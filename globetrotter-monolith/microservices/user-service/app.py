"""
User Service
-------------
Owns all user identity, auth, favorites, and app feedback. This is
the ONLY service that touches passwords or issues JWTs — every other
service just verifies tokens using the shared JWT_SECRET.

Cross-service calls:
  - Calls Recommendation Service's /internal/destinations/<id> to
    hydrate favorites with full place details (name, image, rating,
    etc.) since User Service doesn't own destination data itself.
    If Recommendation Service is unreachable, favorites still return
    with just the destination_id — a small resilience touch so one
    service being down doesn't hard-fail this one.

Run:
    python app.py
"""
import logging
import os
from functools import wraps

import jwt
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

import auth
import data_access as db
import business_logic as logic

logging.basicConfig(level=logging.INFO, format="%(asctime)s USER-SVC %(levelname)s %(message)s")
logger = logging.getLogger("user-service")

RECOMMENDATION_SERVICE_URL = os.environ.get("RECOMMENDATION_SERVICE_URL", "http://localhost:5003")
REQUEST_TIMEOUT = 3  # seconds — fail fast rather than hang if a peer service is down

app = Flask(__name__)
CORS(app)


def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "Missing or malformed Authorization header"}), 401
        token = header.split(" ", 1)[1]
        try:
            payload = auth.decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        request.user_id = payload["sub"]
        request.user_name = payload["name"]
        return f(*args, **kwargs)
    return wrapper


@app.before_request
def log_request():
    logger.info("%s %s", request.method, request.path)


@app.errorhandler(Exception)
def handle_unexpected_error(e):
    logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error"}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "user-service"}), 200


# ---------------------------------------------------------------------
# POST /register
# ---------------------------------------------------------------------
@app.route("/register", methods=["POST"])
def register():
    body = request.get_json(silent=True) or {}
    errors = logic.validate_registration_payload(body)

    email = body.get("email")
    phone = body.get("phone")
    if email and db.get_user_by_email(email):
        errors.append("that email is already registered")
    if phone and db.get_user_by_phone(phone):
        errors.append("that phone number is already registered")

    if errors:
        return jsonify({"errors": errors}), 400

    user = {
        "name": body["name"],
        "email": email,
        "phone": phone,
        "password_hash": auth.hash_password(body["password"]),
        "preferences": body.get("preferences", []),
    }
    saved = db.add_user(user)
    return jsonify({
        "id": saved["id"], "name": saved["name"],
        "email": saved["email"], "phone": saved["phone"],
    }), 201


# ---------------------------------------------------------------------
# POST /login
# ---------------------------------------------------------------------
@app.route("/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    email = body.get("email")
    phone = body.get("phone")
    password = body.get("password")

    if not password or (not email and not phone):
        return jsonify({"error": "password and either email or phone are required"}), 400

    user = db.get_user_by_email(email) if email else db.get_user_by_phone(phone)
    if not user or not auth.verify_password(password, user["password_hash"]):
        return jsonify({"error": "invalid credentials"}), 401

    token = auth.issue_token(user["id"], user["name"])
    return jsonify({"token": token, "name": user["name"]}), 200


# ---------------------------------------------------------------------
# GET / PATCH /profile  (auth required)
# ---------------------------------------------------------------------
@app.route("/profile", methods=["GET"])
@require_auth
def get_profile():
    user = db.get_user_by_id(request.user_id)
    if not user:
        return jsonify({"error": "user not found"}), 404
    return jsonify({
        "id": user["id"], "name": user["name"], "email": user["email"],
        "phone": user["phone"], "preferences": user["preferences"],
    }), 200


@app.route("/profile", methods=["PATCH"])
@require_auth
def update_profile():
    body = request.get_json(silent=True) or {}
    errors = logic.validate_profile_update(body)
    if errors:
        return jsonify({"errors": errors}), 400

    updates = {}
    if "name" in body:
        updates["name"] = body["name"].strip()
    if "preferences" in body:
        updates["preferences"] = body["preferences"]

    updated = db.update_user(request.user_id, updates)
    return jsonify({
        "id": updated["id"], "name": updated["name"], "email": updated["email"],
        "phone": updated["phone"], "preferences": updated["preferences"],
    }), 200


# ---------------------------------------------------------------------
# Favorites  (auth required)
# ---------------------------------------------------------------------
def _fetch_destination(destination_id):
    """Cross-service call to Recommendation Service. Returns None on any failure."""
    try:
        res = requests.get(
            f"{RECOMMENDATION_SERVICE_URL}/internal/destinations/{destination_id}",
            timeout=REQUEST_TIMEOUT,
        )
        return res.json() if res.status_code == 200 else None
    except requests.RequestException:
        logger.warning("Recommendation Service unreachable while hydrating favorite %s", destination_id)
        return None


@app.route("/favorites", methods=["GET"])
@require_auth
def list_favorites():
    ids = db.get_favorite_destination_ids(request.user_id)
    places = []
    for destination_id in ids:
        place = _fetch_destination(destination_id)
        places.append(place if place else {"id": destination_id, "name": f"Place #{destination_id}", "unavailable": True})
    return jsonify(places), 200


@app.route("/favorites", methods=["POST"])
@require_auth
def add_favorite_route():
    body = request.get_json(silent=True) or {}
    destination_id = body.get("destination_id")
    if not isinstance(destination_id, int):
        return jsonify({"error": "destination_id (integer) is required"}), 400
    # Verify the destination actually exists via Recommendation Service.
    if not _fetch_destination(destination_id):
        return jsonify({"error": "destination not found or recommendation-service unreachable"}), 404
    favorite, created = db.add_favorite(request.user_id, destination_id)
    return jsonify(favorite), 201 if created else 200


@app.route("/favorites/<int:destination_id>", methods=["DELETE"])
@require_auth
def remove_favorite_route(destination_id):
    removed = db.remove_favorite(request.user_id, destination_id)
    if not removed:
        return jsonify({"error": "not in favorites"}), 404
    return jsonify({"removed": True}), 200


# ---------------------------------------------------------------------
# App feedback
# ---------------------------------------------------------------------
@app.route("/feedback", methods=["POST"])
@require_auth
def submit_feedback():
    body = request.get_json(silent=True) or {}
    errors = logic.validate_feedback_payload(body)
    if errors:
        return jsonify({"errors": errors}), 400

    feedback = {
        "user_id": request.user_id,
        "user_name": request.user_name,
        "message": body["message"],
        "rating": body.get("rating"),
    }
    saved = db.add_feedback(feedback)
    return jsonify(saved), 201


@app.route("/feedback", methods=["GET"])
def list_feedback():
    return jsonify(db.get_feedback()), 200


# ---------------------------------------------------------------------
# Internal — for other services to resolve a user's name/preferences
# without needing the user's own JWT. Not exposed through the API
# Gateway's public routes.
# ---------------------------------------------------------------------
@app.route("/internal/users/<int:user_id>", methods=["GET"])
def internal_get_user(user_id):
    user = db.get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "user not found"}), 404
    return jsonify({
        "id": user["id"], "name": user["name"], "preferences": user["preferences"],
    }), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)

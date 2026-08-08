"""
Itinerary Service
-------------------
Owns trip planning: itineraries, time slots, transport mode, and the
visited/review flow. Reviews are stored here (embedded in the
itinerary) but the public reviews endpoint needs each reviewer's
display NAME, which this service doesn't own — that's a cross-service
call to User Service's /internal/users/<id>.

Cross-service calls:
  - Validates destination_id against Recommendation Service before
    accepting a new itinerary (no point booking a trip to a place
    that doesn't exist).
  - Calls User Service to resolve reviewer names for the public
    reviews endpoint.

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

logging.basicConfig(level=logging.INFO, format="%(asctime)s ITIN-SVC %(levelname)s %(message)s")
logger = logging.getLogger("itinerary-service")

RECOMMENDATION_SERVICE_URL = os.environ.get("RECOMMENDATION_SERVICE_URL", "http://localhost:5003")
USER_SERVICE_URL = os.environ.get("USER_SERVICE_URL", "http://localhost:5001")
REQUEST_TIMEOUT = 3

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
    return jsonify({"status": "ok", "service": "itinerary-service"}), 200


def _destination_exists(destination_id):
    try:
        res = requests.get(
            f"{RECOMMENDATION_SERVICE_URL}/internal/destinations/{destination_id}",
            timeout=REQUEST_TIMEOUT,
        )
        return res.status_code == 200
    except requests.RequestException:
        logger.warning("Recommendation Service unreachable while validating destination %s", destination_id)
        return False


def _resolve_user_name(user_id):
    try:
        res = requests.get(f"{USER_SERVICE_URL}/internal/users/{user_id}", timeout=REQUEST_TIMEOUT)
        if res.status_code == 200:
            return res.json().get("name", "Former user")
    except requests.RequestException:
        logger.warning("User Service unreachable while resolving user %s", user_id)
    return "Former user"


# ---------------------------------------------------------------------
# POST /itineraries  (auth required)
# ---------------------------------------------------------------------
@app.route("/itineraries", methods=["POST"])
@require_auth
def create_itinerary():
    body = request.get_json(silent=True) or {}
    errors = logic.validate_itinerary_payload(body)
    if errors:
        return jsonify({"errors": errors}), 400

    if not _destination_exists(body["destination_id"]):
        return jsonify({"errors": ["destination_id does not match a known destination"]}), 400

    itinerary = {
        "user_id": request.user_id,
        "destination_id": body["destination_id"],
        "start_date": body["start_date"],
        "end_date": body["end_date"],
        "notes": body.get("notes", ""),
        "time_slot": body.get("time_slot", ""),
        "transport_mode": body.get("transport_mode", ""),
        "shared_with": body.get("shared_with", []),
        "visited": False,
        "review": None,
    }
    saved = db.add_itinerary(itinerary)
    return jsonify(saved), 201


# ---------------------------------------------------------------------
# GET /itineraries  (auth required)
# ---------------------------------------------------------------------
@app.route("/itineraries", methods=["GET"])
@require_auth
def list_itineraries():
    return jsonify(db.get_itineraries_for_user(request.user_id)), 200


# ---------------------------------------------------------------------
# PATCH /itineraries/<id>/visit  (auth required, owner only)
# ---------------------------------------------------------------------
@app.route("/itineraries/<int:itinerary_id>/visit", methods=["PATCH"])
@require_auth
def mark_visited(itinerary_id):
    itinerary = db.get_itinerary_by_id(itinerary_id)
    if not itinerary or itinerary["user_id"] != request.user_id:
        return jsonify({"error": "itinerary not found"}), 404

    body = request.get_json(silent=True) or {}
    errors = logic.validate_review_payload(body)
    if errors:
        return jsonify({"errors": errors}), 400

    updated = db.update_itinerary(itinerary_id, {
        "visited": True,
        "review": {
            "rating": body["rating"],
            "comment": body.get("comment", ""),
            "visited_date": body["visited_date"],
        },
    })
    return jsonify(updated), 200


# ---------------------------------------------------------------------
# GET /destinations/<id>/reviews  (public)
# ---------------------------------------------------------------------
@app.route("/destinations/<int:destination_id>/reviews", methods=["GET"])
def destination_reviews(destination_id):
    reviews = db.get_reviews_for_destination(destination_id)
    for r in reviews:
        r["reviewer_name"] = _resolve_user_name(r.pop("user_id"))
    return jsonify(reviews), 200


# ---------------------------------------------------------------------
# Internal — for Recommendation Service to know what a user has
# already booked, so it doesn't recommend a repeat.
# ---------------------------------------------------------------------
@app.route("/internal/itineraries", methods=["GET"])
def internal_list_itineraries():
    user_id = request.args.get("user_id", type=int)
    if user_id is None:
        return jsonify({"error": "user_id query param is required"}), 400
    return jsonify(db.get_itineraries_for_user(user_id)), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    app.run(host="0.0.0.0", port=port, debug=True)

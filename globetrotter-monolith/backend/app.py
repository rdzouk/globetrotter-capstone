"""
GlobeTrotter Travel Assistant — Monolith Phase
------------------------------------------------
API Layer. Single Flask process, all business logic and data access
imported as modules (not services).

Production-hardened per ARCHITECTURE_AUDIT.md: environment-based
config (config.py), locked-down CORS, rate limiting on auth endpoints,
security headers, structured logging with per-request IDs, and
/health + /ready endpoints for Docker/load-balancer health checks.

Run (development):
    python app.py
Run (production):
    gunicorn -w 4 -b 0.0.0.0:5000 app:app
"""
import logging
import time
import uuid
from functools import wraps

import jwt
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.exceptions import HTTPException

import config
import auth
import database
import data_access as db
import business_logic as logic

database.init_db()

logging.basicConfig(level=config.LOG_LEVEL, format="%(asctime)s %(levelname)s  %(message)s")


class _RequestIdFilter(logging.Filter):
    """Injects the current request's ID into every log record, so a
    single request's log lines can be grepped out of a shared log
    stream — see ARCHITECTURE_AUDIT.md's Observability requirements."""
    def filter(self, record):
        try:
            from flask import has_request_context
            record.request_id = g.request_id if has_request_context() and hasattr(g, "request_id") else "-"
        except RuntimeError:
            record.request_id = "-"
        return True


logger = logging.getLogger("globetrotter")
logger.addFilter(_RequestIdFilter())

app = Flask(__name__)
CORS(app, origins=config.CORS_ORIGINS)

limiter = Limiter(get_remote_address, app=app, storage_uri=config.REDIS_URL, default_limits=[], enabled=config.RATELIMIT_ENABLED)


# ---------------------------------------------------------------------
# Auth decorator
# ---------------------------------------------------------------------
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


# ---------------------------------------------------------------------
# Request lifecycle: ID assignment, timing, structured logging,
# security headers on every response.
# ---------------------------------------------------------------------
@app.before_request
def start_request():
    g.request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    g.start_time = time.time()


@app.after_request
def finish_request(response):
    duration_ms = round((time.time() - g.start_time) * 1000, 1) if hasattr(g, "start_time") else None
    logger.info("%s %s -> %s (%sms)", request.method, request.path, response.status_code, duration_ms)
    response.headers["X-Request-ID"] = g.get("request_id", "-")

    # Security headers (audit Critical Problem #8)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if config.IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.errorhandler(Exception)
def handle_unexpected_error(e):
    # HTTPExceptions (404, 405, 429 from the rate limiter, etc.) already
    # carry the correct status code and a safe message — only genuinely
    # unexpected exceptions (real bugs) should become a generic 500.
    if isinstance(e, HTTPException):
        response = e.get_response()
        response.data = jsonify({"error": e.description or e.name}).data
        response.content_type = "application/json"
        return response
    logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------------------
# Health endpoints (audit Problem #9) — separate liveness/readiness
# semantics, matching what Docker health checks and load balancers
# expect: /health = "is the process alive", /ready = "can it actually
# serve requests" (i.e. is its datastore reachable).
# ---------------------------------------------------------------------
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/ready", methods=["GET"])
def ready():
    try:
        db.get_destinations()
    except Exception:
        logger.exception("Readiness check failed — datastore unreachable")
        return jsonify({"status": "not ready", "reason": "datastore unreachable"}), 503
    return jsonify({"status": "ready"}), 200


# ---------------------------------------------------------------------
# POST /register
# ---------------------------------------------------------------------
@app.route("/register", methods=["POST"])
@limiter.limit("5 per minute")
def register():
    """
    name is a display name and MAY duplicate across users (e.g. two
    different "John" accounts are fine). What must be unique is
    whichever identifier is supplied: email and/or phone. At least one
    of the two is required — a user with no email can register with
    just a phone number, and vice versa.
    """
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
@limiter.limit("10 per minute")
def login():
    """
    Accepts either {"email": ..., "password": ...} or
    {"phone": ..., "password": ...} — whichever identifier the account
    was registered with.
    """
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
# GET /destinations
# ---------------------------------------------------------------------
@app.route("/destinations", methods=["GET"])
def destinations():
    query = request.args.get("q")
    category = request.args.get("category")
    neighborhood = request.args.get("neighborhood")
    tag = request.args.get("tag")
    results = logic.search_destinations(db.get_destinations(), query, category, neighborhood, tag)
    return jsonify(results), 200


# ---------------------------------------------------------------------
# GET /recommendations  (auth required)
# ---------------------------------------------------------------------
@app.route("/recommendations", methods=["GET"])
@require_auth
def recommendations():
    user = db.get_user_by_id(request.user_id)
    if not user:
        return jsonify({"error": "user not found"}), 404
    limit = request.args.get("limit", default=5, type=int)
    past = db.get_itineraries_for_user(user["id"])
    recs = logic.recommend_destinations(db.get_destinations(), user, past, limit=limit)
    return jsonify(recs), 200


# ---------------------------------------------------------------------
# POST /itineraries  (auth required)
# ---------------------------------------------------------------------
@app.route("/itineraries", methods=["POST"])
@require_auth
def create_itinerary():
    body = request.get_json(silent=True) or {}
    valid_ids = {d["id"] for d in db.get_destinations()}
    errors = logic.validate_itinerary_payload(body, valid_ids)
    if errors:
        return jsonify({"errors": errors}), 400

    itinerary = {
        "user_id": request.user_id,
        "destination_id": body["destination_id"],
        "start_date": body["start_date"],
        "end_date": body["end_date"],
        "notes": body.get("notes", ""),
        "time_slot": body.get("time_slot", ""),  # e.g. "09:00-11:00" — used by the weekly planner view
        "transport_mode": body.get("transport_mode", ""),  # e.g. "taxi", "moto", "yango"
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
    mine = db.get_itineraries_for_user(request.user_id)
    return jsonify(mine), 200


# ---------------------------------------------------------------------
# PATCH /itineraries/<id>/visit  (auth required)
# Mark a planned itinerary as visited and attach a review — rating,
# a free-text comment, and the date actually visited.
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
# GET /destinations/<id>/reviews
# Every user's review of this place — this is the "place page" of
# reviews and critiques, public so anyone browsing can read them.
# ---------------------------------------------------------------------
@app.route("/destinations/<int:destination_id>/reviews", methods=["GET"])
def destination_reviews(destination_id):
    if not db.get_destination_by_id(destination_id):
        return jsonify({"error": "destination not found"}), 404
    return jsonify(db.get_reviews_for_destination(destination_id)), 200


# ---------------------------------------------------------------------
# POST /feedback  (auth required)
# Comments/critiques about the APP itself — separate from place
# reviews above.
# ---------------------------------------------------------------------
@app.route("/feedback", methods=["POST"])
@require_auth
@limiter.limit("10 per minute")
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


# ---------------------------------------------------------------------
# GET /destinations/<id>/nearby
# Other places within walking/short-drive distance — powers the
# "places nearby" section on the place detail page.
# ---------------------------------------------------------------------
@app.route("/destinations/<int:destination_id>/nearby", methods=["GET"])
def nearby_destinations(destination_id):
    origin = db.get_destination_by_id(destination_id)
    if not origin:
        return jsonify({"error": "destination not found"}), 404
    limit = request.args.get("limit", default=5, type=int)
    max_km = request.args.get("max_km", default=3.0, type=float)
    results = logic.nearby_destinations(db.get_destinations(), origin, limit=limit, max_km=max_km)
    return jsonify(results), 200


# ---------------------------------------------------------------------
# GET /neighborhoods/<name>
# A short "good to know" blurb about an area, plus which neighborhoods
# are nearby and how many places we have listed there.
# ---------------------------------------------------------------------
@app.route("/neighborhoods/<name>", methods=["GET"])
def neighborhood_info(name):
    info = logic.NEIGHBORHOOD_INFO.get(name)
    if not info:
        return jsonify({"error": "unknown neighborhood"}), 404
    place_count = len([d for d in db.get_destinations() if d["neighborhood"] == name])
    return jsonify({
        "neighborhood": name,
        "blurb": info["blurb"],
        "nearby_neighborhoods": info["nearby"],
        "place_count": place_count,
    }), 200


# ---------------------------------------------------------------------
# GET /feedback
# Public listing of app feedback — an "about this app" / reviews page.
# ---------------------------------------------------------------------
@app.route("/feedback", methods=["GET"])
def list_feedback():
    return jsonify(db.get_feedback()), 200


# ---------------------------------------------------------------------
# GET /profile  (auth required)
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


# ---------------------------------------------------------------------
# PATCH /profile  (auth required)
# Only name and preferences (interest tags) are editable — email/phone
# stay fixed since they're the account identifier.
# ---------------------------------------------------------------------
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
# Favorites  (auth required) — heart a place, see your liked places.
# ---------------------------------------------------------------------
@app.route("/favorites", methods=["GET"])
@require_auth
def list_favorites():
    ids = db.get_favorite_destination_ids(request.user_id)
    places = [d for d in db.get_destinations() if d["id"] in ids]
    return jsonify(places), 200


@app.route("/favorites", methods=["POST"])
@require_auth
def add_favorite():
    body = request.get_json(silent=True) or {}
    destination_id = body.get("destination_id")
    if not db.get_destination_by_id(destination_id):
        return jsonify({"error": "destination not found"}), 404
    favorite, created = db.add_favorite(request.user_id, destination_id)
    return jsonify(favorite), 201 if created else 200


@app.route("/favorites/<int:destination_id>", methods=["DELETE"])
@require_auth
def remove_favorite(destination_id):
    removed = db.remove_favorite(request.user_id, destination_id)
    if not removed:
        return jsonify({"error": "not in favorites"}), 404
    return jsonify({"removed": True}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=config.PORT, debug=config.DEBUG)

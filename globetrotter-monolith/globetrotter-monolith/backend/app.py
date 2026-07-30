"""
GlobeTrotter Travel Assistant — Monolith Phase
------------------------------------------------
API Layer. Single Flask process, all business logic and data access
imported as modules (not services). Everything lives on one server;
the JSON file is the only datastore. This is the deliberately-limited
baseline: no horizontal scaling, no redundancy, single point of
failure at the file and at the process.

This is now a PURE JSON API — no HTML pages are served here. Any
client (the frontend/ web pages, a Flutter app, curl, Postman) talks
to it over HTTP. CORS is enabled so browser-based frontends running
on a different origin/port can call it directly.

Run:
    python app.py
"""
import logging
from functools import wraps

import jwt
from flask import Flask, request, jsonify
from flask_cors import CORS

import auth
import data_access as db
import business_logic as logic

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("globetrotter")

app = Flask(__name__)
CORS(app)  # allow requests from any origin — fine for a dev/course project;
           # in production you'd restrict this to your actual frontend's domain


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


@app.before_request
def log_request():
    logger.info("%s %s", request.method, request.path)


@app.errorhandler(Exception)
def handle_unexpected_error(e):
    logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------------------
# POST /register
# ---------------------------------------------------------------------
@app.route("/register", methods=["POST"])
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

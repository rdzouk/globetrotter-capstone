"""
GlobeTrotter Travel Assistant — Monolith Phase
------------------------------------------------
API Layer. Single Flask process, all business logic and data access
imported as modules (not services). Everything lives on one server;
the JSON file is the only datastore. This is the deliberately-limited
baseline: no horizontal scaling, no redundancy, single point of
failure at the file and at the process.

Run:
    python app.py

Then visit http://localhost:5000/ in your browser to see the frontend
    
"""
import logging
from functools import wraps

import jwt
from flask import Flask, request, jsonify, render_template

import auth
import data_access as db
import business_logic as logic

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("globetrotter")

app = Flask(__name__)


# ---------------------------------------------------------------------
# Frontend pages (server-rendered HTML; the JS on each page calls the
# JSON API routes below to fetch/submit data)
# ---------------------------------------------------------------------
@app.route("/", methods=["GET"])
def page_home():
    return render_template("index.html")


@app.route("/register", methods=["GET"])
def page_register():
    return render_template("register.html")


@app.route("/login", methods=["GET"])
def page_login():
    return render_template("login.html")


@app.route("/recommendations-page", methods=["GET"])
def page_recommendations():
    return render_template("recommendations.html")


@app.route("/itineraries-page", methods=["GET"])
def page_itineraries():
    return render_template("itineraries.html")


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
        request.username = payload["username"]
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
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    password = body.get("password")
    preferences = body.get("preferences", [])

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    if db.get_user_by_username(username):
        return jsonify({"error": "username already taken"}), 409
    if not isinstance(preferences, list):
        return jsonify({"error": "preferences must be a list of tags"}), 400

    user = {
        "username": username,
        "password_hash": auth.hash_password(password),
        "preferences": preferences,
    }
    saved = db.add_user(user)
    return jsonify({"id": saved["id"], "username": saved["username"]}), 201


# ---------------------------------------------------------------------
# POST /login
# ---------------------------------------------------------------------
@app.route("/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    password = body.get("password")

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    user = db.get_user_by_username(username)
    if not user or not auth.verify_password(password, user["password_hash"]):
        return jsonify({"error": "invalid credentials"}), 401

    token = auth.issue_token(user["id"], user["username"])
    return jsonify({"token": token}), 200


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
        "shared_with": body.get("shared_with", []),
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

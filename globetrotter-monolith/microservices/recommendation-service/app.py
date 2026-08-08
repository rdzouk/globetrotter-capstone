"""
Recommendation Service
------------------------
Owns Yaoundé place data (58 destinations) exclusively. Serves search,
nearby-places, and neighborhood info directly from its own data — and
composes personalized recommendations by calling out to User Service
(for interest preferences) and Itinerary Service (for what the user
has already booked, so we don't recommend a repeat).

This is the clearest example of synchronous inter-service REST calls
in the whole system: GET /recommendations can't do its job from local
data alone.

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

logging.basicConfig(level=logging.INFO, format="%(asctime)s REC-SVC %(levelname)s %(message)s")
logger = logging.getLogger("recommendation-service")

USER_SERVICE_URL = os.environ.get("USER_SERVICE_URL", "http://localhost:5001")
ITINERARY_SERVICE_URL = os.environ.get("ITINERARY_SERVICE_URL", "http://localhost:5002")
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
    return jsonify({"status": "ok", "service": "recommendation-service"}), 200


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


@app.route("/destinations/<int:destination_id>/nearby", methods=["GET"])
def nearby(destination_id):
    origin = db.get_destination_by_id(destination_id)
    if not origin:
        return jsonify({"error": "destination not found"}), 404
    limit = request.args.get("limit", default=5, type=int)
    max_km = request.args.get("max_km", default=3.0, type=float)
    results = logic.nearby_destinations(db.get_destinations(), origin, limit=limit, max_km=max_km)
    return jsonify(results), 200


@app.route("/neighborhoods/<name>", methods=["GET"])
def neighborhood_info(name):
    info = logic.NEIGHBORHOOD_INFO.get(name)
    if not info:
        return jsonify({"error": "unknown neighborhood"}), 404
    place_count = len([d for d in db.get_destinations() if d["neighborhood"] == name])
    return jsonify({
        "neighborhood": name, "blurb": info["blurb"],
        "nearby_neighborhoods": info["nearby"], "place_count": place_count,
    }), 200


# ---------------------------------------------------------------------
# GET /recommendations  (auth required) — the cross-service endpoint
# ---------------------------------------------------------------------
@app.route("/recommendations", methods=["GET"])
@require_auth
def recommendations():
    limit = request.args.get("limit", default=5, type=int)

    preferences = []
    try:
        res = requests.get(f"{USER_SERVICE_URL}/internal/users/{request.user_id}", timeout=REQUEST_TIMEOUT)
        if res.status_code == 200:
            preferences = res.json().get("preferences", [])
    except requests.RequestException:
        logger.warning("User Service unreachable — recommending without preference weighting")

    visited_ids = set()
    try:
        res = requests.get(
            f"{ITINERARY_SERVICE_URL}/internal/itineraries",
            params={"user_id": request.user_id},
            timeout=REQUEST_TIMEOUT,
        )
        if res.status_code == 200:
            visited_ids = {it["destination_id"] for it in res.json()}
    except requests.RequestException:
        logger.warning("Itinerary Service unreachable — recommending without excluding past trips")

    recs = logic.recommend_destinations(db.get_destinations(), preferences, visited_ids, limit=limit)
    return jsonify(recs), 200


# ---------------------------------------------------------------------
# Internal — for other services to fetch/validate destination data.
# ---------------------------------------------------------------------
@app.route("/internal/destinations/<int:destination_id>", methods=["GET"])
def internal_get_destination(destination_id):
    d = db.get_destination_by_id(destination_id)
    if not d:
        return jsonify({"error": "not found"}), 404
    return jsonify(d), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5003))
    app.run(host="0.0.0.0", port=port, debug=True)

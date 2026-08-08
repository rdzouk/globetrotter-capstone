"""
API Gateway
------------
The ONLY service clients (the web frontend, the Flutter app) talk to
directly. It routes each request to whichever microservice owns that
piece of functionality, and forwards the response back unchanged.

The routing table below deliberately mirrors the exact URL paths the
old monolith used — same paths, same methods, same request/response
shapes. That means the existing frontend and mobile app work against
this gateway with ZERO code changes: just point them at this same
port (5000) instead of the monolith. That's the actual point of an
API Gateway — it decouples "what URL does the client call" from "how
many services are actually behind it".

Run:
    python app.py
"""
import logging
import os

import requests
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format="%(asctime)s GATEWAY %(levelname)s %(message)s")
logger = logging.getLogger("api-gateway")

USER_SERVICE_URL = os.environ.get("USER_SERVICE_URL", "http://localhost:5001")
ITINERARY_SERVICE_URL = os.environ.get("ITINERARY_SERVICE_URL", "http://localhost:5002")
RECOMMENDATION_SERVICE_URL = os.environ.get("RECOMMENDATION_SERVICE_URL", "http://localhost:5003")
REQUEST_TIMEOUT = 5

app = Flask(__name__)
CORS(app)

# Headers we don't forward either direction (hop-by-hop / would break the proxy).
_HOP_BY_HOP = {"host", "content-length", "connection", "transfer-encoding"}


def proxy(target_base, path):
    """Forward the current request to target_base + path, return its response verbatim."""
    url = f"{target_base}{path}"
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP}

    try:
        upstream = requests.request(
            method=request.method,
            url=url,
            headers=headers,
            params=request.args,
            data=request.get_data(),
            timeout=REQUEST_TIMEOUT,
        )
    except requests.ConnectionError:
        logger.error("Could not reach %s", url)
        return jsonify({"error": "A required service is currently unavailable", "service_url": target_base}), 503
    except requests.Timeout:
        logger.error("Timed out reaching %s", url)
        return jsonify({"error": "A required service timed out", "service_url": target_base}), 504

    response_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    return Response(upstream.content, status=upstream.status_code, headers=response_headers)


@app.before_request
def log_request():
    logger.info("%s %s -> routing", request.method, request.path)


# ---------------------------------------------------------------------
# Aggregate health check — pings all three services
# ---------------------------------------------------------------------
@app.route("/health", methods=["GET"])
def health():
    services = {
        "user-service": USER_SERVICE_URL,
        "itinerary-service": ITINERARY_SERVICE_URL,
        "recommendation-service": RECOMMENDATION_SERVICE_URL,
    }
    statuses = {}
    all_ok = True
    for name, base_url in services.items():
        try:
            res = requests.get(f"{base_url}/health", timeout=2)
            statuses[name] = "ok" if res.status_code == 200 else f"unhealthy ({res.status_code})"
            all_ok = all_ok and res.status_code == 200
        except requests.RequestException:
            statuses[name] = "unreachable"
            all_ok = False
    return jsonify({"gateway": "ok", "services": statuses}), 200 if all_ok else 503


# ---------------------------------------------------------------------
# User Service routes
# ---------------------------------------------------------------------
@app.route("/register", methods=["POST"])
def register():
    return proxy(USER_SERVICE_URL, "/register")


@app.route("/login", methods=["POST"])
def login():
    return proxy(USER_SERVICE_URL, "/login")


@app.route("/profile", methods=["GET", "PATCH"])
def profile():
    return proxy(USER_SERVICE_URL, "/profile")


@app.route("/favorites", methods=["GET", "POST"])
def favorites():
    return proxy(USER_SERVICE_URL, "/favorites")


@app.route("/favorites/<int:destination_id>", methods=["DELETE"])
def remove_favorite(destination_id):
    return proxy(USER_SERVICE_URL, f"/favorites/{destination_id}")


@app.route("/feedback", methods=["GET", "POST"])
def feedback():
    return proxy(USER_SERVICE_URL, "/feedback")


# ---------------------------------------------------------------------
# Recommendation Service routes
# ---------------------------------------------------------------------
@app.route("/destinations", methods=["GET"])
def destinations():
    return proxy(RECOMMENDATION_SERVICE_URL, "/destinations")


@app.route("/destinations/<int:destination_id>/nearby", methods=["GET"])
def nearby(destination_id):
    return proxy(RECOMMENDATION_SERVICE_URL, f"/destinations/{destination_id}/nearby")


@app.route("/neighborhoods/<name>", methods=["GET"])
def neighborhood(name):
    return proxy(RECOMMENDATION_SERVICE_URL, f"/neighborhoods/{name}")


@app.route("/recommendations", methods=["GET"])
def recommendations():
    return proxy(RECOMMENDATION_SERVICE_URL, "/recommendations")


# ---------------------------------------------------------------------
# Itinerary Service routes (note: reviews live under /destinations/
# but are owned by Itinerary Service — routed here, not to Recs)
# ---------------------------------------------------------------------
@app.route("/destinations/<int:destination_id>/reviews", methods=["GET"])
def destination_reviews(destination_id):
    return proxy(ITINERARY_SERVICE_URL, f"/destinations/{destination_id}/reviews")


@app.route("/itineraries", methods=["GET", "POST"])
def itineraries():
    return proxy(ITINERARY_SERVICE_URL, "/itineraries")


@app.route("/itineraries/<int:itinerary_id>/visit", methods=["PATCH"])
def mark_visited(itinerary_id):
    return proxy(ITINERARY_SERVICE_URL, f"/itineraries/{itinerary_id}/visit")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)

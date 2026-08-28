import json
import os
import sys
from unittest.mock import patch, Mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import app as app_module
import auth

BASELINE_DESTINATIONS = {
    "destinations": [
        {"id": 1, "name": "Tassa", "category": "restaurant", "neighborhood": "Bastos",
         "lat": 3.8856164, "lng": 11.512473, "rating": 4.3, "rating_count": 189,
         "tags": ["restaurant", "cafe", "casual"], "description": "Garden cafe."},
        {"id": 2, "name": "Shu Anta Nlongkak", "category": "spa", "neighborhood": "Nlongkak",
         "lat": 3.8848691, "lng": 11.5191044, "rating": 4.2, "rating_count": 93,
         "tags": ["spa", "relaxation", "affordable"], "description": "Popular spa."},
    ]
}

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "destinations.json")


@pytest.fixture(autouse=True)
def reset_data():
    with open(DATA_FILE, "w") as f:
        json.dump(BASELINE_DESTINATIONS, f)
    yield
    with open(DATA_FILE, "w") as f:
        json.dump(BASELINE_DESTINATIONS, f)


@pytest.fixture
def client():
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as c:
        yield c


def make_token(user_id=1, name="Alice"):
    return auth.jwt.encode(
        {"sub": user_id, "name": name,
         "exp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc) + __import__("datetime").timedelta(hours=1)},
        auth.SECRET_KEY, algorithm=auth.ALGORITHM,
    )


def auth_header(user_id=1):
    return {"Authorization": f"Bearer {make_token(user_id)}"}


# ---- Destinations ----

def test_get_destinations(client):
    resp = client.get("/destinations")
    assert resp.status_code == 200
    names = [d["name"] for d in resp.get_json()]
    assert "Tassa" in names and "Shu Anta Nlongkak" in names


def test_filter_by_category(client):
    resp = client.get("/destinations?category=spa")
    data = resp.get_json()
    assert len(data) == 1
    assert data[0]["name"] == "Shu Anta Nlongkak"


def test_nearby(client):
    resp = client.get("/destinations/1/nearby?max_km=5")
    assert resp.status_code == 200
    nearby = resp.get_json()
    assert len(nearby) == 1
    assert nearby[0]["name"] == "Shu Anta Nlongkak"


def test_nearby_unknown_id(client):
    resp = client.get("/destinations/999/nearby")
    assert resp.status_code == 404


def test_neighborhood_info(client):
    resp = client.get("/neighborhoods/Bastos")
    assert resp.status_code == 200
    assert resp.get_json()["place_count"] == 1


def test_neighborhood_unknown(client):
    resp = client.get("/neighborhoods/Nowhereville")
    assert resp.status_code == 404


# ---- Internal ----

def test_internal_get_destination(client):
    resp = client.get("/internal/destinations/1")
    assert resp.status_code == 200
    assert resp.get_json()["name"] == "Tassa"


def test_internal_get_destination_not_found(client):
    resp = client.get("/internal/destinations/999")
    assert resp.status_code == 404


# ---- Recommendations (mocks BOTH cross-service calls) ----

def test_recommendations_requires_auth(client):
    resp = client.get("/recommendations")
    assert resp.status_code == 401


def test_recommendations_uses_preferences_and_excludes_visited(client):
    user_response = Mock(status_code=200)
    user_response.json.return_value = {"preferences": ["spa"]}

    itinerary_response = Mock(status_code=200)
    itinerary_response.json.return_value = []  # nothing booked yet

    with patch("requests.get", side_effect=[user_response, itinerary_response]):
        resp = client.get("/recommendations", headers=auth_header())
        assert resp.status_code == 200
        recs = resp.get_json()
        assert recs[0]["name"] == "Shu Anta Nlongkak"  # spa tag matches preference


def test_recommendations_excludes_already_booked_destination(client):
    user_response = Mock(status_code=200)
    user_response.json.return_value = {"preferences": ["spa"]}

    itinerary_response = Mock(status_code=200)
    itinerary_response.json.return_value = [{"destination_id": 2}]  # already booked the spa

    with patch("requests.get", side_effect=[user_response, itinerary_response]):
        resp = client.get("/recommendations", headers=auth_header())
        recs = resp.get_json()
        names = [r["name"] for r in recs]
        assert "Shu Anta Nlongkak" not in names  # excluded since already booked


def test_recommendations_degrades_gracefully_when_peers_down(client):
    """If User Service and Itinerary Service are both unreachable, still return SOMETHING."""
    with patch("requests.get", side_effect=app_module.requests.RequestException("down")):
        resp = client.get("/recommendations", headers=auth_header())
        assert resp.status_code == 200
        assert len(resp.get_json()) > 0  # falls back to unweighted recommendations

"""
End-to-end tests against the Flask test client.
Each test resets data.json to a clean baseline first so tests don't
depend on each other or leak state (a real weakness of the JSON-file
approach that a proper test DB wouldn't have).
"""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import data_access as db
import app as flask_app_module

BASELINE = {
    "users": [],
    "itineraries": [],
    "destinations": [
        {"id": 1, "name": "Tassa", "category": "restaurant", "neighborhood": "Bastos",
         "address": "Bastos, Yaoundé", "lat": 3.8856164, "lng": 11.512473,
         "rating": 4.3, "rating_count": 189, "price_level": 2, "phone": "+237 6 56 70 65 66",
         "tags": ["restaurant", "cafe", "casual"], "description": "Garden cafe-restaurant in Bastos."},
        {"id": 2, "name": "Shu Anta Nlongkak", "category": "spa", "neighborhood": "Nlongkak",
         "address": "Nlongkak, Yaoundé", "lat": 3.8848691, "lng": 11.5191044,
         "rating": 4.2, "rating_count": 93, "price_level": None, "phone": "+237 6 99 19 55 46",
         "tags": ["spa", "relaxation", "affordable"], "description": "Popular spa in Nlongkak."},
    ],
}


@pytest.fixture(autouse=True)
def reset_data():
    db.save(json.loads(json.dumps(BASELINE)))
    yield
    db.save(json.loads(json.dumps(BASELINE)))


@pytest.fixture
def client():
    flask_app_module.app.config["TESTING"] = True
    with flask_app_module.app.test_client() as c:
        yield c


def register(client, username="alice", password="hunter22", preferences=None):
    return client.post("/register", json={
        "username": username, "password": password,
        "preferences": preferences or ["restaurant"],
    })


def login(client, username="alice", password="hunter22"):
    return client.post("/login", json={"username": username, "password": password})


def auth_header(client):
    resp = login(client)
    token = resp.get_json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_register_success(client):
    resp = register(client)
    assert resp.status_code == 201
    assert resp.get_json()["username"] == "alice"


def test_register_duplicate_username(client):
    register(client)
    resp = register(client)
    assert resp.status_code == 409


def test_login_success(client):
    register(client)
    resp = login(client)
    assert resp.status_code == 200
    assert "token" in resp.get_json()


def test_login_bad_password(client):
    register(client)
    resp = login(client, password="wrong")
    assert resp.status_code == 401


def test_get_destinations(client):
    resp = client.get("/destinations")
    assert resp.status_code == 200
    names = [d["name"] for d in resp.get_json()]
    assert "Tassa" in names and "Shu Anta Nlongkak" in names


def test_get_destinations_filter_by_category(client):
    resp = client.get("/destinations?category=spa")
    data = resp.get_json()
    assert len(data) == 1
    assert data[0]["name"] == "Shu Anta Nlongkak"


def test_recommendations_requires_auth(client):
    resp = client.get("/recommendations")
    assert resp.status_code == 401


def test_recommendations_prefers_matching_tags(client):
    register(client, preferences=["spa"])
    headers = auth_header(client)
    resp = client.get("/recommendations", headers=headers)
    assert resp.status_code == 200
    recs = resp.get_json()
    assert recs[0]["name"] == "Shu Anta Nlongkak"  # spa tag matches preference


def test_create_itinerary(client):
    register(client)
    headers = auth_header(client)
    resp = client.post("/itineraries", headers=headers, json={
        "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-10",
    })
    assert resp.status_code == 201
    assert resp.get_json()["destination_id"] == 1


def test_create_itinerary_invalid_dates(client):
    register(client)
    headers = auth_header(client)
    resp = client.post("/itineraries", headers=headers, json={
        "destination_id": 1, "start_date": "2026-08-10", "end_date": "2026-08-01",
    })
    assert resp.status_code == 400


def test_list_itineraries_scoped_to_user(client):
    register(client)
    headers = auth_header(client)
    client.post("/itineraries", headers=headers, json={
        "destination_id": 2, "start_date": "2026-09-01", "end_date": "2026-09-05",
    })
    resp = client.get("/itineraries", headers=headers)
    assert resp.status_code == 200
    assert len(resp.get_json()) == 1

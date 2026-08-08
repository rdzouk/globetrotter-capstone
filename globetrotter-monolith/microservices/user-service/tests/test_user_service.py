import json
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import data_access as db
import app as app_module

BASELINE = {"users": [], "favorites": [], "feedback": []}

FAKE_DESTINATION = {
    "id": 1, "name": "Tassa", "category": "restaurant", "neighborhood": "Bastos",
    "rating": 4.3, "lat": 3.88, "lng": 11.51,
}


@pytest.fixture(autouse=True)
def reset_data():
    db.save(json.loads(json.dumps(BASELINE)))
    yield
    db.save(json.loads(json.dumps(BASELINE)))


@pytest.fixture
def client():
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as c:
        yield c


def register(client, name="Alice", email="alice@example.com", phone=None, password="hunter22", preferences=None):
    body = {"name": name, "password": password, "preferences": preferences or ["restaurant"]}
    if email:
        body["email"] = email
    if phone:
        body["phone"] = phone
    return client.post("/register", json=body)


def login(client, email="alice@example.com", phone=None, password="hunter22"):
    body = {"password": password}
    if email:
        body["email"] = email
    if phone:
        body["phone"] = phone
    return client.post("/login", json=body)


def auth_header(client, **kwargs):
    resp = login(client, **kwargs)
    token = resp.get_json()["token"]
    return {"Authorization": f"Bearer {token}"}


# ---- Registration / Login ----

def test_register_success(client):
    resp = register(client)
    assert resp.status_code == 201
    assert resp.get_json()["name"] == "Alice"


def test_register_with_phone_only(client):
    resp = register(client, email=None, phone="+237699112233")
    assert resp.status_code == 201


def test_register_requires_email_or_phone(client):
    resp = register(client, email=None, phone=None)
    assert resp.status_code == 400


def test_register_duplicate_name_allowed(client):
    register(client, name="Alice", email="a1@example.com")
    resp = register(client, name="Alice", email="a2@example.com")
    assert resp.status_code == 201


def test_register_duplicate_email_rejected(client):
    register(client, email="dup@example.com")
    resp = register(client, name="Someone Else", email="dup@example.com")
    assert resp.status_code == 400


def test_login_success(client):
    register(client)
    resp = login(client)
    assert resp.status_code == 200
    assert "token" in resp.get_json()


def test_login_bad_password(client):
    register(client)
    resp = login(client, password="wrong")
    assert resp.status_code == 401


# ---- Profile ----

def test_get_profile(client):
    register(client, preferences=["spa"])
    headers = auth_header(client)
    resp = client.get("/profile", headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()["preferences"] == ["spa"]


def test_update_profile(client):
    register(client)
    headers = auth_header(client)
    resp = client.patch("/profile", headers=headers, json={"name": "New Name", "preferences": ["fancy"]})
    assert resp.status_code == 200
    assert resp.get_json()["name"] == "New Name"


def test_profile_requires_auth(client):
    resp = client.get("/profile")
    assert resp.status_code == 401


# ---- Favorites (mocking the cross-service call) ----

def test_add_favorite_calls_recommendation_service(client):
    register(client)
    headers = auth_header(client)
    with patch("app._fetch_destination", return_value=FAKE_DESTINATION):
        resp = client.post("/favorites", headers=headers, json={"destination_id": 1})
        assert resp.status_code == 201

        resp = client.get("/favorites", headers=headers)
        assert resp.status_code == 200
        favs = resp.get_json()
        assert len(favs) == 1
        assert favs[0]["name"] == "Tassa"


def test_add_favorite_unknown_destination(client):
    register(client)
    headers = auth_header(client)
    with patch("app._fetch_destination", return_value=None):
        resp = client.post("/favorites", headers=headers, json={"destination_id": 999})
        assert resp.status_code == 404


def test_favorites_degrade_gracefully_when_recommendation_service_down(client):
    """If Recommendation Service is unreachable, favorites still list — just with less detail."""
    register(client)
    headers = auth_header(client)
    with patch("app._fetch_destination", return_value=FAKE_DESTINATION):
        client.post("/favorites", headers=headers, json={"destination_id": 1})
    with patch("app._fetch_destination", return_value=None):
        resp = client.get("/favorites", headers=headers)
        assert resp.status_code == 200
        favs = resp.get_json()
        assert favs[0]["unavailable"] is True


def test_remove_favorite(client):
    register(client)
    headers = auth_header(client)
    with patch("app._fetch_destination", return_value=FAKE_DESTINATION):
        client.post("/favorites", headers=headers, json={"destination_id": 1})
    resp = client.delete("/favorites/1", headers=headers)
    assert resp.status_code == 200


# ---- Feedback ----

def test_submit_and_list_feedback(client):
    register(client)
    headers = auth_header(client)
    resp = client.post("/feedback", headers=headers, json={"message": "Great app!", "rating": 5})
    assert resp.status_code == 201
    resp = client.get("/feedback")
    assert len(resp.get_json()) == 1


def test_feedback_requires_auth_to_post(client):
    resp = client.post("/feedback", json={"message": "hi"})
    assert resp.status_code == 401


# ---- Internal endpoint ----

def test_internal_get_user(client):
    register(client, name="Alice", preferences=["spa"])
    resp = client.get("/internal/users/1")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["name"] == "Alice"
    assert body["preferences"] == ["spa"]
    # Password hash must NOT leak through this endpoint
    assert "password_hash" not in body


def test_internal_get_user_not_found(client):
    resp = client.get("/internal/users/999")
    assert resp.status_code == 404

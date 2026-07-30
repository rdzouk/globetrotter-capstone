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
    "feedback": [],
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


def register(client, name="Alice", email="alice@example.com", phone=None,
             password="hunter22", preferences=None):
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


# ---- Registration ----

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
    assert any("email or phone" in e for e in resp.get_json()["errors"])


def test_register_duplicate_name_allowed(client):
    """Names CAN duplicate — only email/phone must be unique."""
    register(client, name="Alice", email="alice1@example.com")
    resp = register(client, name="Alice", email="alice2@example.com")
    assert resp.status_code == 201


def test_register_duplicate_email_rejected(client):
    register(client, email="dup@example.com")
    resp = register(client, name="Someone Else", email="dup@example.com")
    assert resp.status_code == 400
    assert any("email" in e for e in resp.get_json()["errors"])


def test_register_duplicate_phone_rejected(client):
    register(client, email=None, phone="+237699000000")
    resp = register(client, name="Bob", email=None, phone="+237699000000")
    assert resp.status_code == 400
    assert any("phone" in e for e in resp.get_json()["errors"])


# ---- Login ----

def test_login_success_with_email(client):
    register(client)
    resp = login(client)
    assert resp.status_code == 200
    assert "token" in resp.get_json()


def test_login_success_with_phone(client):
    register(client, email=None, phone="+237699445566")
    resp = login(client, email=None, phone="+237699445566")
    assert resp.status_code == 200


def test_login_bad_password(client):
    register(client)
    resp = login(client, password="wrong")
    assert resp.status_code == 401


# ---- Destinations ----

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


# ---- Recommendations ----

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


# ---- Itineraries ----

def test_create_itinerary(client):
    register(client)
    headers = auth_header(client)
    resp = client.post("/itineraries", headers=headers, json={
        "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-10",
    })
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["destination_id"] == 1
    assert body["visited"] is False
    assert body["review"] is None


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


# ---- Mark visited + reviews ----

def test_mark_itinerary_visited_with_review(client):
    register(client)
    headers = auth_header(client)
    created = client.post("/itineraries", headers=headers, json={
        "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-10",
    }).get_json()

    resp = client.patch(f"/itineraries/{created['id']}/visit", headers=headers, json={
        "rating": 5, "comment": "Loved the garden seating.", "visited_date": "2026-08-05",
    })
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["visited"] is True
    assert body["review"]["rating"] == 5


def test_mark_visited_invalid_rating_rejected(client):
    register(client)
    headers = auth_header(client)
    created = client.post("/itineraries", headers=headers, json={
        "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-10",
    }).get_json()

    resp = client.patch(f"/itineraries/{created['id']}/visit", headers=headers, json={
        "rating": 9, "visited_date": "2026-08-05",
    })
    assert resp.status_code == 400


def test_mark_visited_wrong_owner_rejected(client):
    register(client, name="Alice", email="alice@example.com")
    alice_headers = auth_header(client, email="alice@example.com")
    created = client.post("/itineraries", headers=alice_headers, json={
        "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-10",
    }).get_json()

    register(client, name="Bob", email="bob@example.com")
    bob_headers = auth_header(client, email="bob@example.com")
    resp = client.patch(f"/itineraries/{created['id']}/visit", headers=bob_headers, json={
        "rating": 4, "visited_date": "2026-08-05",
    })
    assert resp.status_code == 404


def test_destination_reviews_public(client):
    register(client)
    headers = auth_header(client)
    created = client.post("/itineraries", headers=headers, json={
        "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-10",
    }).get_json()
    client.patch(f"/itineraries/{created['id']}/visit", headers=headers, json={
        "rating": 4, "comment": "Great atmosphere.", "visited_date": "2026-08-05",
    })

    resp = client.get("/destinations/1/reviews")
    assert resp.status_code == 200
    reviews = resp.get_json()
    assert len(reviews) == 1
    assert reviews[0]["reviewer_name"] == "Alice"
    assert reviews[0]["rating"] == 4


# ---- App feedback ----

def test_submit_feedback_requires_auth(client):
    resp = client.post("/feedback", json={"message": "Great app!"})
    assert resp.status_code == 401


def test_submit_and_list_feedback(client):
    register(client)
    headers = auth_header(client)
    resp = client.post("/feedback", headers=headers, json={
        "message": "Love the Yaoundé map!", "rating": 5,
    })
    assert resp.status_code == 201

    resp = client.get("/feedback")
    assert resp.status_code == 200
    items = resp.get_json()
    assert len(items) == 1
    assert items[0]["user_name"] == "Alice"


def test_submit_feedback_empty_message_rejected(client):
    register(client)
    headers = auth_header(client)
    resp = client.post("/feedback", headers=headers, json={"message": ""})
    assert resp.status_code == 400


# ---- Nearby places + neighborhood info ----

def test_nearby_destinations(client):
    # Tassa (id 1) and Shu Anta Nlongkak (id 2) are ~1km apart in the baseline data.
    resp = client.get("/destinations/1/nearby?max_km=5")
    assert resp.status_code == 200
    nearby = resp.get_json()
    assert len(nearby) == 1
    assert nearby[0]["name"] == "Shu Anta Nlongkak"
    assert "distance_km" in nearby[0]


def test_nearby_destinations_unknown_id(client):
    resp = client.get("/destinations/999/nearby")
    assert resp.status_code == 404


def test_neighborhood_info(client):
    resp = client.get("/neighborhoods/Bastos")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["neighborhood"] == "Bastos"
    assert "blurb" in body
    assert body["place_count"] == 1  # Tassa, in the baseline data


def test_neighborhood_info_unknown(client):
    resp = client.get("/neighborhoods/Nowhereville")
    assert resp.status_code == 404

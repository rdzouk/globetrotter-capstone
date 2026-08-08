import json
import os
import sys
import datetime
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import data_access as db
import app as app_module
import auth

BASELINE = {"itineraries": []}


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


def make_token(user_id=1, name="Alice"):
    return __import__("jwt").encode(
        {"sub": user_id, "name": name,
         "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)},
        auth.SECRET_KEY, algorithm=auth.ALGORITHM,
    )


def auth_header(user_id=1, name="Alice"):
    return {"Authorization": f"Bearer {make_token(user_id, name)}"}


# ---- Create itinerary (mocks destination validation) ----

def test_create_itinerary_success(client):
    with patch("app._destination_exists", return_value=True):
        resp = client.post("/itineraries", headers=auth_header(), json={
            "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-05",
        })
        assert resp.status_code == 201
        body = resp.get_json()
        assert body["visited"] is False
        assert body["review"] is None


def test_create_itinerary_unknown_destination_rejected(client):
    with patch("app._destination_exists", return_value=False):
        resp = client.post("/itineraries", headers=auth_header(), json={
            "destination_id": 999, "start_date": "2026-08-01", "end_date": "2026-08-05",
        })
        assert resp.status_code == 400


def test_create_itinerary_invalid_dates(client):
    with patch("app._destination_exists", return_value=True):
        resp = client.post("/itineraries", headers=auth_header(), json={
            "destination_id": 1, "start_date": "2026-08-10", "end_date": "2026-08-01",
        })
        assert resp.status_code == 400


def test_create_itinerary_with_time_slot_and_transport(client):
    with patch("app._destination_exists", return_value=True):
        resp = client.post("/itineraries", headers=auth_header(), json={
            "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-05",
            "time_slot": "09:00-11:00", "transport_mode": "taxi",
        })
        body = resp.get_json()
        assert body["time_slot"] == "09:00-11:00"
        assert body["transport_mode"] == "taxi"


def test_list_itineraries_scoped_to_user(client):
    with patch("app._destination_exists", return_value=True):
        client.post("/itineraries", headers=auth_header(user_id=1), json={
            "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-05",
        })
        client.post("/itineraries", headers=auth_header(user_id=2), json={
            "destination_id": 1, "start_date": "2026-09-01", "end_date": "2026-09-05",
        })
    resp = client.get("/itineraries", headers=auth_header(user_id=1))
    assert len(resp.get_json()) == 1


# ---- Mark visited / review ----

def test_mark_visited_with_review(client):
    with patch("app._destination_exists", return_value=True):
        created = client.post("/itineraries", headers=auth_header(), json={
            "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-05",
        }).get_json()

    resp = client.patch(f"/itineraries/{created['id']}/visit", headers=auth_header(), json={
        "rating": 5, "comment": "Loved it!", "visited_date": "2026-08-03",
    })
    assert resp.status_code == 200
    assert resp.get_json()["visited"] is True


def test_mark_visited_wrong_owner_rejected(client):
    with patch("app._destination_exists", return_value=True):
        created = client.post("/itineraries", headers=auth_header(user_id=1), json={
            "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-05",
        }).get_json()

    resp = client.patch(f"/itineraries/{created['id']}/visit", headers=auth_header(user_id=2), json={
        "rating": 4, "visited_date": "2026-08-03",
    })
    assert resp.status_code == 404


# ---- Public reviews (mocks resolving reviewer name from User Service) ----

def test_destination_reviews_resolves_reviewer_name(client):
    with patch("app._destination_exists", return_value=True):
        created = client.post("/itineraries", headers=auth_header(user_id=1, name="Alice"), json={
            "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-05",
        }).get_json()
    client.patch(f"/itineraries/{created['id']}/visit", headers=auth_header(user_id=1), json={
        "rating": 5, "comment": "Great!", "visited_date": "2026-08-03",
    })

    with patch("app._resolve_user_name", return_value="Alice"):
        resp = client.get("/destinations/1/reviews")
        assert resp.status_code == 200
        reviews = resp.get_json()
        assert reviews[0]["reviewer_name"] == "Alice"
        assert reviews[0]["rating"] == 5


def test_destination_reviews_empty(client):
    resp = client.get("/destinations/999/reviews")
    assert resp.status_code == 200
    assert resp.get_json() == []


# ---- Internal endpoint (used by Recommendation Service) ----

def test_internal_list_itineraries_for_user(client):
    with patch("app._destination_exists", return_value=True):
        client.post("/itineraries", headers=auth_header(user_id=1), json={
            "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-05",
        })
    resp = client.get("/internal/itineraries?user_id=1")
    assert resp.status_code == 200
    assert len(resp.get_json()) == 1


def test_internal_list_itineraries_requires_user_id(client):
    resp = client.get("/internal/itineraries")
    assert resp.status_code == 400

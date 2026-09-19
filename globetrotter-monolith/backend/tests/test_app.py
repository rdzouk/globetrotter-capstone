"""
End-to-end tests against the Flask test client.

Runs against its own isolated, temporary SQLite database — completely
separate from whatever database the app normally uses (a local
globetrotter.db, or real Postgres in production). This is the fix for
the JSON-era bug where running `pytest` would destructively wipe the
real seed data: tests now can't touch real data even by accident,
because they're pointed at a throwaway file that gets deleted when
the test session ends.
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Both of these MUST be set before `import app` / `import database`,
# since Flask-Limiter and the SQLAlchemy engine both read env vars once
# at construction time — setting them later has no effect.
os.environ["RATELIMIT_ENABLED"] = "false"
_TEST_DB_FD, _TEST_DB_PATH = tempfile.mkstemp(suffix=".db")
os.close(_TEST_DB_FD)
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"

import pytest
import database
import data_access as db
from models import Destination
import app as flask_app_module

BASELINE_DESTINATIONS = [
    {"id": 1, "name": "Tassa", "category": "restaurant", "neighborhood": "Bastos",
     "address": "Bastos, Yaoundé", "lat": 3.8856164, "lng": 11.512473,
     "rating": 4.3, "rating_count": 189, "price_level": 2, "phone": "+237 6 56 70 65 66",
     "tags": ["restaurant", "cafe", "casual"], "description": "Garden cafe-restaurant in Bastos.",
     "image_url": "https://loremflickr.com/640/420/restaurant?lock=1"},
    {"id": 2, "name": "Shu Anta Nlongkak", "category": "spa", "neighborhood": "Nlongkak",
     "address": "Nlongkak, Yaoundé", "lat": 3.8848691, "lng": 11.5191044,
     "rating": 4.2, "rating_count": 93, "price_level": None, "phone": "+237 6 99 19 55 46",
     "tags": ["spa", "relaxation", "affordable"], "description": "Popular spa in Nlongkak.",
     "image_url": "https://loremflickr.com/640/420/spa?lock=2"},
]


def _reset_database():
    """Drops and recreates every table, then inserts just the baseline
    destinations — the SQL equivalent of the old JSON version's
    db.save(BASELINE), but against the isolated test database only."""
    from models import Base
    Base.metadata.drop_all(bind=database.engine)
    Base.metadata.create_all(bind=database.engine)
    with database.get_session() as s:
        for d in BASELINE_DESTINATIONS:
            s.add(Destination(**d))


@pytest.fixture(autouse=True)
def reset_data():
    _reset_database()
    yield
    _reset_database()


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


@pytest.fixture
def authenticated_headers(client):
    register(client)
    return auth_header(client)


@pytest.mark.parametrize("path", [
    "/destinations", "/destinations/1/reviews", "/destinations/1/comments",
    "/destinations/1/nearby", "/neighborhoods/Bastos", "/feedback",
])
@pytest.mark.parametrize("authorization", [None, "Basic invalid", "Bearer invalid-token"])
def test_catalogue_and_community_require_auth(client, path, authorization):
    headers = {"Authorization": authorization} if authorization else {}
    response = client.get(path, headers=headers)
    assert response.status_code == 401
    assert response.headers["Cache-Control"] == "no-store"


def test_friendship_consent_and_private_message_ownership():
    alice = db.add_user({"name": "Alice", "email": "alice@example.com", "password_hash": "unused"})["id"]
    bob = db.add_user({"name": "Bob", "email": "bob@example.com", "password_hash": "unused"})["id"]
    carol = db.add_user({"name": "Carol", "email": "carol@example.com", "password_hash": "unused"})["id"]
    with pytest.raises(ValueError):
        db.request_friendship(alice, alice)
    friendship, created = db.request_friendship(alice, bob)
    friendship_id = friendship["id"]
    assert created and friendship["status"] == "outgoing"
    assert db.request_friendship(bob, alice)[1] is False
    assert db.get_friendships(bob)[0]["status"] == "incoming"
    assert db.accept_friendship(alice, friendship_id) is None
    assert db.accept_friendship(carol, friendship_id) is None
    assert db.get_direct_messages(alice, friendship_id) is None
    with pytest.raises(ValueError):
        db.add_direct_message(alice, friendship_id, "pending", "Hello")
    assert db.accept_friendship(bob, friendship_id)["status"] == "accepted"
    message, created = db.add_direct_message(alice, friendship_id, "retry-id", "Hello Bob")
    assert created
    assert db.add_direct_message(alice, friendship_id, "retry-id", "Hello Bob")[1] is False
    assert db.get_direct_messages(bob, friendship_id)["messages"][0]["message"] == "Hello Bob"
    assert db.get_direct_messages(carol, friendship_id) is None
    with pytest.raises(ValueError):
        db.add_direct_message(carol, friendship_id, "intruder", "Hello")
    assert db.delete_direct_message(bob, friendship_id, message["id"]) is None
    assert db.delete_direct_message(alice, friendship_id, message["id"])["deleted"]
    assert not db.remove_friendship(carol, friendship_id)
    assert db.remove_friendship(bob, friendship_id)
    assert db.get_direct_messages(alice, friendship_id) is None
    assert db.get_friendships(alice) == []


def _accepted_friends(client):
    register(client)
    register(client, name="Bob", email="bob@example.com")
    alice_headers = auth_header(client)
    bob_headers = auth_header(client, email="bob@example.com")
    bob_id = db.get_user_by_email("bob@example.com")["id"]
    response = client.post("/friends", headers=alice_headers, json={"user_id": bob_id})
    assert response.status_code == 201
    friendship_id = response.get_json()["id"]
    assert client.patch(f"/friends/{friendship_id}", headers=alice_headers, json={"action": "accept"}).status_code == 404
    assert client.get(f"/friends/{friendship_id}/messages", headers=alice_headers).status_code == 404
    assert client.patch(f"/friends/{friendship_id}", headers=bob_headers, json={"action": "accept"}).status_code == 200
    return friendship_id, alice_headers, bob_headers


def _wave_bytes(seconds=1):
    from io import BytesIO
    import wave
    output = BytesIO()
    with wave.open(output, "wb") as recording:
        recording.setnchannels(1)
        recording.setsampwidth(2)
        recording.setframerate(8000)
        recording.writeframes(b"\x00\x00" * 8000 * seconds)
    return output.getvalue()


def test_friends_api_text_and_voice(client):
    from io import BytesIO
    import uuid
    friendship_id, alice_headers, bob_headers = _accepted_friends(client)
    path = f"/friends/{friendship_id}/messages"
    assert client.get("/friends").status_code == 401
    assert client.get("/friends", headers=alice_headers).get_json()[0]["status"] == "accepted"
    payload = {"message": "Meet at the cafe?", "client_id": str(uuid.uuid4())}
    assert client.post(path, headers=alice_headers, json=payload).status_code == 201
    assert client.post(path, headers=alice_headers, json=payload).status_code == 200
    assert client.post(path, headers=alice_headers, json={"message": "", "client_id": str(uuid.uuid4())}).status_code == 400
    assert client.get(path + "?before_id=bad", headers=bob_headers).status_code == 400
    assert client.get(path + "?limit=101", headers=bob_headers).status_code == 400
    response = client.post(path, headers=alice_headers, data={
        "client_id": str(uuid.uuid4()), "audio": (BytesIO(_wave_bytes()), "note.wav"),
    })
    assert response.status_code == 201
    voice = response.get_json()
    assert voice["duration"] == 1
    audio_response = client.get(voice["audio_url"], headers=bob_headers)
    assert audio_response.status_code == 200
    assert audio_response.mimetype == "audio/wav"
    assert audio_response.headers["Cache-Control"] == "no-store"
    assert client.get(voice["audio_url"]).status_code == 401
    register(client, name="Carol", email="carol@example.com")
    carol_headers = auth_header(client, email="carol@example.com")
    assert client.get(path, headers=carol_headers).status_code == 404
    assert client.get(voice["audio_url"], headers=carol_headers).status_code == 404
    assert client.post(path, headers=carol_headers, json=payload).status_code == 404
    assert client.delete(f"{path}/{voice['id']}", headers=bob_headers).status_code == 404
    assert client.delete(f"{path}/{voice['id']}", headers=alice_headers).status_code == 200
    assert client.get(voice["audio_url"], headers=bob_headers).status_code == 404


def test_uploaded_media_are_decoded_and_bounded():
    from io import BytesIO
    from PIL import Image
    from werkzeug.datastructures import FileStorage
    from media import prepare_audio, prepare_photo, MAX_AUDIO_BYTES
    with pytest.raises(ValueError):
        prepare_audio(FileStorage(BytesIO(b"not audio"), filename="voice.webm", content_type="audio/webm"))
    with pytest.raises(ValueError, match="2 minutes"):
        prepare_audio(FileStorage(BytesIO(_wave_bytes(121))))
    with pytest.raises(ValueError, match="5 MB"):
        prepare_audio(FileStorage(BytesIO(b"0" * (MAX_AUDIO_BYTES + 1))))
    with pytest.raises(ValueError):
        prepare_photo(FileStorage(BytesIO(b"not a photo"), filename="place.jpg"))
    image_file = BytesIO()
    Image.new("RGB", (2200, 100), "green").save(image_file, "PNG")
    image_file.seek(0)
    result = prepare_photo(FileStorage(image_file, filename="place.png"))
    with Image.open(BytesIO(result)) as image:
        assert image.format == "JPEG"
        assert image.width == 1920
        assert not image.getexif()


@pytest.mark.parametrize("container_format,codec,expected_type", [("webm", "libopus", "audio/webm"), ("mp4", "aac", "audio/mp4"), ("ogg", "libopus", "audio/ogg")])
def test_browser_voice_formats_are_decoded(container_format, codec, expected_type):
    from io import BytesIO
    import av
    from werkzeug.datastructures import FileStorage
    from media import prepare_audio
    output = BytesIO()
    with av.open(output, mode="w", format=container_format) as container:
        stream = container.add_stream(codec, rate=48000)
        stream.layout = "mono"
        for _ in range(50):
            frame = av.AudioFrame(format="s16", layout="mono", samples=960)
            frame.sample_rate = 48000
            frame.planes[0].update(b"\x00" * 1920)
            for packet in stream.encode(frame):
                container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)
    content = output.getvalue()
    saved, media_type, duration = prepare_audio(FileStorage(BytesIO(content), filename="voice-note"))
    assert saved == content
    assert media_type == expected_type
    assert 0.9 <= duration <= 1.1


def _photo_bytes():
    from io import BytesIO
    from PIL import Image
    output = BytesIO()
    Image.new("RGB", (32, 24), "green").save(output, "PNG")
    return output.getvalue()


def test_community_place_creation_has_trusted_attribution_and_a_photo(client, authenticated_headers):
    from io import BytesIO
    import json
    import uuid
    identifier = str(uuid.uuid4())
    details = {"name": "Community garden", "category": "nature", "neighborhood": "Bastos", "address": "Bastos, Yaounde", "lat": 3.88, "lng": 11.51, "description": "A garden added by a traveler.", "tags": ["outdoor"]}
    def payload(values=details):
        return {"client_id": identifier, "details": json.dumps(values), "photo": (BytesIO(_photo_bytes()), "garden.png")}
    response = client.post("/destinations", headers=authenticated_headers, data=payload())
    assert response.status_code == 201
    place = response.get_json()
    assert place["added_by"] == {"id": db.get_user_by_email("alice@example.com")["id"], "name": "Alice"}
    assert place["rating"] == 0 and place["rating_count"] == 0
    assert place["active"] is True
    image = client.get(place["cover_photo_url"], headers=authenticated_headers)
    assert image.status_code == 200 and image.mimetype == "image/jpeg"
    assert image.headers["Cache-Control"] == "no-store"
    assert client.get(place["cover_photo_url"]).status_code == 401
    assert client.post("/destinations", headers=authenticated_headers, data=payload()).status_code == 200
    assert len(db.get_destinations()) == 3
    gallery = client.get(f"/destinations/{place['id']}/photos", headers=authenticated_headers).get_json()
    assert gallery["count"] == 1 and gallery["photos"][0]["user_name"] == "Alice"
    for invalid in ({**details, "lat": 91}, {**details, "lng": float("nan")}, {**details, "lat": True}, {**details, "added_by": {"id": 999}}, {**details, "category": "anything"}):
        assert client.post("/destinations", headers=authenticated_headers, data=payload(invalid)).status_code == 400
    assert client.post("/destinations", data=payload()).status_code == 401


def test_place_photos_have_pagination_ownership_and_cover_cleanup(client, authenticated_headers):
    from io import BytesIO
    import uuid
    identifier = str(uuid.uuid4())
    def upload():
        return {"client_id": identifier, "caption": "The terrace", "photo": (BytesIO(_photo_bytes()), "terrace.png")}
    response = client.post("/destinations/1/photos", headers=authenticated_headers, data=upload())
    assert response.status_code == 201
    photo = response.get_json()
    assert photo["caption"] == "The terrace"
    assert client.post("/destinations/1/photos", headers=authenticated_headers, data=upload()).status_code == 200
    assert client.get("/destinations/1/photos?before_id=invalid", headers=authenticated_headers).status_code == 400
    assert client.get("/destinations/999/photos", headers=authenticated_headers).status_code == 404
    assert client.get(f"/destinations/2/photos/{photo['id']}/image", headers=authenticated_headers).status_code == 404
    register(client, name="Bob", email="bob@example.com")
    bob_headers = auth_header(client, email="bob@example.com")
    assert client.get(photo["image_url"], headers=bob_headers).status_code == 200
    photo_path = f"/destinations/1/photos/{photo['id']}"
    assert client.delete(photo_path, headers=bob_headers).status_code == 404
    assert client.delete(photo_path, headers=authenticated_headers).status_code == 200
    assert client.get(photo["image_url"], headers=authenticated_headers).status_code == 404
    user_id = db.get_user_by_email("alice@example.com")["id"]
    for index in range(13):
        db.add_destination_photo(user_id, 1, str(uuid.uuid4()), f"View {index}", _photo_bytes())
    first = client.get("/destinations/1/photos", headers=authenticated_headers).get_json()
    assert len(first["photos"]) == 12 and first["count"] == 13
    last = client.get(f"/destinations/1/photos?before_id={first['next_before']}", headers=authenticated_headers).get_json()
    assert len(last["photos"]) == 1 and last["next_before"] is None
    place, _ = db.add_community_destination(user_id, str(uuid.uuid4()), {"name": "Park", "category": "nature", "neighborhood": "Bastos", "address": "Bastos", "lat": 3.8, "lng": 11.5, "description": "Park"}, _photo_bytes())
    cover = db.get_destination_photos(place["id"])["photos"][0]
    assert db.delete_destination_photo(user_id, place["id"], cover["id"])
    assert db.get_destination_by_id(place["id"])["cover_photo_url"] is None


def test_social_migration_preserves_existing_accounts(tmp_path):
    from pathlib import Path
    import subprocess
    from sqlalchemy import create_engine, inspect, text
    backend = Path(__file__).resolve().parents[1]
    url = f"sqlite:///{tmp_path / 'upgrade.db'}"
    environment = {**os.environ, "DATABASE_URL": url}
    command = [sys.executable, "-m", "alembic", "-c", str(backend / "alembic.ini"), "upgrade"]
    subprocess.run([*command, "20260911_recovery"], cwd=backend, env=environment, capture_output=True, text=True, check=True, timeout=60)
    engine = create_engine(url)
    try:
        with engine.begin() as connection:
            connection.execute(text("INSERT INTO users (id, name, email, password_hash, preferences, created_at) VALUES (42, 'Existing Traveler', 'existing@example.com', 'unchanged-hash', '[]', CURRENT_TIMESTAMP)"))
        subprocess.run([*command, "head"], cwd=backend, env=environment, capture_output=True, text=True, check=True, timeout=60)
        assert {"friendships", "direct_messages", "destination_photos", "destination_contributions"} <= set(inspect(engine).get_table_names())
        with engine.connect() as connection:
            assert connection.execute(text("SELECT name, password_hash FROM users WHERE id = 42")).one() == ("Existing Traveler", "unchanged-hash")
            assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "20260919_social_places"
    finally:
        engine.dispose()


def test_health_and_preflight_remain_public(client):
    assert client.get("/health").status_code == 200
    assert client.get("/ready").status_code == 200
    assert client.options("/destinations").status_code == 200


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

def test_get_destinations(client, authenticated_headers):
    resp = client.get("/destinations", headers=authenticated_headers)
    assert resp.status_code == 200
    names = [d["name"] for d in resp.get_json()]
    assert "Tassa" in names and "Shu Anta Nlongkak" in names


def test_get_destinations_filter_by_category(client, authenticated_headers):
    resp = client.get("/destinations?category=spa", headers=authenticated_headers)
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


def test_destination_comments_require_auth(client):
    resp = client.post("/destinations/1/comments", json={"message": "Needs login"})
    assert resp.status_code == 401


def test_destination_comments_allow_nested_replies(client):
    register(client)
    headers = auth_header(client)

    parent = client.post("/destinations/1/comments", headers=headers, json={"message": "Nice place"}).get_json()
    reply = client.post("/destinations/1/comments", headers=headers, json={
        "message": "Agreed!",
        "parent_comment_id": parent["id"],
    }).get_json()

    assert parent["message"] == "Nice place"
    assert reply["parent_comment_id"] == parent["id"]

    resp = client.get("/destinations/1/comments", headers=headers)
    assert resp.status_code == 200
    comments = resp.get_json()
    assert any(c["message"] == "Nice place" for c in comments)
    assert any(
        c["message"] == "Nice place" and c["replies"] and c["replies"][0]["message"] == "Agreed!"
        for c in comments
    )


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

def test_edit_and_cancel_owned_plan(client, authenticated_headers):
    created = client.post("/itineraries", headers=authenticated_headers, json={"destination_id": 1, "start_date": "2026-09-20", "end_date": "2026-09-20"}).get_json()
    path = f'/itineraries/{created["id"]}'
    assert client.patch(path, json={"notes": "Changed"}).status_code == 401
    for payload in ({"user_id": 999}, {"visited": True}, {"start_date": "2026-02-30"}, {"time_slot": "12:00-10:00"}, {"notes": []}, {"end_date": "2026-01-01"}):
        assert client.patch(path, headers=authenticated_headers, json=payload).status_code == 400
    updated = client.patch(path, headers=authenticated_headers, json={"time_slot": "10:00-12:00", "notes": "Bring water", "transport_mode": "moto"})
    assert updated.status_code == 200
    assert updated.get_json()["notes"] == "Bring water"
    register(client, name="Bob", email="bob@example.com")
    other = auth_header(client, email="bob@example.com")
    assert client.patch(path, headers=other, json={"notes": "No"}).status_code == 404
    assert client.delete(path, headers=other).status_code == 404
    assert client.delete(path, headers=authenticated_headers).status_code == 200
    assert client.get("/itineraries", headers=authenticated_headers).get_json() == []


def test_completed_plans_preserve_visit_history(client, authenticated_headers):
    created = client.post("/itineraries", headers=authenticated_headers, json={"destination_id": 1, "start_date": "2026-09-01", "end_date": "2026-09-01"}).get_json()
    path = f'/itineraries/{created["id"]}'
    client.patch(path + "/visit", headers=authenticated_headers, json={"rating": 5, "visited_date": "2026-09-01"})
    assert client.patch(path, headers=authenticated_headers, json={"notes": "No"}).status_code == 409
    assert client.delete(path, headers=authenticated_headers).status_code == 409
    assert client.get("/destinations/1/reviews", headers=authenticated_headers).get_json()[0]["rating"] == 5


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


def test_destination_reviews_authenticated(client):
    register(client)
    headers = auth_header(client)
    created = client.post("/itineraries", headers=headers, json={
        "destination_id": 1, "start_date": "2026-08-01", "end_date": "2026-08-10",
    }).get_json()
    client.patch(f"/itineraries/{created['id']}/visit", headers=headers, json={
        "rating": 4, "comment": "Great atmosphere.", "visited_date": "2026-08-05",
    })

    resp = client.get("/destinations/1/reviews", headers=headers)
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

    resp = client.get("/feedback", headers=headers)
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

def test_nearby_destinations(client, authenticated_headers):
    # Tassa (id 1) and Shu Anta Nlongkak (id 2) are ~1km apart in the baseline data.
    resp = client.get("/destinations/1/nearby?max_km=5", headers=authenticated_headers)
    assert resp.status_code == 200
    nearby = resp.get_json()
    assert len(nearby) == 1
    assert nearby[0]["name"] == "Shu Anta Nlongkak"
    assert "distance_km" in nearby[0]


def test_nearby_destinations_unknown_id(client, authenticated_headers):
    resp = client.get("/destinations/999/nearby", headers=authenticated_headers)
    assert resp.status_code == 404


def test_neighborhood_info(client, authenticated_headers):
    resp = client.get("/neighborhoods/Bastos", headers=authenticated_headers)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["neighborhood"] == "Bastos"
    assert "blurb" in body
    assert body["place_count"] == 1  # Tassa, in the baseline data


def test_neighborhood_info_unknown(client, authenticated_headers):
    resp = client.get("/neighborhoods/Nowhereville", headers=authenticated_headers)
    assert resp.status_code == 404


# ---- Profile ----

def test_get_profile(client):
    register(client, name="Alice", email="alice@example.com", preferences=["spa"])
    headers = auth_header(client)
    resp = client.get("/profile", headers=headers)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["name"] == "Alice"
    assert body["email"] == "alice@example.com"
    assert body["preferences"] == ["spa"]


def test_update_profile_name_and_preferences(client):
    register(client, name="Alice")
    headers = auth_header(client)
    resp = client.patch("/profile", headers=headers, json={
        "name": "Alice Updated", "preferences": ["restaurant", "fancy"],
    })
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["name"] == "Alice Updated"
    assert body["preferences"] == ["restaurant", "fancy"]
    assert body["email"] == "alice@example.com"


def test_update_profile_empty_name_rejected(client):
    register(client)
    headers = auth_header(client)
    resp = client.patch("/profile", headers=headers, json={"name": "   "})
    assert resp.status_code == 400


def test_profile_requires_auth(client):
    resp = client.get("/profile")
    assert resp.status_code == 401


# ---- Favorites ----

def test_add_and_list_favorite(client):
    register(client)
    headers = auth_header(client)
    resp = client.post("/favorites", headers=headers, json={"destination_id": 1})
    assert resp.status_code == 201

    resp = client.get("/favorites", headers=headers)
    assert resp.status_code == 200
    favs = resp.get_json()
    assert len(favs) == 1
    assert favs[0]["name"] == "Tassa"


def test_add_favorite_idempotent(client):
    register(client)
    headers = auth_header(client)
    client.post("/favorites", headers=headers, json={"destination_id": 1})
    resp = client.post("/favorites", headers=headers, json={"destination_id": 1})
    assert resp.status_code == 200

    resp = client.get("/favorites", headers=headers)
    assert len(resp.get_json()) == 1


def test_add_favorite_unknown_destination(client):
    register(client)
    headers = auth_header(client)
    resp = client.post("/favorites", headers=headers, json={"destination_id": 999})
    assert resp.status_code == 404


def test_remove_favorite(client):
    register(client)
    headers = auth_header(client)
    client.post("/favorites", headers=headers, json={"destination_id": 1})
    resp = client.delete("/favorites/1", headers=headers)
    assert resp.status_code == 200

    resp = client.get("/favorites", headers=headers)
    assert resp.get_json() == []


def test_remove_favorite_not_favorited(client):
    register(client)
    headers = auth_header(client)
    resp = client.delete("/favorites/1", headers=headers)
    assert resp.status_code == 404


def test_favorites_require_auth(client):
    resp = client.get("/favorites")
    assert resp.status_code == 401


# ---- Error handling regression tests ----

def test_unknown_route_returns_404_not_500(client):
    """The catch-all error handler must not swallow Flask/werkzeug
    HTTPExceptions (404, 429, etc.) into a generic 500."""
    resp = client.get("/this-route-does-not-exist")
    assert resp.status_code == 404


def test_wrong_method_returns_405_not_500(client):
    resp = client.delete("/destinations")  # DELETE isn't defined on this route
    assert resp.status_code == 405


def test_recovery_single_use_neutral_response_and_session_revocation(client, monkeypatch):
    from urllib.parse import urlsplit, parse_qs
    from models import PasswordReset
    delivered = []
    monkeypatch.setattr(flask_app_module.config, "SMTP_HOST", "localhost")
    monkeypatch.setattr(flask_app_module.config, "SMTP_FROM", "noreply@example.test")
    monkeypatch.setattr(flask_app_module.config, "APP_PUBLIC_URL", "https://example.test")
    monkeypatch.setattr(flask_app_module.recovery, "deliver_reset", lambda identity, channel, link: delivered.append((identity, link)))
    register(client)
    old_session = auth_header(client)
    payload = {"channel": "email", "identifier": "alice@example.com"}
    known = client.post("/auth/recovery", json=payload)
    unknown = client.post("/auth/recovery", json={**payload, "identifier": "absent@example.test"})
    assert known.status_code == unknown.status_code == 202
    assert known.get_json() == unknown.get_json()
    assert len(delivered) == 1
    assert delivered[0][1].startswith("https://example.test/reset-password#token=")
    token = parse_qs(urlsplit(delivered[0][1]).fragment)["token"][0]
    with database.get_session() as session:
        assert token not in session.query(PasswordReset).first().token_hash
    assert client.post("/auth/recovery/reset", json={"token": token, "password": "short"}).status_code == 400
    assert client.post("/auth/recovery/reset", json={"token": token, "password": "a-new-long-password"}).status_code == 200
    assert client.post("/auth/recovery/reset", json={"token": token, "password": "another-new-password"}).status_code == 400
    assert client.get("/profile", headers=old_session).status_code == 401
    assert login(client).status_code == 401
    assert login(client, password="a-new-long-password").status_code == 200
    assert client.get("/profile", headers=auth_header(client, password="a-new-long-password")).status_code == 200


def test_recovery_expired_links_and_phone_delivery(client, monkeypatch):
    from datetime import datetime, timedelta, timezone
    from urllib.parse import urlsplit, parse_qs
    from models import PasswordReset
    delivered = []
    monkeypatch.setattr(flask_app_module.recovery, "delivery_channels", lambda: {"email": True, "phone": True})
    monkeypatch.setattr(flask_app_module.recovery, "deliver_reset", lambda identity, channel, link: delivered.append((identity, link)))
    register(client, email=None, phone="+237 699112233")
    assert client.post("/auth/recovery", json={"channel": "phone", "identifier": "699112233"}).status_code == 202
    assert delivered[0][0] == "+237699112233"
    token = parse_qs(urlsplit(delivered[0][1]).fragment)["token"][0]
    with database.get_session() as session:
        session.query(PasswordReset).update({"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)})
    assert client.post("/auth/recovery/reset", json={"token": token, "password": "a-new-long-password"}).status_code == 400
    assert login(client, email=None, phone="+237 699112233").status_code == 200
    assert client.post("/auth/recovery", json={"channel": "email", "identifier": "%@example.com"}).status_code == 400


def test_recovery_ambiguous_phone_and_delivery_failure_do_not_leak_accounts(client, monkeypatch):
    from models import PasswordReset
    delivered = []
    monkeypatch.setattr(flask_app_module.recovery, "delivery_channels", lambda: {"email": True, "phone": True})
    monkeypatch.setattr(flask_app_module.recovery, "deliver_reset", lambda *values: delivered.append(values))
    register(client, email=None, phone="+237 699112233")
    register(client, name="Bob", email=None, phone="+237699112233")
    response = client.post("/auth/recovery", json={"channel": "phone", "identifier": "699112233"})
    assert response.status_code == 202
    assert delivered == []
    register(client, name="Carol", email="carol@example.test")
    def delivery_failure(*args):
        raise RuntimeError("test delivery failure")
    monkeypatch.setattr(flask_app_module.recovery, "deliver_reset", delivery_failure)
    failure = client.post("/auth/recovery", json={"channel": "email", "identifier": "carol@example.test"})
    unknown = client.post("/auth/recovery", json={"channel": "email", "identifier": "absent@example.test"})
    assert failure.status_code == unknown.status_code == 202
    assert failure.get_json() == unknown.get_json()
    with database.get_session() as session:
        assert session.query(PasswordReset).count() == 0


def test_recovery_delivery_uses_tls_and_expected_sms_payload(monkeypatch):
    from unittest.mock import MagicMock
    from urllib.parse import parse_qs
    service = flask_app_module.recovery
    mail_connection = MagicMock()
    mail_connection.__enter__.return_value = mail_connection
    mail_factory = MagicMock(return_value=mail_connection)
    monkeypatch.setattr(service.smtplib, "SMTP", mail_factory)
    monkeypatch.setattr(service.config, "SMTP_HOST", "smtp.example.test")
    monkeypatch.setattr(service.config, "SMTP_PORT", 587)
    monkeypatch.setattr(service.config, "SMTP_SECURITY", "starttls")
    monkeypatch.setattr(service.config, "SMTP_FROM", "noreply@example.test")
    monkeypatch.setattr(service.config, "SMTP_USERNAME", "")
    link = "https://example.test/reset-password#token=test-only"
    service.deliver_reset("alice@example.test", "email", link)
    mail_factory.assert_called_once_with("smtp.example.test", 587, timeout=10)
    mail_connection.starttls.assert_called_once()
    email = mail_connection.send_message.call_args.args[0]
    assert email["To"] == "alice@example.test"
    assert link in email.get_content()
    response = MagicMock()
    response.__enter__.return_value.status = 201
    send_sms = MagicMock(return_value=response)
    monkeypatch.setattr(service, "urlopen", send_sms)
    monkeypatch.setattr(service.config, "TWILIO_ACCOUNT_SID", "AC" + "0" * 32)
    monkeypatch.setattr(service.config, "TWILIO_AUTH_TOKEN", "test-only")
    monkeypatch.setattr(service.config, "TWILIO_FROM", "+15005550006")
    service.deliver_reset("+237699112233", "phone", link)
    request = send_sms.call_args.args[0]
    assert request.full_url.startswith("https://api.twilio.com/2010-04-01/Accounts/AC")
    payload = parse_qs(request.data.decode())
    assert payload["To"] == ["+237699112233"]
    assert payload["From"] == ["+15005550006"]
    assert link in payload["Body"][0]


def test_admin_roles_catalogue_archiving_and_conflicts(client, authenticated_headers):
    from models import AccountSecurity
    paths = ["/admin/overview", "/admin/destinations", "/admin/fares", "/admin/audit"]
    for path in paths:
        assert client.get(path).status_code == 401
        assert client.get(path, headers=authenticated_headers).status_code == 403
    assert client.patch("/profile", headers=authenticated_headers, json={"role": "admin"}).status_code != 500
    assert client.get("/admin/overview", headers=authenticated_headers).status_code == 403
    with database.get_session() as session:
        session.add(AccountSecurity(user_id=1, role="admin", session_version=0))
    assert client.get("/profile", headers=authenticated_headers).get_json()["role"] == "admin"
    listing = client.get("/admin/destinations", headers=authenticated_headers).get_json()
    from administration import DESTINATION_FIELDS
    body = {key: listing[0][key] for key in DESTINATION_FIELDS}
    body.update({"description_fr": "Un lieu agreable.", "version": 0, "image_url": "/images/places/1.jpg"})
    path = f'/admin/destinations/{listing[0]["id"]}'
    created = client.post("/admin/destinations", headers=authenticated_headers, json={**body, "name": "New place"})
    assert created.status_code == 201
    assert created.get_json()["content_version"] == 1
    updated = client.patch(path, headers=authenticated_headers, json={**body, "active": False})
    assert updated.status_code == 200
    assert updated.get_json()["content_version"] == 1
    assert client.patch(path, headers=authenticated_headers, json=body).status_code == 409
    assert all(place["id"] != listing[0]["id"] for place in client.get("/destinations", headers=authenticated_headers).get_json())
    assert client.get(f'/destinations/{listing[0]["id"]}', headers=authenticated_headers).status_code == 200
    assert client.patch(path, headers=authenticated_headers, json={**body, "version": 1, "image_url": "javascript:alert(1)"}).status_code == 400
    assert client.patch(path, headers=authenticated_headers, json={**body, "version": 1}).status_code == 200
    audit = client.get("/admin/audit", headers=authenticated_headers).get_json()["records"]
    assert len(audit) == 3
    assert "password_hash" not in str(audit)


def test_admin_fare_validation_audit_and_role_bootstrap(client, authenticated_headers):
    runner = flask_app_module.app.test_cli_runner()
    assert runner.invoke(args=["set-admin", "--user-id", "1"]).exit_code != 0
    assert runner.invoke(args=["set-admin", "--user-id", "1", "--confirm"]).exit_code == 0
    assert client.get("/admin/fares", headers=authenticated_headers).status_code == 401
    headers = auth_header(client)
    policy = client.get("/admin/fares", headers=headers).get_json()[1]
    path = "/admin/fares/" + policy["id"]
    assert client.put(path, headers=headers, json={**policy, "base_min": 900, "base_max": 100}).status_code == 400
    assert client.put(path, headers=headers, json={**policy, "source_url": "javascript:alert(1)"}).status_code == 400
    assert client.put(path, headers=headers, json={**policy, "id": []}).status_code == 400
    assert client.put(path, headers=headers, json={**policy, "source_url": "https://[invalid"}).status_code == 400
    assert client.put(path, headers=headers, json={**policy, "mode": "taxi"}).status_code == 400
    assert client.put(path, headers=headers, json={**policy, "base_min": 360}).status_code == 200
    assert client.put(path, headers=headers, json=policy).status_code == 409
    assert client.get("/fares", headers=headers).get_json()[1]["base_min"] == 360
    assert client.put(path, headers=headers, json={**policy, "version": 1, "active": False}).status_code == 200
    assert all(item["id"] != policy["id"] for item in client.get("/fares", headers=headers).get_json())
    assert len(client.get("/admin/fares", headers=headers).get_json()) == 3
    assert runner.invoke(args=["set-admin", "--user-id", "1", "--remove", "--confirm"]).exit_code != 0


def test_google_disabled_without_client_id(client, monkeypatch):
    monkeypatch.setattr(flask_app_module.config, "GOOGLE_CLIENT_ID", "")
    assert client.get("/auth/google/config").get_json() == {"client_id": None}
    assert client.post("/auth/google", json={"credential": "not-a-token"}).status_code == 503


def google_claims(client, monkeypatch, **overrides):
    monkeypatch.setattr(flask_app_module.config, "GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com")
    nonce = client.get("/auth/google/config").get_json()["nonce"]
    claims = {"sub": "google-subject", "iss": "https://accounts.google.com", "email": "google@example.com", "name": "Google Traveler", "email_verified": True, "nonce": nonce, **overrides}
    def verify(credential, transport, audience):
        assert audience == "test-client.apps.googleusercontent.com"
        return claims
    monkeypatch.setattr(flask_app_module.google_signin.id_token, "verify_oauth2_token", verify)
    return claims


def test_google_creates_and_reuses_identity(client, monkeypatch):
    google_claims(client, monkeypatch)
    response = client.post("/auth/google", json={"credential": "verified-test-token"})
    assert response.status_code == 201
    headers = {"Authorization": "Bearer " + response.get_json()["token"]}
    assert client.get("/profile", headers=headers).get_json()["email"] == "google@example.com"
    assert response.headers["Cache-Control"] == "no-store"
    google_claims(client, monkeypatch)
    assert client.post("/auth/google", json={"credential": "verified-test-token"}).status_code == 200
    assert len(db.get_users()) == 1


@pytest.mark.parametrize("overrides", [{"nonce": "wrong"}, {"email_verified": False}, {"iss": "https://attacker.invalid"}, {"sub": ""}])
def test_google_rejects_invalid_claims(client, monkeypatch, overrides):
    google_claims(client, monkeypatch, **overrides)
    assert client.post("/auth/google", json={"credential": "invalid-claims"}).status_code == 400
    assert db.get_users() == []


def test_google_rejects_unverified_token(client, monkeypatch):
    google_claims(client, monkeypatch)
    def reject(*args, **kwargs):
        raise ValueError("Invalid signature or audience")
    monkeypatch.setattr(flask_app_module.google_signin.id_token, "verify_oauth2_token", reject)
    assert client.post("/auth/google", json={"credential": "forged"}).status_code == 400


def test_google_does_not_link_password_account_by_email(client, monkeypatch):
    register(client, email="google@example.com")
    google_claims(client, monkeypatch)
    assert client.post("/auth/google", json={"credential": "verified-test-token"}).status_code == 409
    assert len(db.get_users()) == 1


def test_chat_authorship_replies_and_owned_deletion(client):
    import uuid
    register(client)
    alice = auth_header(client)
    message = client.post("/chat/messages", headers=alice, json={"message": "Hello Yaounde", "client_id": str(uuid.uuid4()), "user_id": 999}).get_json()
    assert message["user_name"] == "Alice"
    register(client, name="Bob", email="bob@example.com")
    bob = auth_header(client, email="bob@example.com")
    reply = client.post("/chat/messages", headers=bob, json={"message": "Welcome!", "client_id": str(uuid.uuid4()), "reply_to_id": message["id"]})
    assert reply.status_code == 201
    assert reply.get_json()["reply_to"]["user_name"] == "Alice"
    assert client.delete(f'/chat/messages/{message["id"]}', headers=bob).status_code == 404
    assert client.delete(f'/chat/messages/{message["id"]}', headers=alice).status_code == 200
    listing = client.get("/chat/messages", headers=bob).get_json()["messages"]
    assert listing[0]["deleted"] and listing[0]["message"] == ""
    assert listing[1]["reply_to"]["message"] == ""
    assert "email" not in listing[0]


def test_chat_pagination_and_retry_deduplication(client):
    import uuid
    register(client)
    headers = auth_header(client)
    for index in range(3):
        payload = {"message": f"Message {index}", "client_id": str(uuid.uuid4())}
        assert client.post("/chat/messages", headers=headers, json=payload).status_code == 201
        assert client.post("/chat/messages", headers=headers, json=payload).status_code == 200
    latest = client.get("/chat/messages?limit=2", headers=headers).get_json()
    assert latest["has_more"] and len(latest["messages"]) == 2
    earlier = client.get(f'/chat/messages?before_id={latest["messages"][0]["id"]}', headers=headers).get_json()
    assert len(earlier["messages"]) == 1
    assert client.get("/chat/messages?limit=10000", headers=headers).status_code == 400


def test_chat_requires_auth_and_valid_message(client):
    import uuid
    assert client.get("/chat/messages").status_code == 401
    assert client.post("/chat/messages", json={}).status_code == 401
    register(client)
    headers = auth_header(client)
    for message in ("   ", "a" * 2001, 123):
        assert client.post("/chat/messages", headers=headers, json={"message": message, "client_id": str(uuid.uuid4())}).status_code == 400


def test_profile_activity_and_comment_review_authors(client):
    register(client)
    alice = auth_header(client)
    original = client.post("/destinations/1/comments", headers=alice, json={"message": "A lovely place"}).get_json()
    trip = client.post("/itineraries", headers=alice, json={"destination_id": 1, "start_date": "2026-01-01", "end_date": "2026-01-01"}).get_json()
    client.patch(f'/itineraries/{trip["id"]}/visit', headers=alice, json={"rating": 5, "comment": "Great visit", "visited_date": "2026-01-01"})
    register(client, name="Bob", email="bob@example.com")
    bob = auth_header(client, email="bob@example.com")
    client.post("/destinations/1/comments", headers=bob, json={"message": "Thanks Alice", "parent_comment_id": original["id"]})
    activity = client.get("/profile/activity", headers=alice).get_json()
    assert activity["reviews"][0]["review"]["rating"] == 5
    assert activity["comments"][0]["user_name"] == "Alice"
    assert activity["replies"][0]["user_name"] == "Bob"
    assert client.get("/profile/activity", headers=bob).get_json()["reviews"] == []
    assert client.get("/profile/activity").status_code == 401
    comments = client.get("/destinations/1/comments", headers=alice).get_json()
    assert comments[0]["review"]["rating"] == 5


def test_social_migration_preserves_existing_users(tmp_path):
    import subprocess
    from sqlalchemy import create_engine, inspect, text
    backend_dir = os.path.dirname(os.path.dirname(__file__))
    database_path = tmp_path / "migration.db"
    environment = {**os.environ, "DATABASE_URL": f"sqlite:///{database_path}", "APP_ENV": "development"}
    command = [sys.executable, "-m", "alembic", "upgrade"]
    subprocess.run([*command, "29467b508f5e"], cwd=backend_dir, env=environment, check=True, capture_output=True)
    engine = create_engine(environment["DATABASE_URL"])
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO users (id, name, email, password_hash, preferences, created_at) VALUES (1, 'Existing User', 'existing@example.test', 'hash', '[]', '2026-01-01')"))
    for _ in range(2):
        subprocess.run([*command, "head"], cwd=backend_dir, env=environment, check=True, capture_output=True)
    assert {"comments", "google_identities", "chat_messages", "account_security", "password_resets", "fare_policies", "destination_publications"}.issubset(inspect(engine).get_table_names())
    with engine.connect() as connection:
        assert connection.execute(text("SELECT name FROM users WHERE id=1")).scalar() == "Existing User"
    engine.dispose()

"""
Data Access Layer — User Service owns this file exclusively. No other
service reads or writes users.json directly; they go through this
service's HTTP API (or its /internal endpoints) instead. That
exclusive ownership is the core rule of microservices data isolation.
"""
import json
import os
import threading

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "users.json")
_lock = threading.Lock()


def _read_raw():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_raw(data):
    tmp_path = DATA_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp_path, DATA_FILE)


def load():
    with _lock:
        return _read_raw()


def save(data):
    with _lock:
        _write_raw(data)


def next_id(items):
    return (max((item["id"] for item in items), default=0)) + 1


# ---- Users ----
def get_users():
    return load()["users"]


def get_user_by_email(email):
    if not email:
        return None
    email = email.lower()
    for u in get_users():
        if u.get("email") and u["email"].lower() == email:
            return u
    return None


def get_user_by_phone(phone):
    if not phone:
        return None
    for u in get_users():
        if u.get("phone") and u["phone"] == phone:
            return u
    return None


def get_user_by_id(user_id):
    for u in get_users():
        if u["id"] == user_id:
            return u
    return None


def add_user(user):
    data = load()
    user["id"] = next_id(data["users"])
    data["users"].append(user)
    save(data)
    return user


def update_user(user_id, updates):
    data = load()
    for u in data["users"]:
        if u["id"] == user_id:
            u.update(updates)
            save(data)
            return u
    return None


# ---- Favorites ----
def get_favorites():
    return load().get("favorites", [])


def get_favorite_destination_ids(user_id):
    return {f["destination_id"] for f in get_favorites() if f["user_id"] == user_id}


def add_favorite(user_id, destination_id):
    data = load()
    data.setdefault("favorites", [])
    existing = next(
        (f for f in data["favorites"] if f["user_id"] == user_id and f["destination_id"] == destination_id),
        None,
    )
    if existing:
        return existing, False
    favorite = {"id": next_id(data["favorites"]), "user_id": user_id, "destination_id": destination_id}
    data["favorites"].append(favorite)
    save(data)
    return favorite, True


def remove_favorite(user_id, destination_id):
    data = load()
    data.setdefault("favorites", [])
    before = len(data["favorites"])
    data["favorites"] = [
        f for f in data["favorites"]
        if not (f["user_id"] == user_id and f["destination_id"] == destination_id)
    ]
    removed = len(data["favorites"]) < before
    if removed:
        save(data)
    return removed


# ---- App feedback ----
def get_feedback():
    return load().get("feedback", [])


def add_feedback(feedback):
    data = load()
    data.setdefault("feedback", [])
    feedback["id"] = next_id(data["feedback"])
    data["feedback"].append(feedback)
    save(data)
    return feedback

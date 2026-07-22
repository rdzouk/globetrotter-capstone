"""
Data Access Layer
------------------
All reads/writes to the single JSON file go through here. A lock guards
against concurrent writes corrupting the file (the file itself is the
single point of failure in this monolith phase — that's the point of
this exercise).
"""
import json
import os
import threading

DATA_FILE = os.path.join(os.path.dirname(__file__), "data.json")
_lock = threading.Lock()


def _read_raw():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_raw(data):
    tmp_path = DATA_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp_path, DATA_FILE)  # atomic on POSIX


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


def get_user_by_username(username):
    for u in get_users():
        if u["username"] == username:
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


# ---- Destinations ----
def get_destinations():
    return load()["destinations"]


# ---- Itineraries ----
def get_itineraries():
    return load()["itineraries"]


def get_itineraries_for_user(user_id):
    return [i for i in get_itineraries() if i["user_id"] == user_id]


def add_itinerary(itinerary):
    data = load()
    itinerary["id"] = next_id(data["itineraries"])
    data["itineraries"].append(itinerary)
    save(data)
    return itinerary

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


# ---- Destinations ----
def get_destinations():
    return load()["destinations"]


def get_destination_by_id(destination_id):
    for d in get_destinations():
        if d["id"] == destination_id:
            return d
    return None


# ---- Itineraries ----
def get_itineraries():
    return load()["itineraries"]


def get_itineraries_for_user(user_id):
    return [i for i in get_itineraries() if i["user_id"] == user_id]


def get_itinerary_by_id(itinerary_id):
    for i in get_itineraries():
        if i["id"] == itinerary_id:
            return i
    return None


def add_itinerary(itinerary):
    data = load()
    itinerary["id"] = next_id(data["itineraries"])
    data["itineraries"].append(itinerary)
    save(data)
    return itinerary


def update_itinerary(itinerary_id, updates):
    data = load()
    for i in data["itineraries"]:
        if i["id"] == itinerary_id:
            i.update(updates)
            save(data)
            return i
    return None


def get_reviews_for_destination(destination_id):
    """All reviews left on a given place, across every user, newest first."""
    reviews = []
    for i in get_itineraries():
        if i["destination_id"] == destination_id and i.get("review"):
            user = get_user_by_id(i["user_id"])
            reviews.append({
                "itinerary_id": i["id"],
                "reviewer_name": user["name"] if user else "Former user",
                "rating": i["review"]["rating"],
                "comment": i["review"]["comment"],
                "visited_date": i["review"]["visited_date"],
            })
    return reviews


# ---- App feedback (comments/critiques about the app itself) ----
def get_feedback():
    return load().get("feedback", [])


def add_feedback(feedback):
    data = load()
    data.setdefault("feedback", [])
    feedback["id"] = next_id(data["feedback"])
    data["feedback"].append(feedback)
    save(data)
    return feedback

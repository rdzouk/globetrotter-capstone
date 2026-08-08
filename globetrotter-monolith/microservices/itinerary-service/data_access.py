import json
import os
import threading

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "itineraries.json")
_lock = threading.Lock()


def load():
    with _lock:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)


def save(data):
    with _lock:
        tmp_path = DATA_FILE + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, DATA_FILE)


def next_id(items):
    return (max((item["id"] for item in items), default=0)) + 1


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
    reviews = []
    for i in get_itineraries():
        if i["destination_id"] == destination_id and i.get("review"):
            reviews.append({
                "itinerary_id": i["id"],
                "user_id": i["user_id"],
                "rating": i["review"]["rating"],
                "comment": i["review"]["comment"],
                "visited_date": i["review"]["visited_date"],
            })
    return reviews

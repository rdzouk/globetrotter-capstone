"""
Data Access Layer — Recommendation Service owns destinations.json
exclusively. This is Yaoundé place data: search/filter, nearby-places
distance queries, and the raw data recommendations are scored from.
"""
import json
import os
import threading

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "destinations.json")
_lock = threading.Lock()


def load():
    with _lock:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)


def get_destinations():
    return load()["destinations"]


def get_destination_by_id(destination_id):
    for d in get_destinations():
        if d["id"] == destination_id:
            return d
    return None

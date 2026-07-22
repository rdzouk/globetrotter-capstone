"""
Business Logic Layer
---------------------
Recommendation scoring, destination search/filtering, and itinerary
validation. Kept separate from the API layer so it can be unit tested
without spinning up Flask, and so it can be lifted out wholesale when
this becomes a standalone recommendation microservice later.
"""


def search_destinations(destinations, query=None, category=None, neighborhood=None, tag=None):
    """
    query      free-text match on name/neighborhood/description
    category   exact match: restaurant | sports | spa | nightlife | hotel | attraction
    neighborhood exact match, e.g. "Bastos"
    tag        exact match against the descriptive tags list (e.g. "fancy", "affordable")
    """
    results = destinations
    if query:
        q = query.lower()
        results = [
            d for d in results
            if q in d["name"].lower() or q in d["neighborhood"].lower()
            or q in d["description"].lower()
        ]
    if category:
        c = category.lower()
        results = [d for d in results if d["category"].lower() == c]
    if neighborhood:
        n = neighborhood.lower()
        results = [d for d in results if d["neighborhood"].lower() == n]
    if tag:
        t = tag.lower()
        results = [d for d in results if t in [x.lower() for x in d["tags"]]]
    return sorted(results, key=lambda d: d["rating"], reverse=True)


def recommend_destinations(destinations, user, past_itineraries, limit=5):
    """
    Score every place the user hasn't already booked an itinerary to:
      + 10 points per matching preference tag (interest tags picked at registration)
      + rating * 2 as a tiebreaker/base score (rating is out of 5)
    Past trips are excluded so we don't recommend somewhere they've already been.
    """
    preferences = set(t.lower() for t in user.get("preferences", []))
    visited_ids = {it["destination_id"] for it in past_itineraries}

    scored = []
    for d in destinations:
        if d["id"] in visited_ids:
            continue
        tag_matches = len(preferences.intersection(t.lower() for t in d["tags"]))
        score = tag_matches * 10 + d["rating"] * 2
        scored.append((score, d))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [d for _, d in scored[:limit]]


def validate_itinerary_payload(payload, valid_destination_ids):
    errors = []
    if "destination_id" not in payload:
        errors.append("destination_id is required")
    elif payload["destination_id"] not in valid_destination_ids:
        errors.append("destination_id does not match a known destination")

    if "start_date" not in payload:
        errors.append("start_date is required (YYYY-MM-DD)")
    if "end_date" not in payload:
        errors.append("end_date is required (YYYY-MM-DD)")
    if "start_date" in payload and "end_date" in payload:
        if payload["end_date"] < payload["start_date"]:
            errors.append("end_date cannot be before start_date")

    return errors

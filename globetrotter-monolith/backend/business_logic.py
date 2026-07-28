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


def validate_registration_payload(payload):
    """
    name is required and MAY duplicate across users (it's just a display name).
    At least one of email / phone is required, and each — when provided — must
    be unique account-wide (checked separately in the API layer, since that
    needs a data lookup this pure-logic layer doesn't have access to).
    """
    errors = []
    if not payload.get("name"):
        errors.append("name is required")
    if not payload.get("password"):
        errors.append("password is required")
    elif len(payload["password"]) < 4:
        errors.append("password must be at least 4 characters")

    email = payload.get("email")
    phone = payload.get("phone")
    if not email and not phone:
        errors.append("either email or phone is required")
    if email and "@" not in email:
        errors.append("email looks invalid")
    if phone and not any(ch.isdigit() for ch in phone):
        errors.append("phone looks invalid")

    preferences = payload.get("preferences", [])
    if not isinstance(preferences, list):
        errors.append("preferences must be a list of tags")

    return errors


def validate_review_payload(payload):
    errors = []
    rating = payload.get("rating")
    if rating is None:
        errors.append("rating is required")
    elif not isinstance(rating, (int, float)) or not (1 <= rating <= 5):
        errors.append("rating must be a number between 1 and 5")

    if "visited_date" not in payload:
        errors.append("visited_date is required (YYYY-MM-DD)")

    comment = payload.get("comment", "")
    if comment and len(comment) > 1000:
        errors.append("comment is too long (max 1000 characters)")

    return errors


def validate_feedback_payload(payload):
    errors = []
    message = payload.get("message")
    if not message or not message.strip():
        errors.append("message is required")
    elif len(message) > 2000:
        errors.append("message is too long (max 2000 characters)")

    rating = payload.get("rating")
    if rating is not None and (not isinstance(rating, (int, float)) or not (1 <= rating <= 5)):
        errors.append("rating, if provided, must be a number between 1 and 5")

    return errors

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


# ---------------------------------------------------------------------
# Distance / "nearby places" — used for the place detail page's
# "places nearby" section (a simple, honest form of on-site content
# discovery — related-content sections like this are one of the more
# effective SEO techniques, since they keep visitors browsing instead
# of bouncing back to a search engine).
# ---------------------------------------------------------------------
import math


def haversine_km(lat1, lng1, lat2, lng2):
    """Great-circle distance between two lat/lng points, in kilometers."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nearby_destinations(destinations, origin, limit=5, max_km=3.0):
    """destinations near `origin` (a dict with 'id','lat','lng'), closest first."""
    scored = []
    for d in destinations:
        if d["id"] == origin["id"]:
            continue
        dist = haversine_km(origin["lat"], origin["lng"], d["lat"], d["lng"])
        if dist <= max_km:
            scored.append((dist, d))
    scored.sort(key=lambda pair: pair[0])
    return [{"distance_km": round(dist, 2), **d} for dist, d in scored[:limit]]


# ---------------------------------------------------------------------
# Neighborhood directory — a short "good to know" blurb plus which
# other neighborhoods are close by, for the area-info panel on the
# Explore page.
# ---------------------------------------------------------------------
NEIGHBORHOOD_INFO = {
    "Bastos": {
        "blurb": "Yaoundé's diplomatic and upscale district — embassies, fine dining, and the city's densest cluster of fancy restaurants and spas.",
        "nearby": ["Nlongkak", "Elig-Essono", "Centre-ville"],
    },
    "Centre-ville": {
        "blurb": "The administrative and commercial heart of the city, home to Poste Centrale, the Hilton, and most major hotels.",
        "nearby": ["Hippodrome", "Bastos", "Warda"],
    },
    "Hippodrome": {
        "blurb": "A relaxed, leafy district just south of downtown with a good concentration of casual restaurants and nightlife.",
        "nearby": ["Centre-ville", "Bastos", "Warda"],
    },
    "Nlongkak": {
        "blurb": "A busy roundabout district bordering Bastos, known for lounges, spas, and rooftop bars.",
        "nearby": ["Bastos", "Elig-Essono"],
    },
    "Elig-Essono": {
        "blurb": "A dense, lively neighborhood between Bastos and downtown, popular for nightlife and mid-range dining.",
        "nearby": ["Bastos", "Nlongkak", "Centre-ville"],
    },
    "Etoa-Meki": {
        "blurb": "A residential area to the south with several fitness and sports complexes.",
        "nearby": ["Biyem-Assi"],
    },
    "Essos": {
        "blurb": "A working-class, residential district east of the center with neighborhood restaurants off the main roads.",
        "nearby": ["Nlongkak", "Olembe"],
    },
    "Ngousso": {
        "blurb": "A northeastern residential area near the general hospital, with gyms and small wellness spots.",
        "nearby": ["Mimboman"],
    },
    "Odza": {
        "blurb": "A growing southern suburb, popular for affordable hotels and fitness centers, on the road toward the airport.",
        "nearby": ["Nsimalen", "Biyem-Assi"],
    },
    "Biyem-Assi": {
        "blurb": "A large southern district known for its nightlife scene around Carrefour Biyem-Assi.",
        "nearby": ["Etoa-Meki", "Odza"],
    },
    "Mvan": {
        "blurb": "A southeastern residential neighborhood with a handful of wellness spots.",
        "nearby": ["Mimboman"],
    },
    "Mimboman": {
        "blurb": "A large residential district east of downtown.",
        "nearby": ["Mvan", "Ngousso"],
    },
    "Warda": {
        "blurb": "Home to the multipurpose sports complex and PlaYce mall — a hub for shopping and sport right in the center.",
        "nearby": ["Centre-ville", "Hippodrome"],
    },
    "Nkolbisson": {
        "blurb": "A western district on the way out of the city, home to Eco Park.",
        "nearby": [],
    },
    "Nsimalen": {
        "blurb": "The airport district south of the city — mostly transit, with a couple of relaxation spots nearby.",
        "nearby": ["Odza"],
    },
    "Olembe": {
        "blurb": "A northern district known for local Cameroonian restaurants.",
        "nearby": ["Essos"],
    },
    "Soa": {
        "blurb": "A quiet town just north of Yaoundé, a good day-trip for nature and fishing spots.",
        "nearby": [],
    },
    "Ngoa-Ekelle": {
        "blurb": "The university district, home to Université de Yaoundé I and the city's main cinema.",
        "nearby": ["Centre-ville"],
    },
}

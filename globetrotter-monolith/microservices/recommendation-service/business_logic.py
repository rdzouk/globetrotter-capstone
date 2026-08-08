import math


def search_destinations(destinations, query=None, category=None, neighborhood=None, tag=None):
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


def recommend_destinations(destinations, preferences, visited_destination_ids, limit=5):
    """
    Score every place the user hasn't already booked an itinerary to:
      + 10 points per matching preference tag
      + rating * 2 as a tiebreaker/base score
    `preferences` and `visited_destination_ids` are supplied by the
    caller (fetched from User Service and Itinerary Service
    respectively) — this service owns none of that data itself.
    """
    prefs = set(t.lower() for t in preferences)
    scored = []
    for d in destinations:
        if d["id"] in visited_destination_ids:
            continue
        tag_matches = len(prefs.intersection(t.lower() for t in d["tags"]))
        score = tag_matches * 10 + d["rating"] * 2
        scored.append((score, d))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [d for _, d in scored[:limit]]


def haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nearby_destinations(destinations, origin, limit=5, max_km=3.0):
    scored = []
    for d in destinations:
        if d["id"] == origin["id"]:
            continue
        dist = haversine_km(origin["lat"], origin["lng"], d["lat"], d["lng"])
        if dist <= max_km:
            scored.append((dist, d))
    scored.sort(key=lambda pair: pair[0])
    return [{"distance_km": round(dist, 2), **d} for dist, d in scored[:limit]]


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

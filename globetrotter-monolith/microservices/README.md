# GlobeTrotter — Phase 2: Microservices

The monolith (`../backend/`) decomposed into three independent
services behind an API Gateway, exactly per the course's Phase 2
architecture: **User Service**, **Itinerary Service**, and
**Recommendation Service**, each owning its own data exclusively, and
talking to each other only over REST — never touching another
service's database directly.

```
                        ┌─────────────────┐
   Client (web/mobile) →│   API Gateway    │  :5000
                        │ (routes to the   │
                        │  right service)  │
                        └────────┬─────────┘
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                   ▼
    ┌──────────────────┐ ┌──────────────────┐ ┌─────────────────────┐
    │   User Service    │ │ Itinerary Service │ │ Recommendation Svc   │
    │      :5001        │ │      :5002        │ │       :5003          │
    │  users.json        │ │ itineraries.json  │ │  destinations.json   │
    └──────────────────┘ └──────────────────┘ └─────────────────────┘
```

## Who owns what

| Service | Owns | Endpoints |
|---|---|---|
| **User Service** | Identity, auth, favorites, app feedback | `/register`, `/login`, `/profile`, `/favorites`, `/feedback` |
| **Itinerary Service** | Trip planning, visited/review flow | `/itineraries`, `/itineraries/<id>/visit`, `/destinations/<id>/reviews` |
| **Recommendation Service** | The 58 Yaoundé places, search, recommendations | `/destinations`, `/destinations/<id>/nearby`, `/neighborhoods/<name>`, `/recommendations` |
| **API Gateway** | Nothing of its own — pure routing | Every path above, forwarded to whichever service owns it |

## The interesting part: synchronous inter-service calls

Three real, working cross-service REST calls, matching the slide's
example exactly ("Recommendation Service calling User Service"):

1. **`GET /recommendations`** (Recommendation Service) calls **User
   Service** (`/internal/users/<id>`) for interest preferences, and
   **Itinerary Service** (`/internal/itineraries?user_id=`) for what's
   already been booked, so it doesn't recommend a repeat. Verified
   live: booking a place removes it from that user's next
   recommendations.
2. **`POST /favorites`** and **`GET /favorites`** (User Service) call
   **Recommendation Service** (`/internal/destinations/<id>`) to
   verify a destination exists before favoriting it, and to hydrate
   favorited IDs into full place objects (name, image, rating) for
   display.
3. **`POST /itineraries`** (Itinerary Service) calls **Recommendation
   Service** to validate `destination_id` before accepting a booking
   — verified live: booking a nonexistent destination is correctly
   rejected. **`GET /destinations/<id>/reviews`** calls **User
   Service** to resolve each reviewer's display name, since Itinerary
   Service only stores `user_id`, not identity.

All three calls have a short timeout (3s) and degrade gracefully
rather than crash if a peer service is down — e.g. recommendations
still return (just without preference-weighting) if User Service is
unreachable; favorites still return (with `"unavailable": true`) if
Recommendation Service is down. Both paths are covered by mocked
tests (see below).

## Auth: JWT, not shared sessions

Only **User Service** ever touches a password. It issues JWTs at
login. Every other service independently *verifies* tokens using the
same `JWT_SECRET` (shared via environment variable) — no service
calls User Service just to check if a token is valid. That's the
standard stateless-auth pattern for microservices: verification
doesn't require a network call.

## Running it

### Option A — Docker Compose (matches the course's deployment target)

```bash
cd microservices
docker compose up --build
```
Gateway on `http://localhost:5000`. Each service's `data/` folder is
volume-mounted so your data survives container restarts.

### Option B — locally, no Docker

```bash
cd microservices
./run_all.sh     # starts all 4 services with their own venvs
./stop_all.sh    # stops them
```

The web frontend needs **zero changes** either way — it already
points at `http://localhost:5000`, and the gateway preserves every
URL path the old monolith used.

## Verified test results

**63 unit tests, all passing**, each service tested in isolation with
cross-service calls mocked:
- User Service: 18/18 (including graceful-degradation-when-peer-down)
- Itinerary Service: 11/11
- Recommendation Service: 12/12 (including graceful degradation)
- API Gateway: 22/22 (routing table, header/query passthrough, 503/504 on peer failure, aggregate health check)

**Plus a full live integration run** — all 4 services started as real
processes, hit through the gateway end-to-end: register → login →
favorite a place (cross-service existence check) → book an itinerary
(cross-service validation; confirmed a bogus `destination_id` is
correctly rejected) → mark visited with a review → fetch public
reviews (confirmed the reviewer's real name resolved via User
Service, not just a raw ID) → fetch recommendations (confirmed the
just-booked place was excluded and results matched stated
preferences) → nearby places → neighborhood info → profile. Every
step passed.

## Restoring destination data (and your own photos)

`recommendation-service/data/destinations.json` gets reset to a tiny
2-place test dataset whenever you run that service's `pytest` suite
(same reasoning as the monolith — see its README). To restore all 58
places:
```bash
cd recommendation-service
python seed_destinations.py
```
This checks `../../frontend/static/images/places/<id>.jpg` for each
place first and uses it if present — **it will never overwrite a
photo you've already added**, so it's always safe to re-run.

## Known limitation, honestly

I could not test the actual `docker compose up` build in this
environment — no Docker available in this sandbox. The Dockerfiles
and compose file are written correctly (verified by careful reading,
consistent with your course scaffold's own Dockerfile conventions),
and all the *application logic* they package is fully tested and
proven working via the live integration run above. But the container
build itself is the one thing I'm asking you to be the first to
verify — run `docker compose up --build` and let me know immediately
if anything doesn't come up cleanly.

## A note on the JSON-file "databases"

Per the architecture diagram, each service has its own database
(User DB, Itinerary DB, Destinations DB) — here that's three separate
JSON files (`users.json`, `itineraries.json`, `destinations.json`),
one per service, matching the "each service owns its data
exclusively" principle even though the storage technology itself is
still simple. Swapping each JSON file for a real per-service database
(Postgres, MongoDB, etc.) is exactly the kind of change this
architecture is designed to make painless — the `data_access.py` in
each service is the only place that would need to change.

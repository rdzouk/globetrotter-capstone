# GlobeTrotter Travel Assistant — Yaoundé Edition (Phase 1: Monolith)

A single Flask process handling all requests, with a JSON file as the
only datastore. This build is personalized to **Yaoundé, Cameroon**:
53 real venues (restaurants, sport complexes, spas, hotels, nightlife,
and attractions) sourced from real place data, spread across 17
neighborhoods including a strong concentration in Bastos, plotted on
a live interactive map (Leaflet + OpenStreetMap — no API key needed).

This is still the deliberately-limited course baseline: no database,
no redundancy, no horizontal scaling. Every weakness you hit here is
the motivation for the next phase (database → services → distributed
system).

## Architecture

```
Browser (HTML/JS pages) → API (Flask routes, app.py)
                              → Business Logic (business_logic.py) — search, scoring, validation
                              → Data Access (data_access.py) — reads/writes data.json under a lock
Auth (auth.py) — password hashing + JWT issue/verify, used by the API layer
```

The frontend is plain server-rendered HTML (Jinja templates) plus
vanilla JS in `static/app.js` that calls the same JSON API endpoints
you'd hit with curl. The JWT is stored in the browser's `localStorage`
after login and sent as `Authorization: Bearer <token>` on every
subsequent request — same auth flow either way.

### Pages

| URL | Page |
|---|---|
| `/` | Search & browse destinations |
| `/register` | Create an account (username, password, interest tags) |
| `/login` | Log in, stores JWT in the browser |
| `/recommendations-page` | Personalized picks (requires login) |
| `/itineraries-page` | Your saved itineraries + booking modal |

(The plain JSON API routes — `/destinations`, `/recommendations`,
`/itineraries` — still exist exactly as before for curl/Postman/tests;
the `-page` suffix avoids clashing with the API routes of the same
name.)

Each layer is its own module on purpose — even though everything runs
in one process, keeping Business Logic and Data Access decoupled from
the Flask route handlers means you can unit test the logic without an
HTTP server, and it's what lets you lift business_logic.py wholesale
into a "recommendation service" in a later phase.

## Project layout

```
globetrotter-monolith/
├── app.py              # API layer — Flask routes (JSON API + page routes)
├── auth.py             # JWT + password hashing
├── business_logic.py   # Search, recommendation scoring, validation
├── data_access.py      # Thread-safe JSON file read/write
├── data.json             # The "database" — seeded with 12 destinations
├── templates/           # Jinja HTML pages (base.html + one per page)
├── static/
│   ├── style.css        # Page styling
│   └── app.js            # Nav state + booking modal, shared by every page
├── requirements.txt
├── tests/
│   └── test_app.py     # pytest suite, 11 tests, exercises every endpoint
├── .gitignore
└── README.md
```

## Setup

Requires Python 3.10+.

```bash
cd globetrotter-monolith
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Dependencies (what and why)

| Package  | Purpose |
|---|---|
| Flask | HTTP server / routing |
| PyJWT | Issuing and verifying JWT auth tokens |
| Werkzeug | Password hashing (`generate_password_hash` / `check_password_hash`) — installed as a Flask dependency, pinned explicitly here since we import it directly |
| pytest | Test runner |
| requests | Only needed if you write a manual smoke-test script that hits the running server over HTTP |

## Run the server

```bash
python app.py
```

Starts on `http://localhost:5000`. Debug mode is on for local dev —
turn it off (`debug=False`) before anything resembling production.

## Run the tests

```bash
pytest -q
```

**Known limitation, on purpose:** the test suite resets `data.json` to
a small fixed dataset before/after every test so tests don't leak
state into each other. That means running `pytest` will overwrite your
real `data.json` with the test dataset. This is exactly the kind of
problem a real database (with test/prod separation, transactions, and
isolated schemas) solves and a shared JSON file cannot — make a note
of it for your Phase 2 write-up. If you need your seed data back,
re-run the seeding snippet in `data.json`'s git history or regenerate
it from the 12-destination list below.

## API Reference

### `POST /register`
```json
// request
{ "username": "gaetan", "password": "pass1234", "preferences": ["mountain", "adventure"] }
// 201 response
{ "id": 1, "username": "gaetan" }
```
`preferences` is optional (defaults to `[]`) — it's a list of tags
(e.g. `beach`, `mountain`, `culture`, `food`, `adventure`, `city`,
`relaxation`, `nature`, `history`, `luxury`, `skiing`) used later by
`/recommendations`.

### `POST /login`
```json
// request
{ "username": "gaetan", "password": "pass1234" }
// 200 response
{ "token": "<JWT>" }
```
Send this token as `Authorization: Bearer <JWT>` on every protected
route below. Tokens expire after 24 hours (see `auth.TOKEN_TTL_HOURS`).

### `GET /destinations`
Public, no auth. Returns Yaoundé venues. Query params (all optional, combinable):
- `q` — free-text match against name/neighborhood/description
- `category` — `restaurant` | `sports` | `spa` | `nightlife` | `hotel` | `attraction`
- `neighborhood` — exact match, e.g. `Bastos`, `Hippodrome`, `Centre-ville`
- `tag` — descriptive tag match, e.g. `fancy`, `affordable`, `live-music`, `outdoor`

```
GET /destinations?category=restaurant&neighborhood=Bastos
GET /destinations?tag=fancy
```

Each venue includes `lat`/`lng` (used to plot it on the map), `rating`
and `rating_count` (real Google-style ratings), `price_level`, `phone`,
and `address`.

### `GET /recommendations` (auth required)
Scores every venue the user hasn't already booked an itinerary to:
+10 points per matching interest tag (set at registration, e.g.
`fancy`, `spa`, `nightlife`), plus `rating * 2` as a tiebreaker.
Optional `?limit=N` (default 5).

### `POST /itineraries` (auth required)
```json
{ "destination_id": 3, "start_date": "2026-08-01", "end_date": "2026-08-07", "notes": "honeymoon" }
```
Validates that `destination_id` exists and `end_date >= start_date`.

### `GET /itineraries` (auth required)
Returns only the authenticated user's itineraries.

## What this phase deliberately does NOT solve

Keep this list — it's your comparison baseline for later phases:

- **Single point of failure**: one process, one file. If either dies, the whole system is down.
- **No horizontal scaling**: the JSON file can't be shared safely across multiple server instances (file locks don't work across machines).
- **No real concurrency control**: the in-process lock in `data_access.py` protects against races within one process, not across processes.
- **No observability**: only basic request logging — no metrics, no distributed tracing, no dashboards.
- **No cost elasticity**: the server runs (and costs you) 24/7 regardless of traffic; it can't scale to zero or scale out on demand.
- **JWT secret is hardcoded** for dev convenience (`auth.SECRET_KEY`) — must move to a real secrets manager before this goes anywhere near production.

## Git

```bash
git init          # already done if you used the commands above
git add .
git commit -m "Phase 1: monolith baseline"
```

Push to your team's remote (GitHub/GitLab) as required by the course.

# GlobeTrotter Travel Assistant — Yaoundé Edition

A single Flask API, personalized to **Yaoundé, Cameroon** (53 real venues
across 17 neighborhoods), with two clients: a web frontend and a Flutter
mobile app — both talking to the same backend.

```
globetrotter-monolith/
├── backend/    # Flask JSON API — the only place data lives
├── frontend/   # HTML/CSS/JS web client (browser)
└── mobile/     # Flutter/Dart client (Android/iOS) — see mobile/README.md
```

The backend is a pure JSON API (CORS-enabled) — it has no idea whether
it's being called by a browser, a phone, or curl. That separation is
what let the Flutter app get added without touching a single line of
Python.

## What's new in this build

- **Flexible identity**: register with a `name` (can duplicate — two
  different people can both be "Alice") plus **either an email or a
  phone number** as your unique identifier. Log in with whichever one
  you registered with.
- **Visited places + reviews**: mark any itinerary as visited, attach
  a star rating, a comment, and the date — this becomes a public
  review on that place's page (`GET /destinations/<id>/reviews`).
- **App feedback**: a separate channel (`POST`/`GET /feedback`) for
  comments and critiques about the app itself, not about a place.
- **Light/dark mode**: implemented client-side in the Flutter app
  (Settings tab) and persisted on-device — this needs no backend
  support since it's purely a rendering choice.
- **Flutter mobile app**: full client in `mobile/` — see its README
  for setup, and note the backend URL you'll need to configure
  depending on emulator vs. physical device.

## Quick start (backend)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest -q            # 23 tests
python app.py          # http://localhost:5000
```

## Quick start (web frontend)

```bash
cd frontend
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python serve.py       # http://localhost:5173
```

This is a tiny, separate Flask app (`serve.py`) whose only job is
rendering the HTML templates — it has no business logic and never
touches `data.json`. Every page's JavaScript calls the real backend
directly using `API_BASE_URL` (set in `static/app.js`, defaults to
`http://localhost:5000`) — change that if your backend runs elsewhere.

## Quick start (mobile)

```bash
cd mobile
flutter pub get
flutter run
```

**Read `mobile/README.md` first** — the backend URL you configure
depends on whether you're using an emulator or a real phone.



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
{ "name": "Gaetan", "email": "gaetan@example.com", "password": "pass1234", "preferences": ["fancy","restaurant"] }
```
`name` may duplicate across accounts — it's just a display name.
Provide **either `email` or `phone`** (or both) — whichever you give
must be unique account-wide. Example with phone instead:
```json
{ "name": "Gaetan", "phone": "+237699112233", "password": "pass1234" }
```

### `POST /login`
```json
{ "email": "gaetan@example.com", "password": "pass1234" }
```
or
```json
{ "phone": "+237699112233", "password": "pass1234" }
```
Returns `{ "token": "<JWT>", "name": "Gaetan" }`.

### `PATCH /itineraries/<id>/visit` (auth required, owner only)
Marks a planned itinerary as visited and attaches a review:
```json
{ "rating": 5, "comment": "Loved it!", "visited_date": "2026-08-03" }
```

### `GET /destinations/<id>/reviews`
Public — every user's review of that place (reviewer name, rating,
comment, visited date), newest first.

### `POST /feedback` (auth required) / `GET /feedback` (public)
Comments and critiques about the **app itself** — separate from place
reviews above:
```json
{ "message": "Really like the Yaoundé map!", "rating": 5 }
```

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

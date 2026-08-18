# GlobeTrotter Travel Assistant — Yaoundé Edition

Production-grade web app for discovering restaurants, spas, hotels,
and attractions across Yaoundé, Cameroon (58 real venues, 17
neighborhoods). Web-only — no mobile app.

```
globetrotter-monolith/
├── frontend/         Static site (HTML/CSS/JS, no build step) — served
│                       directly by Nginx (see nginx/nginx.conf)
├── backend/          Flask API — PostgreSQL (SQLite in local dev),
│                       Redis-backed rate limiting, Gunicorn, Alembic
│                       migrations. See its own detailed README below.
├── microservices/    Alternate architecture: same functionality as
│                       backend/, split into 3 services + a gateway.
│                       Not the deployment target (see
│                       ARCHITECTURE_AUDIT.md for why) but fully
│                       tested and documented — microservices/README.md
├── nginx/            Reverse proxy config — HTTPS-ready, serves the
│                       static frontend, proxies /api/ to the backend
├── docker-compose.yml  Nginx + backend + PostgreSQL + Redis, one command
├── scripts/           migrate_json_to_postgres.py, backup_db.sh, restore_db.sh
├── docs/              DEPLOYMENT.md, SECURITY.md, MONITORING.md, BACKUPS.md
├── .github/workflows/  CI (test + lint + docker build) and deploy
└── ARCHITECTURE_AUDIT.md   Full audit: problems found, decisions, migration plan
```

## Quick start — local development (no Docker)

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head            # create the schema (SQLite by default)
python seed_destinations.py      # load the 58 places
python app.py                     # http://localhost:5000

# Frontend (separate terminal) — any static server works, e.g.:
cd frontend
python3 serve_local.py          # http://localhost:8080 — no dependencies, one command
```

## Quick start — full production stack (Docker Compose)

```bash
cp .env.example .env    # fill in real secrets — see docs/DEPLOYMENT.md
docker compose build
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend python seed_destinations.py
docker compose up -d
curl http://localhost/health
```

Full VPS setup (firewall, HTTPS, Cloudflare) in `docs/DEPLOYMENT.md`.

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
- **Light/dark mode**: toggle in the nav bar on every web page, and
  toggle in the nav bar — persisted per-device.
- **English/French**: language toggle in the web nav bar (persisted).
- **58 places** now, including Canal Olympia (Yaoundé's main cinema —
  what people often call "the Majestic"), the Cathedral of Our Lady of
  Victories, PlaYce mall in Warda, Star Land Hotel Bastos, and Djeuga
  Palace — plus two new categories, `entertainment` and `landmark`.
- **Live location + route line**: "Show my location (live)" on the
  Explore map uses `watchPosition` to keep a blue dot updating as you
  move, and "Route from me" draws a straight line + distance to any
  place.
- **Transport estimates**: picking taxi / moto-taxi / Yango / own
  vehicle when booking an itinerary shows a rough fare + time
  estimate based on straight-line distance. **These are formula-based
  estimates, not live pricing** from any ride-hailing API — labeled
  as such in the UI.
- **Nearby places**: every place card has a "Nearby places" button
  showing what else is within 3km (`GET /destinations/<id>/nearby`).
- **Area info**: selecting a neighborhood filter shows a "good to
  know" blurb about that area plus which neighborhoods are close by
  (`GET /neighborhoods/<name>`).
- **Weekly planner**: a new Planner page lays your itineraries out as
  a Monday–Sunday timetable, using an optional `time_slot` field you
  can set when booking (e.g. "09:00–11:00").

## Quick start (backend)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest -q            # 23 tests
python app.py          # http://localhost:5000
```


## Architecture

```
Browser (HTML/JS pages) → API (Flask routes, app.py)
                              → Business Logic (business_logic.py) — search, scoring, validation
                              → Data Access (data_access.py) — reads/writes data.json under a lock
Auth (auth.py) — password hashing + JWT issue/verify, used by the API layer
```

The frontend is a plain static site (no build step, no server-side
rendering) plus
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

## Two honesty notes

**Photos are placeholders, not real venue photos.** I pulled real
names, addresses, coordinates, and ratings for every place, but I
can't legally scrape and re-host actual Google Photos of these
businesses in an app — that's outside what their licensing allows.
Each place has a stable placeholder image (`image_url`, from Lorem
Picsum, seeded so it's consistent) so the UI has something to show.
If you want real photos, the proper path is Google's Places Photos
API with your own API key and billing — I can wire that in if you
set one up.

**No verbatim Google review text.** I gathered the real aggregate
rating and rating count for every place (that's factual data, not
copyrighted) but I didn't copy actual review sentences into the
app — reproducing other people's review text isn't something I can
do. What the app has instead is its own review system: any user who
marks a place visited can leave a real star rating + comment, which
shows up on that place's public reviews.

## Adding your own real photos

Placeholder images work out of the box, but if you want to swap in
real photos you've collected yourself:

1. **Save each photo** as `<id>.jpg` (or `.jpeg`/`.png`) into
   `frontend/static/images/places/` — the ID is the number next to
   each place (e.g. `1.jpg` for Tassa, `58.jpg` for La Cathédrale).
   Landscape orientation, ~800×600px, under 300KB works best.
2. **Run the sync script** for whichever backend you're using:
   ```bash
   cd backend && python update_images.py                              # monolith
   cd microservices/recommendation-service && python seed_destinations.py  # microservices
   ```
   Both scan that same shared folder and point each matching place's
   `image_url` at your local file — no manual JSON editing needed.
   Places without a photo yet keep the placeholder, so you can add
   them gradually.
3. **If a place's data ever needs a full reset** (most commonly:
   you ran `pytest`, which intentionally wipes the destinations file
   down to a 2-place test dataset so tests don't leak state — see
   `## What this phase deliberately does NOT solve`), re-run:
   ```bash
   cd backend && python seed_destinations.py                              # monolith
   cd microservices/recommendation-service && python seed_destinations.py  # microservices
   ```
   **This is safe to run any time and will never overwrite photos
   you've already added** — it checks `frontend/static/images/places/`
   first for each place, and only falls back to a placeholder if no
   local photo exists yet for that ID.
4. Restart the backend (or let its auto-reloader pick it up) and
   refresh the frontend.

## Latest round of additions

- **Real interactive map, on its own page** (`/map-page`) — built on
  [OpenFreeMap](https://openfreemap.org/) + MapLibre GL JS (free, no
  API key, nicer vector-tile rendering than plain OpenStreetMap
  raster tiles). Hover a pin for a quick name+description tooltip;
  click for a full detail panel (image, categories, tags, nearby
  places) and a **route builder**: turn on live location, pick a
  place, and it draws a line from you to it with distance, and a
  time/fare estimate per transport mode.
- **Clickable tags and category badges** — click any tag chip or
  category badge on a place card and it filters the whole page to
  that tag/category instantly.
- **"This period has passed" + Book again** — itineraries whose end
  date is in the past show a passed badge and a one-click rebook
  button (pre-fills the same place).
- **Favorites** — heart any place from its card; see them all on the
  new Favorites page (`GET`/`POST /favorites`, `DELETE /favorites/<id>`).
- **"Show on map"** on every destination card, deep-linking straight
  into the map page with that place pre-selected.
- **Profile page** — edit your name and interests
  (`GET`/`PATCH /profile`), and a consolidated language (EN/FR) +
  theme switcher, alongside your (read-only) identity.
- **A crafted SVG hero banner** on the login page, sketching Bastos,
  Centre-ville's cathedral, Warda's mall, Hippodrome, and Nlongkak as
  a stylized skyline over Yaoundé's hills.
- **Category-relevant images** — every place now shows a real,
  freely-licensed photo matching its category (a real restaurant
  photo for restaurants, a real spa photo for spas, etc.) via
  LoremFlickr, instead of random placeholder images.

### Two honesty notes on this round

**Photos are still not photos of these specific venues.** I pulled
real names, addresses, coordinates, and ratings for every place, but
I can't legally scrape and re-host actual Google Photos of these
businesses — that's outside what their licensing allows, full stop.
What's there now is a real, category-matched Creative-Commons photo
per place (via LoremFlickr) — much better than random placeholders,
but still not a photo of that exact restaurant/spa/hotel. If you want
real per-venue photos, the correct path is Google's Places Photos API
with your own key/billing; ask if you want that wired in.

**Mobile app wasn't updated with this round** — live location, the
route builder, favorites, clickable tags, book-again, and the profile
This is a web-only application; there is no mobile app to keep in sync.

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
{ "destination_id": 3, "start_date": "2026-08-01", "end_date": "2026-08-07",
  "time_slot": "09:00-11:00", "transport_mode": "taxi", "notes": "honeymoon" }
```
`time_slot` and `transport_mode` are both optional free-text fields —
`time_slot` powers the weekly Planner page, `transport_mode` is one of
`taxi` / `moto` / `yango` / `own` and just gets stored + redisplayed
(the fare estimate itself is computed client-side, not stored).
Validates that `destination_id` exists and `end_date >= start_date`.

### `GET /destinations/<id>/nearby`
Public. Other places within a radius (default 3km, override with
`?max_km=`), closest first, each with a `distance_km`. Optional
`?limit=N` (default 5).

### `GET /neighborhoods/<name>`
Public. A short "good to know" blurb about that area, which
neighborhoods are nearby, and how many places are listed there.

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

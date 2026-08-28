# ARCHITECTURE_AUDIT.md

Audit of the existing GlobeTrotter repository, before any production
hardening work begins. Written per the brief's explicit instruction to
inspect everything and understand it before changing anything.

---

## 1. Current Architecture

Three parallel codebases exist in this repo, at different levels of
completeness:

```
globetrotter-monolith/
├── backend/          Flask monolith API — the most complete, tested
│                       implementation. JSON-file "database" (data.json).
├── microservices/     Same functionality split into 3 services + an
│                       API Gateway (User / Itinerary / Recommendation),
│                       each with its own JSON file, communicating over
│                       REST. Fully tested (78 unit tests total across
│                       4 services) and proven via live integration runs.
└── frontend/          Web client. Currently in a HALF-MIGRATED,
                        DUPLICATED state — see Problem #1 below.
```

No Docker, no Nginx, no Postgres, no Redis, no CI/CD pipeline, and no
`.env.example` exist yet anywhere in the repo.

## 2. Current Technologies

| Layer | Technology |
|---|---|
| Backend | Python 3, Flask 3.0.3, Flask-CORS 4.0.1, PyJWT 2.9.0, Werkzeug (password hashing via PBKDF2) |
| "Database" | Plain JSON files, one per service, read/written with a threading lock |
| Frontend | Plain HTML/CSS/vanilla JS. Leaflet.js + OpenStreetMap on some pages, MapLibre GL JS + OpenFreeMap on the dedicated map page |
| Testing | pytest, 37 tests (monolith) + 78 tests (microservices), all currently passing |
| Auth | JWT (HS256), issued at login, verified independently by each service |
| Dev server | Flask's built-in development server (`app.run(...)`) — **not production-safe** |

## 3. Current Problems

Ranked by severity:

### Critical (must fix before any production deployment)
1. **Duplicated, half-migrated frontend.** `frontend/` currently has
   BOTH the original Jinja-templated pages in `frontend/templates/`
   (11 files, server-rendered, requires `frontend/serve.py`'s Flask
   process) AND a partial static-HTML conversion at `frontend/*.html`
   (9 files — `map.html` was never finished, so it's missing from the
   static set). These are two different architectures for the same
   pages, actively diverging (`diff` confirms `index.html` differs
   between the two locations). This must be resolved to one approach
   before anything else — see Recommended Architecture below.
2. **`debug=True` hardcoded** in `backend/app.py`'s `app.run()` call.
   Flask's debug mode exposes an interactive Python debugger/console
   over HTTP on any unhandled exception — a remote code execution risk
   if ever left on in production.
3. **Wide-open CORS**: `CORS(app)` with no origin restriction, in
   `backend/app.py`. Fine for local development, unacceptable once
   real user data and auth tokens are involved — any website can make
   authenticated-looking requests against it from a victim's browser.
4. **JWT secret defaults to a hardcoded string** (`"dev-secret-change-me"`
   in `auth.py`) if the `JWT_SECRET` environment variable isn't set.
   Silent fallback to a known secret is a critical auth bypass risk if
   ever deployed without setting the real env var.
5. **Flask's development server serves production traffic.** It's
   single-threaded by default, not hardened against slow-client
   attacks, and its own docs say not to use it in production.
6. **No rate limiting anywhere** — login, registration, and every
   other endpoint can be hit at unlimited frequency, enabling
   brute-force credential attacks and trivial denial-of-service.

### High
7. **JSON-file persistence.** No transactions across related writes,
   no concurrent-access safety beyond a single in-process lock (fails
   under multiple worker processes, which Gunicorn will run), and
   — as already documented in the existing READMEs — running `pytest`
   destructively resets seed data, requiring manual restore scripts.
   Not viable for real user data at any real scale.
8. **No security headers** (HSTS, X-Content-Type-Options,
   Content-Security-Policy, etc.) anywhere in the stack.
9. **No health/readiness endpoints.** Nothing to point Docker health
   checks or a load balancer at.
10. **No structured logging.** `backend/app.py` has a single
    `logging.basicConfig` line; no request IDs, no per-request timing,
    no way to trace a failure end-to-end.

### Medium
11. **No automated CI.** Tests exist and pass, but nothing runs them
    automatically on push/PR.
12. **No PWA support** — no manifest, no service worker, not
    installable.
13. **No SEO metadata** — no meta descriptions, Open Graph tags,
    sitemap, or robots.txt on the public-facing pages.
14. **Accessibility unaudited** — semantic HTML is mostly reasonable
    (real `<label>`s, `<button>`s), but no systematic keyboard-nav,
    contrast, or screen-reader pass has been done.
15. **No `.env.example`**, so there's no documented list of what
    environment variables a deployer needs to set.

### Low / not actually problems
- **Password hashing (PBKDF2 via Werkzeug)** is acceptable for
  production — not as strong as Argon2id, but not a critical gap.
  Worth upgrading opportunistically, not urgent.
- **Microservices split** — technically extra complexity versus the
  monolith, but well-tested and not "dozens of services." Per the
  brief's explicit instruction to avoid unnecessary complexity, I'm
  recommending the **monolith as the production deployment target**
  (see below) and keeping `microservices/` as a documented, working
  alternative rather than deleting it — it's real, tested engineering
  work, not dead code.

## 4. Recommended Architecture

Matches the brief's diagram directly:

```
Internet → Cloudflare (DNS/WAF/CDN, configured outside this repo)
         → Nginx (reverse proxy, HTTPS termination, serves static frontend directly)
              ├─→ /              → static frontend files (served directly by Nginx)
              └─→ /api/v1/*      → Gunicorn → Flask backend (backend/)
                                        ├─→ PostgreSQL (primary datastore)
                                        └─→ Redis (rate limiting, caching)
```

Key decisions and why:

- **Monolith (`backend/`), not microservices, is the production
  target.** The brief explicitly says not to introduce unnecessary
  service-decomposition complexity, and the monolith already has full
  feature parity, more mature tests, and one fewer network hop per
  request. `microservices/` stays in the repo, documented, as a
  legitimate alternative architecture — useful if the team later needs
  to scale specific pieces independently — but isn't what gets
  deployed first.
- **Finish the static frontend conversion, delete the Jinja version.**
  A static frontend served directly by Nginx is simpler, faster (no
  per-request Python template rendering), and trivially cacheable/
  CDN-friendly — a better fit for the brief's architecture than
  running a second Flask process (`frontend/serve.py`) just to render
  templates. This resolves Problem #1 by picking one approach instead
  of maintaining two.
- **PostgreSQL replaces the JSON files.** Real transactions, real
  concurrent-write safety (needed the moment Gunicorn runs more than
  one worker), and it removes the "running tests wipes production
  data" class of bug entirely, since tests will run against a
  separate test database.
- **Redis** for rate limiting (login/register endpoints) and, later,
  response caching for expensive/reused reads.
- **Gunicorn** replaces `app.run()` as the production WSGI server.

## 5. Migration Plan (incremental, matching the brief's process rules)

1. Finish/resolve the frontend duplication (delete one version).
2. Introduce environment-based configuration + `.env.example`; remove
   hardcoded secrets and `debug=True`.
3. Lock down CORS to explicit origins.
4. Add rate limiting (Flask-Limiter + Redis) to auth endpoints.
5. Add security headers (Flask-Talisman or equivalent).
6. Add `/health` and `/ready` endpoints.
7. Introduce structured logging with request IDs.
8. Design the PostgreSQL schema; write SQLAlchemy models +
   `scripts/migrate_json_to_postgres.py` with dry-run support.
9. Swap `data_access.py` to use PostgreSQL instead of JSON, behind the
   same function signatures so `business_logic.py` and `app.py` don't
   need to change.
10. Dockerize: `Dockerfile` (Gunicorn-based) for the backend, Nginx
    config, `docker-compose.yml` wiring Nginx + backend + Postgres +
    Redis.
11. GitHub Actions CI: lint + test on every push/PR.
12. PWA: manifest + service worker for the static frontend.
13. SEO: meta tags, sitemap.xml, robots.txt on public pages.
14. Accessibility pass across all pages.
15. Documentation: `DEPLOYMENT.md`, `SECURITY.md`, `API.md`,
    `BACKUPS.md`, `MONITORING.md`.

Each step will be implemented, tested, and verified working before
moving to the next, per the brief's process rule.

## 6. Risks

- **Data migration risk**: moving from JSON to Postgres risks losing
  the 58-place Yaoundé dataset if the migration script has bugs — the
  script will support `--dry-run` and won't delete the JSON source
  files.
- **Downtime risk during cutover**: mitigated by testing the full
  Docker Compose stack locally before any real deployment.
- **Scope risk**: this is a large brief (30+ sections). Work proceeds
  incrementally per the brief's own rule rather than as one giant
  rewrite, so a partial-completion state is always still a working,
  tested application, not a broken one.

## 7. Compatibility Considerations

- The API's URL paths and JSON response shapes stay identical during
  the Postgres migration — only `data_access.py` changes internally.
  This means the frontend requires zero changes for that step.
- The microservices variant's data access layer is structured the
  same way (`data_access.py` per service), so the same Postgres
  migration pattern could later be applied there too, if the team
  ever needs to deploy that architecture instead.

## 8. Files That Should Remain

- `backend/app.py`, `business_logic.py`, `auth.py` — solid,
  well-tested route/logic layer; needs config hardening, not a
  rewrite.
- `backend/tests/test_app.py` — 37 passing tests, good coverage of
  the API surface.
- `frontend/static/{app.js,i18n.js,layout.js,config.js,style.css}` —
  all working, no server-side dependency.
- `microservices/` — kept as a working, documented alternative
  architecture.

## 9. Files That Should Be Refactored

- `backend/data_access.py` — swap JSON-file I/O for SQLAlchemy,
  keeping the same function signatures.
- `backend/app.py` — remove `debug=True`, lock down CORS, add
  security headers/rate limiting/health endpoints.
- `backend/auth.py` — remove the hardcoded JWT secret fallback; fail
  loudly if `JWT_SECRET` isn't set in production.
- The 9 partially-converted static frontend pages — need `map.html`
  finished, then all pages get PWA/SEO additions.

## 10. Files That Can Eventually Be Removed

- `frontend/templates/` (all 11 Jinja files) — once the static
  conversion is finished and verified, this entire directory and
  `frontend/serve.py` become dead code.
- `backend/data.json` and the various `seed_destinations.py` /
  `update_images.py` scripts — retired once PostgreSQL is live (the
  seed data moves into a proper migration/seed script instead).

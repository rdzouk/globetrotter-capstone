# SECURITY.md

## Authentication

- Passwords hashed with Werkzeug's PBKDF2 implementation (`generate_password_hash`/`check_password_hash`) — never stored or logged in plaintext, never returned in any API response.
- JWT (HS256), 24-hour expiry, signed with `JWT_SECRET` (required env var in production — the app refuses to start without it, see `config.py`).
- Every non-public endpoint verifies the JWT independently via `require_auth` — no session state on the server.

## Authorization / IDOR protection

Ownership is always determined from the authenticated JWT's `sub` claim (`request.user_id`), never from any ID in the request body or URL. Examples:
- `GET /itineraries` only returns itineraries where `user_id == request.user_id`.
- `PATCH /itineraries/<id>/visit` checks `itinerary["user_id"] != request.user_id` and returns 404 (not 403 — doesn't even confirm the itinerary exists to a non-owner) if it doesn't match.
- `GET /favorites` / `POST /favorites` / `DELETE /favorites/<id>` all scope to `request.user_id`.

Verified live in earlier testing: a second user attempting to mark a first user's itinerary as visited gets a 404.

## Rate limiting

Flask-Limiter, backed by Redis in production (`REDIS_URL`), in-memory for local dev:
- `POST /login`: 10/minute per IP
- `POST /register`: 5/minute per IP
- `POST /feedback`: 10/minute per IP

Verified live: hammering `/login` past the limit returns `429` with normal traffic to other endpoints unaffected.

## CORS

Locked to an explicit allowlist (`CORS_ORIGINS` env var) — required in production, the app won't start without it. No wildcard origin is ever used for the authenticated API.

## Security headers

Set on every response (`app.py`'s `after_request` hook):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (production only, once HTTPS is live)

Nginx sets the same headers again at the proxy layer for the static frontend.

## Input validation

Every write endpoint validates its payload in `business_logic.py` before touching the database (`validate_registration_payload`, `validate_itinerary_payload`, `validate_review_payload`, `validate_feedback_payload`, `validate_profile_update`) and returns a 400 with specific error messages — never a raw stack trace.

## SQL injection

Not applicable via string concatenation — all queries go through SQLAlchemy's ORM query builder (`session.query(...)`, `session.get(...)`), which parameterizes everything automatically.

## XSS

The frontend is vanilla JS building DOM via template strings assigned to `innerHTML` in a few places (card rendering). Data displayed is either from the trusted backend (place names/descriptions the team controls) or from other users (reviews, feedback messages, itinerary notes) — **this is a known gap**: user-supplied text (review comments, feedback messages) is not currently HTML-escaped before insertion into the DOM. Recommended fix before handling untrusted production traffic at scale: escape user-supplied string fields (`comment`, `message`, `notes`) before rendering, e.g. via a small `escapeHtml()` helper wrapping any user-authored text.

## CSRF

Not applicable in the traditional cookie-session sense — auth is a bearer JWT sent in an `Authorization` header, which isn't automatically attached by the browser to cross-site requests the way cookies are.

## Rate of exposure / stack traces

The catch-all error handler (`handle_unexpected_error`) never returns Python tracebacks to the client — only a generic "Internal server error" for unexpected exceptions, while legitimate HTTP errors (404, 405, 429, etc.) pass through with their real status code and a safe message.

## Known gaps / not yet implemented

- **Argon2id/bcrypt** — brief recommends these over PBKDF2; not yet upgraded (PBKDF2 via Werkzeug is still an acceptable production choice, just not the strongest available).
- **Refresh tokens / logout-side revocation** — JWTs currently just expire after 24h; there's no server-side revocation list, so a stolen token remains valid until it expires. A `refresh_tokens` table and short-lived (e.g. 15 min) access tokens + revocable refresh tokens would close this gap.
- **XSS escaping of user-generated text** — see above.
- **Audit logging** — the `AuditLog` model exists in `models.py` but isn't yet written to from any endpoint (login attempts, account changes). Wiring it up is a small, low-risk follow-up.
- **Request size limits** — not yet explicitly configured at the Flask level (Nginx's `client_max_body_size 2M` provides a coarse limit at the proxy).

## Reporting

This is a course/demo project without a formal disclosure process — if you find something, open an issue or contact the maintainer directly.

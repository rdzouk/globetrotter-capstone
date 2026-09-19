# SECURITY.md

## Authentication

- Passwords hashed with Werkzeug's PBKDF2 implementation (`generate_password_hash`/`check_password_hash`) — never stored or logged in plaintext, never returned in any API response.
- JWT (HS256), 24-hour expiry, signed with `JWT_SECRET` (required env var in production — the app refuses to start without it, see `config.py`).
- Every application data endpoint verifies the JWT independently via `require_auth`, including destinations, nearby/neighborhood information, reviews, comments, feedback and fares. Registration, login, password recovery, Google authentication, health/readiness and CORS preflight are public. Server-side account security records hold the role and session version; missing records retain the legacy user/version-zero behavior.
- The frontend validates a saved token with `/profile` before rendering app navigation or loading catalogue data. Guests are redirected to login, preserving the requested URL. Sign-out and token changes synchronize across tabs. Authentication errors and authenticated responses are marked `Cache-Control: no-store`.
- Password recovery uses a 256-bit random token, stores only its SHA-256 digest, expires after 15 minutes, and conditionally changes the password only if its fingerprint still matches. A successful reset deletes all recovery tokens and increments the session version, rejecting all previous JWTs. Tokens are sent only through configured encrypted SMTP or Twilio HTTPS, never API responses/logs; the trusted return origin comes from configuration. Browser fragments are cleared immediately. Requests have neutral account-existence responses, per-IP rate limits and a one-minute per-account delivery cooldown. Synchronous delivery timing is not guaranteed uniform; use a durable mail/SMS queue before high-volume public operation. Ambiguous normalized phone records do not receive a reset link.
- `/admin/*` requires a current database-backed administrator role on every request. Roles are provisioned through an explicit server CLI command, not registration/profile fields. Role changes revoke older sessions. Destination and fare edits use version checks; stale drafts return 409. Archive preserves history and is not a confidentiality boundary.

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
- `POST /auth/recovery`: 5/minute and 20/hour per IP
- `POST /auth/recovery/reset`: 5/minute and 30/hour per IP

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

Write endpoints validate their payloads before persistence. Core account/trip validation lives in `business_logic.py`; administration, friendships and community submissions validate in their owning modules. Invalid inputs return client errors, never raw stack traces.

## Uploads and private media

Flask and Nginx both limit requests to 9 MB including multipart overhead. Photos are limited to 8 MB and 20 megapixels, decoded with Pillow, resized, re-encoded as JPEG and stripped of metadata. Voice notes are limited to 5 MB and two minutes; PyAV checks the actual audio content and duration, not just its filename or claimed MIME type. Upload endpoints also apply per-account rate limits.

Private messages and recordings require an accepted friendship and a bearer token belonging to either participant. Only the sender can delete a message. Place photos require authentication; only the uploader or an administrator can delete them. Contributor identities come from the authenticated account. Media responses are marked `no-store` and are excluded from the service worker cache.

Media is stored in the database, so backups contain private messages, voice notes and photos and need appropriate access controls. Private messaging is not end-to-end encrypted. Blocking, reporting, storage quotas and moderation queues are not implemented; review these needs before enabling contributions for a large public audience.

## SQL injection

Not applicable via string concatenation — all queries go through SQLAlchemy's ORM query builder (`session.query(...)`, `session.get(...)`), which parameterizes everything automatically.

## XSS

The React frontend renders user and admin text as text, not raw HTML. Destination photo and fare-source URLs are validated before persistence. Do not introduce `dangerouslySetInnerHTML` for descriptions, reviews, chat or audit entries. API authorization remains mandatory regardless of frontend rendering. Tokens in localStorage remain exposed to any successful same-origin script injection; this is a residual risk, not solved by HTML escaping alone.

## CSRF

Not applicable in the traditional cookie-session sense — auth is a bearer JWT sent in an `Authorization` header, which isn't automatically attached by the browser to cross-site requests the way cookies are.

## Rate of exposure / stack traces

The catch-all error handler (`handle_unexpected_error`) never returns Python tracebacks to the client — only a generic "Internal server error" for unexpected exceptions, while legitimate HTTP errors (404, 405, 429, etc.) pass through with their real status code and a safe message.

## Known gaps / not yet implemented

- **Argon2id/bcrypt** — brief recommends these over PBKDF2; not yet upgraded (PBKDF2 via Werkzeug is still an acceptable production choice, just not the strongest available).
- **Refresh tokens / logout-side revocation** — reset and role changes now revoke all prior JWTs through account session versions. Ordinary logout still only clears client storage; a stolen token remains valid until expiry or a security-version change. Per-device revocation and short-lived refresh sessions are not implemented.
- **Audit coverage** — admin destination/fare edits, role changes and successful password resets are recorded with actor/time and changed field names, never credentials. Ordinary login attempts and other actions are not yet comprehensively audited.

## Reporting

This is a course/demo project without a formal disclosure process — if you find something, open an issue or contact the maintainer directly.

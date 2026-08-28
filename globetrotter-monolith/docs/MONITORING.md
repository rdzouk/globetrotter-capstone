# MONITORING.md

Kept deliberately simple per the brief — practical monitoring, not an
observability platform.

## What to monitor

| What | How |
|---|---|
| Uptime | `GET /health` (liveness) and `GET /ready` (datastore reachable) — point an external uptime checker (UptimeRobot, Better Stack, or a simple cron+curl+alert script) at both, every 1-5 min |
| Container health | `docker compose ps` — every service has a `HEALTHCHECK`/`healthcheck:` defined; Docker restarts unhealthy containers automatically (`restart: unless-stopped`) |
| CPU/RAM/disk | `docker stats` for a live view; for ongoing tracking, Netdata or a simple `df`/`free` cron job emailing you if disk crosses 80% |
| PostgreSQL | `docker compose exec postgres pg_isready` (also what the container health check itself uses) |
| Redis | `docker compose exec redis redis-cli ping` |
| Application errors | `docker compose logs backend` — every unexpected exception is logged via `logger.exception(...)` with a full traceback and the request ID that triggered it |
| Response times | Every request is logged with its duration: `"%s %s -> %s (%sms)"` in `app.py`'s `after_request` hook |

## Tracing a specific failure

Every response carries an `X-Request-ID` header. If a user reports
"it broke," ask for that header value (or check `X-Request-ID` in
your own testing) and grep it out of the logs:
```bash
docker compose logs backend | grep <request-id>
```
That single ID appears on every log line for that request — the
route hit, the status code, the duration, and the full traceback if
it errored. This directly answers the brief's Observability
questions: what failed, when, which endpoint, how long it took.

## Suggested alerting (keep it minimal)

- `/health` returning non-200 for >2 consecutive checks → page someone
- Disk >85% full → email
- Anything more elaborate than that is premature for this stage —
  add it when real usage data tells you what actually needs watching,
  not before.

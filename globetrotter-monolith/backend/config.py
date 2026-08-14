"""
Configuration — single source of truth for every environment variable
this app reads. Nothing else in the codebase should call
os.environ.get(...) directly; import from here instead.

Behavior differs by APP_ENV:
  - "development" (default): sensible insecure defaults so `python app.py`
    just works out of the box with no setup.
  - "production": missing secrets are a hard failure at import time,
    not a silent fallback to a known/guessable value. This is the fix
    for the audit's Critical Problem #4 (hardcoded JWT secret fallback).
"""
import os

APP_ENV = os.environ.get("APP_ENV", "development")
IS_PRODUCTION = APP_ENV == "production"

DEBUG = os.environ.get("FLASK_DEBUG", "false" if IS_PRODUCTION else "true").lower() == "true"

PORT = int(os.environ.get("PORT", "5000"))


def _require(name, dev_default=None):
    """Read a required env var. In production, missing = crash immediately
    with a clear message, rather than silently using a fallback value."""
    value = os.environ.get(name)
    if value:
        return value
    if IS_PRODUCTION:
        raise RuntimeError(
            f"Missing required environment variable '{name}'. "
            f"Set it before starting the app in production — see .env.example."
        )
    return dev_default


JWT_SECRET = _require("JWT_SECRET", dev_default="dev-secret-change-me-in-production")

DATABASE_URL = os.environ.get("DATABASE_URL")  # None until the Postgres migration lands

REDIS_URL = os.environ.get("REDIS_URL", "memory://")  # falls back to in-process rate-limit storage

# Comma-separated list, e.g. "https://globetrotter.example.com,https://www.globetrotter.example.com"
_cors_env = os.environ.get("CORS_ORIGINS", "")
if _cors_env:
    CORS_ORIGINS = [origin.strip() for origin in _cors_env.split(",") if origin.strip()]
elif IS_PRODUCTION:
    raise RuntimeError(
        "Missing required environment variable 'CORS_ORIGINS' in production. "
        "Set it to your real frontend origin(s), e.g. https://yourdomain.com"
    )
else:
    # Local dev: the static frontend is typically opened via a local
    # static server or file://, so allow common local dev origins.
    CORS_ORIGINS = ["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:5500", "http://127.0.0.1:5500"]

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "true" if IS_PRODUCTION else "false").lower() == "true"

# Tests set RATELIMIT_ENABLED=false (as an env var, before importing app.py)
# so the full suite can run at full speed without tripping the real limits —
# Flask-Limiter reads this once at construction time, so it must be set
# before Limiter(...) is created, not toggled afterward via app.config.
RATELIMIT_ENABLED = os.environ.get("RATELIMIT_ENABLED", "true").lower() == "true"

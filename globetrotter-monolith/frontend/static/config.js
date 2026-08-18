/**
 * Point this at wherever your backend API is actually running.
 *
 * Local development: leave this as-is — it defaults to
 * http://localhost:5000, matching `python app.py`.
 *
 * VPS / Docker Compose production deployment (this repo's
 * docker-compose.yml + nginx/nginx.conf): Nginx reverse-proxies
 * /api/ to the backend on the SAME domain, so there's no separate
 * origin/CORS setup to worry about — just use a relative path:
 *   window.GT_API_BASE_URL = "/api";
 */
window.GT_API_BASE_URL = "http://localhost:5000";

// Production (uncomment when deploying behind the included Nginx config):
// window.GT_API_BASE_URL = "/api";

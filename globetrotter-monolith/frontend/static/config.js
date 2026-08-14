/**
 * Point this at wherever your backend API is actually running.
 *
 * Netlify only hosts static files — it can't run the Flask backend.
 * Deploy backend/ (or microservices/) separately to a host that runs
 * persistent Python processes (Render, Railway, Fly.io, PythonAnywhere,
 * a VPS, etc.), then put that URL here before deploying this frontend.
 *
 * Local development: leave this as-is and run the backend locally
 * with `python app.py` — it defaults to http://localhost:5000.
 */
window.GT_API_BASE_URL = "http://localhost:5000";

// Example once deployed:
// window.GT_API_BASE_URL = "https://globetrotter-api.onrender.com";
//
// If deployed via this repo's docker-compose.yml + nginx/nginx.conf,
// Nginx reverse-proxies /api/ to the backend on the SAME domain, so
// no separate origin/CORS setup is needed — just use a relative path:
// window.GT_API_BASE_URL = "/api";

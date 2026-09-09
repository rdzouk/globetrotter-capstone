# GlobeTrotter React Frontend

React 19, Vite, React Router, Lucide icons, and React Leaflet. The application uses the existing Flask API without changing its data model or endpoints.

## Local Development

Use Node.js 22 or newer. From this directory:

```powershell
npm ci
npm run dev
```

Open the URL printed by Vite (normally http://localhost:5173). Start the existing Flask backend on port 5000 in another terminal:

```powershell
Set-Location ../backend
.\.venv\Scripts\python.exe app.py
```

The Vite development proxy forwards `/api/*` to `http://127.0.0.1:5000`. The browser always uses the frontend origin, including when testing from a phone on the same trusted network. Use Vite's printed network URL on the phone. Browser geolocation requires HTTPS or localhost; plain LAN HTTP does not support it on most phones. Allow the development port through your local firewall only on a trusted network.

To target another API, set `VITE_API_BASE_URL` when building. Cross-origin APIs must allow the frontend origin through CORS. Never put secrets in `VITE_*` variables.

## Build and Test

```powershell
npm test
npm run test:e2e
npm run build
npm run preview
```

Browser tests cover desktop and iPhone-sized layouts against isolated API fixtures, so they do not write to your database. On Windows they use installed Microsoft Edge. On other platforms, install Chromium once with `npx playwright install chromium`. Screenshots and failure traces are written to `test-results/`.

The production output is `dist/`. The preview command serves the built files and inherits the local `/api/` proxy to Flask on port 5000. It is a local verification server, not the production web server.

## Production

The monolith Docker Compose configuration now builds the frontend with its multi-stage Dockerfile. Nginx serves the resulting `dist/` files and proxies `/api/` to Flask. Its SPA fallback supports refreshed and bookmarked React routes. Existing HTTPS certificate and production environment requirements are unchanged.

```powershell
Set-Location ..
docker compose up -d --build
```

For a deployment outside Docker, serve `dist/`, configure a fallback to `index.html`, and proxy `/api/` to Flask. Cache hashed `/assets/` files; do not cache `index.html` or `sw.js` aggressively.

## Source Layout

- `react/src/App.jsx`: navigation, route protection, and legacy URL redirects.
- `react/src/Explore.jsx`: search, filters, saved places, and recommendations.
- `react/src/PlaceDetail.jsx`: details, nearby places, reviews, and comments.
- `react/src/Trips.jsx`: itineraries, visit reviews, and responsive weekly planner.
- `react/src/Account.jsx`: email/phone login, registration, profile, and feedback.
- `react/src/MapView.jsx`: lazy-loaded map, live location, and OSRM directions.
- `react/src/state.jsx` and `api.js`: shared session state and API error handling.
- `react/src/styles.css`: desktop, tablet, phone, light, and dark styles.
- `static/images/places/`: existing destination photographs, copied into the build.

Legacy HTML and scripts remain as reference source, but are not entry points in the deployed React build. Existing `.html` bookmarks redirect to React routes. Login tokens, display names, and language/theme preferences retain their original localStorage keys. Navigation and booking labels retain the original English/French scope; destination content is supplied by the API, not machine-translated.

The production service worker replaces old GlobeTrotter caches and caches only the app shell and public static assets. API responses and authenticated data are never cached. Offline API operations show a recoverable connection error. Map tiles and directions depend on external services; place images and fonts are served locally.
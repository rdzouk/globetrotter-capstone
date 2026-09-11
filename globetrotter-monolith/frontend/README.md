# GlobeTrotter React Frontend

React 19, Vite, React Router, Lucide icons, and mapcn with MapLibre GL. The Flask API stores accounts, destinations, visits, reviews, and community conversations.

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
- `react/src/Recovery.jsx`: email/SMS recovery requests and single-use password reset.
- `react/src/Admin.jsx`: protected catalogue, fare policy and audit management.
- `react/src/GoogleSignIn.jsx`: Google Identity Services button and verified backend sign-in.
- `react/src/Chat.jsx`: authenticated community chat, replies, earlier messages, and owned deletion.
- `react/src/ProfileActivity.jsx`: your reviews, comments, and replies received.
- `react/src/i18n.js`, `translations.js`, and `contentTranslations.js`: interface, locale formatting, and destination translations.
- `react/src/MapView.jsx`: lazy-loaded map, live location, and OSRM directions.
- `react/src/components/ui/map.jsx`: official mapcn registry component, with a locally bundled MapLibre worker.
- `react/src/mapcn.css` and `map.css`: isolated map utilities and application map styles.
- `react/src/theme.js`: light/dark/system theme resolution, shared with startup.
- `react/src/state.jsx` and `api.js`: shared session state and API error handling.
- `react/src/styles.css`: desktop, tablet, phone, light, and dark styles.
- `static/images/places/`: existing destination photographs, copied into the build.

Legacy HTML and scripts have been removed. The only HTML entry point is `react/index.html`, which mounts React; existing `.html` bookmarks still redirect to React routes. Login tokens, display names, and language/theme preferences retain their original localStorage keys.

English/French switching covers interface text, validation, tooltips, dates, numbers, map controls, and the current catalogue of 108 destination descriptions, tags, and 34 neighborhood descriptions. Place/person names, addresses, and user-written comments/chat messages remain in their original form. New catalogue content must receive a translation in `contentTranslations.js`. The source-coverage test rejects untranslated JSX labels.

## Login Required

Guests see `/login` before any application page or data loads. Login and registration use a standalone layout without app navigation. A successful email, phone, or Google sign-in returns to the requested path, query, and fragment. Saved sessions are verified with `/api/profile` before the app is shown; verification failures offer retry or sign-out. Signing out, including in another tab, or receiving an expired-session response closes application access.

The backend independently requires a bearer token for catalogue, nearby/neighborhood information, reviews, comments, feedback, fares, and all existing account/trip/chat endpoints. Registration, login, recovery, Google authentication, health/readiness, and CORS preflight remain public. Shared place links still work, but recipients must sign in first.

## Recovery and Administration Setup

Recovery is available from **Forgot password?** on the login screen. Configure `APP_PUBLIC_URL` to the trusted frontend origin; production requires HTTPS. This URL is never taken from request headers. Reset links expire after 15 minutes, can be used once, and carry a random token in the URL fragment. The reset screen immediately removes that fragment and keeps the token only in memory, so refreshing requires reopening the email/SMS link. New passwords must have 12-128 characters. Successful resets invalidate all older account sessions. Google-only accounts continue with Google, not password reset.

For email, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY` (`starttls` or `ssl`), `SMTP_FROM`, and any required `SMTP_USERNAME`/`SMTP_PASSWORD`. For phone-only accounts, configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM`; SMS availability and Cameroon delivery require a suitable provider account and enabled destinations. Plain SMTP (`SMTP_SECURITY=none`) is allowed only with a loopback development mail server. Add real credentials directly to the private backend/Compose `.env`, never to source or chat. Restart the backend afterward. Unconfigured channels are disabled. The API never returns or logs reset links, and requests use neutral account-existence responses. Delivery errors are logged without recipient or token. Real delivery requires testing with your configured provider; automated tests substitute the delivery function.

`/admin` is visible only for accounts whose server-side role is `admin`. There is no default administrator and registration cannot assign roles. To promote an existing, explicitly chosen account from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m flask --app app set-admin --user-id 123 --confirm
```

Replace `123` with the verified intended account ID. For Compose use `docker compose exec backend flask --app app set-admin --user-id 123 --confirm`. The user must sign in again after a role change. `--remove` revokes the role; removing the last administrator is blocked. Never promote an account simply because it was the first to register.

The dashboard creates/edits destinations, archives/restores them without deleting history, maintains English/French descriptions and existing/local or HTTPS photo URLs, edits dated/source-linked fare policies, and displays a paginated audit trail. Newly created places start unpublished. Concurrent edits return a conflict and offer an explicit draft-discard/reload action. Role checks run on every admin API request; there is no user-directory or password-reading interface. Archive is publication status, not confidentiality: an archived place remains viewable by direct link or in prior plans/favorites, but cannot receive new plans. Uploaded-file management and recovery-provider setup are not part of the dashboard.

The additive `20260911_recovery` migration creates `account_security`, `password_resets`, `fare_policies`, and `destination_publications` without replacing existing users, destinations or plans. Back up first, then run `alembic upgrade head` before deploying this backend. Local startup creates missing tables. Do not downgrade to an older backend after resets: it would not enforce session-version revocation. The migration deliberately refuses a security-state downgrade.

## Editable Plans

Unvisited plans can be edited from My trips or the weekly planner using the existing visit form. Dates, time slot, transport and notes are validated by the API; only the owner may edit or cancel. Cancellation needs confirmation and deletes an unvisited plan, not a venue reservation. Completed visits/reviews cannot be edited or cancelled through these endpoints. Archived destinations stay attached to existing plans so history remains readable.

## Google Sign-up

Create an OAuth client of type **Web application** in Google Cloud / Google Auth Platform. Add the exact JavaScript origins used by this app, such as `http://localhost:5173`, `http://127.0.0.1:5173`, and your production HTTPS origin. Configure the consent screen and test users as required by Google.

Set `GOOGLE_CLIENT_ID=<your-public-client-id>.apps.googleusercontent.com` in `backend/.env` for local development, or `globetrotter-monolith/.env` for Docker Compose, then restart/rebuild the backend. No Google client secret belongs in React and none is required for this ID-token flow. The public ID is served by `/api/auth/google/config`; keep the API on the same origin using the existing proxy so the secure nonce cookie is sent.

Google verifies identity before the backend creates a session. The server validates signature, audience, issuer, expiration, verified email, and a signed ten-minute nonce bound to the browser cookie. Accounts are identified by Google's stable subject, not by display name or email. Existing password accounts are not silently linked by email; those users continue with their password. When no client ID is configured, the button is disabled with an explicit localized status. Automated tests mock Google verification; real OAuth requires your own configured client.

## Community and Activity

`/chat` is one shared, authenticated community room backed by SQL. It polls the latest messages every five seconds while the tab is visible, supports earlier-message pagination, quoted replies, retry-safe sending, and deletion of your own messages. Messages are limited to 2,000 characters and 20 sends per minute. Names and timestamps come from the server. Deletion retains a tombstone so reply threads remain understandable. This is a general room, not private messaging or a moderated messaging platform.

The profile activity section lists up to 50 recent reviews, comments, and replies to your comments, with authors and links to the exact conversation. Destination comments show the author's visit review when present.

Before deploying the new API, install backend requirements and run `alembic upgrade head` from `backend/`. The additive migration creates Google identities and chat tables and supplies the previously missing comments migration without modifying existing user data. Back up production before any migration. Local startup also creates missing tables. API responses are marked `no-store` and never enter the offline cache.

Destination actions use native sharing where available, otherwise a copy-link dialog. Map/comment links use the destination ID so the receiver reaches the same place; for external sharing, use the publicly deployed site rather than a localhost URL.

The production service worker replaces old GlobeTrotter caches and caches only the app shell and public static assets. API responses and authenticated data are never cached. Offline API operations show a recoverable connection error. Map tiles and directions depend on external services; place images and fonts are served locally.

## Map and Design

The requested mapcn-rn library targets Expo/React Native. This website uses its browser-compatible counterpart, [mapcn](https://mapcn.dev/), as approved. The map is a real MapLibre vector map with CARTO light/dark basemaps, keyboard-accessible place markers, popups, zoom/compass controls, fit-to-places, live location, and driving routes. No map API key is required for the default services; availability and provider usage terms still apply.

**Locate me** requests a fresh, high-accuracy browser position and recenters the map. Coordinates and the device's reported accuracy are displayed; actual precision depends on the device and signal, so desktop Wi-Fi/IP positions can be approximate. Tracking starts only on a location or directions action, stops with the stop control or when leaving the map, and is never saved to localStorage or the app database. The last position is explicitly labeled when tracking stops. HTTPS (or localhost) and browser permission are required; no position is invented when permission is denied or unavailable.

Select a destination and choose **Estimate trip**, or use **Directions** in its popup. **Manual origin** accepts a catalogue landmark, validated latitude/longitude, a map click or a draggable origin marker. It stops GPS tracking and labels the chosen origin separately from a device fix. The selected origin and destination coordinates are sent to OSRM for a driving route. Route distance and estimated driving time are displayed; live traffic is not included. Failed routes can be retried and do not produce a fare.

The fare panel now separates published shared-taxi reference ceilings, crowdsourced low/high distance estimates, quote-only modes and a custom calculator. See [Fare Research](../docs/FARES.md) for source values, dates, limitations and academic-use licensing. Local research is limited to Yaounde and is withheld for routes outside a conservative geographic/distance screen; this screen is not a legal city-boundary test. The **Custom kilometer calculation** uses `round(base FCFA + driving meters / 1000 * FCFA per km)` with empty inputs until the user supplies rates. No automatic nightly multiplier, live quote, moto tariff or service availability is invented.

MapLibre and its worker are lazy-loaded and bundled with the app rather than downloaded from a JavaScript CDN. Basemap tiles remain external and cannot be guaranteed offline. WebGL is required; unsupported browsers receive an explicit fallback message. Attribution is preserved on the map, and the mapcn license is shipped in `static/THIRD_PARTY_NOTICES.txt`.

Layout tokens use the Fibonacci sequence (3, 5, 8, 13, 21, 34, 55, 89 px). Photo aspect ratios and the detail-column split use the golden ratio, approximately 1.618. This is a visual proportion system, not a claim that Fibonacci numbers improve routing or recommendation accuracy. Minimum touch sizes and readable text take priority over strict numeric ratios.

Light, dark, and system-following modes are available in the header, persist between visits, synchronize between tabs, and apply to the map. Map styling uses Tailwind utilities scoped to the installed component without Tailwind's global reset; the rest of the application keeps its existing CSS system.
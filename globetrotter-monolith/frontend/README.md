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
- `react/src/Notifications.jsx`: private activity feed, unread bell and read acknowledgments.
- `react/src/DayTrips.jsx`, `TripBudget.jsx`: day-trip editing, invitations, suggestions, voting and actual FCFA expenses.
- `react/src/Events.jsx`: bilingual event discovery, private interests and administrator publication.
- `react/src/OfflinePacks.jsx`, `offline.js`: explicit encrypted downloads and a read-only offline viewer.
- `react/src/Safety.jsx`: blocking, reporting and the administrator moderation queue.
- `react/src/Account.jsx`: email/phone login, registration, profile, and feedback.
- `react/src/Recovery.jsx`: email/SMS recovery requests and single-use password reset.
- `react/src/Admin.jsx`: protected catalogue, fare policy and audit management.
- `react/src/GoogleSignIn.jsx`: Google Identity Services button and verified backend sign-in.
- `react/src/Chat.jsx`, `Friends.jsx`, and `VoiceNote.jsx`: community chat, friend requests, private text/voice conversations, recording preview and authenticated playback.
- `react/src/CommunityPlaces.jsx`: user-submitted places, map location selection and community photo galleries.
- `react/src/Media.jsx`: authenticated media loading with abort and object-URL cleanup.
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

## Notifications, Shared Trips and Budgets

The header bell opens `/notifications`. The feed includes incoming friend requests, private messages, replies to your comments, invitations and visits/day trips in the next seven days (Cameroon time). It refreshes every 30 seconds while visible and retains per-account read acknowledgments. Social activity covers the last 30 days; the displayed feed is capped at 100 items. Opening a notification marks it read and links to the relevant conversation or plan. These are in-app notifications, not operating-system push, email or SMS reminders.

`/day-trips` extends the existing private day-trip API. An organizer creates a dated itinerary of 2-12 unique, ordered stops, with visit durations, notes and optional estimated costs/budget. The organizer can invite up to 20 accepted friends. Invitations reveal only the title, date and organizer until the recipient accepts. Only the organizer edits the final itinerary or removes guests; accepted members can propose places, vote once per suggestion, and leave. The organizer can add a suggested place through the itinerary editor. Stale itinerary versions are rejected rather than overwritten.

The Budget view keeps actual expenses separate from estimates. A member records a payment they made, chooses a category and the accepted members sharing it. Amounts are whole FCFA; equal splits distribute any remainder deterministically by member ID, so shares and balances reconcile exactly. Retry identifiers prevent duplicate expenses. The payer or organizer may delete an incorrect entry and re-enter it. A departed member's existing expense shares remain in the ledger so historical balances do not change silently. Suggested repayments are calculations only, not payments, bookings or settlement confirmations. Limits are 100 suggestions and 500 expenses per trip.

## Local Events

`/events` supports date ranges, this-weekend selection, category/title filters, pagination and privately saved events. Events use existing catalogue venues and their photos. Times are entered and shown in Cameroon time. Unknown prices remain unknown; zero means free entry. Administrators create bilingual titles/descriptions and a required HTTPS source link, then explicitly publish a draft. Cancelled events disappear from discovery but remain marked cancelled in saved events. There is no scraped feed or fabricated seed event. Organizers' external links and current availability need verification before publication.

## Offline Trip Packs

Save offline on an accepted/owned day trip explicitly stores its title, date, notes, ordered stops and selected place details in IndexedDB. Optional thumbnails are downloaded from local/authenticated images; a missing image does not prevent a text pack. Shared member lists, messages, financial ledgers and tokens are not copied into the pack. The viewer at `/offline-packs` works without a live profile request and exposes no live account functions.

Packs are AES-GCM encrypted using a key derived from the current session token. Another sign-in cannot decrypt them; signing out, an observed session expiry, account changes or blocking changes clear the store. Packs expire after seven days, with a maximum of 20 packs and 5 MB per pack. This protects against accidental account mixing, not a compromised browser or same-origin script that can read the stored token. A previously downloaded snapshot cannot learn about remote revocation while offline. Notes are sensitive: use a trusted device and sign out when finished. No offline edits, map tiles, directions or automatic synchronization are provided.

Offline page reload requires the production build's service worker, HTTPS or localhost, and an initial successful online load. Vite's development server intentionally does not install that worker. Verify the built version with `npm run build`, then `npm run preview`. The app shell remains the only service-worker cache; private packs use the separate encrypted store. Automated reload coverage runs against the preview server on port 5175:

```powershell
$env:GT_TEST_PRODUCTION = '1'
npm run test:e2e -- --grep "production shell"
Remove-Item Env:GT_TEST_PRODUCTION
```

## Blocking and Moderation

Report and block icons appear beside other travelers' messages, comments and gallery photos. Blocking removes the friendship and its private conversation, rejects new friend requests/private contact in either direction, hides community messages/comments and replies, and removes direct organizer/guest memberships between the two accounts. It does not erase third-party group history or public place records. Unblocking at `/safety` does not restore deleted conversations or friendships.

Reporting requires access to the selected item. The confirmation explains that its text and attached photo/audio will be copied as evidence for administrators; it does not expose the rest of a private conversation. Reports are limited to 10/hour and 20/day per account, with duplicate submissions returning the existing report. Administration's Reports tab offers open/removed/dismissed queues, evidence review and confirmed removal or dismissal. Removal clears the reported message or updates a deleted photo's cover reference; comment replies are preserved. Actions are audited and stale resolutions return a conflict. Evidence remains in database backups after the original item is deleted. Before wider public deployment, define a retention/purge policy and storage budget for reports and media; no scheduled retention job is included.

## Feature Migration

Back up the database before deploying. Install backend requirements, run `alembic upgrade head` from `backend/`, install frontend dependencies with `npm ci`, and rebuild/restart the API and frontend. The additive `20260928_community_tools` migration follows `20260926_day_trips` and adds notification reads, memberships, suggestions/votes, expenses, events/interests, blocks and reports. It does not replace existing users, visits, messages or day trips. Its downgrade deliberately refuses to discard shared financial history or safety state. Local startup creates missing tables, while deployed databases should use Alembic. No paid service/API key is required for these six additions.

## Google Sign-in and Sign-up

This app uses [Google Identity Services](https://developers.google.com/identity/gsi/web/guides/overview), not an API key or the retired Google Sign-In library. Both login and registration use Google's official button. FedCM is enabled without automatic account selection, and Nginx/Vite allow Google's fallback popup flow.

1. Open [Google Auth Platform clients](https://console.cloud.google.com/auth/clients), choose your project, and create an OAuth client of type **Web application**.
2. Add the exact **Authorized JavaScript origins**: `http://localhost`, `http://localhost:5173`, `http://127.0.0.1:5173`, and your deployed HTTPS origin. If the Vite port changes, authorize that port too. Do not include URL paths.
3. Complete Branding and Audience settings, and add test accounts while the app is in testing. Basic sign-in uses only identity/profile information; no Maps, Gmail, Drive or paid API key is needed.
4. Set the public client ID as `GOOGLE_CLIENT_ID` in the private backend `.env` (local) or monolith `.env` (Compose), then restart the backend. Never use a client secret as this value.
5. Open `/login` at an authorized origin, choose **Sign in with Google**, and complete consent yourself. Sign out and sign back in to confirm the same app account returns. An unconfigured client deliberately leaves the button disabled.

The JavaScript callback posts the credential to `/api/auth/google`, so an OAuth redirect URL is not needed for this flow. Keep the API on the same origin to preserve the signed nonce cookie. See Google's [setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) and [server verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

Set `GOOGLE_CLIENT_ID=<your-public-client-id>.apps.googleusercontent.com` in `backend/.env` for local development, or `globetrotter-monolith/.env` for Docker Compose, then restart/rebuild the backend. No Google client secret belongs in React and none is required for this ID-token flow. The public ID is served by `/api/auth/google/config`; keep the API on the same origin using the existing proxy so the secure nonce cookie is sent.

Google verifies identity before the backend creates a session. The server validates signature, audience, issuer, expiration, verified email, and a signed ten-minute nonce bound to the browser cookie. Accounts are identified by Google's stable subject, not by display name or email. Existing password accounts are not silently linked by email; those users continue with their password. When no client ID is configured, the button is disabled with an explicit localized status. Automated tests mock Google verification; real OAuth requires your own configured client.

## Community and Activity

`/chat` has **Community chat** and **Friends** views. Community chat retains its shared room, quoted replies, earlier-message pagination and owned deletion. **Add friend** appears beside other travelers' place comments and community messages. Requests can be accepted, declined or cancelled; only accepted friends can open a private conversation. The friends view lists accepted friends and pending requests and supports name filtering. No email addresses, phone numbers or user directory are exposed.

Private conversations support text and voice notes. Recording starts only after a user action and browser microphone permission, requires HTTPS or localhost, stops automatically before two minutes, and stops when leaving the conversation. Users can preview, discard or send a recording. Playback fetches audio with the bearer token, never with a token in the URL. A participant may delete their own messages. Removing a friend requires confirmation and deletes that friendship and its private conversation for both people; a fresh request requires acceptance again.

Messages are limited to 2,000 characters. Private sends are capped at 20/minute and 200/day per account. Audio is capped at 5 MB and two minutes, decoded by PyAV on the server, and must be an audio-only WebM, Ogg, MP4 or WAV file. Names and timestamps come from the server, and client UUIDs make retries idempotent. Conversations poll every five seconds while visible; friend lists refresh every ten seconds on the chat page. Messages are access-controlled but are not end-to-end encrypted. Blocking, reporting and moderation are described above; operating-system push notifications are not included.

## Community Places and Photos

**Add a place** on Explore or the map opens `/places/new`. A submission requires a name, category, neighborhood, address, description, photo and valid coordinates. Users can click the map, drag its marker, enter coordinates, or explicitly request their current position. Phone, price level and tags are optional. Community entries are published with zero ratings and clearly labeled **Community place / Added by {name}**; attribution comes from the signed-in account, never the form. Existing administrator archive controls still apply.

**More photos** on every place opens the community gallery. Any signed-in user can add a photo and optional caption to an active place; each image displays its contributor. Galleries are paginated and have a full-image viewer. Only the uploader or an administrator can delete a photo. Deleting a community place's cover selects another available photo or displays the existing missing-image fallback; the place and its history remain intact.

Photos must be JPEG, PNG or WebP, at most 8 MB and 20 megapixels. Pillow decodes and resizes them to at most 1920 pixels, re-encodes JPEG, and drops metadata including location EXIF. SVG, animated and invalid images are rejected. Submissions are limited to 5 places/hour (15/day) and 20 photos/hour (100/day) per account. User text stays in its original language; UI labels are English/French.

Install the updated backend requirements and back up before `alembic upgrade head`. The additive `20260919_social_places` migration adds friendships, direct messages, destination contributions and photos without rewriting accounts, destinations, community messages or plans. Media is stored in database binary columns and covered by database backups; no ephemeral container upload folder or new public media directory is used. Plan for database growth and protect backups as they include private messages and recordings. This is appropriate for the current monolith; a high-volume deployment should move media behind authenticated object storage with a retention policy.

Flask and Nginx cap requests at 9 MB including multipart overhead. Authenticated photo/audio responses use `no-store` and remain excluded from the service worker. Tests use isolated databases, mocked APIs and a synthetic microphone, not user accounts or real microphone input. Live Google consent, physical-device microphone quality and third-party map availability still require checks in the target environment.

## Profile Activity

The profile activity section lists up to 50 recent reviews, comments, and replies to your comments, with authors and links to the exact conversation. Destination comments show the author's visit review when present.

Before deploying the new API, install backend requirements and run `alembic upgrade head` from `backend/`. The additive migration creates Google identities and chat tables and supplies the previously missing comments migration without modifying existing user data. Back up production before any migration. Local startup also creates missing tables. API responses are marked `no-store` and never enter the offline cache.

The visible **Share** button on place cards, place details and map popups opens the device share sheet where available. Otherwise it opens a photo/name/address preview with a selectable link and **Copy link**. Cancelling native sharing does nothing; a failed native share falls back to copying. The URL points to `/places/{id}` on the current app origin, never includes a session token, and returns a signed-out recipient to that exact place after sign-in. For links anyone can open, share from the publicly deployed site; a localhost URL only works on the same computer, and a local-only place must exist on the deployed app before it can be shared publicly. Map/comment links also preserve the destination ID.

The production service worker replaces old GlobeTrotter caches and caches only the app shell and public static assets. API responses and authenticated data never enter that cache. Explicit offline trip downloads use a separate encrypted IndexedDB store as described above. Other offline API operations show a recoverable connection error. Map tiles and directions depend on external services; place images and fonts are served locally.

## Map and Design

The requested mapcn-rn library targets Expo/React Native. This website uses its browser-compatible counterpart, [mapcn](https://mapcn.dev/), as approved. The map is a real MapLibre vector map with CARTO light/dark basemaps, keyboard-accessible place markers, popups, zoom/compass controls, fit-to-places, live location, and driving routes. No map API key is required for the default services; availability and provider usage terms still apply.

**Locate me** requests a fresh, high-accuracy browser position and recenters the map. Coordinates and the device's reported accuracy are displayed; actual precision depends on the device and signal, so desktop Wi-Fi/IP positions can be approximate. Tracking starts only on a location or directions action, stops with the stop control or when leaving the map, and is never saved to localStorage or the app database. The last position is explicitly labeled when tracking stops. HTTPS (or localhost) and browser permission are required; no position is invented when permission is denied or unavailable.

Select a destination and choose **Estimate trip**, or use **Directions** in its popup. **Manual origin** accepts a catalogue landmark, validated latitude/longitude, a map click or a draggable origin marker. It stops GPS tracking and labels the chosen origin separately from a device fix. The selected origin and destination coordinates are sent to OSRM for a driving route. Route distance and estimated driving time are displayed; live traffic is not included. Failed routes can be retried and do not produce a fare.

The fare panel now separates published shared-taxi reference ceilings, crowdsourced low/high distance estimates, quote-only modes and a custom calculator. See [Fare Research](../docs/FARES.md) for source values, dates, limitations and academic-use licensing. Local research is limited to Yaounde and is withheld for routes outside a conservative geographic/distance screen; this screen is not a legal city-boundary test. The **Custom kilometer calculation** uses `round(base FCFA + driving meters / 1000 * FCFA per km)` with empty inputs until the user supplies rates. No automatic nightly multiplier, live quote, moto tariff or service availability is invented.

MapLibre and its worker are lazy-loaded and bundled with the app rather than downloaded from a JavaScript CDN. Basemap tiles remain external and cannot be guaranteed offline. WebGL is required; unsupported browsers receive an explicit fallback message. Attribution is preserved on the map, and the mapcn license is shipped in `static/THIRD_PARTY_NOTICES.txt`.

Layout tokens use the Fibonacci sequence (3, 5, 8, 13, 21, 34, 55, 89 px). Photo aspect ratios and the detail-column split use the golden ratio, approximately 1.618. This is a visual proportion system, not a claim that Fibonacci numbers improve routing or recommendation accuracy. Minimum touch sizes and readable text take priority over strict numeric ratios.

Light, dark, and system-following modes are available in the header, persist between visits, synchronize between tabs, and apply to the map. Map styling uses Tailwind utilities scoped to the installed component without Tailwind's global reset; the rest of the application keeps its existing CSS system.
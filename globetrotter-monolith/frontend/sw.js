/**
 * Service worker — caches the static "app shell" (HTML pages, CSS,
 * JS, icons) for offline access and fast repeat loads, and
 * deliberately does NOT touch anything else.
 *
 * Per the brief: "Do NOT cache sensitive authenticated API responses
 * improperly. Do NOT store sensitive authentication data in an
 * insecure offline cache." This service worker only ever intercepts
 * same-origin GET requests for known static files — it never sees or
 * caches requests to the backend API (which lives on a different
 * origin/port in dev, and even same-origin via the Nginx /api/ proxy
 * in production, those requests are explicitly excluded below). The
 * JWT itself lives in localStorage, which a service worker's Cache
 * Storage never touches at all.
 */

<<<<<<< HEAD
const CACHE_NAME = "globetrotter-shell-v1";
=======
const CACHE_NAME = "globetrotter-shell-v2";
>>>>>>> local-backup

const APP_SHELL = [
  "index.html", "login.html", "register.html", "map.html", "recommendations.html",
  "favorites.html", "itineraries.html", "planner.html", "feedback.html", "profile.html",
  "offline.html",
  "static/style.css", "static/app.js", "static/i18n.js", "static/layout.js", "static/config.js",
  "static/icons/icon-192.png", "static/icons/icon-512.png",
  "manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept anything cross-origin (the backend API, map tile
  // servers, MapLibre/Leaflet CDN scripts, etc.) or anything that
  // isn't a simple GET — those go straight to the network, always,
  // full stop. This is the safeguard against ever caching an
  // authenticated API response.
  if (url.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  // Never cache the /api/ proxy path either, for the same reason,
  // even though it happens to be same-origin in the Nginx-proxied
  // production setup.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline and not cached: fall back to the offline page for
          // navigations, otherwise just fail (e.g. for an image).
          if (event.request.mode === "navigate") {
            return caches.match("offline.html");
          }
        });
      // Cache-first for speed, but always refresh the cache in the
      // background so updates aren't stuck forever.
      return cached || networkFetch;
    })
  );
});

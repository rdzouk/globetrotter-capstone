const CACHE_NAME = 'globetrotter-react-__BUILD_ID__';
const BUILD_ASSETS = ['__BUILD_ASSETS__'];
const SHELL = ['/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', ...BUILD_ASSETS];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const upgradingLegacy = names.some(name => name.startsWith('globetrotter-shell-'));
    await Promise.all(names.filter(name => name.startsWith('globetrotter-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
    if (upgradingLegacy) {
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(clients.map(client => client.navigate(client.url)));
    }
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.headers.has('Authorization')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
    return;
  }
  if (!url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/images/') && !url.pathname.startsWith('/icons/')) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});
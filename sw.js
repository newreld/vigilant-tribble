/* Service worker for Cosmic Merge.
 *
 * Strategy: network-first for the app shell (HTML/CSS/JS) so an updated deploy
 * always reaches returning players when they're online; falls back to cache
 * only when the network is unavailable (true offline play). Fonts and the icon
 * are cache-first since they never change. Bump CACHE on any strategy change to
 * evict stale entries from existing installs.
 */
const CACHE = 'cosmic-v3';
const CORE = [
  './',
  './index.html',
  './merge.css',
  './merge.js',
  './icon.svg',
  'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600;700&display=swap',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Only handle GET; skip non-http (chrome-extension, etc.)
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;

  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.href.includes('fonts.g');

  // Fonts + cross-origin static: cache-first (immutable, safe to serve cached).
  if (isFont) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        if (res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); }
        return res;
      }))
    );
    return;
  }

  // App shell (same-origin HTML/CSS/JS/icon): network-first so updates land.
  if (sameOrigin) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); }
        return res;
      }).catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Everything else: try network, fall back to whatever's cached.
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

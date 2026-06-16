/* Service worker for Cosmic Merge — offline-first caching */
const CACHE = 'cosmic-v1';
const CORE = [
  './',
  './index.html',
  './merge.css',
  './merge.js',
  './icon.svg',
  'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
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

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Cache same-origin and font responses
        if (res.ok && (new URL(e.request.url).origin === self.location.origin ||
                       e.request.url.includes('fonts.g'))) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});

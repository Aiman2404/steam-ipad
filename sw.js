// DeckOS service worker.
// Network-first for the app shell so a new deploy shows up on the next launch;
// the cache is only a fallback for when the iPad is offline.
const CACHE_NAME = 'deckos-shell-v6';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/deck.css',
  './icons/icon.svg',
  './icons/icon-180.png',
  './js/main.js',
  './js/util.js',
  './js/fit.js',
  './js/idb.js',
  './js/tags.js',
  './js/lyrics.js',
  './js/palette.js',
  './js/player.js',
  './js/spotify-auth.js',
  './js/spotify-api.js',
  './js/sources/spotify-source.js',
  './js/sources/local-source.js',
  './js/views/now-playing.js',
  './js/views/lyrics-view.js',
  './js/views/library-view.js',
  './js/views/queue-view.js',
  './js/views/sliders.js',
  './js/views/dock.js',
  './js/views/settings.js',
  './js/views/sheet.js',
  './js/views/ambient.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCacheable(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) return true;
  // Fonts are safe to keep; never cache Spotify, LRCLIB or other API traffic.
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isCacheable(request)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('./index.html'))
      )
  );
});

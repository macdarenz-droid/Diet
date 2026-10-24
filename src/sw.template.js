// Service worker template: vite.config.ts fills in the version and this build's file list.
// Same-origin GETs are served cache-first; API calls to other hosts never touch the cache.
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `nuance-${VERSION}`;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('nuance-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html', { ignoreVary: true }).then(hit => hit || fetch(req)));
    return;
  }
  event.respondWith(
    // ignoreVary: hosts send Vary: Origin, and module scripts and fonts are requested with an Origin
    // header that the install-time copies were not, so a strict match would miss offline.
    caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })),
  );
});

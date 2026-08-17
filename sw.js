/* Never Miss Again — service worker.

   NETWORK-FIRST by design. When you push a new version, the phone picks it up
   on the very next open. The cache exists purely so the app still works with
   no signal — it is a fallback, never the primary source.

   This means you never have to bump a version number here to ship an update.
*/

const CACHE = 'nma-runtime';

self.addEventListener('install', (e) => {
  // Take over immediately rather than waiting for old tabs to close
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './index.html']).catch(() => {}))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        // Stash a fresh copy for offline use
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          // Offline and never seen this URL — fall back to the app shell
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        })
      )
  );
});

// Lets the page force an immediate cache wipe from Settings → Force update
self.addEventListener('message', (e) => {
  if (e.data === 'nuke-cache') {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});

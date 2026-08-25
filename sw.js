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

const SHARE_KEY = './__shared-update';

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // ── Android share target ─────────────────────────────────────────────
  // Sharing a .json into the app POSTs here. Stash the file, then bounce
  // to the app, which picks it up and imports it. Two taps, no menus.
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const file = form.get('updatefile');
        let text = '';
        if (file && typeof file.text === 'function') text = await file.text();
        else if (typeof file === 'string') text = file;
        else text = form.get('text') || '';

        const cache = await caches.open(CACHE);
        await cache.put(SHARE_KEY, new Response(text, {
          headers: { 'Content-Type': 'application/json' }
        }));
        return Response.redirect('./index.html?shared=1', 303);
      } catch (err) {
        return Response.redirect('./index.html?shared=error', 303);
      }
    })());
    return;
  }

  if (req.method !== 'GET') return;

  // The update file must never be served from cache, and its cache-busted
  // URLs must never accumulate in it. Straight to the network, every time.
  if (req.url.includes('updates.json')) {
    e.respondWith(fetch(req).catch(() => new Response('{}', {
      status: 200, headers: {'Content-Type': 'application/json'}
    })));
    return;
  }

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
  // The page has consumed a shared file — drop it so it can't re-apply
  if (e.data === 'clear-shared') {
    caches.open(CACHE).then((c) => c.delete(SHARE_KEY));
  }
});

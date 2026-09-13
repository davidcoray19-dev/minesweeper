const CACHE = 'minesweeper-v3';

// Everything the game needs to run with no network at all.
const ASSETS = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async cache => {
    // Precache each file on its own rather than with addAll(): that one is
    // all-or-nothing, so a single unavailable file — a 404, or a 401 where the
    // deployment sits behind auth — would fail the whole install and silently
    // leave the previous worker in place. Whatever is missed here gets cached
    // by the fetch handler the first time it is actually used.
    await Promise.all(ASSETS.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  }));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(caches.open(CACHE).then(async cache => {
    // Page loads go to the network first. Answering them from the cache would
    // bypass HTTP auth in front of the deployment: dismissing the login dialog
    // would still show the cached game. On a 401, show it and drop the cache;
    // fall back to the cached shell only when the network is unreachable.
    if (req.mode === 'navigate') {
      let res;
      try {
        res = await fetch(req);
      } catch (err) {
        const shell = await cache.match(req) || await cache.match('index.html');
        if (shell) return shell;
        throw err;
      }
      if (res.status === 401) await caches.delete(CACHE);
      else if (res.ok) cache.put(req, res.clone());
      return res;
    }

    // Everything else: stale-while-revalidate. Answer from the cache and refresh
    // the entry in the background so the next load picks up a new deployment.
    const cached = await cache.match(req);

    const network = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });

    if (cached) {
      e.waitUntil(network.catch(() => {}));
      return cached;
    }

    return network;
  }));
});

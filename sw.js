const CACHE = 'minesweeper-v2';

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

// Stale-while-revalidate: answer from the cache so the game starts instantly and
// works offline, but refresh the entry in the background so the next load picks
// up a new deployment. Bumping CACHE above is only needed to force-drop old files.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req);

    const network = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });

    if (cached) {
      e.waitUntil(network.catch(() => {}));
      return cached;
    }

    // Not cached yet: go to the network, and if that fails on a page load,
    // fall back to the app shell rather than showing the browser error page.
    return network.catch(async err => {
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      throw err;
    });
  }));
});

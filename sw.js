// Only the three constants below differ between deployments; the rest stays as is.
const CACHE   = 'minesweeper-v4';
const ASSETS  = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

// true:  with no network the app starts from the cache — only for apps that are
//        usable without a server (games like this one).
// false: with no network the browser shows its error page. More honest than an
//        empty app that can neither load nor save data.
const OFFLINE = true;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    if (OFFLINE) {
      const cache = await caches.open(CACHE);
      // One file at a time rather than addAll(): that one is all-or-nothing, so a
      // single 404 — or a 401 where the deployment sits behind auth — would fail
      // the whole install silently.
      await Promise.all(ASSETS.map(url => cache.add(url).catch(() => {})));
    }
    await self.skipWaiting();
  })());
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

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Data never goes through the cache: fetch() calls from the page have no
  // `destination`, which catches any API whatever its path. Only page loads and
  // files the HTML itself loads (scripts, styles, images, manifest) are cached.
  if (req.mode !== 'navigate' && req.destination === '') return;

  e.respondWith(caches.open(CACHE).then(async cache => {
    // Page loads always go to the network first. Answered from the cache, they
    // bypass HTTP auth in front of a deployment: dismissing the login dialog would
    // still show the cached app. On a 401, show it and drop the cache.
    if (req.mode === 'navigate') {
      let res;
      try {
        res = await fetch(req);
      } catch (err) {
        if (OFFLINE) {
          const shell = await cache.match(req) || await cache.match('index.html');
          if (shell) return shell;
        }
        throw err;
      }
      if (res.status === 401) await caches.delete(CACHE);
      else if (OFFLINE && res.ok && !url.search) cache.put(req, res.clone());
      return res;
    }

    // Everything else: stale-while-revalidate. Answer from the cache and refresh in
    // the background so a new deployment is picked up on the next load.
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

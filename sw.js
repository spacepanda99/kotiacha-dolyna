// Lets Chrome install the game and keeps it playable offline, while always preferring the newest version.
// Pages, scripts and settings: straight from the server every time (bypassing the browser's own cache);
// the saved copy is only used when there's no connection.
// Voice clips, music and icons: saved after first use. The whole cache is renamed each release
// (tools/release.mjs), so a new version starts clean.
const CACHE = 'kotiacha-dolyna-246';
const CORE = ['./', 'index.html', 'game.js', 'data.js', 'manifest.webmanifest', 'version.json', 'icons/icon-192.png?v=2', 'icons/icon-512.png?v=2', 'icons/apple-touch-icon.png?v=2'];

self.addEventListener('install', e => {
  // put() rather than addAll(): addAll fails outright if a second install is filling the same cache.
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(CORE.map(u => fetch(u, { cache: 'no-store' }).then(r => r.ok ? c.put(u, r).catch(() => null) : null).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Audio may be requested in ranges; let the browser handle those directly.
  if (req.headers.has('range')) return;
  if (/\/(audio|music|icons|fonts)\//.test(url.pathname)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    })));
    return;
  }
  // Everything else: always ask the server (no-cache revalidates even if the browser thinks its copy is fresh).
  e.respondWith(fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req.url, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req.url, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});

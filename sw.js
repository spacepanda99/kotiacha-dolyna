// Lets Chrome install the game and keeps it playable offline.
// Pages and scripts: network first, so updates arrive straight away; the cached copy is the offline fallback.
// Voice clips, music and icons: cache first, since they never change under the same name.
const CACHE = 'kotiacha-dolyna-v5';
const CORE = ['./', 'index.html', 'game.js', 'data.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  // put() rather than addAll(): addAll fails outright if a second install is filling the same cache.
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(CORE.map(u => fetch(u, { cache: 'reload' }).then(r => r.ok ? c.put(u, r).catch(() => null) : null).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Audio may be requested in ranges; let the browser handle those directly.
  if (req.headers.has('range')) return;
  const media = /\/(audio|music|icons)\//.test(req.url);
  if (media) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    })));
  } else {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html'))));
  }
});

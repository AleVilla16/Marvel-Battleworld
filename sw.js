const V = 'bw-v1';
const CORE = ['/', '/index.html', '/storage.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (r.mode === 'navigate') { e.respondWith(fetch(r).then(x => { const c = x.clone(); caches.open(V).then(ca => ca.put('/', c)); return x; }).catch(() => caches.match('/'))); return; }
  const ok = u.origin === location.origin || u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com';
  if (!ok) return;
  e.respondWith(caches.match(r).then(hit => { const net = fetch(r).then(x => { if (x && (x.ok || x.type === 'opaque')) { const c = x.clone(); caches.open(V).then(ca => ca.put(r, c)); } return x; }).catch(() => hit); return hit || net; }));
});

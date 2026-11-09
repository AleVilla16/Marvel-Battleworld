// Service worker di Marvel Battleworld: rende l'app installabile e utilizzabile senza connessione
const CACHE = 'battleworld-v2';
const FILES = [
  './',
  './index.html',
  './storage.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png',
  './apple-touch-icon.png'
];
// librerie esterne usate dall'app (PDF): salvate quando servono la prima volta
const CDN = 'https://cdnjs.cloudflare.com/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(FILES.map((f) => cache.add(f).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Prima la rete (così l'app è sempre aggiornata), se manca la connessione usa la copia salvata
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !req.url.startsWith(CDN)) return;
  if (same && /\/dati\.(json|zip)$/.test(url.pathname)) return; // il file dei dati non va in cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, {ignoreSearch: true}).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});

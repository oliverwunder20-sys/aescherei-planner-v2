// sw.js — robuste, 404-sichere Variante
const CACHE_NAME = 'aeschere-v2-001';

// Nur Kern-Dateien, alles relativ (für GitHub Pages wichtig)
const CORE_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js'
  // KEINE Icons hier eintragen, solange sie nicht sicher existieren
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Dateien einzeln holen; 404/Fehler werden still übersprungen
    for (const url of CORE_FILES) {
      try {
        const resp = await fetch(url, { cache: 'no-cache' });
        if (resp && resp.ok) {
          await cache.put(url, resp.clone());
        }
      } catch (_) {
        // ignorieren
      }
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // alte Caches aufräumen
    const names = await caches.keys();
    await Promise.all(names.map(n => (n === CACHE_NAME ? null : caches.delete(n))));
    self.clients.claim();
  })());
});

// Network-First, fällt auf Cache zurück (offline)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  event.respondWith((async () => {
    try {
      const net = await fetch(req);
      // Erfolgreiche Antworten in Cache legen (stille Fehler ignorieren)
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, net.clone()).catch(() => {});
      return net;
    } catch (_) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      // Fallback auf Startseite für Navigations-Requests
      if (req.mode === 'navigate') {
        return cache.match('./index.html');
      }
      throw _;
    }
  })());
});

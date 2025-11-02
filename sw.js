const CACHE = 'aescher-planer-v29';
const ASSETS = [
  './','./index.html','./styles.css','./app.js','./manifest.json',
  './assets/icon-192.png','./assets/icon-512.png','./assets/suedleder-icons.svg',
  './Daten/rezepte.json','./Daten/gewichtsklassen.json','./Daten/stueckzahl_limits.json'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
});

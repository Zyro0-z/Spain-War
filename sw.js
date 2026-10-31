// Guarda la app para que funcione sin conexión. Sube la versión de CACHE en cada cambio publicado.
const CACHE = 'eeg-v2';
const CORE = [
  './', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-512.png', './css/app.css', './data/map.json', './data/flags.json',
  './fonts/barlow-condensed-500.woff2', './fonts/barlow-condensed-600.woff2', './fonts/barlow-condensed-700.woff2', './fonts/barlow-condensed-800.woff2',
  './js/main.js', './js/store.js', './js/art.js', './js/icons.js', './js/fx.js', './js/flags.js', './js/qr.js',
  './js/engine/rng.js', './js/engine/prob.js', './js/engine/game.js', './js/engine/bots.js', './js/map/render.js',
  './js/net/transport.js', './js/net/room.js',
  './js/ui/dom.js', './js/ui/clock.js', './js/ui/wheel.js', './js/ui/dice.js', './js/ui/play.js', './js/ui/drivers.js',
  './js/ui/menu.js', './js/ui/settings.js', './js/ui/setup.js', './js/ui/online.js',
];

// Además de lo anterior, las banderas que estén descargadas (data/flags.json dice cuáles)
async function flags() {
  try { const r = await fetch('./data/flags.json', {cache:'no-cache'}); const m = await r.json(); return Object.keys(m).map(ine => `./data/flags/${ine}.png`); } catch (e) { return []; }
}
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => c.addAll([...CORE, ...await flags()])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Solo se sirve desde caché lo de este origen. El multijugador (ntfy.sh) va siempre por red.
// Lo guardado responde al momento y se actualiza en segundo plano.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, {ignoreSearch:true});
    const net = fetch(e.request).then(r => { if (r && r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

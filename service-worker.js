/* Cache-first service worker. Bump CACHE_VERSION whenever any precached file changes. */
/* global self, caches, Response */
const CACHE_VERSION = 'puzzle-hub-v13';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './pages/language.html',
  './pages/profile.html',
  './pages/rate.html',
  './pages/settings.html',
  './pages/statistics.html',
  './assets/css/game.css',
  './assets/css/main.css',
  './assets/fonts/lilita-one-latin.woff2',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/img/bg-sky.webp',
  './assets/img/hero.webp',
  './assets/img/logo.webp',
  './assets/js/app.js',
  './assets/js/game-registry.js',
  './assets/js/icons.js',
  './assets/js/placeholder-game.js',
  './assets/js/profile-manager.js',
  './assets/js/router.js',
  './assets/js/settings.js',
  './assets/js/statistics.js',
  './assets/js/storage.js',
  './games/bus-jam/bus-jam.css',
  './games/bus-jam/config.js',
  './games/bus-jam/index.js',
  './games/bus-jam/levels.js',
  './games/bus-jam/rules.js',
  './games/bus-jam/score.js',
  './games/bus-jam/state.js',
  './games/bus-jam/view.js',
  './games/lines/core.js',
  './games/lines/index.js',
  './games/lines/lines.css',
  './games/lines/state.js',
  './games/lines/ui.js',
  './assets/icons/ui/alert.webp',
  './assets/icons/ui/card.webp',
  './assets/icons/ui/check.webp',
  './assets/icons/ui/chest.webp',
  './assets/icons/ui/chevrons.webp',
  './assets/icons/ui/close.webp',
  './assets/icons/ui/cog.webp',
  './assets/icons/ui/coin.webp',
  './assets/icons/ui/cup.webp',
  './assets/icons/ui/gamepad.webp',
  './assets/icons/ui/gear.webp',
  './assets/icons/ui/globe.webp',
  './assets/icons/ui/home.webp',
  './assets/icons/ui/house.webp',
  './assets/icons/ui/music.webp',
  './assets/icons/ui/play.webp',
  './assets/icons/ui/player.webp',
  './assets/icons/ui/plus.webp',
  './assets/icons/ui/refresh.webp',
  './assets/icons/ui/sound.webp',
  './assets/icons/ui/star.webp',
  './assets/icons/ui/vibrate.webp',
  './assets/img/avatars/bunny.webp',
  './assets/img/avatars/fox.webp',
  './assets/img/avatars/frog.webp',
  './assets/img/avatars/guest.webp',
  './assets/img/avatars/monkey.webp',
  './assets/img/avatars/octopus.webp',
  './assets/img/avatars/panda.webp',
  './assets/img/avatars/tiger.webp',
  './assets/img/avatars/unicorn.webp',
  './assets/img/balls/1.webp',
  './assets/img/balls/2.webp',
  './assets/img/balls/3.webp',
  './assets/img/balls/4.webp',
  './assets/img/balls/5.webp',
  './assets/img/balls/6.webp',
  './assets/img/balls/7.webp',
  './assets/img/games/bus-jam.webp',
  './assets/img/games/lines.webp',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }
  e.respondWith(
    caches
      .match(req, { ignoreSearch: true })
      .then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
      .catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
});

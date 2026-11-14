/* Dhamaka: service worker, so the site works like an app.
 * - Pages, styles, scripts and artwork are saved on the phone, so they still open
 *   if the venue Wi-Fi drops for a moment.
 * - Always tries the network first, so every visit gets the latest version; the saved
 *   copy is only used when the network fails.
 * - Live data (check-ins, photos, winners) comes from Apps Script and is never cached.
 */
var CACHE = "dhamaka-v2";
var CORE = [
  "./", "index.html", "checkin.html", "admin.html", "draw.html", "live.html", "qr-screen.html", "qr.html",
  "config.js", "assets/api.js", "assets/dhamaka.css", "assets/frame.js", "assets/fair.js", "assets/announcer.js", "assets/screen.js",
  "assets/fullscreen.js", "assets/qr-targets.js", "assets/diya.svg", "assets/mandala.svg", "assets/rangoli-tile.svg",
  "assets/toran.svg", "assets/favicon.svg", "assets/techniline.png", "assets/icon-192.png", "assets/icon-512.png", "assets/icon-180.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // Apps Script, Cloudinary, fonts: straight to the network
  if (url.pathname.endsWith("/exec")) return;                           // local test backend
  e.respondWith(
    fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("index.html"); });
    })
  );
});

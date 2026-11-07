/* JJ Props service worker — only used when the app is hosted online (lets phones install it).
   App files: network first, saved copy when offline. ESPN data is never cached here (always live). */
var CACHE = 'jjprops-v2';
var SHELL = ['./', './index.html', './css/fonts.css', './css/styles.css?v=2', './js/util.js?v=2', './js/store.js?v=2', './js/espn.js?v=2', './js/model.js?v=2',
  './js/explain.js?v=2', './js/parlay.js?v=2', './js/charts.js?v=2', './js/ui.js?v=2', './js/app.js?v=2', './icons/icon.svg', './icons/icon-192.png', './manifest.webmanifest'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () {
    return caches.match(e.request).then(function (r) { return r || caches.match('./index.html'); });
  }));
});

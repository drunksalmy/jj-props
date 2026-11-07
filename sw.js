/* JJ Props service worker — only used when the app is hosted online (lets phones install it).
   App files: network first, saved copy when offline. ESPN data is never cached here (always live). */
var CACHE = 'jjprops-v4';
var SHELL = ['./', './index.html', './css/fonts.css', './css/styles.css?v=4', './js/util.js?v=4', './js/store.js?v=4', './js/espn.js?v=4', './js/model.js?v=4',
  './js/explain.js?v=4', './js/parlay.js?v=4', './js/charts.js?v=4', './js/ui.js?v=4', './js/app.js?v=4', './icons/icon.svg', './icons/icon-192.png', './manifest.webmanifest'];
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

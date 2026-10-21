/* JJ Props — store.js
 * Saves downloaded stats in the browser (IndexedDB, falling back to localStorage, then memory)
 * so the app opens fast the next time and doesn't re-download last season's numbers.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var HE = (root.HE = root.HE || {});
  var mem = new Map();
  var dbPromise = null;
  var LS = 'he:';

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      try {
        if (!root.indexedDB) return finish(null);
        var req = root.indexedDB.open('jjprops', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () { finish(req.result); };
        req.onerror = function () { finish(null); };
        req.onblocked = function () { finish(null); };
        setTimeout(function () { finish(null); }, 4000);
      } catch (e) { finish(null); }
    });
    return dbPromise;
  }

  function idb(mode, fn) {
    return openDB().then(function (db) {
      if (!db) return undefined;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('kv', mode);
          var req = fn(tx.objectStore('kv'));
          tx.oncomplete = function () { resolve(req && req.result); };
          tx.onerror = function () { resolve(undefined); };
          tx.onabort = function () { resolve(undefined); };
        } catch (e) { resolve(undefined); }
      });
    });
  }

  function lsGet(key) {
    try { var s = root.localStorage.getItem(LS + key); return s ? JSON.parse(s) : undefined; } catch (e) { return undefined; }
  }
  function lsSet(key, val) {
    try { root.localStorage.setItem(LS + key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  HE.store = {
    get: function (key) {
      if (mem.has(key)) return Promise.resolve(mem.get(key));
      return openDB().then(function (db) {
        if (db) return idb('readonly', function (s) { return s.get(key); });
        return lsGet(key);
      }).then(function (v) {
        if (v !== undefined) mem.set(key, v);
        return v;
      }).catch(function () { return undefined; });
    },
    set: function (key, val) {
      mem.set(key, val);
      return openDB().then(function (db) {
        if (db) return idb('readwrite', function (s) { return s.put(val, key); });
        lsSet(key, val);
      }).catch(function () { /* storage full or blocked: memory copy still works */ });
    },
    del: function (key) {
      mem.delete(key);
      try { root.localStorage.removeItem(LS + key); } catch (e) { /* ignore */ }
      return idb('readwrite', function (s) { return s.delete(key); });
    },
    clearAll: function () {
      mem.clear();
      try {
        var drop = [];
        for (var i = 0; i < root.localStorage.length; i++) {
          var k = root.localStorage.key(i);
          if (k && k.indexOf(LS) === 0) drop.push(k);
        }
        drop.forEach(function (k) { root.localStorage.removeItem(k); });
      } catch (e) { /* ignore */ }
      return idb('readwrite', function (s) { return s.clear(); });
    },
    /* small synchronous settings (theme, refresh speed, your own lines) */
    getSetting: function (k, d) {
      try { var v = root.localStorage.getItem('he.set.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    setSetting: function (k, v) {
      try { root.localStorage.setItem('he.set.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ }
    }
  };
})();

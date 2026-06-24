// MicroCiv cloud-save client — a tiny wrapper around the save Worker.
// Plain global <script> (no modules) so it works in the single-file app. Exposes
// window.__CLOUD = { enabled, uid, link(), pull(), put(obj), health() }.
//
// Worker API (see /worker):
//   GET  <cloudUrl>/v1/save?u=<id>  -> { t, data } | { data: null }
//   PUT  <cloudUrl>/v1/save?u=<id>  body=<json>    -> { ok, t }
//
// The account id `u` is the only secret — anyone with it can read/write that
// save (fine for a personal single-user game). The save body is the compressed
// envelope { t, z } the app builds, so it stays well under the Worker's size cap.
(function () {
  var cfg = (typeof window !== 'undefined' && window.MICROCIV_CONFIG) || {};
  var base = (cfg.cloudUrl || '').replace(/\/+$/, '');
  var enabled = !!base;
  var UIDKEY = 'microciv.uid';

  function makeId() {
    // `mc` prefix namespaces MicroCiv away from sibling games sharing the worker.
    var s = 'mc', a = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < 12; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  }

  // Resolve the account id: an explicit ?u= link wins (and is remembered);
  // otherwise reuse the stored id, or mint a fresh one.
  var uid = '';
  try {
    var fromUrl = new URLSearchParams(location.search).get('u');
    if (fromUrl) {
      uid = fromUrl.replace(/[^a-z0-9]/gi, '').slice(0, 64);
      if (uid) localStorage.setItem(UIDKEY, uid);
    }
    if (!uid) {
      uid = localStorage.getItem(UIDKEY) || '';
      if (!uid) { uid = makeId(); localStorage.setItem(UIDKEY, uid); }
    }
  } catch (e) { uid = uid || makeId(); }

  function url(id) { return base + '/v1/save?u=' + encodeURIComponent(id || uid); }

  function fetchTimeout(u, opts, ms) {
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, ms);
    var merged = {};
    for (var k in opts) merged[k] = opts[k];
    merged.signal = ctrl.signal;
    return fetch(u, merged).then(
      function (r) { clearTimeout(to); return r; },
      function (e) { clearTimeout(to); throw e; }
    );
  }

  var lastSent = '';

  window.__CLOUD = {
    enabled: enabled,
    uid: uid,
    link: function () {
      try { return location.origin + location.pathname + '?u=' + uid; }
      catch (e) { return '?u=' + uid; }
    },
    // Switch to a chosen sync code (so the same short code links every device
    // without QR scanning). Returns the cleaned id, or '' if invalid.
    setUid: function (code) {
      var clean = (code || '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 64);
      if (!clean) return '';
      uid = clean;
      this.uid = uid;
      lastSent = '';                       // force a re-push under the new id
      try { localStorage.setItem(UIDKEY, uid); } catch (e) {}
      return uid;
    },
    // Pull the remote envelope ({ t, z }) or null on miss/error/timeout.
    pull: function () {
      if (!enabled) return Promise.resolve(null);
      return fetchTimeout(url(), { cache: 'no-store' }, 5000)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return j && j.data ? j.data : null; })
        .catch(function () { return null; });
    },
    // Push an envelope object. Returns true if the worker accepted the write.
    put: function (obj) {
      if (!enabled || !obj) return Promise.resolve(false);
      var body = JSON.stringify(obj);
      if (body === lastSent) return Promise.resolve(true);
      return fetchTimeout(url(), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: body }, 8000)
        .then(function (r) { if (r.ok) lastSent = body; return r.ok; })
        .catch(function () { return false; });
    },
    // Live status: can we read, and (separately) can we write? Probes a throwaway
    // health key so it never clobbers the real save.
    health: function () {
      if (!enabled) return Promise.resolve({ enabled: false, reachable: false, writable: false });
      var reachable = fetchTimeout(url(), { cache: 'no-store' }, 5000).then(function (r) { return r.ok; }, function () { return false; });
      return reachable.then(function (ok) {
        return fetchTimeout(url(uid + 'h'), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"t":1,"z":"ping"}' }, 6000)
          .then(function (r) { return { enabled: true, reachable: ok, writable: r.ok }; },
                function () { return { enabled: true, reachable: ok, writable: false }; });
      });
    }
  };
})();

/* overrides.js — parametri della mappa 3D letti da /api/mappa-3d (vedi MAPPA-3D-API.md).
   Va caricato PRIMA di campus-3d.js e senza `defer`: riempie window.MAPPA3D_OVERRIDES e poi
   mette window.MAPPA3D_READY = true, che i moduli 3D aspettano prima di costruire la scena.
   MAPPA3D_READY diventa true in ogni caso — successo, errore, API assente o timeout (2,5 s) —
   così il sito funziona anche senza API: i moduli usano i valori di default. */
(function () {
  'use strict';
  var TIMEOUT = 2500;
  window.MAPPA3D_OVERRIDES = window.MAPPA3D_OVERRIDES || {};
  window.MAPPA3D_READY = false;
  var done = false;
  function ready(info) {
    if (done) return;
    done = true;
    window.MAPPA3D_READY = true;
    window.MAPPA3D_SOURCE = info;
  }
  var timer = setTimeout(function () { ready({ ok: false, reason: 'timeout' }); }, TIMEOUT);
  var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  if (ctrl) setTimeout(function () { try { ctrl.abort(); } catch (e) { /* ignora */ } }, TIMEOUT);
  var opts = ctrl ? { signal: ctrl.signal, cache: 'no-store' } : { cache: 'no-store' };
  if (typeof fetch !== 'function') { clearTimeout(timer); ready({ ok: false, reason: 'fetch non disponibile' }); return; }
  fetch('/api/mappa-3d', opts)
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
    .then(function (d) {
      if (d && d.overrides && typeof d.overrides === 'object') {
        Object.keys(d.overrides).forEach(function (mod) {
          var v = d.overrides[mod];
          if (v && typeof v === 'object' && !Array.isArray(v)) window.MAPPA3D_OVERRIDES[mod] = v;
        });
      }
      clearTimeout(timer);
      ready({ ok: true, updated_at: (d && d.updated_at) || 0 });
    })
    .catch(function (e) {
      clearTimeout(timer);
      ready({ ok: false, reason: String((e && e.message) || e) });
    });
})();

/* overrides.js — parametri della mappa 3D letti da /api/mappa-3d (vedi MAPPA-3D-API.md).
   Va caricato PRIMA di campus-3d.js e senza `defer`: riempie window.MAPPA3D_OVERRIDES e poi
   mette window.MAPPA3D_READY = true, che i moduli 3D aspettano prima di costruire la scena.
   Se l'API non risponde si ricade su `overrides.json`, il file che il pulsante «Pubblica su
   git» dell'editor scrive nel repository: così la scena resta coerente anche se D1 è
   irraggiungibile. MAPPA3D_READY diventa true in ogni caso — successo, riserva, errore,
   API assente o timeout (2,5 s) — così il sito funziona comunque con i valori di default. */
(function () {
  'use strict';
  var TIMEOUT = 2500;
  window.MAPPA3D_OVERRIDES = window.MAPPA3D_OVERRIDES || {};
  window.MAPPA3D_EDITOR_EDITS = {};
  window.MAPPA3D_READY = false;
  var done = false;
  function ready(info) {
    if (done) return;
    done = true;
    window.MAPPA3D_READY = true;
    window.MAPPA3D_SOURCE = info;
  }
  function apply(d) {
    var n = 0;
    if (d && d.overrides && typeof d.overrides === 'object') {
      Object.keys(d.overrides).forEach(function (mod) {
        var v = d.overrides[mod];
        if (v && typeof v === 'object' && !Array.isArray(v)) { window.MAPPA3D_OVERRIDES[mod] = v; n++; }
      });
    }
    if (d && d.editor_edits && typeof d.editor_edits === 'object' && !Array.isArray(d.editor_edits)) {
      window.MAPPA3D_EDITOR_EDITS = d.editor_edits;
    }
    return n;
  }
  var timer = setTimeout(function () { ready({ ok: false, reason: 'timeout' }); }, TIMEOUT);
  var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  if (ctrl) setTimeout(function () { try { ctrl.abort(); } catch (e) { /* ignora */ } }, TIMEOUT);
  var opts = ctrl ? { signal: ctrl.signal, cache: 'no-store' } : { cache: 'no-store' };
  if (typeof fetch !== 'function') { clearTimeout(timer); ready({ ok: false, reason: 'fetch non disponibile' }); return; }
  function get(url) {
    return fetch(url, opts).then(function (r) {
      return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status));
    });
  }
  get('/api/mappa-3d')
    .then(function (d) {
      clearTimeout(timer);
      apply(d);
      ready({ ok: true, from: 'api', updated_at: (d && d.updated_at) || 0 });
    })
    .catch(function (e) {
      if (done) return;
      var why = String((e && e.message) || e);
      /* Riserva: il file pubblicato su git accanto a questa pagina. */
      get('overrides.json')
        .then(function (d) {
          clearTimeout(timer);
          apply(d);
          ready({ ok: true, from: 'overrides.json', updated_at: (d && d.updated_at) || 0, api_error: why });
        })
        .catch(function (e2) {
          clearTimeout(timer);
          ready({ ok: false, reason: why, fallback_reason: String((e2 && e2.message) || e2) });
        });
    });
})();

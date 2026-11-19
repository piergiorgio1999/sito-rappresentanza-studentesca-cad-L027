/* /api/mappa-3d — parametri della mappa 3D del campus, modificabili senza push su git
   GET  /api/mappa-3d  → pubblico: {"overrides":{...},"updated_at":N} (N = epoch in secondi, 0 se vuoto)
                         restituisce sempre l'ULTIMA versione salvata
   PUT  /api/mappa-3d  → richiede `Authorization: Bearer <ADMIN_SECRET>`; corpo {"overrides":{...}}
                         header facoltativo `X-Editor: <nome>` per firmare la versione
   OPTIONS             → preflight CORS (serve all'editor e a un modello esterno su altro dominio)
   Sotto-endpoint (file separati in functions/api/mappa-3d/):
     GET  /api/mappa-3d/versions       → elenco delle ultime 50 versioni (senza corpo JSON)
     GET  /api/mappa-3d/versions/<id>  → una versione intera
     POST /api/mappa-3d/restore        → ripristina una versione (append), Bearer
     POST /api/mappa-3d/publish        → scrive site/campus-3d/overrides.json sul repo, Bearer
   Lo storico è APPEND-ONLY: ogni salvataggio è una riga nuova, niente viene sovrascritto.
   Binding richiesti (wrangler.toml / dashboard Pages):
     DB            → database D1 (tabelle create in automatico)
     ADMIN_SECRET  → variabile segreta (stringa lunga a caso), la stessa usata dagli altri endpoint admin
     GITHUB_TOKEN  → solo per /publish: token GitHub con permesso di scrittura sul repo
   Schema dei parametri: vedi site/campus-3d/MAPPA-3D-API.md */
import { hasSession } from './editor-auth.js';

const SQL_LEGACY = 'CREATE TABLE IF NOT EXISTS mappa3d (k TEXT PRIMARY KEY, json TEXT, updated_at INTEGER)';
const SQL_VERSIONS = 'CREATE TABLE IF NOT EXISTS mappa3d_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL, created_at INTEGER NOT NULL, author TEXT NOT NULL DEFAULT \'sconosciuto\')';
const KEY = 'overrides';
export const MAX_BYTES = 64 * 1024;
export const MAX_VERSIONS = 500;
export const LIST_LIMIT = 50;
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, X-Editor',
  'access-control-max-age': '86400'
};
export const json = (d, s = 200, extra = {}) => new Response(JSON.stringify(d), {
  status: s,
  headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, CORS, extra)
});
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/* Un valore sovrascrivibile è un numero finito, un booleano, una stringa breve
   o un array di numeri finiti: niente oggetti annidati, niente funzioni. */
function badValue(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? '' : 'numero non finito';
  if (typeof v === 'boolean') return '';
  if (typeof v === 'string') return v.length <= 200 ? '' : 'stringa troppo lunga (max 200 caratteri)';
  if (Array.isArray(v)) {
    if (v.length > 400) return 'array troppo lungo (max 400 elementi)';
    return v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? '' : 'array: ammessi solo numeri';
  }
  return 'ammessi solo numeri, booleani, stringhe e array di numeri';
}

export function validate(overrides) {
  if (!isPlainObject(overrides)) return 'overrides deve essere un oggetto';
  for (const [mod, params] of Object.entries(overrides)) {
    if (!isPlainObject(params)) return `overrides["${mod}"] deve essere un oggetto di parametri`;
    for (const [name, value] of Object.entries(params)) {
      const err = badValue(value);
      if (err) return `overrides["${mod}"]["${name}"]: ${err}`;
    }
  }
  const size = new TextEncoder().encode(JSON.stringify(overrides)).length;
  if (size > MAX_BYTES) return `JSON troppo grande: ${size} byte, massimo ${MAX_BYTES}`;
  return '';
}

/* Il token non deve mai comparire in una risposta: il confronto avviene qui e
   l'unica cosa che esce è `true`/`false`. */
export function authorized(request, env) {
  if (!env.ADMIN_SECRET) return false;
  const m = /^Bearer\s+(.+)$/i.exec((request.headers.get('authorization') || '').trim());
  return !!m && m[1] === env.ADMIN_SECRET;
}

/* Scrittura ammessa con il Bearer (IA e script) oppure con il cookie di sessione
   dell'editor (browser, dopo il login). La lettura resta pubblica. */
export async function canWrite(request, env) {
  if (authorized(request, env)) return true;
  return hasSession(request, env);
}

/* Nome di chi salva: header facoltativo `X-Editor`, ripulito e accorciato. */
export function editorName(request) {
  const raw = (request.headers.get('x-editor') || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return raw ? raw.slice(0, 40) : 'sconosciuto';
}

export async function ensureSchema(env) {
  await env.DB.prepare(SQL_VERSIONS).run();
}

/* Corpo JSON con tetto di 64 KB, letto come testo per poter rifiutare prima del parse. */
export async function readBody(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BYTES) {
    return { error: `corpo troppo grande: massimo ${MAX_BYTES} byte` };
  }
  try {
    const body = JSON.parse(text || 'null');
    if (!isPlainObject(body)) return { error: 'il corpo deve essere un oggetto JSON' };
    return { body };
  } catch (e) {
    return { error: 'JSON non valido' };
  }
}

/* Ultima versione. Se lo storico è vuoto ricade sulla vecchia tabella a riga
   singola, così i parametri già salvati prima dello storico non si perdono. */
export async function readLatest(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT id, json, created_at, author FROM mappa3d_versions ORDER BY id DESC LIMIT 1').first();
  if (row) {
    let overrides = {};
    try { overrides = JSON.parse(row.json) || {}; } catch (e) { overrides = {}; }
    return { overrides, updated_at: row.created_at || 0, id: row.id, author: row.author || 'sconosciuto' };
  }
  try {
    await env.DB.prepare(SQL_LEGACY).run();
    const old = await env.DB.prepare('SELECT json, updated_at FROM mappa3d WHERE k=?').bind(KEY).first();
    if (old) {
      let overrides = {};
      try { overrides = JSON.parse(old.json) || {}; } catch (e) { overrides = {}; }
      return { overrides, updated_at: old.updated_at || 0, id: 0, author: 'sconosciuto' };
    }
  } catch (e) { /* tabella vecchia assente: va bene */ }
  return { overrides: {}, updated_at: 0, id: 0, author: 'sconosciuto' };
}

/* Append di una nuova versione + potatura oltre MAX_VERSIONS righe. */
export async function appendVersion(env, overrides, author) {
  await ensureSchema(env);
  const now = Math.floor(Date.now() / 1000);
  const res = await env.DB.prepare('INSERT INTO mappa3d_versions (json, created_at, author) VALUES (?,?,?)')
    .bind(JSON.stringify(overrides), now, author).run();
  try {
    await env.DB.prepare('DELETE FROM mappa3d_versions WHERE id NOT IN (SELECT id FROM mappa3d_versions ORDER BY id DESC LIMIT ?)')
      .bind(MAX_VERSIONS).run();
  } catch (e) { /* la potatura non deve far fallire un salvataggio riuscito */ }
  const id = (res && res.meta && res.meta.last_row_id) || 0;
  return { id, updated_at: now, author };
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: 'database non configurato' }, 500);
  try {
    const d = await readLatest(env);
    return json({ overrides: d.overrides, updated_at: d.updated_at }, 200, { 'cache-control': 'public, max-age=30' });
  } catch (e) {
    return json({ error: 'lettura non riuscita' }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  if (!env.DB) return json({ error: 'database non configurato' }, 500);
  if (!env.ADMIN_SECRET) return json({ error: 'scrittura non configurata' }, 503);
  if (!(await canWrite(request, env))) return json({ error: 'autenticazione non valida' }, 401, { 'www-authenticate': 'Bearer' });
  const parsed = await readBody(request);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const err = validate(parsed.body.overrides);
  if (err) return json({ error: err }, 400);
  let saved;
  try {
    saved = await appendVersion(env, parsed.body.overrides, editorName(request));
  } catch (e) {
    return json({ error: 'salvataggio non riuscito' }, 500);
  }
  return json({ overrides: parsed.body.overrides, updated_at: saved.updated_at, id: saved.id, author: saved.author });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

/* Metodi non ammessi: handler espliciti invece di un `onRequest` catch-all, che su
   Pages rischierebbe di coprire anche GET/PUT/OPTIONS. Gli altri metodi ricadono
   sul 405 predefinito di Pages. */
const notAllowed = ({ request }) => json({ error: `metodo ${request.method} non ammesso` }, 405, { allow: 'GET, PUT, OPTIONS' });
export const onRequestPost = notAllowed;
export const onRequestPatch = notAllowed;
export const onRequestDelete = notAllowed;

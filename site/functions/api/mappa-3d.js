/* /api/mappa-3d — parametri della mappa 3D del campus, modificabili senza push su git
   GET  /api/mappa-3d  → pubblico: {"overrides":{...},"updated_at":N} (N = epoch in secondi, 0 se vuoto)
   PUT  /api/mappa-3d  → richiede `Authorization: Bearer <ADMIN_SECRET>`; corpo {"overrides":{...}}
   OPTIONS             → preflight CORS (serve all'editor e a un modello esterno su altro dominio)
   Binding richiesti (wrangler.toml / dashboard Pages):
     DB            → database D1 (tabella creata in automatico)
     ADMIN_SECRET  → variabile segreta (stringa lunga a caso), la stessa usata dagli altri endpoint admin
   Schema dei parametri: vedi site/campus-3d/MAPPA-3D-API.md */
const SQL = 'CREATE TABLE IF NOT EXISTS mappa3d (k TEXT PRIMARY KEY, json TEXT, updated_at INTEGER)';
const KEY = 'overrides';
const MAX_BYTES = 64 * 1024;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type',
  'access-control-max-age': '86400'
};
const json = (d, s = 200, extra = {}) => new Response(JSON.stringify(d), {
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

function validate(overrides) {
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

async function read(env) {
  await env.DB.prepare(SQL).run();
  const row = await env.DB.prepare('SELECT json, updated_at FROM mappa3d WHERE k=?').bind(KEY).first();
  if (!row) return { overrides: {}, updated_at: 0 };
  let overrides = {};
  try { overrides = JSON.parse(row.json) || {}; } catch (e) { overrides = {}; }
  return { overrides, updated_at: row.updated_at || 0 };
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: 'database non configurato' }, 500);
  try {
    return json(await read(env), 200, { 'cache-control': 'public, max-age=30' });
  } catch (e) {
    return json({ error: 'lettura non riuscita' }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  if (!env.DB) return json({ error: 'database non configurato' }, 500);
  if (!env.ADMIN_SECRET) return json({ error: 'scrittura non configurata' }, 503);
  const auth = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m || m[1] !== env.ADMIN_SECRET) {
    return json({ error: 'token non valido' }, 401, { 'www-authenticate': 'Bearer' });
  }
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'JSON non valido' }, 400); }
  if (!isPlainObject(body)) return json({ error: 'il corpo deve essere un oggetto JSON' }, 400);
  const err = validate(body.overrides);
  if (err) return json({ error: err }, 400);
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(SQL).run();
    await env.DB.prepare('INSERT INTO mappa3d (k,json,updated_at) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at')
      .bind(KEY, JSON.stringify(body.overrides), now).run();
  } catch (e) {
    return json({ error: 'salvataggio non riuscito' }, 500);
  }
  return json({ overrides: body.overrides, updated_at: now });
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

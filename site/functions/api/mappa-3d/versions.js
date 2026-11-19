/* GET /api/mappa-3d/versions — pubblico: elenco delle ultime 50 versioni salvate,
   senza il corpo JSON (solo id, data, autore e dimensione in byte). */
import { json, CORS, LIST_LIMIT, ensureSchema } from '../mappa-3d.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: 'database non configurato' }, 500);
  try {
    await ensureSchema(env);
    const res = await env.DB.prepare(
      'SELECT id, created_at, author, LENGTH(CAST(json AS BLOB)) AS bytes FROM mappa3d_versions ORDER BY id DESC LIMIT ?'
    ).bind(LIST_LIMIT).all();
    const versions = ((res && res.results) || []).map((r) => ({
      id: r.id,
      created_at: r.created_at || 0,
      author: r.author || 'sconosciuto',
      bytes: r.bytes || 0
    }));
    return json({ versions, limit: LIST_LIMIT });
  } catch (e) {
    return json({ error: 'lettura dello storico non riuscita' }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
const notAllowed = ({ request }) => json({ error: `metodo ${request.method} non ammesso` }, 405, { allow: 'GET, OPTIONS' });
export const onRequestPost = notAllowed;
export const onRequestPut = notAllowed;
export const onRequestPatch = notAllowed;
export const onRequestDelete = notAllowed;

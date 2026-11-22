/* GET /api/mappa-3d/versions/<id> — pubblico: una versione intera dello storico. */
import { json, CORS, ensureSchema, decodeVersion } from '../../mappa-3d.js';

export async function onRequestGet({ params, env }) {
  if (!env.DB) return json({ error: 'database non configurato' }, 500);
  const id = Number(params && params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'id non valido' }, 400);
  try {
    await ensureSchema(env);
    const row = await env.DB.prepare('SELECT id, json, created_at, author FROM mappa3d_versions WHERE id=?').bind(id).first();
    if (!row) return json({ error: 'versione non trovata' }, 404);
    const { overrides, editor_edits } = decodeVersion(row.json);
    return json({ id: row.id, created_at: row.created_at || 0, author: row.author || 'sconosciuto', overrides, editor_edits });
  } catch (e) {
    return json({ error: 'lettura della versione non riuscita' }, 500);
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

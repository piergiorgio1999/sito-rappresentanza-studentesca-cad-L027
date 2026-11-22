/* POST /api/mappa-3d/restore — corpo {"id":N}: rilegge la versione N e la riscrive
   come nuova versione in cima. Il ripristino è per append: non si perde mai nulla.
   Autenticazione: Bearer <ADMIN_SECRET> oppure cookie di sessione dell'editor. */
import { json, CORS, canWrite, readBody, ensureSchema, appendVersion, editorName, decodeVersion } from '../mappa-3d.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'database non configurato' }, 500);
  if (!env.ADMIN_SECRET) return json({ error: 'scrittura non configurata' }, 503);
  if (!(await canWrite(request, env))) return json({ error: 'autenticazione non valida' }, 401, { 'www-authenticate': 'Bearer' });
  const parsed = await readBody(request);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const id = Number(parsed.body.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'id non valido' }, 400);
  try {
    await ensureSchema(env);
    const row = await env.DB.prepare('SELECT json FROM mappa3d_versions WHERE id=?').bind(id).first();
    if (!row) return json({ error: 'versione non trovata' }, 404);
    const { overrides, editor_edits } = decodeVersion(row.json);
    const author = editorName(request);
    const saved = await appendVersion(env, overrides, author, editor_edits);
    return json({ overrides, editor_edits, restored_from: id, id: saved.id, updated_at: saved.updated_at, author: saved.author });
  } catch (e) {
    return json({ error: 'ripristino non riuscito' }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
const notAllowed = ({ request }) => json({ error: `metodo ${request.method} non ammesso` }, 405, { allow: 'POST, OPTIONS' });
export const onRequestGet = notAllowed;
export const onRequestPut = notAllowed;
export const onRequestPatch = notAllowed;
export const onRequestDelete = notAllowed;

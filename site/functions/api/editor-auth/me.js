/* GET /api/editor-auth/me — dice se la sessione dell'editor è ancora valida.
   L'editor la chiama all'avvio: senza sessione valida rimanda a login.html. */
import { reply, sessionUser } from '../editor-auth.js';

export async function onRequestGet({ request, env }) {
  const user = await sessionUser(request, env);
  if (!user) return reply({ error: 'sessione assente o scaduta' }, 401);
  return reply({ ok: true, user });
}
export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'null', 'access-control-allow-methods': 'GET, OPTIONS' } });
}

/* GET /api/editor-auth/me — dice se la sessione dell'editor è ancora valida.
   L'editor la chiama all'avvio: senza sessione valida rimanda a login.html.
   Quando in D1 non c'è nessun utente e nemmeno EDITOR_PASSWORD_HASH, la
   risposta resta 401 ma porta `setup: true`: login.html mostra allora il
   modulo di primo accesso. */
import { meResponse } from '../editor-auth.js';

export async function onRequestGet({ request, env }) {
  return meResponse(request, env);
}
export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'null', 'access-control-allow-methods': 'GET, OPTIONS' } });
}

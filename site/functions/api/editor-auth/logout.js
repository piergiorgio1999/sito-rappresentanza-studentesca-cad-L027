/* POST /api/editor-auth/logout — svuota il cookie di sessione dell'editor. */
import { reply, clearCookie } from '../editor-auth.js';

export function onRequestPost() {
  return reply({ ok: true }, 200, { 'set-cookie': clearCookie() });
}
export function onRequestGet() {
  return reply({ error: 'usa POST' }, 405, { allow: 'POST, OPTIONS' });
}
export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'null', 'access-control-allow-methods': 'POST, OPTIONS' } });
}

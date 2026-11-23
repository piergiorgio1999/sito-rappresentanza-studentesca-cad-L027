/* DELETE /api/editor-auth/utenti/<utente> — elimina un account.
   Solo per chi ha ruolo admin. Due rifiuti di principio:
   non si elimina il proprio account e non si elimina l'ultimo admin rimasto,
   altrimenti nessuno potrebbe più gestire gli account.
   L'eliminazione chiude subito le sessioni aperte di quell'account: il
   contatore `sessioni` sparisce con la riga e il cookie non combacia più. */
import { reply, requireSession, findUtente, countAdmin, normRuolo } from '../../editor-auth.js';

export async function onRequestDelete({ request, env, params }) {
  if (!env || !env.DB) return reply({ error: 'database non configurato' }, 500);
  const guard = await requireSession(request, env, true);
  if (guard.error) return guard.error;

  const raw = params && params.utente;
  const nome = Array.isArray(raw) ? raw.join('/') : String(raw == null ? '' : raw);
  let target = nome;
  try { target = decodeURIComponent(nome); } catch (e) { target = nome; }
  const row = await findUtente(env, target);
  if (!row) return reply({ error: 'utente non trovato' }, 404);

  if (row.utente.toLowerCase() === String(guard.session.utente).toLowerCase()) {
    return reply({ error: 'non puoi eliminare il tuo account' }, 409);
  }
  if (normRuolo(row.ruolo) === 'admin' && (await countAdmin(env)) <= 1) {
    return reply({ error: 'è l\'ultimo amministratore: non può essere eliminato' }, 409);
  }

  await env.DB.prepare('DELETE FROM editor_utenti WHERE utente = ?').bind(row.utente).run();
  return reply({ ok: true, utente: row.utente });
}

export function onRequestGet() {
  return reply({ error: 'usa DELETE' }, 405, { allow: 'DELETE, OPTIONS' });
}
export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'null', 'access-control-allow-methods': 'DELETE, OPTIONS' } });
}

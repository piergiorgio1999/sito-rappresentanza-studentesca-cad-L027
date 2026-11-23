/* POST /api/editor-auth/setup — primo accesso.
   Crea il PRIMO utente (ruolo admin) e apre subito la sessione.
   Corpo: {"utente":"...","password":"...","conferma":"..."} (conferma facoltativa).
   Funziona solo finché non esiste nessuna password: se la tabella ha già un
   utente, o se è impostato EDITOR_PASSWORD_HASH, risponde 409 e non si può più
   usare. L'hash è calcolato qui sul server (PBKDF2-SHA256 con sale): la
   password in chiaro non viene mai scritta in D1 né in un log. */
import {
  reply, readJson, checkUtente, checkPassword, makeHash, mintSession,
  sessionCookie, countUtenti, ensureUtenti, NO_SECRET
} from '../editor-auth.js';

const GIA_FATTO = 'una password è già impostata: il primo accesso non è più disponibile';

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return reply({ error: 'database non configurato' }, 500);
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body;

  /* Senza ADMIN_SECRET il cookie non si può firmare: meglio dirlo prima di
     scrivere qualunque cosa, così il primo accesso resta ancora possibile. */
  if (!env.ADMIN_SECRET) return reply({ error: NO_SECRET, secret: false }, 503);
  if (env.EDITOR_PASSWORD_HASH) return reply({ error: GIA_FATTO }, 409);
  if ((await countUtenti(env)) > 0) return reply({ error: GIA_FATTO }, 409);

  const utente = typeof body.utente === 'string' ? body.utente.trim() : '';
  const errU = checkUtente(utente);
  if (errU) return reply({ error: errU }, 400);
  const password = typeof body.password === 'string' ? body.password : '';
  const errP = checkPassword(password);
  if (errP) return reply({ error: errP }, 400);
  if (typeof body.conferma === 'string' && body.conferma !== password) {
    return reply({ error: 'le due password non coincidono' }, 400);
  }

  const hash = await makeHash(password);
  await ensureUtenti(env);
  /* Inserimento con guardia: se nel frattempo qualcuno ha già completato il
     primo accesso, non si sovrascrive niente e si risponde 409. */
  const res = await env.DB.prepare(
    "INSERT INTO editor_utenti (utente, hash, ruolo, creato_da, creato_il, sessioni)" +
    " SELECT ?, ?, 'admin', 'primo accesso', ?, 1 WHERE NOT EXISTS (SELECT 1 FROM editor_utenti)"
  ).bind(utente, hash, Math.floor(Date.now() / 1000)).run();
  const changes = (res && res.meta && Number(res.meta.changes)) || 0;
  if (!changes) return reply({ error: GIA_FATTO }, 409);

  const value = await mintSession(utente, 1, env.ADMIN_SECRET);
  return reply({ ok: true, user: utente, utente, ruolo: 'admin' }, 200, { 'set-cookie': sessionCookie(value) });
}

export function onRequestGet() {
  return reply({ error: 'usa POST' }, 405, { allow: 'POST, OPTIONS' });
}
export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'null', 'access-control-allow-methods': 'POST, OPTIONS' } });
}

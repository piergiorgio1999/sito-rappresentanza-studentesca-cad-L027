/* POST /api/editor-auth/password — cambio della PROPRIA password.
   Corpo: {"corrente":"...","nuova":"..."}. Serve una sessione valida; ogni
   utente, anche con ruolo editor, può cambiare solo la propria.
   La nuova password deve essere lunga almeno 8 caratteri e diversa da quella in
   uso. Il contatore `sessioni` della riga sale di uno: tutte le altre sessioni
   aperte con quell'account scadono subito, mentre a chi fa il cambio viene dato
   un cookie nuovo e resta dentro. */
import {
  reply, readJson, requireSession, findUtente, checkPassword, passwordOk,
  makeHash, mintSession, sessionCookie, ensureUtenti, normRuolo
} from '../editor-auth.js';

const FAIL_DELAY_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return reply({ error: 'database non configurato' }, 500);
  const guard = await requireSession(request, env, false);
  if (guard.error) return guard.error;
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body;

  const corrente = typeof body.corrente === 'string' ? body.corrente : '';
  const nuova = typeof body.nuova === 'string' ? body.nuova : '';
  const errP = checkPassword(nuova);
  if (errP) return reply({ error: errP }, 400);
  if (nuova === corrente) return reply({ error: 'la nuova password deve essere diversa da quella in uso' }, 400);

  const row = await findUtente(env, guard.session.utente);
  let hashAttuale = row ? row.hash : (env.EDITOR_PASSWORD_HASH || '');
  if (!(await passwordOk(corrente, hashAttuale))) {
    await sleep(FAIL_DELAY_MS);
    return reply({ error: 'password attuale non valida' }, 401);
  }

  const hash = await makeHash(nuova);
  await ensureUtenti(env);
  let sessioni = 1;
  let ruolo = row ? normRuolo(row.ruolo) : 'admin';
  if (row) {
    const res = await env.DB
      .prepare('UPDATE editor_utenti SET hash = ?, sessioni = sessioni + 1 WHERE utente = ? RETURNING sessioni')
      .bind(hash, row.utente).first();
    sessioni = (res && Number(res.sessioni)) || ((Number(row.sessioni) || 0) + 1);
  } else {
    /* La password viveva ancora nei segreti: il cambio la porta in D1, e da
       quel momento vale solo la tabella. */
    await env.DB.prepare(
      'INSERT INTO editor_utenti (utente, hash, ruolo, creato_da, creato_il, sessioni) VALUES (?, ?, ?, ?, ?, 1)'
    ).bind(guard.session.utente, hash, 'admin', 'variabile d\'ambiente', Math.floor(Date.now() / 1000)).run();
    sessioni = 1;
  }

  const nome = row ? row.utente : guard.session.utente;
  const value = await mintSession(nome, sessioni, env.ADMIN_SECRET);
  return reply({ ok: true, user: nome, utente: nome, ruolo }, 200, { 'set-cookie': sessionCookie(value) });
}

export function onRequestGet() {
  return reply({ error: 'usa POST' }, 405, { allow: 'POST, OPTIONS' });
}
export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'null', 'access-control-allow-methods': 'POST, OPTIONS' } });
}

/* /api/editor-auth/utenti — elenco e creazione degli account dell'editor.
   GET  → elenco: utente, ruolo, data di creazione, chi l'ha creato. MAI l'hash.
   POST → {"utente":"...","password":"...","ruolo":"admin"|"editor"}
   Entrambi solo per chi ha ruolo admin: un editor riceve 403 e non vede
   l'elenco. L'eliminazione sta in utenti/[utente].js. */
import {
  reply, readJson, requireSession, findUtente, checkUtente, checkPassword,
  makeHash, ensureUtenti, ruoloOk, normRuolo
} from '../editor-auth.js';

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return reply({ error: 'database non configurato' }, 500);
  const guard = await requireSession(request, env, true);
  if (guard.error) return guard.error;
  await ensureUtenti(env);
  const { results } = await env.DB
    .prepare('SELECT utente, ruolo, creato_da, creato_il FROM editor_utenti ORDER BY creato_il, utente')
    .all();
  const utenti = (results || []).map((r) => ({
    utente: r.utente,
    ruolo: normRuolo(r.ruolo),
    creato_da: r.creato_da || '',
    creato_il: Number(r.creato_il) || 0
  }));
  return reply({ ok: true, utenti, io: guard.session.utente });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return reply({ error: 'database non configurato' }, 500);
  const guard = await requireSession(request, env, true);
  if (guard.error) return guard.error;
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body;

  const utente = typeof body.utente === 'string' ? body.utente.trim() : '';
  const errU = checkUtente(utente);
  if (errU) return reply({ error: errU }, 400);
  const password = typeof body.password === 'string' ? body.password : '';
  const errP = checkPassword(password);
  if (errP) return reply({ error: errP }, 400);
  const ruolo = typeof body.ruolo === 'string' ? body.ruolo.trim() : '';
  if (!ruoloOk(ruolo)) return reply({ error: 'il ruolo deve essere "admin" o "editor"' }, 400);

  /* Confronto senza distinzione fra maiuscole e minuscole. */
  if (await findUtente(env, utente)) return reply({ error: 'questo nome utente esiste già' }, 409);

  const hash = await makeHash(password);
  await ensureUtenti(env);
  try {
    await env.DB.prepare(
      'INSERT INTO editor_utenti (utente, hash, ruolo, creato_da, creato_il, sessioni) VALUES (?, ?, ?, ?, ?, 1)'
    ).bind(utente, hash, ruolo, guard.session.utente, Math.floor(Date.now() / 1000)).run();
  } catch (e) {
    return reply({ error: 'questo nome utente esiste già' }, 409);
  }
  return reply({ ok: true, utente, ruolo }, 201);
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'null', 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
}

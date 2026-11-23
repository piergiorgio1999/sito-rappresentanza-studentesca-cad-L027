/* /api/editor-auth — login e account dell'editor della mappa 3D (nome utente + password).
   POST   /api/editor-auth                   → {"utente":"...","password":"..."} → cookie di sessione
   GET    /api/editor-auth                   → come /me
   POST   /api/editor-auth/logout            → svuota il cookie
   GET    /api/editor-auth/me                → sessione valida: {"ok":true,"utente":"...","ruolo":"..."}
                                               nessuna password impostata: 401 con {"setup":true}
   POST   /api/editor-auth/setup             → primo accesso: crea il primo utente (ruolo admin)
   POST   /api/editor-auth/password          → cambio della propria password
   GET    /api/editor-auth/utenti            → elenco utenti (solo admin, mai l'hash)
   POST   /api/editor-auth/utenti            → crea un utente (solo admin)
   DELETE /api/editor-auth/utenti/<utente>   → elimina un utente (solo admin)

   Dove vive la password: nella tabella D1 `editor_utenti`, creata in automatico.
   Nessuna password e nessun hash vivono nel repository, in nessuna forma,
   nemmeno come esempio o come ripiego.

   Ordine di precedenza nella verifica:
     1. se la tabella `editor_utenti` ha almeno una riga, vale solo quella;
     2. altrimenti, se `EDITOR_PASSWORD_HASH` è impostato vale quello (compatibilità);
     3. altrimenti si è nello stato «nessuna password impostata» e l'unico ingresso
        possibile è il primo accesso (`/setup`), che si chiude per sempre appena
        esiste un utente.

   Binding e variabili (dashboard Pages / wrangler.toml, MAI nel repository):
     DB                    → database D1 (la tabella è creata in automatico)
     ADMIN_SECRET          → chiave con cui si firma (HMAC-SHA256) il cookie di sessione
     EDITOR_USER           → solo compatibilità: nome utente del vecchio accesso
                             da variabile d'ambiente (default "Piergiorgio")
     EDITOR_PASSWORD_HASH  → solo compatibilità: `pbkdf2$<iterazioni>$<sale_b64>$<hash_b64>`
   Formato dell'hash: PBKDF2-SHA256 con sale, almeno 100000 iterazioni. */
export const COOKIE = 'mappa3d_sess';
const MAX_AGE = 28800;              /* 8 ore */
const MIN_ITERATIONS = 100000;
export const ITERATIONS = 150000;   /* usato per gli hash scritti da qui */
const FAIL_DELAY_MS = 250;
export const MAX_BODY = 65536;      /* 64 KB */
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 256;
const USER_RE = /^[A-Za-z0-9._-]{3,32}$/;
export const RUOLI = ['admin', 'editor'];
export const BAD_LOGIN = 'nome utente o password non validi';
export const NO_SECRET =
  'ADMIN_SECRET non impostato: aggiungilo fra le variabili del progetto, poi riprova. ' +
  'Il valore non viene mai mostrato né registrato.';

const SQL_UTENTI = 'CREATE TABLE IF NOT EXISTS editor_utenti (utente TEXT PRIMARY KEY, hash TEXT, ruolo TEXT, creato_da TEXT, creato_il INTEGER, sessioni INTEGER DEFAULT 0)';

const CORS = {
  'access-control-allow-origin': 'null',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
  'access-control-max-age': '86400'
};
export const reply = (d, s = 200, extra = {}) => new Response(JSON.stringify(d), {
  status: s,
  headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, CORS, extra)
});

const enc = new TextEncoder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function b64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes) {
  let bin = '';
  const a = new Uint8Array(bytes);
  for (let i = 0; i < a.length; i++) bin += String.fromCharCode(a[i]);
  return btoa(bin);
}
/* Confronto a tempo costante: stessa quantità di lavoro comunque vada. */
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function sameString(a, b) {
  return sameBytes(enc.encode(String(a)), enc.encode(String(b)));
}

async function pbkdf2(password, salt, iterations, bits) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const out = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, bits);
  return new Uint8Array(out);
}

/* `pbkdf2$<iterazioni>$<sale_b64>$<hash_b64>` */
export async function passwordOk(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS) return false;
  let salt, want;
  try { salt = b64ToBytes(parts[2]); want = b64ToBytes(parts[3]); } catch (e) { return false; }
  if (!salt.length || !want.length) return false;
  const got = await pbkdf2(password, salt, iterations, want.length * 8);
  return sameBytes(got, want);
}

/* Hash della password, calcolato sempre qui sul server con Web Crypto: la
   password in chiaro non viene mai scritta in D1 né in un log. */
export async function makeHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(String(password), salt, ITERATIONS, 256);
  return 'pbkdf2$' + ITERATIONS + '$' + bytesToB64(salt) + '$' + bytesToB64(bits);
}

/* Lavoro equivalente a una verifica, quando l'utente non esiste: il tempo di
   risposta non dice se il nome è giusto. Il sale è casuale a ogni chiamata,
   così nel repository non resta nessun hash, nemmeno finto. */
export async function burnPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await pbkdf2(String(password || ''), salt, MIN_ITERATIONS, 256);
  return false;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

/* ---- tabella degli utenti ---------------------------------------------- */

export async function ensureUtenti(env) {
  if (!env || !env.DB) return false;
  await env.DB.prepare(SQL_UTENTI).run();
  return true;
}

/* Il nome utente non distingue maiuscole e minuscole: in tabella ne esiste una
   sola forma, quella scelta alla creazione, e quella torna nelle risposte. */
export async function findUtente(env, nome) {
  if (!(await ensureUtenti(env))) return null;
  const row = await env.DB
    .prepare('SELECT utente, hash, ruolo, creato_da, creato_il, sessioni FROM editor_utenti WHERE utente = ? COLLATE NOCASE')
    .bind(String(nome == null ? '' : nome)).first();
  return row || null;
}

export async function countUtenti(env) {
  if (!(await ensureUtenti(env))) return 0;
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_utenti').first();
  return row ? Number(row.n) || 0 : 0;
}

export async function countAdmin(env) {
  if (!(await ensureUtenti(env))) return 0;
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM editor_utenti WHERE ruolo = 'admin'").first();
  return row ? Number(row.n) || 0 : 0;
}

/* Nessuna password impostata da nessuna parte: si entra solo dal primo accesso. */
export async function needsSetup(env) {
  if ((await countUtenti(env)) > 0) return false;
  return !(env && env.EDITOR_PASSWORD_HASH);
}

export const ruoloOk = (r) => RUOLI.indexOf(r) >= 0;
export const normRuolo = (r) => (r === 'admin' ? 'admin' : 'editor');

/* Errore in chiaro se il nome utente non va, stringa vuota se va bene. */
export function checkUtente(nome) {
  const v = typeof nome === 'string' ? nome.trim() : '';
  if (!USER_RE.test(v)) {
    return 'il nome utente deve avere da 3 a 32 caratteri fra lettere, numeri, punto, trattino e trattino basso';
  }
  return '';
}
export function checkPassword(password) {
  if (typeof password !== 'string') return 'password mancante';
  if ([...password].length < MIN_PASSWORD) return 'la password deve essere lunga almeno ' + MIN_PASSWORD + ' caratteri';
  if (password.length > MAX_PASSWORD) return 'password troppo lunga';
  return '';
}

/* ---- sessione ----------------------------------------------------------- */

/* Valore del cookie: <utente_b64>.<sessioni>.<scadenza>.<firma>.
   `sessioni` è il contatore della riga in tabella: cambiarlo (cambio password,
   eliminazione dell'account) chiude subito tutte le sessioni aperte.
   Nel cookie non finisce nessun segreto e nessun pezzo di hash. */
export async function mintSession(utente, sessioni, secret) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = bytesToB64(enc.encode(utente)) + '.' + (Number(sessioni) || 0) + '.' + exp;
  return payload + '.' + bytesToB64(await hmac(secret, payload));
}

export function cookieValue(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

/* Sessione valida? Nessuna eccezione esce da qui: in caso di dubbio, no.
   Restituisce {utente, ruolo, sessioni} oppure null. */
export async function sessionInfo(request, env) {
  if (!env || !env.ADMIN_SECRET) return null;
  const value = cookieValue(request, COOKIE);
  if (!value) return null;
  const bits = value.split('.');
  if (bits.length !== 4) return null;
  const payload = bits[0] + '.' + bits[1] + '.' + bits[2];
  try {
    const want = await hmac(env.ADMIN_SECRET, payload);
    if (!sameBytes(want, b64ToBytes(bits[3]))) return null;
    const sessioni = Number(bits[1]);
    const exp = Number(bits[2]);
    if (!Number.isInteger(sessioni) || sessioni < 0) return null;
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
    const utente = new TextDecoder().decode(b64ToBytes(bits[0])).slice(0, 40);
    if (!utente) return null;
    const row = await findUtente(env, utente);
    if (row) {
      /* Contatore diverso: la password è cambiata o l'account è stato rifatto. */
      if ((Number(row.sessioni) || 0) !== sessioni) return null;
      return { utente: row.utente, ruolo: normRuolo(row.ruolo), sessioni };
    }
    /* Nessuna riga: vale solo la sessione del vecchio accesso da variabile
       d'ambiente, e solo finché la tabella è davvero vuota. */
    if (!env.EDITOR_PASSWORD_HASH || sessioni !== 0) return null;
    if ((await countUtenti(env)) > 0) return null;
    return { utente, ruolo: 'admin', sessioni: 0 };
  } catch (e) {
    return null;
  }
}
export async function sessionUser(request, env) {
  const s = await sessionInfo(request, env);
  return s ? s.utente : '';
}
export async function hasSession(request, env) {
  return !!(await sessionInfo(request, env));
}

const setCookie = (value, maxAge) =>
  `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
export const clearCookie = () => setCookie('', 0);
export const sessionCookie = (value) => setCookie(value, MAX_AGE);

/* ---- corpo della richiesta --------------------------------------------- */

/* Corpi oltre 64 KB rifiutati. Torna {body} oppure {error: Response}. */
export async function readJson(request) {
  const text = await request.text();
  if (enc.encode(text).length > MAX_BODY) return { error: reply({ error: 'richiesta troppo grande' }, 413) };
  let body;
  try { body = JSON.parse(text || 'null'); } catch (e) { body = null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: reply({ error: 'JSON non valido' }, 400) };
  return { body };
}

/* Risposta comune a tutti gli endpoint che richiedono una sessione. */
export async function requireSession(request, env, soloAdmin) {
  if (!env || !env.ADMIN_SECRET) return { error: reply({ error: NO_SECRET }, 503) };
  const s = await sessionInfo(request, env);
  if (!s) return { error: reply({ error: 'sessione assente o scaduta' }, 401) };
  if (soloAdmin && s.ruolo !== 'admin') return { error: reply({ error: 'servono i permessi di amministratore' }, 403) };
  return { session: s };
}

/* Stato della sessione, come lo leggono login.html, editor.html ed editor-bridge.html.
   Senza sessione resta 401: solo così le pagine dell'editor rimandano al login.
   Quando non esiste nessuna password il corpo porta `setup: true`. */
export async function meResponse(request, env) {
  const s = await sessionInfo(request, env);
  if (s) return reply({ ok: true, user: s.utente, utente: s.utente, ruolo: s.ruolo, setup: false });
  if (!env || !env.ADMIN_SECRET) {
    const setup = await needsSetup(env);
    return reply({ error: NO_SECRET, setup, secret: false }, 503);
  }
  if (await needsSetup(env)) {
    return reply({ error: 'nessuna password impostata: completa il primo accesso', setup: true }, 401);
  }
  return reply({ error: 'sessione assente o scaduta', setup: false }, 401);
}

/* ---- login -------------------------------------------------------------- */

export async function onRequestPost({ request, env }) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  const nome = typeof body.utente === 'string' ? body.utente.trim()
    : (typeof body.user === 'string' ? body.user.trim() : '');
  const password = typeof body.password === 'string' ? body.password : '';
  if (!env.ADMIN_SECRET) return reply({ error: NO_SECRET, secret: false }, 503);
  if (await needsSetup(env)) {
    return reply({ error: 'nessuna password impostata: completa il primo accesso', setup: true }, 409);
  }

  const row = await findUtente(env, nome);
  if (row) {
    const ok = await passwordOk(password, row.hash);
    if (!ok) {
      await sleep(FAIL_DELAY_MS);
      return reply({ error: BAD_LOGIN }, 401);
    }
    const value = await mintSession(row.utente, Number(row.sessioni) || 0, env.ADMIN_SECRET);
    return reply({ ok: true, user: row.utente, utente: row.utente, ruolo: normRuolo(row.ruolo) },
      200, { 'set-cookie': sessionCookie(value) });
  }

  /* Compatibilità: tabella vuota e password ancora nei segreti. */
  if (env.EDITOR_PASSWORD_HASH && (await countUtenti(env)) === 0) {
    const expected = env.EDITOR_USER || 'Piergiorgio';
    /* Si valutano sempre entrambi i fattori: la risposta non dice mai quale dei
       due è sbagliato, e il ritardo è lo stesso in ogni caso di fallimento. */
    const userOk = sameString(nome, expected);
    const passOk = await passwordOk(password, env.EDITOR_PASSWORD_HASH);
    if (!userOk || !passOk) {
      await sleep(FAIL_DELAY_MS);
      return reply({ error: BAD_LOGIN }, 401);
    }
    const value = await mintSession(expected, 0, env.ADMIN_SECRET);
    return reply({ ok: true, user: expected, utente: expected, ruolo: 'admin' },
      200, { 'set-cookie': sessionCookie(value) });
  }

  await burnPassword(password);
  await sleep(FAIL_DELAY_MS);
  return reply({ error: BAD_LOGIN }, 401);
}

export async function onRequestGet({ request, env }) {
  return meResponse(request, env);
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

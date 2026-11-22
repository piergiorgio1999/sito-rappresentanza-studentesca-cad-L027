/* /api/editor-auth — login dell'editor della mappa 3D (nome utente + password).
   POST /api/editor-auth         → {"user":"...","password":"..."} → cookie di sessione
   POST /api/editor-auth/logout  → svuota il cookie
   GET  /api/editor-auth/me      → {"ok":true,"user":"..."} se la sessione è valida, 401 altrimenti
   Variabili d'ambiente (dashboard Pages, MAI nel repository):
     EDITOR_USER           → nome utente ammesso (default "Piergiorgio" se non impostato)
     EDITOR_PASSWORD_HASH  → `pbkdf2$<iterazioni>$<sale_b64>$<hash_b64>`, almeno 100000 iterazioni.
                             Se manca, il login risponde 503: non esiste nessuna password
                             predefinita, nessun fallback e nessun bypass.
     ADMIN_SECRET          → chiave con cui si firma (HMAC-SHA256) il cookie di sessione
   Come generare l'hash: vedi site/campus-3d/MAPPA-3D-API.md. */
export const COOKIE = 'mappa3d_sess';
const MAX_AGE = 28800;              /* 8 ore */
const MIN_ITERATIONS = 100000;
const FAIL_DELAY_MS = 250;
const MAX_BODY = 4096;

const CORS = {
  'access-control-allow-origin': 'null',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
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
async function passwordOk(password, stored) {
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

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

/* Valore del cookie: <utente_b64>.<scadenza>.<firma> — nessun segreto al suo interno. */
async function mintSession(user, secret) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = bytesToB64(enc.encode(user)) + '.' + exp;
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

/* Sessione valida? Nessuna eccezione esce da qui: in caso di dubbio, no. */
export async function sessionUser(request, env) {
  if (!env || !env.ADMIN_SECRET) return '';
  const value = cookieValue(request, COOKIE);
  if (!value) return '';
  const bits = value.split('.');
  if (bits.length !== 3) return '';
  const payload = bits[0] + '.' + bits[1];
  try {
    const want = await hmac(env.ADMIN_SECRET, payload);
    if (!sameBytes(want, b64ToBytes(bits[2]))) return '';
    const exp = Number(bits[1]);
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return '';
    return new TextDecoder().decode(b64ToBytes(bits[0])).slice(0, 40);
  } catch (e) {
    return '';
  }
}
export async function hasSession(request, env) {
  return !!(await sessionUser(request, env));
}

const setCookie = (value, maxAge) =>
  `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_SECRET) return reply({ error: 'login non configurato' }, 503);
  if (!env.EDITOR_PASSWORD_HASH) return reply({ error: 'login non configurato' }, 503);
  const text = await request.text();
  if (enc.encode(text).length > MAX_BODY) return reply({ error: 'richiesta troppo grande' }, 400);
  let body;
  try { body = JSON.parse(text || 'null'); } catch (e) { body = null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'JSON non valido' }, 400);
  const user = typeof body.user === 'string' ? body.user.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const expectedUser = env.EDITOR_USER || 'Piergiorgio';
  /* Si valutano sempre entrambi i fattori: la risposta non dice mai quale dei due
     è sbagliato, e il ritardo è lo stesso in ogni caso di fallimento. */
  const userOk = sameString(user, expectedUser);
  const passOk = await passwordOk(password, env.EDITOR_PASSWORD_HASH);
  if (!userOk || !passOk) {
    await sleep(FAIL_DELAY_MS);
    return reply({ error: 'nome utente o password non validi' }, 401);
  }
  const value = await mintSession(expectedUser, env.ADMIN_SECRET);
  return reply({ ok: true, user: expectedUser }, 200, { 'set-cookie': setCookie(value, MAX_AGE) });
}

export async function onRequestGet({ request, env }) {
  const user = await sessionUser(request, env);
  if (!user) return reply({ error: 'sessione assente o scaduta' }, 401);
  return reply({ ok: true, user });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export const clearCookie = () => setCookie('', 0);

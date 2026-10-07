const ADMIN_EMAIL = 'pg.liverani@gmail.com';
const COOKIE = '__Host-orari-admin';
const SESSION_SECONDS = 8 * 60 * 60;
const enc = new TextEncoder();

function b64url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(value)));
}

async function sameSecret(a, b) {
  const [left, right] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(left, right);
}

export function json(data, status=200, headers={}) {
  return Response.json(data, {status, headers:{'cache-control':'no-store', 'x-content-type-options':'nosniff', ...headers}});
}

export function originIsSame(request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

export async function readJson(request, maxBytes=1_000_000) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('Richiesta troppo grande.');
  const raw = await request.text();
  if (enc.encode(raw).byteLength > maxBytes) throw new Error('Richiesta troppo grande.');
  try { return JSON.parse(raw); } catch { throw new Error('JSON non valido.'); }
}

function cookieValue(request) {
  return (request.headers.get('cookie') || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1) || '';
}

export async function sessionUser(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return null;
  const token = cookieValue(request);
  const [expires, signature, extra] = token.split('.');
  if (!expires || !signature || extra || !/^\d+$/.test(expires) || Number(expires) < Math.floor(Date.now()/1000)) return null;
  try {
    const expected = b64url(await hmac(env.ADMIN_SESSION_SECRET, `${ADMIN_EMAIL}|${expires}`));
    return await sameSecret(signature, expected) ? {email:ADMIN_EMAIL} : null;
  } catch { return null; }
}

export async function requireAdmin(request, env) {
  const user = await sessionUser(request, env);
  return user ? {user} : {response:json({error:'Accesso amministratore richiesto.'}, 401)};
}

export async function login(request, env) {
  if (!originIsSame(request)) return json({error:'Origine non valida.'}, 403);
  if (!env.DB || !env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) return json({error:'Accesso amministratore non configurato.'}, 503);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const ipHash = b64url(await hmac(env.ADMIN_SESSION_SECRET, `login|${ip}`));
  const now = Math.floor(Date.now()/1000), windowSeconds = 900;
  await env.DB.prepare('DELETE FROM admin_login_attempts WHERE window_started_at+?1<=?2').bind(windowSeconds,now).run();
  const attempts = await env.DB.prepare('SELECT attempts, window_started_at FROM admin_login_attempts WHERE ip_hash=?1').bind(ipHash).first();
  if (attempts && attempts.window_started_at + windowSeconds > now && attempts.attempts >= 5) return json({error:'Troppi tentativi. Riprova tra 15 minuti.'}, 429);
  let body;
  try { body = await readJson(request, 4096); } catch (error) { return json({error:error.message}, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({error:'Richiesta non valida.'},400);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const valid = await sameSecret(email, ADMIN_EMAIL) && await sameSecret(password, env.ADMIN_PASSWORD);
  if (!valid) {
    await env.DB.prepare(`INSERT INTO admin_login_attempts(ip_hash, attempts, window_started_at) VALUES(?1,1,?2)
      ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN window_started_at+?3<=?2 THEN 1 ELSE attempts+1 END,
      window_started_at=CASE WHEN window_started_at+?3<=?2 THEN ?2 ELSE window_started_at END`)
      .bind(ipHash, now, windowSeconds).run();
    return json({error:'Email o password non corretti.'}, 401);
  }
  await env.DB.prepare('DELETE FROM admin_login_attempts WHERE ip_hash=?1').bind(ipHash).run();
  const expires = String(now + SESSION_SECONDS);
  const signature = b64url(await hmac(env.ADMIN_SESSION_SECRET, `${ADMIN_EMAIL}|${expires}`));
  return json({user:{email:ADMIN_EMAIL}}, 200, { 'set-cookie':`${COOKIE}=${expires}.${signature}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; HttpOnly; SameSite=Strict` });
}

export function clearSession() {
  return json({ok:true}, 200, {'set-cookie':`${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`});
}

export function validScheduleEdits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 100) return false;
  for (const [group, edits] of Object.entries(value)) {
    if (!/^[1-3]-[1-4]$/.test(group) || !edits || typeof edits !== 'object' || Array.isArray(edits)) return false;
    for (const [index, patch] of Object.entries(edits)) {
      if (!/^\d{1,3}$/.test(index) || Number(index)>500 || !patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
      if (Object.keys(patch).some(key=>!['d','s','e','r','bld','p','del'].includes(key))) return false;
      if (patch.del === true) continue;
      if (!Number.isInteger(patch.d) || patch.d<0 || patch.d>4 || !Number.isFinite(patch.s) || !Number.isFinite(patch.e) || patch.s<8 || patch.e>20 || patch.e<=patch.s || patch.s*2%1 || patch.e*2%1) return false;
      for (const key of ['r','bld','p']) if (patch[key] !== undefined && (typeof patch[key] !== 'string' || patch[key].length>80)) return false;
    }
  }
  return true;
}

function validISODate(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value;
}

export function validExams(value) {
  if (!Array.isArray(value) || value.length>250) return false;
  return value.every(e => e && typeof e==='object' && !Array.isArray(e) && Object.keys(e).every(k=>['y','s','n','ch','f','prof','d'].includes(k)) && Number.isInteger(e.y) && e.y>=1 && e.y<=3 && Number.isInteger(e.s) && e.s>=1 && e.s<=2 &&
    typeof e.n==='string' && e.n.length>0 && e.n.length<=180 && typeof e.ch==='string' && e.ch.length<=16 &&
    typeof e.f==='string' && e.f.length<=40 && typeof e.prof==='string' && e.prof.length<=120 && Array.isArray(e.d) && e.d.length<=30 && e.d.every(validISODate));
}

export async function getContent(env) {
  const rows = await env.DB.prepare("SELECT key, value, updated_at FROM site_content WHERE key IN ('scheduleEdits','exams')").all();
  const content = {scheduleEdits:{}, exams:null, updatedAt:{}};
  for (const row of rows.results || []) {
    try { content[row.key] = JSON.parse(row.value); content.updatedAt[row.key] = row.updated_at; } catch {}
  }
  return content;
}

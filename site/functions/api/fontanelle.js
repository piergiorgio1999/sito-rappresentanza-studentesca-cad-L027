/* /api/fontanelle — fontanelle e voti di presenza sulla planimetria del campus
   GET  /api/fontanelle                      → {list:[{id,x,y,status}], votes:{k:{yes,no}}}: fontanelle confermate
   POST /api/fontanelle {k, vote: 1|-1, voter} → «c'è» / «non c'è» su una fontanella (k = id, oppure "p:x,y" per quelle
                                               della planimetria). Si conta un voto per browser (voter = codice casuale
                                               salvato nel browser), modificabile: chi è sulla stessa rete, es. Wi-Fi
                                               Sapienza, vota comunque per conto suo. Il controllo è volutamente
                                               leggero, per questo le soglie sono alte: al 5° «non c'è» parte una mail
                                               ai rappresentanti.
                                               Limite anti-abuso: 300 voti l'ora per indirizzo IP.
   GET  /api/fontanelle?confirm=ID&t=TOKEN   → conferma (link nella mail, solo admin)
   GET  /api/fontanelle?reject=ID&t=TOKEN    → scarta
   x, y sono coordinate della planimetria ufficiale (punti PDF, viewBox 28 205 524 570).
   Usa gli stessi binding di /api/avvisi: DB, AVVISI_MAIL, ADMIN_SECRET, MAIL_FROM. */
const SQL = `CREATE TABLE IF NOT EXISTS fontanelle (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT, status TEXT DEFAULT 'pending', x REAL, y REAL, note TEXT)`;
const SQLV = `CREATE TABLE IF NOT EXISTS fontanelle_voti (k TEXT, voter TEXT, vote INTEGER, created TEXT, PRIMARY KEY (k, voter))`;
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const MAIL_AT = 5, IP_PER_HOUR = 300;
async function sign(secret, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json([]);
  await env.DB.prepare(SQL).run();
  const u = new URL(request.url), id = u.searchParams.get('confirm') || u.searchParams.get('reject');
  if (id) {
    const ok = env.ADMIN_SECRET && u.searchParams.get('t') === await sign(env.ADMIN_SECRET, 'fo' + id);
    if (!ok) return new Response('Link non valido.', { status: 403 });
    const st = u.searchParams.get('confirm') ? 'confirmed' : 'rejected';
    await env.DB.prepare('UPDATE fontanelle SET status=? WHERE id=?').bind(st, +id).run();
    return new Response(`<meta charset="utf-8"><body style="font:16px system-ui;padding:30px">Fontanella #${+id}: <b>${st === 'confirmed' ? 'confermata, ora è sulla mappa per tutti' : 'scartata'}</b>.</body>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  await env.DB.prepare(SQLV).run();
  const votes = {};
  const v = await env.DB.prepare('SELECT k, SUM(vote=1) AS yes, SUM(vote=-1) AS no FROM fontanelle_voti GROUP BY k').all();
  for (const r of v.results) votes[r.k] = { yes: r.yes || 0, no: r.no || 0 };
  const { results: list } = await env.DB.prepare("SELECT id,x,y,status FROM fontanelle WHERE status = 'confirmed'").all();
  return json({ list, votes });
}
export async function onRequestPost({ request, env }) {
  let r; try { r = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  if (r && r.vote !== undefined) return vote(request, env, r);
  return json({ error: 'Metodo non consentito' }, 405);
}

async function mail(env, subject, text) {
  if (!(env.AVVISI_MAIL && env.MAIL_FROM)) return;
  const to = env.AVVISI_MAIL_TO || 'rappresentanzastudentesca26@gmail.com';
  const raw = [`From: Orari Chimica <${env.MAIL_FROM}>`, `To: ${to}`, `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    `Message-ID: <fv${Date.now()}@${env.MAIL_FROM.split('@')[1]}>`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', text].join('\r\n');
  try { const { EmailMessage } = await import('cloudflare:email'); await env.AVVISI_MAIL.send(new EmailMessage(env.MAIL_FROM, to, raw)); } catch (e) { console.log('mail', e); }
}
async function vote(request, env, r) {
  const k = String(r.k || ''), v = Number(r.vote);
  if (!/^(\d{1,9}|p:\d{2,3}(\.\d)?,\d{3}(\.\d)?)$/.test(k) || (v !== 1 && v !== -1)) return json({ error: 'voto non valido' }, 400);
  if (!env.DB) return json({ error: 'archivio non configurato' }, 503);
  await env.DB.prepare(SQLV).run();
  // un votante = un browser (codice casuale generato dal sito); in mancanza, l'indirizzo IP. Salvati solo come hash.
  const ip = request.headers.get('cf-connecting-ip') || 'x', secret = env.ADMIN_SECRET || 'fontanelle';
  const dev = /^[A-Za-z0-9-]{16,64}$/.test(String(r.voter || '')) ? String(r.voter) : '';
  const voter = await sign(secret, dev ? 'd' + dev : 'v' + ip), iph = await sign(secret, 'i' + ip);
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS fontanelle_ip (h TEXT, hour TEXT, n INTEGER, PRIMARY KEY (h, hour))').run();
  const hour = new Date().toISOString().slice(0, 13);
  const lim = await env.DB.prepare('INSERT INTO fontanelle_ip (h,hour,n) VALUES (?,?,1) ON CONFLICT(h,hour) DO UPDATE SET n=n+1 RETURNING n').bind(iph, hour).first();
  if (lim && lim.n > IP_PER_HOUR) return json({ error: 'troppi voti, riprova più tardi' }, 429);
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM fontanelle_ip WHERE hour < ?').bind(new Date(Date.now() - 864e5).toISOString().slice(0, 13)).run();
  await env.DB.prepare('INSERT INTO fontanelle_voti (k,voter,vote,created) VALUES (?,?,?,?) ON CONFLICT(k,voter) DO UPDATE SET vote=excluded.vote, created=excluded.created')
    .bind(k, voter, v, new Date().toISOString()).run();
  const c = await env.DB.prepare('SELECT SUM(vote=1) AS yes, SUM(vote=-1) AS no FROM fontanelle_voti WHERE k=?').bind(k).first();
  const yes = c.yes || 0, no = c.no || 0;
  if (v === -1 && no === MAIL_AT) {
    let where = k;
    if (/^\d+$/.test(k)) { await env.DB.prepare(SQL).run(); const f = await env.DB.prepare('SELECT x,y,status,note FROM fontanelle WHERE id=?').bind(+k).first(); if (f) where = `segnalazione #${k} (${f.status}) · x ${f.x.toFixed(1)}, y ${f.y.toFixed(1)}${f.note ? ' · ' + f.note : ''}`; }
    else where = `fontanella della planimetria · ${k.slice(2).replace(',', ', y ').replace(/^/, 'x ')}`;
    const t = /^\d+$/.test(k) && env.ADMIN_SECRET ? await sign(env.ADMIN_SECRET, 'fo' + k) : '';
    const base = new URL(request.url).origin + '/api/fontanelle';
    await mail(env, '[Mappa] Fontanella forse inesistente', [`${MAIL_AT} persone dicono che questa fontanella NON c'è (${yes} dicono che c'è).`, '', where, `Mappa: ${new URL(request.url).origin}/#mappa`,
      t ? `\r\n❌ TOGLILA dalla mappa: ${base}?reject=${k}&t=${t}\r\n✅ CONFERMALA: ${base}?confirm=${k}&t=${t}` : ''].join('\r\n'));
  }
  return json({ ok: true, yes, no });
}

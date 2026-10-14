/* /api/fontanelle — fontanelle segnalate dagli studenti sulla planimetria del campus
   GET  /api/fontanelle                      → fontanelle confermate (visibili a tutti)
   POST /api/fontanelle {x, y, note}         → nuova segnalazione: salvata in D1 + email ai rappresentanti
   GET  /api/fontanelle?confirm=ID&t=TOKEN   → conferma (link nella mail, solo admin)
   GET  /api/fontanelle?reject=ID&t=TOKEN    → scarta
   x, y sono coordinate della planimetria ufficiale (punti PDF, viewBox 28 205 524 570).
   Usa gli stessi binding di /api/avvisi: DB, AVVISI_MAIL, ADMIN_SECRET, MAIL_FROM. */
const SQL = `CREATE TABLE IF NOT EXISTS fontanelle (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT, status TEXT DEFAULT 'pending', x REAL, y REAL, note TEXT)`;
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const AREA = { x0: 28, y0: 205, x1: 552, y1: 775 };
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
  const { results } = await env.DB.prepare("SELECT id,x,y FROM fontanelle WHERE status='confirmed'").all();
  return json(results);
}
export async function onRequestPost({ request, env }) {
  let r; try { r = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const x = Number(r.x), y = Number(r.y), note = String(r.note ?? '').slice(0, 300);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < AREA.x0 || x > AREA.x1 || y < AREA.y0 || y > AREA.y1) return json({ error: 'posizione non valida' }, 400);
  if (!env.DB) return json({ error: 'archivio non configurato' }, 503);
  await env.DB.prepare(SQL).run();
  const res = await env.DB.prepare('INSERT INTO fontanelle (created,x,y,note) VALUES (?,?,?,?)').bind(new Date().toISOString(), x, y, note).run();
  const id = res.meta.last_row_id, base = new URL(request.url).origin + '/api/fontanelle';
  if (env.AVVISI_MAIL && env.MAIL_FROM && env.ADMIN_SECRET) {
    const t = await sign(env.ADMIN_SECRET, 'fo' + id);
    const map = new URL(request.url).origin + `/#mappa`;
    const text = [`Nuova fontanella segnalata (#${id})`, '', `Posizione sulla planimetria: x ${x.toFixed(1)}, y ${y.toFixed(1)}`, note ? `Nota: ${note}` : '', `Mappa: ${map}`, '',
      `✅ CONFERMA (la mostra a tutti): ${base}?confirm=${id}&t=${t}`, `❌ SCARTA: ${base}?reject=${id}&t=${t}`].filter((s) => s !== '').join('\r\n');
    const raw = [`From: Orari Chimica <${env.MAIL_FROM}>`, `To: ${env.AVVISI_MAIL_TO || 'rappresentanzastudentesca26@gmail.com'}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent('[Mappa] Fontanella segnalata #' + id)))}?=`, `Message-ID: <fo${id}.${Date.now()}@${env.MAIL_FROM.split('@')[1]}>`,
      `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', text].join('\r\n');
    try { const { EmailMessage } = await import('cloudflare:email'); await env.AVVISI_MAIL.send(new EmailMessage(env.MAIL_FROM, env.AVVISI_MAIL_TO || 'rappresentanzastudentesca26@gmail.com', raw)); } catch (e) { console.log('mail', e); }
  }
  return json({ ok: true, id });
}

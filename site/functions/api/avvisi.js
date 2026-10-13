/* /api/avvisi — segnalazioni di modifiche/assenze sulle lezioni
   GET  /api/avvisi                      → avvisi confermati (pubblici, valgono per tutti gli orari)
   POST /api/avvisi                      → nuova segnalazione: salvata in D1 + email ai rappresentanti
   GET  /api/avvisi?confirm=ID&t=TOKEN   → conferma (link nella mail, solo admin: token firmato con ADMIN_SECRET)
   GET  /api/avvisi?reject=ID&t=TOKEN    → scarta
   Binding richiesti (wrangler.toml / dashboard Pages):
     DB            → database D1 (tabella creata in automatico)
     AVVISI_MAIL   → [[send_email]] verso la casella della rappresentanza (Email Routing attivo sul dominio)
     ADMIN_SECRET  → variabile segreta (stringa lunga a caso)
     MAIL_FROM     → mittente su un dominio con Email Routing, es. avvisi@tuodominio.it */
const SQL = `CREATE TABLE IF NOT EXISTS avvisi (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT, status TEXT DEFAULT 'pending',
  type TEXT, key TEXT, course TEXT, year INTEGER, ch TEXT, date TEXT, slot TEXT, room TEXT, prof TEXT, nuovo TEXT, note TEXT, email TEXT)`;
const TYPES = {modifica:'Segnalazione di modifica', annuncio:'Variazione annunciata dal docente', assenza:'Docente assente senza preavviso'};
const json = (d, s=200) => new Response(JSON.stringify(d), {status:s, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clip = (v, n) => String(v ?? '').slice(0, n);
async function sign(secret, msg){
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0, 32);
}
export async function onRequestGet({request, env}){
  await env.DB.prepare(SQL).run();
  const u = new URL(request.url), id = u.searchParams.get('confirm') || u.searchParams.get('reject');
  if(id){
    const ok = env.ADMIN_SECRET && u.searchParams.get('t') === await sign(env.ADMIN_SECRET, 'av'+id);
    if(!ok) return new Response('Link non valido.', {status:403});
    const st = u.searchParams.get('confirm') ? 'confirmed' : 'rejected';
    await env.DB.prepare('UPDATE avvisi SET status=? WHERE id=?').bind(st, +id).run();
    return new Response(`<meta charset="utf-8"><body style="font:16px system-ui;padding:30px">Segnalazione #${+id}: <b>${st==='confirmed'?'confermata – ora è visibile in tutti gli orari':'scartata'}</b>.</body>`, {headers:{'content-type':'text/html; charset=utf-8'}});
  }
  const today = new Date(Date.now() - 864e5).toISOString().slice(0,10);
  const {results} = await env.DB.prepare("SELECT id,type,key,course,year,ch,date,slot,nuovo,note FROM avvisi WHERE status='confirmed' AND date>=? ORDER BY date").bind(today).all();
  return json(results);
}
export async function onRequestPost({request, env}){
  let r; try{ r = await request.json(); }catch(e){ return json({error:'bad json'}, 400); }
  if(!TYPES[r.type] || !/^\d{4}-\d\d-\d\d$/.test(r.date||'') || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email||'')) return json({error:'dati non validi'}, 400);
  await env.DB.prepare(SQL).run();
  const v = [new Date().toISOString(), r.type, clip(r.key,120), clip(r.course,160), +r.year||0, clip(r.ch,12), r.date, clip(r.slot,60), clip(r.room,120), clip(r.prof,120), clip(r.nuovo,120), clip(r.note,800), clip(r.email,160)];
  const res = await env.DB.prepare('INSERT INTO avvisi (created,type,key,course,year,ch,date,slot,room,prof,nuovo,note,email) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...v).run();
  const id = res.meta.last_row_id, base = new URL(request.url).origin + '/api/avvisi';
  if(env.AVVISI_MAIL && env.MAIL_FROM && env.ADMIN_SECRET){
    const t = await sign(env.ADMIN_SECRET, 'av'+id);
    const text = [`${TYPES[r.type]} (#${id})`, '', `Corso: ${v[3]} – anno ${v[4]}, canale ${v[5]}`, `Lezione: ${v[7]}${v[8]?', '+v[8]:''}`, v[9]?`Docente: ${v[9]}`:'',
      `Giorno: ${r.date}`, v[10]?`Nuovo orario/aula: ${v[10]}`:'', v[11]?`Dettagli: ${v[11]}`:'', `Segnalato da: ${v[12]}`, '',
      'Verifica con la segreteria didattica o con il docente, poi:', `✅ CONFERMA (pubblica a tutti): ${base}?confirm=${id}&t=${t}`, `❌ SCARTA: ${base}?reject=${id}&t=${t}`].filter(s=>s!=='').join('\r\n');
    const raw = [`From: Orari Chimica <${env.MAIL_FROM}>`, `To: ${env.AVVISI_MAIL_TO||'rappresentanzastudentesca26@gmail.com'}`, `Reply-To: ${v[12]}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent('[Orari] '+TYPES[r.type]+' – '+v[3])))}?=`, `Message-ID: <av${id}.${Date.now()}@${env.MAIL_FROM.split('@')[1]}>`,
      `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', text].join('\r\n');
    try{ const {EmailMessage} = await import('cloudflare:email');
      await env.AVVISI_MAIL.send(new EmailMessage(env.MAIL_FROM, env.AVVISI_MAIL_TO||'rappresentanzastudentesca26@gmail.com', raw)); }catch(e){ console.log('mail', e); }
  }
  return json({ok:true, id});
}

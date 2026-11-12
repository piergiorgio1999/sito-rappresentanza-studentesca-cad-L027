/* /api/aule — occupazione delle aule degli edifici di Chimica, dal sistema pubblico GOMP di Sapienza
   GET /api/aule
   Legge la pagina pubblica «orario aule» (gomp.uniroma1.it) e, per ogni aula di CU014, CU032 e CU035,
   la programmazione delle prossime settimane: insegnamento, corso di laurea e docente.
   Risposta in cache all'edge per 30 minuti. Lo stesso codice genera la copia statica
   site/aule-data.json (node tools/aule-snapshot.mjs), usata quando questa funzione non risponde.
   Metodo (pagina + JsonData.aspx) ripreso dall'idea di sapienzastudents.net; codice scritto da zero. */
const BASE = 'https://gomp.uniroma1.it/PublicFunctions/GestioneAule';
const PAGE = `${BASE}/SchedaOrarioProgrammazione.aspx`;
const JSON_URL = `${BASE}/JsonData/JsonData.aspx`;
const UA = 'Mozilla/5.0 (compatible; orari-chimica.pages.dev; orario aule)';
const TTL = 60 * 30;
const WEEKS = 4;
const VERSION = 'v1';
/* edifici mostrati, nell'ordine della pagina */
const BUILDINGS = {
  CU014: 'Chimica «Stanislao Cannizzaro»',
  CU032: 'Chimica «Vincenzo Caglioti»',
  CU035: 'Ex Officine Ortopediche (aule di Giurisprudenza e Scienze statistiche)'
};

const unescapeHtml = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const clean = (s) => unescapeHtml(String(s || '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/* lunedì della settimana corrente a Roma (sabato e domenica compresi: la settimana resta quella in corso) */
function weekStart(now) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

/* elenco aule dal menù a tendina della pagina: «… CU014-E01P01L016 Aula A» */
function parseRooms(page) {
  const select = /<select[^>]*id="AulaSelector"[\s\S]*?<\/select>/.exec(page);
  if (!select) throw new Error('GOMP: elenco aule non trovato');
  const rooms = [];
  const re = /<option[^>]*value="([0-9a-f-]{36})"[^>]*>([\s\S]*?)<\/option>/gi;
  let m;
  while ((m = re.exec(select[0]))) {
    const label = clean(m[2]);
    const hit = /\b(CU\d{3})-(\S+)\s+(.*)$/.exec(label);
    if (!hit || !BUILDINGS[hit[1]]) continue;
    let name = hit[3].trim();
    if (/^aula\b/i.test(name)) name = 'Aula' + name.slice(4);
    rooms.push({ id: m[1], bld: hit[1], loc: hit[2], name, lab: /^lab/i.test(name) });
  }
  return rooms;
}

/* « 10628923 CHIMICA GENERALE … - Scienze Chimiche L-27 R \r\nDocente: DONZELLO MARIA PIA» */
function parseTitle(raw, kind) {
  const [head, ...rest] = String(raw || '').split(/\r?\n/);
  const teacher = clean((/Docente:\s*(.*)/i.exec(rest.join(' ')) || [])[1]);
  const m = /^\s*(\S+)\s+(.*)\s+-\s+(.*?)\s*$/.exec(head);
  if (!m) return { c: '', n: clean(head).replace(/^\((.*)\)$/, '$1') || 'Aula occupata', g: '', t: teacher, k: clean(kind) };
  return { c: m[1], n: clean(m[2]), g: clean(m[3]), t: teacher, k: clean(kind) };
}

/* «09/28/2026 14:00» → ['2026-09-28', '14:00'] */
function parseWhen(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2})$/.exec(String(s || '').trim());
  return m ? [`${m[3]}-${m[1]}-${m[2]}`, m[4]] : null;
}

function cookieHeader(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  return list.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
}

export async function buildAule(fetchImpl = fetch, now = new Date()) {
  const first = await fetchImpl(PAGE, { headers: { 'user-agent': UA, 'accept-language': 'it-IT,it;q=0.9' } });
  if (!first.ok) throw new Error(`GOMP: pagina aule ${first.status}`);
  const page = await first.text();
  const cache = (/SchedulerCache=([0-9a-f-]{36})/i.exec(page) || [])[1];
  if (!cache) throw new Error('GOMP: SchedulerCache non trovata');
  const cookie = cookieHeader(first);
  const rooms = parseRooms(page);
  if (!rooms.length) throw new Error('GOMP: nessuna aula degli edifici di Chimica');

  const start = weekStart(now);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + WEEKS * 7 - 1);
  const from = iso(start), to = iso(end);
  const sat = new Date(start); sat.setUTCDate(sat.getUTCDate() + 5);
  const body = `showdate=${sat.getUTCMonth() + 1}/${sat.getUTCDate()}/${sat.getUTCFullYear()}&viewtype=week&timezone=2`;

  const lessons = [], index = new Map();
  const lessonId = (l) => {
    const key = [l.c, l.n, l.g, l.t, l.k].join('|');
    if (!index.has(key)) { index.set(key, lessons.length); lessons.push(l); }
    return index.get(key);
  };

  let failed = 0;
  await Promise.all(rooms.map(async (room) => {
    room.ev = [];
    try {
      const url = `${JSON_URL}?method=list&item=${room.id}&cache=${cache}&annoCorso=&canale=&ShowAllUnaTantum=false`;
      const res = await fetchImpl(url, { method: 'POST', body, headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest', accept: 'application/json', referer: PAGE, ...(cookie ? { cookie } : {}) } });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const seen = new Set();
      for (const e of data.events || []) {
        const a = parseWhen(e[2]), b = parseWhen(e[3]);
        if (!a || !b || a[0] < from || a[0] > to) continue;
        const row = [lessonId(parseTitle(e[1], e[12])), a[0], a[1], b[1]];
        const key = row.join('|');
        if (!seen.has(key)) { seen.add(key); room.ev.push(row); }
      }
      room.ev.sort((x, y) => (x[1] + x[2]).localeCompare(y[1] + y[2]));
    } catch (_) { room.err = true; failed++; }
  }));
  if (failed === rooms.length) throw new Error('GOMP: nessuna aula ha risposto');

  return {
    v: 1, gen: now.toISOString(), from, to, src: 'https://gomp.uniroma1.it/PublicFunctions/GestioneAule/SchedaOrarioProgrammazione.aspx',
    lessons,
    buildings: Object.keys(BUILDINGS).map((code) => ({
      code, name: BUILDINGS[code],
      rooms: rooms.filter((r) => r.bld === code).map(({ name, loc, lab, ev, err }) => ({ name, loc, lab, ev, ...(err ? { err: true } : {}) }))
        .sort((a, b) => (a.lab - b.lab) || a.name.localeCompare(b.name, 'it', { numeric: true }))
    }))
  };
}

export async function onRequestGet({ request, waitUntil }) {
  const key = new Request(`${new URL(request.url).origin}/api/aule?${VERSION}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  let data;
  try { data = await buildAule(); }
  catch (err) {
    return new Response(JSON.stringify({ error: 'GOMP non raggiungibile', detail: String(err && err.message || err) }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const response = new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${TTL}` } });
  waitUntil(cache.put(key, response.clone()));
  return response;
}

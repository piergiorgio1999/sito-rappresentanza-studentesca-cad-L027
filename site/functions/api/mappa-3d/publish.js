/* POST /api/mappa-3d/publish — scrive l'ultima versione salvata nel file
   `site/campus-3d/overrides.json` del repository, con un commit via API REST GitHub.
   Autenticazione: Bearer <ADMIN_SECRET> oppure cookie di sessione dell'editor.

   Il token GitHub si legge SOLO da env.GITHUB_TOKEN (segreto Cloudflare):
   non viene mai restituito, né registrato, né rimandato dentro un errore, e il
   front-end non lo vede mai. Se manca, 503 e basta.

   Percorso, repository e branch sono COSTANTI qui dentro: nessun parametro della
   richiesta può cambiarli, così il token non può servire a scrivere altrove. */
import { json, CORS, MAX_BYTES, canWrite, readLatest, editorName } from '../mappa-3d.js';

const OWNER = 'piergiorgio1999';
const REPO = 'sito-rappresentanza-studentesca-cad-L027';
const PATH = 'site/campus-3d/overrides.json';
const BRANCH = 'main';
const UA = 'mappa-3d-publish';

const api = (p) => `https://api.github.com/repos/${OWNER}/${REPO}/${p}`;
const ghHeaders = (token) => ({
  authorization: `Bearer ${token}`,
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': UA
});

/* Messaggio d'errore di GitHub ripulito: se per qualsiasi ragione contenesse il
   token, non esce comunque. */
function safeMessage(text, token) {
  let s = String(text || '').slice(0, 200);
  if (token && s.includes(token)) s = s.split(token).join('[omesso]');
  return s;
}
async function ghMessage(res, token) {
  try {
    const d = await res.json();
    return safeMessage(d && d.message, token);
  } catch (e) {
    return '';
  }
}

function b64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'database non configurato' }, 500);
  if (!env.ADMIN_SECRET) return json({ error: 'scrittura non configurata' }, 503);
  if (!(await canWrite(request, env))) return json({ error: 'autenticazione non valida' }, 401, { 'www-authenticate': 'Bearer' });
  if (!env.GITHUB_TOKEN) return json({ error: 'GITHUB_TOKEN non configurato' }, 503);
  /* Il corpo non serve a nulla (si pubblica sempre l'ultima versione salvata), ma
     se c'è deve stare nei 64 KB come negli altri endpoint. */
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BYTES) {
    return json({ error: `corpo troppo grande: massimo ${MAX_BYTES} byte` }, 400);
  }

  const token = env.GITHUB_TOKEN;
  const author = editorName(request);
  let latest;
  try {
    latest = await readLatest(env);
  } catch (e) {
    return json({ error: 'lettura dei parametri non riuscita' }, 500);
  }
  const contents = JSON.stringify({ overrides: latest.overrides, updated_at: latest.updated_at }, null, 2) + '\n';

  /* 1) sha attuale del file (404 = file non ancora presente: si crea) */
  let sha;
  try {
    const head = await fetch(api(`contents/${PATH}?ref=${BRANCH}`), { headers: ghHeaders(token) });
    if (head.ok) {
      const d = await head.json();
      sha = d && d.sha;
    } else if (head.status !== 404) {
      return json({ error: 'GitHub ha rifiutato la lettura del file', github_status: head.status, github: await ghMessage(head, token) }, 502);
    }
  } catch (e) {
    return json({ error: 'GitHub non raggiungibile' }, 502);
  }

  /* 2) commit del solo file di override */
  const when = new Date((latest.updated_at || Math.floor(Date.now() / 1000)) * 1000)
    .toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
  const body = {
    message: `Mappa 3D: pubblica i parametri del ${when} (autore: ${author})`,
    content: b64(contents),
    branch: BRANCH
  };
  if (sha) body.sha = sha;
  try {
    const res = await fetch(api(`contents/${PATH}`), {
      method: 'PUT',
      headers: Object.assign({ 'content-type': 'application/json' }, ghHeaders(token)),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      return json({ error: 'commit non riuscito', github_status: res.status, github: await ghMessage(res, token) }, 502);
    }
    const d = await res.json();
    const commit = (d && d.commit) || {};
    return json({
      ok: true,
      path: PATH,
      branch: BRANCH,
      bytes: new TextEncoder().encode(contents).length,
      updated_at: latest.updated_at,
      author,
      commit_sha: commit.sha || '',
      commit_url: commit.html_url || ''
    });
  } catch (e) {
    return json({ error: 'commit non riuscito' }, 502);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
const notAllowed = ({ request }) => json({ error: `metodo ${request.method} non ammesso` }, 405, { allow: 'POST, OPTIONS' });
export const onRequestGet = notAllowed;
export const onRequestPut = notAllowed;
export const onRequestPatch = notAllowed;
export const onRequestDelete = notAllowed;

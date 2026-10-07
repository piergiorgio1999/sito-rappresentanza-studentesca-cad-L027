import { clearSession, getContent, json, login, originIsSame, readJson, requireAdmin, sessionUser, validExams, validScheduleEdits } from '../../_lib.js';

const OWNER = 'piergiorgio1999';
const REPO = 'sito-rappresentanza-studentesca-cad-L027';
const COMMENT_PREFIX = '[Commento sito]';

async function github(request, env, path, options={}) {
  if (!env.GITHUB_ISSUES_TOKEN) return json({error:'Collegamento GitHub non configurato.'}, 503);
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers:{accept:'application/vnd.github+json', authorization:`Bearer ${env.GITHUB_ISSUES_TOKEN}`, 'x-github-api-version':'2022-11-28', ...(options.body?{'content-type':'application/json'}:{}), ...options.headers}
  });
  if (!response.ok) return json({error:response.status===403?'GitHub ha rifiutato l’operazione.':'Non riesco a leggere o salvare i commenti.'}, response.status===403?403:502);
  return response;
}

async function listComments(request, env) {
  const all=[];
  for(let page=1;page<=10;page++){
    const response=await github(request,env,`/repos/${OWNER}/${REPO}/issues?state=all&per_page=100&page=${page}`);
    if(response.status>=400) return response;
    const rows=await response.json();
    all.push(...rows.filter(x=>!x.pull_request && x.title.startsWith(COMMENT_PREFIX)).map(x=>({id:x.number,title:x.title,url:x.html_url,body:x.body,createdAt:x.created_at,state:x.state})));
    if(rows.length<100) break;
  }
  return json({comments:all});
}

async function createComment(request, env) {
  if (!originIsSame(request)) return json({error:'Origine non valida.'}, 403);
  let body;
  try { body=await readJson(request, 12000); } catch(error) { return json({error:error.message},400); }
  if(!body || typeof body!=='object' || Array.isArray(body)) return json({error:'Richiesta non valida.'},400);
  const route=typeof body.route==='string' && body.route.startsWith('/') && body.route.length<=300 ? body.route : '';
  const selector=typeof body.selector==='string' && body.selector.length<=700 ? body.selector : '';
  const selected=typeof body.selectedText==='string' ? body.selectedText.trim().slice(0,500) : '';
  const comment=typeof body.comment==='string' ? body.comment.trim() : '';
  if(!route || !selector || !comment || comment.length>3000) return json({error:'Commento o posizione non validi.'},400);
  const title=`${COMMENT_PREFIX} ${route} · ${selected.replace(/[\r\n]+/g,' ').slice(0,70) || selector.slice(0,70)}`.slice(0,240);
  const record={route,selector,selectedText:selected,comment};
  const response=await github(request,env,`/repos/${OWNER}/${REPO}/issues`,{
    method:'POST', body:JSON.stringify({title,body:`Posizione e commento inviati dall’area amministratore del sito.\n\n\`\`\`json\n${JSON.stringify(record,null,2)}\n\`\`\``})
  });
  if(response.status>=400) return response;
  const issue=await response.json();
  return json({id:issue.number,url:issue.html_url},201);
}

async function saveContent(request, env) {
  if (!originIsSame(request)) return json({error:'Origine non valida.'}, 403);
  let body;
  try { body=await readJson(request, 1_000_000); } catch(error) { return json({error:error.message},400); }
  if(!body || typeof body!=='object' || Array.isArray(body)) return json({error:'Richiesta non valida.'},400);
  const allowed=new Set(['scheduleEdits','exams']);
  if(!allowed.has(body.key)) return json({error:'Sezione dati sconosciuta.'},400);
  if(body.key==='scheduleEdits' && !validScheduleEdits(body.value)) return json({error:'Modifiche orario non valide.'},400);
  if(body.key==='exams' && !validExams(body.value)) return json({error:'Dati esami non validi.'},400);
  try {
    await env.DB.prepare(`INSERT INTO site_content(key,value,updated_at) VALUES(?1,?2,?3)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
      .bind(body.key,JSON.stringify(body.value),new Date().toISOString()).run();
    return json(await getContent(env));
  } catch { return json({error:'Non riesco a salvare i dati condivisi.'},503); }
}

export async function onRequest({request,env,params}) {
  const route=(Array.isArray(params.path)?params.path.join('/'):params.path||'').replace(/^\/+|\/+$/g,'');
  if(route==='login' && request.method==='POST') return login(request,env);
  if(route==='me' && request.method==='GET') return json({user:await sessionUser(request,env)});
  if(route==='logout' && request.method==='POST') {
    if(!originIsSame(request)) return json({error:'Origine non valida.'},403);
    return clearSession();
  }
  const auth=await requireAdmin(request,env);
  if(auth.response) return auth.response;
  if(route==='comments' && request.method==='GET') return listComments(request,env);
  if(route==='comments' && request.method==='POST') return createComment(request,env);
  if(route==='content' && request.method==='PUT') return saveContent(request,env);
  return json({error:'Risorsa non trovata.'},404);
}

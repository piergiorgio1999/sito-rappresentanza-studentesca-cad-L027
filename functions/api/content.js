import { getContent, json } from '../_lib.js';

export async function onRequestGet({env}) {
  if (!env.DB) return json({error:'Archivio condiviso non configurato.'}, 503);
  try { return json(await getContent(env)); }
  catch { return json({error:'Non riesco a leggere i dati condivisi.'}, 503); }
}

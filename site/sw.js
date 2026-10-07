/* Versione della cache: cambiala a ogni aggiornamento dell'orario */
const CACHE = 'orari-chimica-v55';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-cad.svg', './push-client.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* Pagina: prima la rete (così gli aggiornamenti arrivano), poi la copia salvata se sei offline.
   Icone e manifest: prima la copia salvata. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (new URL(req.url).pathname.startsWith('/api/')) return;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});

self.addEventListener('push',e=>{
 let data={};try{data=e.data.json()}catch{}
 e.waitUntil(self.registration.showNotification(data.title||'Aggiornamento Chimica',{body:data.body||'Consulta le notizie.',icon:'/icon-192.png',badge:'/icon-192.png',tag:data.tag||'chimica',data:{url:'/#news'}}));
});
self.addEventListener('notificationclick',e=>{
 e.notification.close();const url=new URL('/#news',self.location.origin).href;
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  for(const client of clients){if(new URL(client.url).origin===self.location.origin){await client.navigate(url);return client.focus()}}
  return self.clients.openWindow(url);
 }));
});

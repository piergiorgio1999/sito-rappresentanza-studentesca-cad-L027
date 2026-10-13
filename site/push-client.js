(()=>{
const start=async()=>{
 const host=document.getElementById('pushControls');if(!host)return;
 host.innerHTML='<p>Ricevi le notifiche dei cambi di orario e degli esami.</p><button type="button" id="pushToggle">Attiva notifiche</button><p id="pushStatus" role="status" style="font-size:.9em"></p>';
 const button=host.querySelector('button'),status=host.querySelector('[role=status]');
 if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)){
 button.hidden=true;status.textContent='Questo browser non supporta le notifiche. Su iPhone/iPad aggiungi il sito alla schermata Home e aprilo da lì.';return;
 }
 let registration,key,subscription;
 const sync=()=>{button.textContent=subscription?'Disattiva notifiche':'Attiva notifiche';status.textContent=subscription?'Notifiche attive su questo dispositivo.':Notification.permission==='denied'?'Notifiche bloccate: puoi abilitarle nelle impostazioni del browser.':'';button.disabled=Notification.permission==='denied'&&!subscription};
 const send=async(method,s)=>{const r=await fetch('/api/push/subscription',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(s.toJSON())});if(!r.ok){let e=await r.json().catch(()=>({}));throw Error(e.error||'Impossibile aggiornare le notifiche.')}return r};
 try{
 const config=await fetch('/api/push/config',{cache:'no-store'}).then(r=>r.json());if(!config.enabled)throw Error('Le notifiche saranno disponibili a breve.');
 key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 registration=await navigator.serviceWorker.ready;subscription=await registration.pushManager.getSubscription();sync();
 }catch(e){button.disabled=true;status.textContent=e.message;return}
 button.onclick=async()=>{
 button.disabled=true;
 try{
 if(subscription){await send('DELETE',subscription);await subscription.unsubscribe();subscription=null;sync();return}
 const permission=await Notification.requestPermission();if(permission!=='granted'){sync();return}
 subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 try{await send('POST',subscription)}catch(e){await subscription.unsubscribe();subscription=null;throw e}
 sync();
 }catch(e){status.textContent=e.message}finally{button.disabled=Notification.permission==='denied'&&!subscription}
 };
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

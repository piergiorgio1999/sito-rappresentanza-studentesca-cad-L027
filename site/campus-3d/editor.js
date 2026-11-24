(() => {
  'use strict';
  // Editor sul posto della scena 3D.
  // · Commenta: tocchi un punto e scrivi; il commento si salva con le coordinate (collezione "segnalazioni"), con le foto
  //   allegate (asset dell'artifact, ridotte a 2048 px in JPEG; nel commento restano gli id in "foto").
  // · Modifica: ogni solido ha una scatola di ridimensionamento a parallelepipedo, con una maniglia su ognuna delle sei
  //   facce, sugli angoli e una (rossa, in alto) per spostarlo. Gli oggetti descritti nei JSON (terrazza, panchine, scale,
  //   cortile…) cambiano i loro dati; ogni altro pezzo ("primitiva": una barra, un tubo, un edificio…) viene deformato
  //   con una trasformazione. Gli alberi si spostano, si eliminano e si aggiungono; "＋ Aggiungi" crea primitive
  //   (parallelepipedo, cilindro, sfera) con il materiale scelto, marciapiedi, aiuole e una copia di qualsiasi oggetto
  //   già costruito nel modello (catalogo di campus-3d.js). La ✕ della scheda la nasconde senza deselezionare.
  //   Gli edifici non si deformano: si cambia la texture
  //   della facciata e si tolgono o aggiungono finestre cella per cella.
  //   Tutto finisce nella collezione "modifiche" del db dell'artifact, che Claude riporta nei file.
  const SNAP = 0.05, MIN = 0.05, HANDLE_PX = 28;
  const runtimeOnly = new URL(document.currentScript?.src || location.href, location.href).searchParams.has('runtime');
  const LOCAL_EDITS_KEY = 'campus-sapienza-3d-edits-v1';
  const ORARI_ORIGIN = 'https://orari-chimica.pages.dev';
  const ORARI_BRIDGE = ORARI_ORIGIN + '/campus-3d/editor-bridge.html';
  const ROOTS = ['chimica-esterni', 'cortile-modello', 'alberi', 'edifici', 'minerva', 'planimetria'];
  const KEYS = ['u0', 'u1', 'v0', 'v1', 'h0', 'h1'];
  const round = (x) => Math.round(x * 100) / 100;
  const snap = (x) => Math.round(x / SNAP) * SNAP;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let T = null, C = null, scene = null, camera = null, controls = null, canvas = null;
  let db = null, assets = null, myId = null, saving = false;
  let mode = null; // 'commenta' | 'modifica' | null
  const base = { esterni: null, cortile: null, alberi: null, facciate: {} };
  const FORME = { oggetto: 'Oggetto del modello', box: 'Parallelepipedo', cilindro: 'Cilindro', sfera: 'Sfera', marciapiede: 'Marciapiede', aiuola: 'Aiuola', albero: 'Albero', pino: 'Pino' };
  const TIPI_AIUOLA = { squadrata: 'squadrata', rotonda: 'rotonda', spezzata: 'con angoli spezzati' };
  const TERRENI = { prato: 'prato', foglie: 'terra con foglie', terra: 'terra senza foglie' };
  const TEXTURE = { cortina: 'mattoni rossi', giallo: 'mattoni gialli', travertino: 'travertino', ocra: 'intonaco ocra', arancione: 'intonaco arancione', intonaco: 'intonaco chiaro' };
  const facadeState = new Map(); // codice edificio → { facciata, finestre: [riquadri] }
  let placing = null, removed = null, patchGroup = null;
  let overrides = [];
  let bridgeWindow = null, bridgeReady = false, bridgeRequest = '', applyPending = false;
  let comments = [];
  let sel = null, drag = null, down = null, sliding = false, slideTimer = 0;
  const ui = {};
  let fx = null, pins = null, guides = null;

  /* ---------- interfaccia ---------- */
  function css() {
    const st = document.createElement('style');
    st.textContent = `
    .ed-bar{position:absolute;z-index:20;right:12px;bottom:12px;display:flex;gap:8px;align-items:center;font:600 13px/1.2 Arial,Helvetica,sans-serif}
    .ed-btn{min-height:44px;padding:0 14px;border-radius:10px;border:1px solid #d9d0cc;background:#fffffff2;color:#3b3431;box-shadow:0 4px 14px #32201b22;font:inherit;cursor:pointer}
    .ed-btn[aria-pressed="true"]{background:#822433;border-color:#822433;color:#fff}
    .ed-btn:focus-visible{outline:3px solid #822433;outline-offset:2px}
    .ed-hint{position:absolute;z-index:20;left:12px;right:12px;top:12px;margin:auto;max-width:520px;padding:10px 12px;border-radius:10px;background:#211d1dE6;color:#fff;font:13px/1.4 Arial,Helvetica,sans-serif;text-align:center;pointer-events:none}
    .ed-card{position:absolute;z-index:21;width:min(320px,calc(100% - 24px));padding:12px;border-radius:12px;background:#fff;color:#211d1d;border:1px solid #e3ddd7;box-shadow:0 12px 32px #25191433;font:13px/1.4 Arial,Helvetica,sans-serif}
    .ed-card h3{margin:0 0 6px;padding-right:40px;font-size:14px}
    .ed-card .ed-x{position:absolute;top:4px;right:4px;width:40px;height:40px;border:0;border-radius:8px;background:transparent;color:#6f6866;font:600 18px/1 Arial,Helvetica,sans-serif;cursor:pointer}
    .ed-card .ed-x:hover{background:#f3eeec;color:#211d1d}
    .ed-card .ed-x:focus-visible{outline:3px solid #822433;outline-offset:-3px}
    .ed-card input[type=text]{width:100%;min-height:40px;box-sizing:border-box;padding:0 8px;border:1px solid #d6cfcc;border-radius:8px;font:14px Arial,Helvetica,sans-serif}
    .ed-card input[type=range]{width:100%;height:32px;margin:0;accent-color:#822433}
    .ed-card textarea{width:100%;min-height:84px;box-sizing:border-box;padding:8px;border:1px solid #d6cfcc;border-radius:8px;font:14px/1.4 Arial,Helvetica,sans-serif;resize:vertical}
    .ed-card .ed-row{display:flex;gap:8px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap}
    .ed-card .ed-row button{min-height:40px;padding:0 12px;border-radius:8px;border:1px solid #d6cfcc;background:#fff;color:#211d1d;font:600 13px Arial,Helvetica,sans-serif;cursor:pointer}
    .ed-card input,.ed-card select,.ed-card textarea{color:#211d1d;background-color:#fff;color-scheme:light} /* testi scuri anche col tema scuro del sistema */
    .ed-card .ed-row button.ed-primary{background:#822433;border-color:#822433;color:#fff}
    .ed-card .ed-meta{color:#6f6866;font-size:12px}
    .ed-card p{margin:0 0 6px;white-space:pre-wrap;overflow-wrap:anywhere}
    .ed-card label{display:block;margin:6px 0 2px;font-size:12px;color:#6f6866}
    .ed-card label.ed-check{display:flex;align-items:center;gap:8px;min-height:40px;margin-top:8px;font-size:14px;color:#2b2725;cursor:pointer}
    .ed-card label.ed-check input{width:20px;height:20px;accent-color:#822433}
    .ed-card select{width:100%;min-height:40px;box-sizing:border-box;padding:0 8px;border:1px solid #d6cfcc;border-radius:8px;background:#fff;font:14px Arial,Helvetica,sans-serif}
    .ed-card .ed-row button[aria-pressed="true"]{background:#f6e9eb;border-color:#822433;color:#822433}
    .ed-card .ed-seg{justify-content:stretch;margin:0 0 8px}.ed-card .ed-seg button{flex:1;min-height:44px}.ed-card .ed-seg button.ed-off,.ed-btn.ed-off{opacity:.45}
    .ed-fotos{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
    .ed-fotos img{width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #e3ddd7;background:#f3eeec;cursor:zoom-in}
    .ed-lightbox{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:#000d;cursor:zoom-out}
    .ed-lightbox img{max-width:96%;max-height:96%;border-radius:6px;box-shadow:0 8px 30px #0008}`;
    document.head.appendChild(st);
  }
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function buildUi() {
    const host = document.querySelector('.maparea') || document.body;
    ui.host = host;
    ui.bar = el('div', 'ed-bar');
    ui.edit = el('button', 'ed-btn', '⤡ Modifica'); ui.edit.type = 'button'; ui.edit.setAttribute('aria-pressed', 'false');
    ui.add = el('button', 'ed-btn', '＋ Aggiungi'); ui.add.type = 'button'; ui.add.hidden = true;
    ui.show = el('button', 'ed-btn', '▤ Scheda'); ui.show.type = 'button'; ui.show.hidden = true; ui.show.title = 'Riapri la scheda dell’oggetto selezionato';
    ui.trees = el('button', 'ed-btn', '🌳 Alberi'); ui.trees.type = 'button'; ui.trees.title = 'Mostra o nascondi tutti gli alberi';
    ui.apply = el('button', 'ed-btn ed-apply', '↥ Applica a Orari Chimica'); ui.apply.type = 'button';
    ui.bar.append(ui.show, ui.add, ui.trees, ui.edit, ui.apply);
    ui.rot = el('button', 'ed-btn', '⟳ Ruota'); ui.rot.type = 'button'; ui.rot.hidden = true; ui.rot.title = 'Ruota l’oggetto selezionato (scorciatoia R)'; ui.rot.setAttribute('aria-pressed', 'false'); ui.show.after(ui.rot);
    ui.hint = el('div', 'ed-hint'); ui.hint.hidden = true;
    ui.card = el('div', 'ed-card'); ui.card.hidden = true;
    host.append(ui.bar, ui.hint, ui.card);
    ui.edit.addEventListener('click', () => setMode(mode === 'modifica' ? null : 'modifica'));
    ui.apply.addEventListener('click', applyToOrari);
    ui.add.addEventListener('click', addCard);
    ui.trees.addEventListener('click', () => setTrees(ui.trees.getAttribute('aria-pressed') !== 'true'));
    ui.show.addEventListener('click', showCard);
    ui.rot.addEventListener('click', toggleRot);
  }
  // «Alberi»: acceso = alberi visibili; lo stato resta nel browser e campus-3d.js lo riapplica a ogni ricostruzione
  function setTrees(on) {
    if (C && C.alberiVisibili) C.alberiVisibili(on);
    if (ui.trees) ui.trees.setAttribute('aria-pressed', on ? 'true' : 'false');
    try { localStorage.setItem('campus-alberi', on ? '1' : '0'); } catch (e) { /* senza memoria: vale solo per questa visita */ }
  }
  function hint(text) { ui.hint.textContent = text || ''; ui.hint.hidden = !text; }
  function closeCard() { ui.card.hidden = true; ui.card.replaceChildren(); }
  function openCard(nodes, x, y) {
    ui.card.replaceChildren(...nodes); ui.card.hidden = false;
    if (x === 'dock') { // ✕: nasconde la scheda; l'oggetto resta selezionato con le sue maniglie
      const close = el('button', 'ed-x', '✕'); close.type = 'button'; close.setAttribute('aria-label', sel ? 'Nascondi la scheda (l’oggetto resta selezionato)' : 'Chiudi');
      close.addEventListener('click', hideCard); ui.card.prepend(close);
    }
    const r = ui.host.getBoundingClientRect(), w = ui.card.offsetWidth, h = ui.card.offsetHeight;
    if (x === 'dock') { ui.card.style.left = '12px'; ui.card.style.top = Math.max(12, r.height - h - 68) + 'px'; return; } // in basso a sinistra: non copre le maniglie
    const left = Math.max(12, Math.min(r.width - w - 12, (x ?? r.width / 2) - r.left - w / 2));
    const top = Math.max(12, Math.min(r.height - h - 68, (y ?? r.height / 2) - r.top + 16));
    ui.card.style.left = left + 'px'; ui.card.style.top = top + 'px';
  }
  function hideCard() {
    if (!sel) { placing = null; closeCard(); return; }
    sel.cardHidden = true; closeCard(); ui.show.hidden = false;
    hint('Scheda nascosta: l’oggetto resta selezionato. «▤ Scheda» o un nuovo tocco sull’oggetto la riapre.');
  }
  function showCard() {
    ui.show.hidden = true; hint('');
    if (!sel) return;
    sel.cardHidden = false;
    if (sel.type === 'edificio') buildingCard(); else infoCard();
  }
  // la scheda resta nascosta finché non si riapre; true se va disegnata
  function cardWanted() {
    if (sel.cardHidden) { closeCard(); ui.show.hidden = false; return false; }
    ui.show.hidden = true; return true;
  }
  function button(label, fn, primary) { const b = el('button', primary ? 'ed-primary' : '', label); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function setMode(next) {
    if (runtimeOnly) return;
    mode = next; closeCard(); deselect(); placing = null;
    ui.add.hidden = mode !== 'modifica';
    ui.edit.setAttribute('aria-pressed', String(mode === 'modifica'));
    if (mode === 'modifica') hint('Editor personale: seleziona un elemento per spostarlo, ridimensionarlo o cambiarne i materiali. «＋ Aggiungi» crea nuovi oggetti.');
    else hint('');
    if (pins) pins.visible = true;
  }

  function localDocs() {
    try { const saved = JSON.parse(localStorage.getItem(LOCAL_EDITS_KEY) || '[]'); return Array.isArray(saved) ? saved : []; }
    catch (_) { return []; }
  }
  function saveLocalDocs() {
    try { localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(overrides)); return true; }
    catch (_) { return false; }
  }
  function sendEditsToOrari() {
    if (!overrides.length) { hint('Non ci sono modifiche da applicare.'); return; }
    const editorEdits = Object.fromEntries(overrides.filter((item) => item && item.id).map((item) => [item.id, item]));
    const bytes = new TextEncoder().encode(JSON.stringify(editorEdits)).length;
    if (bytes > 256 * 1024) { hint('Le modifiche superano il limite di trasferimento (256 KB).'); return; }
    if (!bridgeWindow || bridgeWindow.closed || !bridgeReady) {
      bridgeReady = false;
      bridgeWindow = window.open(ORARI_BRIDGE, 'orari-chimica-editor', 'popup,width=620,height=560');
      hint(bridgeWindow ? 'Completa o verifica l’accesso a Orari Chimica nella finestra aperta, poi premi di nuovo «Applica».' : 'Consenti la finestra di collegamento a Orari Chimica e riprova.');
      return;
    }
    bridgeRequest = crypto.randomUUID();
    bridgeWindow.postMessage({ type: 'campus-apply-edits', request_id: bridgeRequest, editor_edits: editorEdits }, ORARI_ORIGIN);
    hint(`Invio di ${overrides.length} modifiche a Orari Chimica…`);
  }
  function applyToOrari() {
    if (!overrides.length) { hint('Non ci sono modifiche da applicare.'); return; }
    if (bridgeReady && bridgeWindow && !bridgeWindow.closed) { sendEditsToOrari(); return; }
    applyPending = true;
    bridgeReady = false;
    bridgeWindow = window.open(ORARI_BRIDGE, 'orari-chimica-editor', 'popup,width=620,height=560');
    hint(bridgeWindow ? 'Accedi a Orari Chimica nella finestra aperta: al termine le modifiche verranno applicate automaticamente.' : 'Consenti la finestra di collegamento a Orari Chimica e riprova.');
  }
  window.addEventListener('message', (event) => {
    if (event.origin !== ORARI_ORIGIN || event.source !== bridgeWindow || !event.data) return;
    if (event.data.type === 'orari-editor-connected') {
      bridgeReady = true;
      if (applyPending) { applyPending = false; sendEditsToOrari(); }
      else hint('Orari Chimica collegato.');
    }
    if (event.data.type === 'orari-editor-result' && event.data.request_id === bridgeRequest) {
      bridgeRequest = '';
      hint(event.data.ok ? `Modifiche applicate e pubblicate su Orari Chimica (${event.data.count || overrides.length}).` : `Applicazione non riuscita: ${event.data.error || 'errore del servizio'}`);
    }
  });

  /* ---------- cornici e coordinate ---------- */
  // cornice = gruppo con X = u, Y = h, Z = −v: un lato della sagoma di Chimica (esterni) o il cortile dell'azoto;
  // tutto il resto usa il lato 0 di Chimica, allineato con gli edifici vicini
  function frameEsterni(i) { const h = scene.getObjectByName('chimica-esterni'); return h ? h.children.find((g) => g.userData.elemento === i) || null : null; }
  function frameCortile() { const h = scene.getObjectByName('cortile-modello'); return h ? h.children[0] : null; }
  let tmpFrame = null; // cornice provvisoria durante lo spostamento di una porta (angolo preso dal muro agganciato)
  function frameBy(key) {
    if (key === 'cortile') return frameCortile();
    if (key === 'tmp') return tmpFrame;
    const r = /^rot:(.+)$/.exec(key || ''); if (r) return frameRot(r[1]);
    const m = /^esterni:(\d+)$/.exec(key || ''); return frameEsterni(m ? Number(m[1]) : 'lato0');
  }
  // cornice ruotata (`rot:<id>`) di un solido con angolo (pr.angolo, gradi, positivo = antiorario visto dall'alto): un Object3D figlio
  // della cornice base, ruotato attorno al centro della scatola. Le coordinate u/v/h restano quelle della cornice base (il centro della
  // scatola sta fermo), così maniglie e scatola girano con l'oggetto; senza angolo è la cornice base stessa.
  const TURNABLE = ['box', 'cilindro', 'sfera', 'oggetto'];
  const angleOf = (pr) => (pr && pr.box && TURNABLE.includes(pr.forma) ? (((Number(pr.angolo) || 0) % 360) + 360) % 360 : 0);
  // voci non primitive con un angolo proprio (it.angKey = campo in gradi dell'oggetto, it.angId = nome della cornice ruotata, per esempio i tubi del gas):
  // la loro scatola è quella non ruotata, centrata sul punto (u, v), e gira attorno al centro come i solidi
  const normAng = (x) => (((Number(x) || 0) % 360) + 360) % 360;
  const angOfItem = (it) => (it.primitiva ? angleOf(it.obj) : it.angKey ? normAng(it.obj[it.angKey]) : 0);
  // angolo mostrato dall'anello: per i poligoni (che ruotano i vertici, senza campo angolo) è la rotazione fatta durante il trascinamento
  /* Gli edifici non hanno un riquadro di ingombro: box() torna undefined e qui si leggeva
     comunque b.u0, buttando un errore a ogni clic che non prendeva un arredo. Il clic
     andava perso e sembrava che la selezione non funzionasse. */
  const centro = (b) => (b ? [(b.u0 + b.u1) / 2, (b.v0 + b.v1) / 2] : [0, 0]);
  const ringCentre = (it, b) => (!it.primitiva && it.pivot ? it.pivot() : centro(b));
  const angShown = (it) => (it.verts && !it.angKey && !(it.primitiva && it.obj.box) ? (sel && sel.vAng) || 0 : angOfItem(it));
  // perno della rotazione di una voce: il suo punto d'ancoraggio (it.pivot) o il centro della scatola
  const pivotOf = (it) => { if (it.pivot) return it.pivot(); return centro(it.box && it.box()); };
  const setAngItem = (it, a) => { if (it.primitiva) it.obj.angolo = a; else it.obj[it.angKey] = a; };
  const frameBaseOfItem = (it) => (it.primitiva ? it.obj.cornice || 'lato0' : it.frameKey);
  const frameOfItem = (it) => (angOfItem(it) ? 'rot:' + (it.primitiva ? it.obj.id : it.angId) : it.frameKey);
  function frameRot(id) {
    const pr = ((C.esterni.cfg && C.esterni.cfg.primitive) || []).find((x) => x.id === id && !x.rimosso);
    if (!pr) { // voce non primitiva con angolo (it.angId)
      const it = liveItems().find((x) => x.angId === id && !x.primitiva); if (!it) return null;
      const base = frameBy(it.frameKey), a = angOfItem(it), pv = pivotOf(it); if (!base || !a) return base;
      let f = base.children.find((c) => c.userData.rotId === id);
      if (!f) { f = new T.Object3D(); f.name = 'ed-rot'; f.userData.rotId = id; base.add(f); }
      const rad = (a * Math.PI) / 180, c = new T.Vector3(pv[0], 0, -pv[1]);
      f.rotation.set(0, rad, 0); f.position.copy(c).sub(c.clone().applyAxisAngle(new T.Vector3(0, 1, 0), rad)); f.updateMatrix();
      return f;
    }
    const base = frameBy(pr.cornice || 'lato0'), a = angleOf(pr); if (!base || !a) return base;
    let f = base.children.find((c) => c.userData.rotId === id);
    if (!f) { f = new T.Object3D(); f.name = 'ed-rot'; f.userData.rotId = id; base.add(f); }
    const rad = (a * Math.PI) / 180, c = new T.Vector3((pr.box.u0 + pr.box.u1) / 2, 0, -(pr.box.v0 + pr.box.v1) / 2);
    f.rotation.set(0, rad, 0); f.position.copy(c).sub(c.clone().applyAxisAngle(new T.Vector3(0, 1, 0), rad)); f.updateMatrix();
    return f;
  }
  // una scatola trascinata nella cornice ruotata torna nella cornice base: stesse misure, centro riportato con la rotazione
  // (pv = perno della rotazione, se non è il centro della vecchia scatola)
  function unturnBox(n, o, deg, pv) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cu = pv ? pv[0] : (o.u0 + o.u1) / 2, cv = pv ? pv[1] : (o.v0 + o.v1) / 2;
    const du = (n.u0 + n.u1) / 2 - cu, dv = (n.v0 + n.v1) / 2 - cv, mu = cu + du * c - dv * s, mv = cv + du * s + dv * c, hu = (n.u1 - n.u0) / 2, hv = (n.v1 - n.v0) / 2;
    return { u0: mu - hu, u1: mu + hu, v0: mv - hv, v1: mv + hv, h0: n.h0, h1: n.h1 };
  }
  function frameKeyOf(obj) {
    for (let o = obj; o; o = o.parent) {
      if (o.parent && o.parent.name === 'chimica-esterni' && o.userData.elemento !== undefined) return typeof o.userData.elemento === 'number' ? 'esterni:' + o.userData.elemento : 'lato0';
      if (o.name === 'cortile-modello') return 'cortile';
    }
    return 'lato0';
  }
  const toLocal = (f, w) => { f.updateWorldMatrix(true, false); const p = f.worldToLocal(w.clone()); return { u: p.x, v: -p.z, h: p.y }; };
  const toWorld = (f, u, v, h) => { f.updateWorldMatrix(true, false); return f.localToWorld(new T.Vector3(u, h, -v)); };
  function pointerNdc(e) { const r = canvas.getBoundingClientRect(); return new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  function rayFrom(e) { const rc = new T.Raycaster(); rc.setFromCamera(pointerNdc(e), camera); return rc; }
  const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  function hits(e) {
    const rc = rayFrom(e), targets = scene.children.filter((o) => o !== fx && o !== pins && o !== patchGroup && o.visible);
    return rc.intersectObjects(targets, true).filter((h) => {
      const o = h.object, mat = Array.isArray(o.material) ? o.material[(h.face && h.face.materialIndex) || 0] : o.material;
      return shown(o) && !(mat && mat.visible === false) && !o.isSprite;
    });
  }
  function describe(obj) {
    for (let o = obj; o; o = o.parent) {
      if (o.name === 'chimica-esterni') { let f = obj; while (f && f.userData.elemento === undefined) f = f.parent; const e = f && C.esterni.cfg.elementi[f.userData.elemento]; return 'esterni di Chimica' + (e ? ': ' + (e.nome || e.tipo) : ''); }
      if (o.name === 'cortile-modello') return "cortile dell'azoto";
      if (o.name === 'alberi') return 'albero';
      if (o.name === 'minerva') return 'piazzale della Minerva';
      if (o.userData && o.userData.code) return 'edificio ' + o.userData.code;
      if (o.name === 'edifici') return 'edificio';
    }
    return 'terreno o contesto';
  }

  /* ---------- scatole ---------- */
  const bboxPts = (pts) => { const us = pts.map((p) => p[0]), vs = pts.map((p) => p[1]); return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) }; };
  // una coordinata dentro la vecchia scatola finisce nello stesso punto relativo della nuova; su un asse piatto segue la faccia mossa
  function sc(c, o0, o1, n0, n1) { if (o1 - o0 > 1e-3) return n0 + ((c - o0) * (n1 - n0)) / (o1 - o0); return c + (Math.abs(n0 - o0) > 1e-9 ? n0 - o0 : n1 - o1); }
  const scalePts = (pts, o, n) => pts.map((p) => { const q = [round(sc(p[0], o.u0, o.u1, n.u0, n.u1)), round(sc(p[1], o.v0, o.v1, n.v0, n.v1))]; if (p.length > 2) q.push(round(sc(p[2], o.h0, o.h1, n.h0, n.h1))); return q; });
  const vol = (b) => Math.max(b.u1 - b.u0, 0.05) * Math.max(b.v1 - b.v0, 0.05) * Math.max(b.h1 - b.h0, 0.05);
  const inBox = (b, q, pad) => q.u >= b.u0 - pad && q.u <= b.u1 + pad && q.v >= b.v0 - pad && q.v <= b.v1 + pad && q.h >= b.h0 - pad && q.h <= b.h1 + pad;
  const roundBox = (b) => { const o = {}; for (const k of KEYS) o[k] = round(b[k]); return o; };
  function defQuote(piani) { const out = []; for (let k = 1, prev = 0; k <= piani; k += 1) { const f = 5.25 + 3.95 * (k - 1); out.push(round((prev + f) / 2), round(f)); prev = f; } return out; }

  /* ---------- oggetti descritti nei file (cambiano i loro dati) ---------- */
  // porte e portoni del catalogo: restano attaccati a una parete e poggiati al suolo (vedi snapParete)
  const A_PARETE = ['portone', 'portaAntincendio'];
  const isPine = (t) => t.g === 'needleleaved' || /pinus|pino/i.test(t.g || '');
  function items(E, M, A) {
    const out = [];
    // ogni oggetto si può eliminare (rimosso: true nel file) salvo quelli "fixed"; parent: l'elemento che lo contiene
    const add = (it) => {
      const { fields, obj } = it;
      if (it.giro && !it.verts) { // ruotabile attorno al perno: campo `angolo` (gradi, antiorario visto dall'alto) letto dal costruttore dell'oggetto
        it.angKey = it.angKey || 'angolo'; it.angId = it.angId || `${it.sorgente}:${it.percorso}`;
        if (!fields.includes(it.angKey)) fields.push(it.angKey);
        const ap = it.apply; // la scatola trascinata sta nella cornice ruotata: torna nella cornice base prima di salvare
        it.apply = (o, n) => { const a = normAng(obj[it.angKey]); ap(o, a ? unturnBox(n, o, a, pivotOf(it)) : n); };
      }
      if (!it.fixed && !it.remove && !fields.includes('rimosso')) fields.push('rimosso');
      const own = it.gone || (() => !!obj.rimosso);
      out.push(Object.assign(it, {
        key: `${it.sorgente}:${it.percorso}`, lock: it.lock || {},
        get: () => { const r = {}; for (const k of fields) if (obj[k] !== undefined) r[k] = clone(obj[k]); return r; },
        set: (val) => { for (const k of fields) { if (val && val[k] !== undefined) obj[k] = clone(val[k]); else if (k === 'rimosso' || k === 'angolo' || k === 'orienta' || k === 'specchio' || k === 'quota') delete obj[k]; } },
        remove: it.fixed ? null : (it.remove || (() => { obj.rimosso = true; })),
        gone: () => own() || !!(it.parent && it.parent !== obj && it.parent.rimosso),
      }));
    };
    const benchItems = (b, P, list, th) => (list || []).forEach((p, k) => add({ ...b, obj: p, percorso: `${P}.panchine.${k}`, label: `Panchina ${k + 1}`, fields: ['u', 'v', 'lunghezza', 'profondita', 'altezza', 'orienta'], lock: { h0: true }, giro: true, pivot: () => [p.u, p.v],
      box: () => { const L = Number(p.lunghezza) || 2.2, D = Number(p.profondita) || 0.45, av = p.orienta === 'v', du = av ? D : L, dv = av ? L : D; return { u0: p.u - du / 2, u1: p.u + du / 2, v0: p.v - dv / 2, v1: p.v + dv / 2, h0: th(), h1: th() + (Number(p.altezza) || 0.42) }; },
      apply: (o, n) => { const av = p.orienta === 'v'; p.u = round((n.u0 + n.u1) / 2); p.v = round((n.v0 + n.v1) / 2); p.lunghezza = round(av ? n.v1 - n.v0 : n.u1 - n.u0); p.profondita = round(av ? n.u1 - n.u0 : n.v1 - n.v0); p.altezza = round(n.h1 - th()); } }));
    const railItems = (b, P, e, th) => (e.ringhiere || []).forEach((l, k) => add({ ...b, percorso: `${P}.ringhiere.${k}`, label: `Ringhiera ${k + 1}`, fields: ['ringhiere', 'ringhiera'], lock: { h0: true },
      box: () => ({ ...bboxPts(e.ringhiere[k]), h0: th(), h1: th() + (Number((e.ringhiera || {}).altezza) || 1) }),
      apply: (o, n) => { e.ringhiere[k] = scalePts(e.ringhiere[k], o, n); e.ringhiera = Object.assign({}, e.ringhiera, { altezza: round(n.h1 - th()) }); },
      verts: { get: () => e.ringhiere[k], set: (q) => { e.ringhiere[k] = q; } },
      remove: () => { e.ringhiere[k] = []; }, gone: () => !Array.isArray(e.ringhiere[k]) || e.ringhiere[k].length < 2 }));
    if (E) (E.elementi || []).forEach((e, i) => {
      const b = { sorgente: 'esterni', frameKey: 'esterni:' + i, nome: e.nome || e.tipo, obj: e, parent: e }, P = `elementi.${i}`;
      if (e.tipo === 'terrazza') {
        const th = () => Number(e.altezza) || 0.8;
        add({ ...b, percorso: P, label: 'Terrazza', fields: ['poligono', 'altezza'], lock: { h0: true },
          box: () => ({ ...bboxPts(e.poligono), h0: 0, h1: th() }),
          apply: (o, n) => { e.poligono = scalePts(e.poligono, o, n); e.altezza = round(n.h1); },
          verts: { get: () => e.poligono, set: (q) => { e.poligono = q; } } });
        if (e.prato) add({ ...b, percorso: P + '.prato', label: 'Aiuola della terrazza', fields: ['prato'], lock: { h0: true, h1: true }, fixed: true,
          box: () => ({ u0: e.prato[0], v0: e.prato[1], u1: e.prato[2], v1: e.prato[3], h0: th(), h1: th() + 0.18 }),
          apply: (o, n) => { e.prato = [n.u0, n.v0, n.u1, n.v1].map(round); } });
        benchItems(b, P, e.panchine, th);
        railItems(b, P, e, th);
      } else if (e.tipo === 'area' || e.tipo === 'pilastro') {
        const pil = e.tipo === 'pilastro';
        add({ ...b, percorso: P, label: b.nome, fields: pil ? ['poligono', 'altezza'] : ['poligono'], lock: pil ? { h0: true } : { h0: true, h1: true },
          box: () => ({ ...bboxPts(e.poligono), h0: 0, h1: pil ? Number(e.altezza) || 2.5 : 0.04 }),
          apply: (o, n) => { e.poligono = scalePts(e.poligono, o, n); if (pil) e.altezza = round(n.h1); },
          verts: { get: () => e.poligono, set: (q) => { e.poligono = q; } } });
      } else if (e.tipo === 'scala') {
        const quote = () => (Array.isArray(e.quote) ? e.quote.map(Number) : defQuote(Math.max(1, Number(e.piani) || 2)));
        add({ ...b, percorso: P, label: b.nome, fields: ['u', 'lunghezza', 'larghezza', 'distacco', 'quote'], lock: { h0: true },
          box: () => { const L = Number(e.lunghezza) || 8.4, W = Number(e.larghezza) || 4.3, d = Number(e.distacco) || 0.5, q = quote(); return { u0: e.u - L / 2, u1: e.u + L / 2, v0: d, v1: d + W, h0: 0, h1: q[q.length - 1] + 1 }; },
          apply: (o, n) => { const k = (n.h1 - 1) / Math.max(0.5, o.h1 - 1); e.quote = quote().map((x) => round(x * k)); e.u = round((n.u0 + n.u1) / 2); e.lunghezza = round(n.u1 - n.u0); e.distacco = round(Math.max(0.05, n.v0)); e.larghezza = round(n.v1 - n.v0); } });
      } else if (e.tipo === 'ingresso') {
        const W = () => Number((e.porta || {}).larghezza) || 2.3, zero = () => 0;
        add({ ...b, percorso: P + '.porta', label: "Portone d'ingresso", fields: ['u', 'porta'], lock: { h0: true },
          box: () => ({ u0: e.u - W() / 2, u1: e.u + W() / 2, v0: 0, v1: 0.16, h0: 0, h1: Number((e.porta || {}).altezza) || 3.3 }),
          apply: (o, n) => { e.u = round((n.u0 + n.u1) / 2); e.porta = Object.assign({}, e.porta, { larghezza: round(n.u1 - n.u0), altezza: round(n.h1) }); },
          remove: () => { e.porta = Object.assign({}, e.porta, { rimosso: true }); }, gone: () => !!(e.porta && e.porta.rimosso) });
        const RV = e.rivestimento;
        if (RV) add({ ...b, obj: RV, percorso: P + '.rivestimento', label: 'Rivestimento chiaro con la scritta', fields: ['u', 'altezza'], lock: { h0: true },
          box: () => ({ u0: RV.u[0], u1: RV.u[1], v0: -0.02, v1: 0.14, h0: 0, h1: Number(RV.altezza) || 4.6 }),
          apply: (o, n) => { RV.u = [round(n.u0), round(n.u1)]; RV.altezza = round(n.h1); } });
        const TT = e.tattile;
        if (TT) add({ ...b, obj: TT, percorso: P + '.tattile', label: 'Percorso tattile', fields: ['u', 'v', 'larghezza'], lock: { h0: true, h1: true },
          box: () => { const w = Number(TT.larghezza) || 0.6, tu = TT.u != null ? Number(TT.u) : e.u; return { u0: tu - w / 2, u1: tu + w / 2, v0: TT.v[0], v1: TT.v[1], h0: 0, h1: 0.05 }; },
          apply: (o, n) => { TT.u = round((n.u0 + n.u1) / 2); TT.larghezza = round(n.u1 - n.u0); TT.v = [round(n.v0), round(n.v1)]; } });
        (e.aiuole || []).forEach((a, k) => add({ ...b, obj: a, percorso: `${P}.aiuole.${k}`, label: `Prato ${k + 1} dell'ingresso`, fields: ['u', 'v', 'cordolo'], lock: { h0: true }, giro: true, vincolo: 'suolo',
          box: () => ({ u0: a.u[0], u1: a.u[1], v0: a.v[0], v1: a.v[1], h0: 0, h1: Number(a.cordolo) || 0.18 }),
          apply: (o, n) => { a.u = [round(n.u0), round(n.u1)]; a.v = [round(n.v0), round(n.v1)]; a.cordolo = round(n.h1); } }));
        const FI = e.fiori;
        if (FI) add({ ...b, obj: FI, percorso: P + '.fiori', label: 'Aiuola fiorita', fields: ['u', 'v', 'altezza'], lock: { h0: true }, giro: true, vincolo: 'suolo',
          box: () => ({ u0: FI.u[0], u1: FI.u[1], v0: FI.v[0], v1: FI.v[1], h0: 0.1, h1: Number(FI.altezza) || 0.4 }),
          apply: (o, n) => { FI.u = [round(n.u0), round(n.u1)]; FI.v = [round(n.v0), round(n.v1)]; FI.altezza = round(n.h1); } });
        benchItems(b, P, e.panchine, zero);
        railItems(b, P, e, zero);
        (e.palme || []).forEach((p, k) => add({ ...b, obj: p, percorso: `${P}.palme.${k}`, label: `Palma ${k + 1}`, fields: ['u', 'v', 'altezza'], lock: { h0: true }, giro: true, pivot: () => [p.u, p.v],
          box: () => ({ u0: p.u - 0.9, u1: p.u + 0.9, v0: p.v - 0.9, v1: p.v + 0.9, h0: 0, h1: Number(p.altezza) || 4 }),
          apply: (o, n) => { p.u = round((n.u0 + n.u1) / 2); p.v = round((n.v0 + n.v1) / 2); p.altezza = round(n.h1); } }));
        (e.totem || []).forEach((t, k) => add({ ...b, obj: t, percorso: `${P}.totem.${k}`, label: `Totem ${k + 1}`, fields: ['u', 'v', 'altezza', 'larghezza', 'spessore', 'scritta', 'cartello', 'logoMuseo', 'orienta'], lock: { h0: true }, totem: true, giro: true, pivot: () => [t.u, t.v],
          // larghezza: lato lungo (con la scritta), spessore: lato corto; orienta 'v' li gira lungo il vialetto
          box: () => { const w = (Number(t.larghezza) || 0.8) / 2 + 0.05, d = (Number(t.spessore) || 0.5) / 2, a = t.orienta === 'v' ? d : w, c = t.orienta === 'v' ? w : d; return { u0: t.u - a, u1: t.u + a, v0: t.v - c, v1: t.v + c, h0: 0, h1: Number(t.altezza) || 2.75 }; },
          apply: (o, n) => { const av = t.orienta === 'v'; t.u = round((n.u0 + n.u1) / 2); t.v = round((n.v0 + n.v1) / 2); t.altezza = round(n.h1); t.larghezza = round((av ? n.v1 - n.v0 : n.u1 - n.u0) - 0.1); t.spessore = round(av ? n.u1 - n.u0 : n.v1 - n.v0); } })); // la pedana sporge 5 cm per lato
        const RS = e.rastrelliera;
        if (RS) add({ ...b, obj: RS, percorso: P + '.rastrelliera', label: 'Rastrelliera per bici', fields: ['u', 'v', 'posti'], lock: { h0: true, h1: true }, giro: true, pivot: () => [RS.u, RS.v],
          box: () => ({ u0: RS.u - 0.02, u1: RS.u + ((Number(RS.posti) || 3) - 1) * 0.6 + 0.02, v0: RS.v - 0.37, v1: RS.v + 0.37, h0: 0, h1: 0.8 }),
          apply: (o, n) => { RS.u = round(n.u0 + 0.02); RS.posti = Math.max(1, Math.round((n.u1 - n.u0 - 0.04) / 0.6) + 1); RS.v = round((n.v0 + n.v1) / 2); } });
      } else if (e.tipo === 'pergolato') {
        // scatola = galleria con la vite (0,4 m oltre gli archi per lato)
        add({ ...b, percorso: P, label: b.nome, fields: ['u', 'v', 'altezza'], lock: { h0: true }, giro: true,
          box: () => ({ u0: e.u[0], u1: e.u[1], v0: e.v[0] - 0.4, v1: e.v[1] + 0.4, h0: 0, h1: Number(e.altezza) || 3 }),
          apply: (o, n) => { e.u = [round(n.u0), round(n.u1)]; e.v = [round(n.v0 + 0.4), round(n.v1 - 0.4)]; e.altezza = round(n.h1); } });
      } else if (e.tipo === 'lampione') {
        add({ ...b, percorso: P, label: b.nome, fields: ['u', 'v', 'altezza'], lock: { h0: true }, giro: true, pivot: () => [e.u, e.v],
          box: () => ({ u0: e.u - 0.2, u1: e.u + 0.2, v0: e.v - 0.2, v1: e.v + 0.9, h0: 0, h1: (Number(e.altezza) || 4.6) + 0.2 }),
          apply: (o, n) => { e.u = round((n.u0 + n.u1) / 2); e.v = round(n.v0 + 0.2); e.altezza = round(n.h1 - 0.2); } });
      } else if (e.tipo === 'palo') {
        add({ ...b, percorso: P, label: b.nome, fields: ['u', 'v', 'altezza'], lock: { h0: true },
          box: () => ({ u0: e.u - 0.2, u1: e.u + 0.2, v0: e.v - 0.2, v1: e.v + 0.2, h0: 0, h1: Number(e.altezza) || 11 }),
          apply: (o, n) => { e.u = round((n.u0 + n.u1) / 2); e.v = round((n.v0 + n.v1) / 2); e.altezza = round(n.h1); } });
      }
    });
    if (M) {
      const b = { sorgente: 'cortile', frameKey: 'cortile' };
      const rect = (o, h0, h1) => ({ u0: o.u[0], u1: o.u[1], v0: o.v[0], v1: o.v[1], h0, h1 });
      const setRect = (o, n) => { o.u = [round(n.u0), round(n.u1)]; o.v = [round(n.v0), round(n.v1)]; };
      const circ = (o, r) => ({ u0: o.u - r, u1: o.u + r, v0: o.v - r, v1: o.v + r });
      const mid = (n) => [round((n.u0 + n.u1) / 2), round((n.v0 + n.v1) / 2)];
      const side = (n) => round(Math.max(n.u1 - n.u0, n.v1 - n.v0));
      if (M.pavimento) add({ ...b, obj: M.pavimento, percorso: 'pavimento', label: 'Pavimento del cortile', fields: ['u', 'v'], lock: { h0: true, h1: true }, fixed: true, box: () => rect(M.pavimento, 0, 0.03), apply: (o, n) => setRect(M.pavimento, n) });
      (M.aiuole || []).forEach((a, k) => add({ ...b, obj: a, percorso: `aiuole.${k}`, label: `Aiuola ${a.id || k + 1} del cortile`, fields: ['u', 'v', 'altezza'], lock: { h0: true }, giro: true, vincolo: 'suolo', box: () => rect(a, 0, Number(a.altezza) || 0.42), apply: (o, n) => { setRect(a, n); a.altezza = round(n.h1); } }));
      const G = M.gabbia;
      if (G) {
        add({ ...b, obj: G, percorso: 'gabbia', label: 'Gabbia del silos', fields: ['u', 'v', 'altezza'], lock: { h0: true }, fixed: true, giro: true, box: () => rect(G, 0.42, 0.42 + (Number(G.altezza) || 2)), apply: (o, n) => { setRect(G, n); G.altezza = round(n.h1 - 0.42); } });
        if (G.porta && typeof G.porta === 'object') add({ ...b, obj: G, percorso: 'gabbia.porta', label: 'Porticina della gabbia', fields: ['porta'], fixed: true,
          box: () => ({ u0: G.u[0] - 0.07, u1: G.u[0] - 0.01, v0: G.porta.v[0], v1: G.porta.v[1], h0: Number(G.porta.soglia) || 0.12, h1: Number(G.porta.sommita) || 2.05 }),
          apply: (o, n) => { G.porta = Object.assign({}, G.porta, { v: [round(n.v0), round(n.v1)], soglia: round(n.h0), sommita: round(n.h1) }); } });
      }
      (M.pilastri || []).forEach((p, k) => add({ ...b, obj: p, percorso: `pilastri.${k}`, label: `Pilastro ${k + 1} del portico`, fields: ['u', 'v', 'altezza'], lock: { h0: true }, giro: true, box: () => rect(p, 0, Number(p.altezza) || 4.5), apply: (o, n) => { setRect(p, n); p.altezza = round(n.h1); } }));
      if (M.portico) add({ ...b, obj: M.portico, percorso: 'portico', label: 'Portico', fields: ['u', 'v', 'soffitto'], lock: { h0: true }, fixed: true, box: () => rect(M.portico, 0, Number(M.portico.soffitto) || 4.5), apply: (o, n) => { setRect(M.portico, n); M.portico.soffitto = round(n.h1); } });
      (M.magnolie || []).forEach((m, k) => add({ ...b, obj: m, percorso: `magnolie.${k}`, label: `Magnolia ${m.id || k + 1}`, fields: ['u', 'v', 'raggio', 'altezza'], lock: { h0: true }, giro: true, pivot: () => [m.u, m.v], box: () => ({ ...circ(m, Number(m.raggio) || 3), h0: 0, h1: Number(m.altezza) || 12 }), apply: (o, n) => { [m.u, m.v] = mid(n); m.raggio = round(side(n) / 2); m.altezza = round(n.h1); } }));
      const S = M.serbatoio;
      if (S) add({ ...b, obj: S, percorso: 'serbatoio', label: "Silos dell'azoto", fields: ['u', 'v', 'raggio', 'altezza'], lock: { h0: true }, fixed: true, giro: true, pivot: () => [S.u, S.v], box: () => ({ ...circ(S, Number(S.raggio) || 0.8), h0: 0, h1: Number(S.altezza) || 4.2 }), apply: (o, n) => { [S.u, S.v] = mid(n); S.raggio = round(side(n) / 2); S.altezza = round(n.h1); } });
      (M.tombini || []).forEach((t, k) => add({ ...b, obj: t, percorso: `tombini.${k}`, label: `Tombino ${k + 1}`, fields: ['u', 'v', 'lato', 'quota'], lock: { h0: true, h1: true }, giro: true, vincolo: 'superficie', pivot: () => [t.u, t.v], box: () => ({ ...circ(t, (Number(t.lato) || 0.6) / 2), h0: Number(t.quota) || 0, h1: (Number(t.quota) || 0) + 0.04 }), apply: (o, n) => { [t.u, t.v] = mid(n); t.lato = side(n); t.quota = round(n.h0); } }));
      (M.transenne || []).forEach((t, k) => add({ ...b, obj: t, percorso: `transenne.${k}`, label: `Transenna ${k + 1}`, fields: ['u', 'v', 'lunghezza', 'angoloDeg'], lock: { h0: true, h1: true }, giro: true, angKey: 'angoloDeg', pivot: () => [t.u, t.v], box: () => ({ u0: t.u, u1: t.u + (Number(t.lunghezza) || 2), v0: t.v - 0.05, v1: t.v + 0.05, h0: 0, h1: 1.1 }), apply: (o, n) => { t.u = round(n.u0); t.lunghezza = round(n.u1 - n.u0); t.v = round((n.v0 + n.v1) / 2); } }));
      const TB = M.tubi;
      if (TB) add({ ...b, obj: TB, percorso: 'tubi', label: 'Tubi del gas (3 bombole)', fields: ['u', 'v', 'ruota', 'scala'], lock: { h0: true, h1: true },
        giro: true, angKey: 'ruota', angId: 'tubi', pivot: () => [TB.u, TB.v],
        box: () => { const k = Number(TB.scala) || 1, du = (0.66 * k) / 2, dv = (0.3 * k) / 2; return { u0: TB.u - du, u1: TB.u + du, v0: TB.v - dv, v1: TB.v + dv, h0: 0, h1: 1.67 * k }; }, // non ruotata: gira la cornice «rot:tubi»
        apply: (o, n) => { [TB.u, TB.v] = mid(n); } });
      const TS = M.tuboScarico;
      if (TS && Array.isArray(TS.percorso)) {
        const r = Number(TS.raggio) || 0.08, inner = (x) => ({ u0: x.u0 + r, u1: x.u1 - r, v0: x.v0 + r, v1: x.v1 - r, h0: x.h0 + r, h1: x.h1 - r });
        add({ ...b, obj: TS, percorso: 'tuboScarico', label: 'Tubo di scarico del silos', fields: ['percorso', 'canaletta'],
          box: () => { const bb = bboxPts(TS.percorso), hs = TS.percorso.map((p) => p[2]); return { u0: bb.u0 - r, u1: bb.u1 + r, v0: bb.v0 - r, v1: bb.v1 + r, h0: Math.min(...hs) - r, h1: Math.max(...hs) + r }; },
          apply: (o, n) => {
            const f0 = TS.percorso[TS.percorso.length - 1]; TS.percorso = scalePts(TS.percorso, inner(o), inner(n)); const f1 = TS.percorso[TS.percorso.length - 1];
            if (TS.canaletta) TS.canaletta = Object.assign({}, TS.canaletta, { u: round(TS.canaletta.u + f1[0] - f0[0]), v: TS.canaletta.v.map((x) => round(x + f1[1] - f0[1])) });
          } });
        if (TS.fossetta) add({ ...b, obj: TS, percorso: 'tuboScarico.fossetta', label: 'Fossetta di scarico', fields: ['fossetta'], lock: { h0: true, h1: true }, parent: TS,
          remove: () => { TS.fossetta = null; }, gone: () => !TS.fossetta,
          box: () => { const F = TS.fossetta, w = (Number(F.larghezza) || 0.2) / 2; return { u0: F.u - w, u1: F.u + w, v0: F.v[0], v1: F.v[1], h0: 0, h1: 0.04 }; },
          apply: (o, n) => { TS.fossetta = Object.assign({}, TS.fossetta, { u: round((n.u0 + n.u1) / 2), larghezza: round(n.u1 - n.u0), v: [round(n.v0), round(n.v1)] }); } });
      }
    }
    // alberi (dalle chiome dell'ortofoto o aggiunti): si spostano, si ridimensionano e si eliminano
    if (A) A.forEach((t) => {
      const ms = () => C.alberi.misure(t);
      add({ sorgente: 'albero', frameKey: 'lato0', obj: t, percorso: t.id, nome: t.id, label: isPine(t) ? 'Pino' : 'Albero', fields: ['p', 'r', 'g', 'nuovo'], lock: { h0: true },
        box: () => { const q = toLocal(frameBy('lato0'), C.project(t.p)), m = ms(); return { u0: q.u - m.R, u1: q.u + m.R, v0: q.v - m.R, v1: q.v + m.R, h0: 0, h1: m.h }; },
        apply: (o, n) => {
          const ll = C.toLonLat(toWorld(frameBy('lato0'), (n.u0 + n.u1) / 2, (n.v0 + n.v1) / 2, 0)), pine = ms().pine;
          t.p = [Number(ll[0].toFixed(7)), Number(ll[1].toFixed(7))];
          // trascinando la faccia alta cambia l'altezza (e con lei la chioma), altrimenti la larghezza della chioma
          t.r = round(Math.abs(n.h1 - o.h1) > 1e-3 ? Math.max(0.6, (n.h1 - (pine ? 3 : 2.5)) / (pine ? 2.6 : 2.1)) : Math.max(0.3, Math.max(n.u1 - n.u0, n.v1 - n.v0) / 2));
        } });
    });
    // primitive aggiunte: scatola nelle coordinate del lato 0
    if (E) (E.primitive || []).forEach((pr) => {
      const poly = pr.forma === 'marciapiede' || (pr.forma === 'aiuola' && pr.tipo !== 'rotonda');
      const label = pr.forma === 'oggetto' ? nomeOggetto(pr.modello) : pr.forma === 'marciapiede' ? 'Marciapiede' : pr.forma === 'aiuola' ? `Aiuola ${TIPI_AIUOLA[pr.tipo] || ''} (${TERRENI[pr.terreno] || 'prato'})` : `${FORME[pr.forma] || FORME.box} in ${pr.materiale || 'travertino'}`;
      add({ sorgente: 'aggiunta', frameKey: pr.cornice || 'lato0', obj: pr, percorso: pr.id, nome: pr.id, label, fields: ['id', 'forma', 'materiale', 'box', 'poligono', 'base', 'altezza', 'tipo', 'terreno', 'cordolo', 'discese', 'raggio', 'raggi', 'modello', 'ruota', 'angolo', 'specchio', 'scritta', 'cartello', 'logoMuseo', 'cornice'], primitiva: true,
        vincolo: pr.forma === 'marciapiede' || pr.forma === 'aiuola' ? 'suolo' : pr.forma === 'oggetto' && A_PARETE.includes(pr.modello) ? 'parete' : pr.forma === 'oggetto' && pr.modello === 'tombino' ? 'superficie' : undefined,
        lock: pr.forma === 'marciapiede' || pr.forma === 'aiuola' ? { h0: true } : pr.forma === 'oggetto' && (A_PARETE.includes(pr.modello) || pr.modello === 'tombino') ? { h0: true } : {},
        box: poly ? () => ({ ...bboxPts(pr.poligono), h0: Number(pr.base) || 0, h1: (Number(pr.base) || 0) + (Number(pr.altezza) || 0.15) }) : () => pr.box,
        apply: poly ? (o, n) => { pr.poligono = scalePts(pr.poligono, o, n); pr.altezza = round(Math.max(0.05, n.h1 - n.h0)); if (pr.forma === 'marciapiede' || pr.forma === 'aiuola') pr.base = 0; } : (o, n) => { pr.box = roundBox(angleOf(pr) ? unturnBox(n, o, angleOf(pr)) : n); }, // con un angolo la scatola è nella cornice ruotata
        verts: poly ? { get: () => pr.poligono, set: (q) => { pr.poligono = q; } } : undefined });
    });
    return out;
  }
  const nomeOggetto = (m) => (C.esterni.catalogo.find(([k]) => k === m) || [m, 'Oggetto'])[1];
  const liveItems = () => items(C.esterni.cfg, C.cortile.M, C.alberi.list);
  const findItem = (key) => liveItems().find((it) => it.key === key) || null;
  function baseValue(it) { const twin = items(base.esterni, base.cortile, base.alberi).find((x) => x.key === it.key); return twin ? clone(twin.get()) : null; }
  // l'oggetto descritto più piccolo la cui scatola contiene il punto toccato
  // magnolie, palme e alberi del catalogo: con l'interruttore «Alberi» spento non si toccano
  const isTreeItem = (it) => it.sorgente === 'albero' || /\.palme\.\d+$|^magnolie\.\d+$/.test(it.percorso) || (it.sorgente === 'aggiunta' && it.obj && ['palma', 'magnolia'].includes(it.obj.modello));
  function itemAt(world) {
    let best = null;
    for (const it of liveItems()) {
      if (it.sorgente === 'albero' || it.gone()) continue; // gli alberi si prendono toccando tronco o chioma
      if (isTreeItem(it) && C.alberiVisibili && C.alberiVisibili() === false) continue; // alberi spenti con «Alberi»: non si selezionano
      const f = frameBy(frameOfItem(it)); if (!f) continue; // un solido ruotato si tocca nella sua cornice ruotata
      const b = it.box();
      if (!b) continue; // alcuni elementi non hanno un ingombro: senza questo il clic andava in errore
      if (inBox(b, toLocal(f, world), 0.25) && (!best || vol(b) < best.v)) best = { it, v: vol(b) };
    }
    return best ? best.it : null;
  }

  /* ---------- primitive (ogni altro solido: deformato con una trasformazione) ---------- */
  const rootOf = (o) => { for (let x = o; x; x = x.parent) if (ROOTS.includes(x.name)) return x; return null; };
  function pathOf(mesh) { const parts = []; let o = mesh; while (o.parent && !ROOTS.includes(o.name)) { parts.unshift(o.parent.children.indexOf(o)); o = o.parent; } return ROOTS.includes(o.name) ? [o.name].concat(parts).join('/') : null; }
  function byPath(path) { const [root, ...idx] = String(path).split('/'); let o = scene.getObjectByName(root); for (const i of idx) { if (!o) return null; o = o.children[Number(i)]; } return o || null; }
  const primId = (p) => ('prim:' + p.path.replace(/\//g, '.') + (p.inst != null ? '@' + p.inst : '')).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_');
  function primWorld(p, original) {
    const m = p.mesh; m.updateWorldMatrix(true, false);
    const W = original && m.userData.edL0 ? new T.Matrix4().multiplyMatrices(m.parent.matrixWorld, m.userData.edL0) : m.matrixWorld.clone();
    if (p.inst != null) {
      const I = new T.Matrix4(), s = m.userData.edI0 && m.userData.edI0[p.inst];
      if (original && s) I.copy(s); else m.getMatrixAt(p.inst, I);
      W.multiply(I);
    }
    return W;
  }
  function primBox(p, original) {
    const f = frameBy(p.frameKey); f.updateWorldMatrix(true, false);
    const g = p.mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox, M = new T.Matrix4().copy(f.matrixWorld).invert().multiply(primWorld(p, original));
    const o = { u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity, h0: Infinity, h1: -Infinity };
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
      const q = new T.Vector3(x, y, z).applyMatrix4(M);
      o.u0 = Math.min(o.u0, q.x); o.u1 = Math.max(o.u1, q.x); o.h0 = Math.min(o.h0, q.y); o.h1 = Math.max(o.h1, q.y); o.v0 = Math.min(o.v0, -q.z); o.v1 = Math.max(o.v1, -q.z);
    }
    return roundBox(o);
  }
  function treeItemFromHit(h) {
    const o = h.object, ids = o && o.userData.treeIds;
    if (!ids || h.instanceId == null) return null;
    const id = ids[o.userData.lumps ? Math.floor(h.instanceId / o.userData.lumps) : h.instanceId];
    return id ? findItem('albero:' + id) : null;
  }
  function primFromHit(h) {
    const o = h.object, root = o && rootOf(o);
    if (!o || !o.isMesh || !root || root.name === 'edifici' || root.name === 'alberi') return null; // edifici: solo texture e finestre
    const p = { mesh: o, inst: h.instanceId != null ? h.instanceId : null, path: pathOf(o), frameKey: frameKeyOf(o) };
    if (!p.path || !frameBy(p.frameKey)) return null;
    const b = primBox(p);
    return Math.hypot(b.u1 - b.u0, b.v1 - b.v0, b.h1 - b.h0) > 250 ? null : p; // niente terreno o quartiere unito
  }
  function axisMap(o0, o1, n0, n1) { if (o1 - o0 > 1e-4) { const s = (n1 - n0) / (o1 - o0); return [s, n0 - o0 * s]; } return [1, (n0 + n1) / 2 - (o0 + o1) / 2]; }
  function boxMatrix(o, n) { // nella cornice: x = u, y = h, z = −v
    const [sx, tx] = axisMap(o.u0, o.u1, n.u0, n.u1), [sy, ty] = axisMap(o.h0, o.h1, n.h0, n.h1), [sz, tz] = axisMap(-o.v1, -o.v0, -n.v1, -n.v0);
    return new T.Matrix4().makeScale(sx, sy, sz).setPosition(tx, ty, tz);
  }
  // porta la scatola originale "o" nella scatola "n", partendo sempre dalla trasformazione originale del pezzo
  function primApply(p, o, n) {
    const m = p.mesh, f = frameBy(p.frameKey); if (!f) return;
    f.updateWorldMatrix(true, false); m.updateWorldMatrix(true, false);
    const F = f.matrixWorld, G = new T.Matrix4().multiplyMatrices(F, boxMatrix(o, n)).multiply(new T.Matrix4().copy(F).invert());
    if (p.inst != null) {
      m.userData.edI0 = m.userData.edI0 || {};
      if (!m.userData.edI0[p.inst]) { const I = new T.Matrix4(); m.getMatrixAt(p.inst, I); m.userData.edI0[p.inst] = I; }
      const Wm = m.matrixWorld, I = new T.Matrix4().copy(Wm).invert().multiply(G).multiply(Wm).multiply(m.userData.edI0[p.inst]);
      m.setMatrixAt(p.inst, I); m.instanceMatrix.needsUpdate = true;
    } else {
      if (!m.userData.edL0) m.userData.edL0 = m.matrix.clone();
      const W0 = new T.Matrix4().multiplyMatrices(m.parent.matrixWorld, m.userData.edL0);
      m.matrixAutoUpdate = false; m.matrix.copy(new T.Matrix4().copy(m.parent.matrixWorld).invert().multiply(G).multiply(W0)); m.matrixWorldNeedsUpdate = true;
    }
  }
  // elimina il pezzo: la mesh diventa invisibile (fuori da clic e collisioni della passeggiata), l'istanza di un InstancedMesh ha la matrice scalata a zero
  function primRemove(p) {
    const m = p.mesh;
    if (p.inst != null) {
      m.userData.edI0 = m.userData.edI0 || {};
      if (!m.userData.edI0[p.inst]) { const I = new T.Matrix4(); m.getMatrixAt(p.inst, I); m.userData.edI0[p.inst] = I; }
      m.setMatrixAt(p.inst, new T.Matrix4().makeScale(0, 0, 0)); m.instanceMatrix.needsUpdate = true;
    } else { m.userData.edHid = true; m.visible = false; }
  }
  function primRestore(p) {
    const m = p.mesh;
    if (m.userData.edHid) { m.visible = true; delete m.userData.edHid; }
    if (p.inst != null) { const s = m.userData.edI0 && m.userData.edI0[p.inst]; if (s) { m.setMatrixAt(p.inst, s); m.instanceMatrix.needsUpdate = true; delete m.userData.edI0[p.inst]; } }
    else if (m.userData.edL0) { m.matrix.copy(m.userData.edL0); m.matrix.decompose(m.position, m.quaternion, m.scale); m.matrixAutoUpdate = true; delete m.userData.edL0; m.matrixWorldNeedsUpdate = true; }
  }
  let primsFromDb = new Map(); // id della modifica → pezzo deformato
  function reapplyPrims() {
    const live = new Set(overrides.filter((o) => o.sorgente === 'primitiva' && (!o.stato || o.stato === 'da applicare')).map((o) => o.id));
    for (const [id, p] of primsFromDb) if (!live.has(id) && p.mesh.parent) primRestore(p);
    primsFromDb = new Map();
    for (const o of overrides) {
      if (o.sorgente !== 'primitiva' || (o.stato && o.stato !== 'da applicare') || (!o.valore && !o.rimosso) || !o.originale) continue;
      const mesh = byPath(o.percorso); if (!mesh || !mesh.isMesh) continue;
      const p = { mesh, inst: o.istanza != null ? o.istanza : null, path: o.percorso, frameKey: o.cornice || frameKeyOf(mesh) };
      if (!frameBy(p.frameKey)) continue;
      const b0 = primBox(p, true); // il pezzo deve essere ancora quello misurato (i dati possono essere cambiati)
      if (KEYS.every((k) => Math.abs(b0[k] - o.originale[k]) < 0.06)) { if (o.rimosso) primRemove(p); else primApply(p, o.originale, o.valore); primsFromDb.set(o.id, p); }
    }
  }

  /* ---------- selezione e maniglie ---------- */
  function selBox() { return sel.type === 'item' ? roundBox(sel.it.box()) : primBox(sel.p); }
  const boxed = () => sel && sel.type !== 'edificio';
  function deselect() {
    if (!sel) return;
    fx.remove(sel.vis); sel.vis.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    sel = null; closeCard(); ui.show.hidden = true;
  }
  function select(t) {
    const rot = !!(sel && sel.rot && sel.type === 'item' && t.type === 'item' && sel.it.key === t.it.key); // stesso oggetto toccato di nuovo: resta in Ruota
    deselect();
    sel = Object.assign({ vis: new T.Group(), handles: [], rot }, t);
    sel.frameKey = t.type === 'item' ? frameOfItem(t.it) : t.p.frameKey;
    sel.box = selBox();
    if (t.type === 'prim') sel.orig = primBox(t.p, true);
    fx.add(sel.vis); drawSel(); infoCard();
  }
  const disp = (b) => { const o = clone(b); for (const a of ['u', 'v', 'h']) if (o[a + '1'] - o[a + '0'] < 0.08) { const c = (o[a + '0'] + o[a + '1']) / 2; o[a + '0'] = c - 0.04; o[a + '1'] = c + 0.04; } return o; };
  function drawSel() {
    const f = frameBy(sel.frameKey); if (!f) return;
    sel.vis.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); sel.vis.clear(); sel.handles = [];
    const b = disp(sel.box), um = (b.u0 + b.u1) / 2, vm = (b.v0 + b.v1) / 2, hm = (b.h0 + b.h1) / 2, lock = sel.type === 'item' ? sel.it.lock : {};
    const c = (i, j, k) => toWorld(f, i ? b.u1 : b.u0, j ? b.v1 : b.v0, k ? b.h1 : b.h0);
    const pts = [];
    for (const [a, z] of [[[0, 0, 0], [1, 0, 0]], [[0, 1, 0], [1, 1, 0]], [[0, 0, 1], [1, 0, 1]], [[0, 1, 1], [1, 1, 1]], [[0, 0, 0], [0, 1, 0]], [[1, 0, 0], [1, 1, 0]], [[0, 0, 1], [0, 1, 1]], [[1, 0, 1], [1, 1, 1]], [[0, 0, 0], [0, 0, 1]], [[1, 0, 0], [1, 0, 1]], [[0, 1, 0], [0, 1, 1]], [[1, 1, 0], [1, 1, 1]]]) pts.push(c(...a), c(...z));
    const edges = new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0x822433, depthTest: false, transparent: true }));
    edges.renderOrder = 998; sel.vis.add(edges);
    const hs = [], rot = rotOn();
    if (rot) { // modo Ruota: al posto delle maniglie un anello orizzontale attorno alla scatola, con una maniglia all'angolo dell'oggetto
      const fb = frameBy(frameBaseOfItem(sel.it)); if (!fb) return;
      const pvt = ringCentre(sel.it, b), rum = pvt[0], rvm = pvt[1]; // l'anello gira attorno al perno dell'oggetto
      const R = Math.max(0.6, 0.5 * Math.hypot(b.u1 - b.u0, b.v1 - b.v0) + 0.4), a = (angShown(sel.it) * Math.PI) / 180, hr = b.h0 + 0.05, ring = [];
      for (let i = 0; i < 96; i += 1) ring.push(toWorld(fb, rum + R * Math.cos((i / 96) * 2 * Math.PI), rvm + R * Math.sin((i / 96) * 2 * Math.PI), hr));
      const hw = toWorld(fb, rum + R * Math.cos(a), rvm + R * Math.sin(a), hr), mat = () => new T.LineBasicMaterial({ color: 0x822433, depthTest: false, transparent: true });
      const rl = new T.LineLoop(new T.BufferGeometry().setFromPoints(ring), mat()), sp = new T.LineSegments(new T.BufferGeometry().setFromPoints([toWorld(fb, rum, rvm, hr), hw]), mat());
      rl.renderOrder = sp.renderOrder = 998; sel.vis.add(rl, sp); sel.ring = { pts: ring };
      hs.push({ role: 'rotate', world: hw });
    } else {
    for (const [axis, val] of [['u', [b.u0, b.u1]], ['v', [b.v0, b.v1]], ['h', [b.h0, b.h1]]]) val.forEach((x, i) => {
      if (axis === 'h' && lock['h' + i]) return;
      hs.push({ role: 'face', axis, side: String(i), u: axis === 'u' ? x : um, v: axis === 'v' ? x : vm, h: axis === 'h' ? x : hm });
    });
    const flat = b.h1 - b.h0 < 0.3;
    for (const i of [0, 1]) for (const j of [0, 1]) for (const k of flat ? [1] : [0, 1]) hs.push({ role: 'corner', u: String(i), v: String(j), pu: i ? b.u1 : b.u0, pv: j ? b.v1 : b.v0, ph: k ? b.h1 : b.h0 });
    hs.push({ role: 'move', u: um, v: vm, h: b.h1 + 0.45 });
    if (sel.type === 'item' && sel.it.verts) sel.it.verts.get().forEach((q, k) => hs.push({ role: 'vertex', k, u: q[0], v: q[1], h: b.h1 }));
    }
    for (const h of hs) {
      const geo = h.role === 'vertex' ? new T.SphereGeometry(0.5, 12, 8) : new T.BoxGeometry(1, 1, 1);
      const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: h.role === 'move' || h.role === 'rotate' ? 0x822433 : h.role === 'vertex' ? (sel.corner === h.k ? 0x2f7de1 : 0xf2c84b) : 0xffffff, depthTest: false, transparent: true }));
      if (h.role !== 'vertex') { const ed = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: 0x822433, depthTest: false, transparent: true })); ed.renderOrder = 1000; m.add(ed); }
      m.position.copy(h.world ? h.world : h.role === 'corner' ? toWorld(f, h.pu, h.pv, h.ph) : toWorld(f, h.u, h.v, h.h)); m.renderOrder = 999; m.userData.handle = h;
      sel.vis.add(m); sel.handles.push(m);
    }
    scaleHandles();
  }
  function scaleHandles() {
    if (!boxed()) return;
    for (const m of sel.handles) { const r = m.userData.handle.role, d = camera.position.distanceTo(m.position); m.scale.setScalar(Math.max(0.08, d * 0.016) * (r === 'move' || r === 'rotate' ? 1.3 : r === 'corner' ? 0.75 : r === 'vertex' ? 0.8 : 1)); }
  }
  function handleAt(e) {
    if (!boxed()) return null;
    const r = canvas.getBoundingClientRect(); let best = null;
    for (const m of sel.handles) {
      const q = m.position.clone().project(camera); if (q.z > 1) continue;
      const d = Math.hypot(r.left + ((q.x + 1) / 2) * r.width - e.clientX, r.top + ((1 - q.y) / 2) * r.height - e.clientY);
      const pri = m.userData.handle.role === 'vertex' ? d - 10 : d; // un vertice sopra l'angolo della scatola vince: si sceglie il suo raggio
      if (d < HANDLE_PX && (!best || pri < best.d)) best = { m, d: pri };
    }
    if (!best && rotOn() && sel.ring) { // anche l'anello si trascina, non solo la sua maniglia
      for (const w of sel.ring.pts) {
        const q = w.clone().project(camera); if (q.z > 1) continue;
        if (Math.hypot(r.left + ((q.x + 1) / 2) * r.width - e.clientX, r.top + ((1 - q.y) / 2) * r.height - e.clientY) < HANDLE_PX * 0.75) return sel.handles.find((m) => m.userData.handle.role === 'rotate') || null;
      }
    }
    return best ? best.m : null;
  }
  const dims = (b) => `${round(b.u1 - b.u0)} × ${round(b.v1 - b.v0)} × ${round(b.h1 - b.h0)} m · u ${b.u0} → ${b.u1} · v ${b.v0} → ${b.v1} · h ${b.h0} → ${b.h1}`;
  const overrideOf = () => sel && overrides.find((o) => o.id === (sel.type === 'item' ? docId(sel.it.key) : primId(sel.p)));
  /* ---------- modo Ruota ---------- */
  // «⤡ Sposta» (maniglie della scatola) / «⟳ Ruota» (anello con maniglia): selettore a due stati per l'oggetto selezionato.
  // 'angolo': solidi e oggetti del catalogo (anello libero, campo `angolo`); 'orienta': totem e panchine, dove Ruota alterna u↔v;
  // null: tutto il resto (nessuna rotazione libera inventata).
  // 'angolo': oggetti con un campo angolo (gradi attorno al perno) letto dal costruttore; 'vertici': poligoni (marciapiedi, aiuole, aree, terrazze,
  // ringhiere), che si ruotano girando i vertici attorno al centro della scatola; 'orienta': alterna u↔v; null: non si ruota
  // (edifici, terreno, porte e portoni che restano attaccati al muro, scale antincendio, alberi del rilievo, parti di un altro oggetto)
  const ROT_STEP = 5, ROT_SNAP = 4, NO_TURN = 'Questo oggetto non si ruota: edifici, terreno, scale antincendio, alberi del rilievo e parti di un altro oggetto restano come sono.';
  const NO_TURN_PARETE = 'Le porte restano attaccate alla parete: si orientano da sole, parallele al muro più vicino, mentre le sposti (Ruota le staccherebbe dal muro).';
  const noTurnMsg = () => (sel && sel.type === 'item' && sel.it.vincolo === 'parete' ? NO_TURN_PARETE : NO_TURN);
  function turnKind() {
    if (!sel || sel.type !== 'item') return null;
    const it = sel.it;
    if (it.vincolo === 'parete') return null;
    if (it.primitiva) { const pr = it.obj; if (pr.box && TURNABLE.includes(pr.forma)) return 'angolo'; return it.verts ? 'vertici' : null; }
    if (it.angKey) return 'angolo';
    if (it.verts) return 'vertici';
    return it.fields.includes('orienta') ? 'orienta' : null;
  }
  const rotOn = () => !!(sel && sel.rot && ['angolo', 'vertici'].includes(turnKind()));
  function toggleRot() {
    if (!sel || drag) return;
    const kind = turnKind();
    if (!kind) { hint(noTurnMsg()); return; }
    if (kind === 'orienta') { // lungo u ↔ lungo v, salvato come gli altri campi
      const o = sel.it.obj; o.orienta = o.orienta === 'v' ? 'u' : 'v';
      saveItem(sel.it); rebuild(sel.it.sorgente); hint('Orientamento: lato lungo ' + (o.orienta === 'v' ? 'lungo il vialetto (v)' : 'lungo u') + '.'); return;
    }
    sel.rot = !sel.rot; sel.tool = null; drawSel(); infoCard();
    hint(sel.rot ? 'Ruota: trascina la maniglia sull’anello (passo 5°, Alt sospende l’aggancio). R o «⤡ Sposta» tornano alle maniglie.' : '');
  }
  function modeSwitch() {
    const kind = turnKind(), row = el('div', 'ed-row ed-seg'), rot = rotOn();
    const mv = button('⤡ Sposta', () => { if (rotOn()) toggleRot(); }), rt = button('⟳ Ruota', toggleRot);
    mv.setAttribute('aria-pressed', String(!rot)); rt.setAttribute('aria-pressed', String(rot));
    if (!kind) { rt.classList.add('ed-off'); rt.setAttribute('aria-disabled', 'true'); rt.title = noTurnMsg(); }
    else if (kind === 'orienta') rt.title = 'Alterna l’orientamento (lungo u / lungo v)';
    row.append(mv, rt); return row;
  }
  // aggancio magnetico dell'angolo grezzo (gradi): 0/90/180/270° e gli angoli, a passi di 90°, dei solidi vicini già ruotati
  function turnMagnet(raw, r) {
    if (magnetOff || touches.size > 1) return null;
    if (!r.near) {
      r.near = [];
      for (const it of liveItems()) {
        if (it.key === sel.it.key || !it.primitiva || it.gone() || it.frameKey !== sel.it.frameKey || !angleOf(it.obj)) continue;
        let nb = null; try { nb = it.box(); } catch (_) { /* scatola non calcolabile */ }
        if (nb && Math.hypot(mid(nb, 'u') - r.um, mid(nb, 'v') - r.vm) <= MAG_RANGE) r.near.push({ a: angleOf(it.obj), label: it.label });
      }
    }
    let best = null;
    const test = (a, text) => { const d = ((((a - raw) % 360) + 540) % 360) - 180; if (Math.abs(d) <= ROT_SNAP && (!best || Math.abs(d) < best.d)) best = { a: raw + d, d: Math.abs(d), text }; };
    for (let k = 0; k < 4; k += 1) test(k * 90, k * 90 + '°');
    for (const n of r.near) for (let k = 0; k < 4; k += 1) test(n.a + k * 90, 'come ' + n.label);
    return best;
  }
  function rotMove(e) {
    const p = new T.Vector3(); if (!rayFrom(e).ray.intersectPlane(drag.plane, p)) return;
    const r = drag.rot, q = toLocal(r.fb, p), pr = sel.it.obj;
    const raw = r.a0 + ((Math.atan2(q.v - r.vm, q.u - r.um) - r.ang0) * 180) / Math.PI, hit = turnMagnet(raw, r);
    const a = ((Math.round(hit ? hit.a : Math.round(raw / ROT_STEP) * ROT_STEP) % 360) + 360) % 360;
    if (r.vts0) { // poligoni: ruotano i vertici dal valore di partenza, attorno al centro della scatola
      const rad = (a * Math.PI) / 180, co = Math.cos(rad), si = Math.sin(rad);
      sel.it.verts.set(r.vts0.map((pt) => { const du = pt[0] - r.um, dv = pt[1] - r.vm, o = [round(r.um + du * co - dv * si), round(r.vm + du * si + dv * co)]; return pt.length > 2 ? o.concat(pt.slice(2)) : o; }));
      r.cur = a; sel.vAng = a; sel.box = selBox();
      if (!slideTimer) slideTimer = setTimeout(() => { slideTimer = 0; rebuild(sel.it.sorgente); }, 90);
      drawSel(); hint(`Rotazione ${a}°` + (hit ? ' · ' + hit.text : '')); return;
    }
    r.cur = a; setAngItem(sel.it, a); sel.frameKey
    if (!slideTimer) slideTimer = setTimeout(() => { slideTimer = 0; rebuild(sel.it.sorgente); }, 90); // l'oggetto gira mentre trascini, come col cursore
    drawSel();
    hint(`Rotazione ${a}°` + (hit ? ' · ' + hit.text + ' (Alt sospende l’aggancio)' : ''));
  }
  // cursore in metri: durante il trascinamento ricostruisce senza ridisegnare la scheda, al rilascio salva
  function slider(label, value, max, onInput) {
    const l = el('label'), r = el('input'); r.type = 'range'; r.min = '0'; r.max = String(max); r.step = '0.05'; r.value = String(value);
    const show = () => { l.textContent = `${label}: ${Number(r.value).toFixed(2)} m`; }; show();
    r.addEventListener('input', () => { sliding = true; show(); onInput(Number(r.value)); if (!slideTimer) slideTimer = setTimeout(() => { slideTimer = 0; rebuild('aggiunta'); }, 90); });
    r.addEventListener('change', () => { sliding = false; clearTimeout(slideTimer); slideTimer = 0; if (sel && sel.type === 'item') { saveItem(sel.it); rebuild('aggiunta'); } });
    return [l, r];
  }
  // cursore «Rotazione» 0–355° (passo 5°): gira il solido attorno al centro della scatola (positivo = antiorario visto dall'alto);
  // come gli altri cursori ricostruisce mentre lo trascini e salva al rilascio
  function angleSlider(pr) {
    const l = el('label'), r = el('input'); r.type = 'range'; r.min = '0'; r.max = '355'; r.step = '5'; r.value = String(angleOf(pr));
    const show = () => { l.textContent = `Rotazione: ${Number(r.value)}°`; }; show();
    r.addEventListener('input', () => { sliding = true; show(); pr.angolo = Number(r.value); if (!slideTimer) slideTimer = setTimeout(() => { slideTimer = 0; rebuild('aggiunta'); }, 90); });
    r.addEventListener('change', () => { sliding = false; clearTimeout(slideTimer); slideTimer = 0; if (sel && sel.type === 'item') { saveItem(sel.it); rebuild('aggiunta'); } });
    return [l, r];
  }
  // scatola con le misure naturali dell'oggetto (e la sua rotazione), stesso centro e stessa base
  function fitNatural(pr) {
    const m = C.esterni.misura(pr.modello, Number(pr.ruota) || 0) || { du: 1, dv: 1, dh: 1 }, b = pr.box, cu = (b.u0 + b.u1) / 2, cv = (b.v0 + b.v1) / 2;
    pr.box = roundBox({ u0: cu - m.du / 2, u1: cu + m.du / 2, v0: cv - m.dv / 2, v1: cv + m.dv / 2, h0: b.h0, h1: b.h0 + m.dh });
  }
  function turn90(pr) {
    const b = pr.box, cu = (b.u0 + b.u1) / 2, cv = (b.v0 + b.v1) / 2, du = b.u1 - b.u0, dv = b.v1 - b.v0;
    pr.ruota = ((Number(pr.ruota) || 0) + 90) % 360;
    pr.box = roundBox({ u0: cu - dv / 2, u1: cu + dv / 2, v0: cv - du / 2, v1: cv + du / 2, h0: b.h0, h1: b.h1 });
  }
  // «Ruota di 90°» dei solidi (parallelepipedi, cilindri, sfere): aumenta l'angolo libero, la scatola resta com'è e gira con l'oggetto
  function turnFree(pr) { pr.angolo = (angleOf(pr) + 90) % 360; }
  // cartelli del totem: codice («CU» resta in grassetto), testi del cartello con la formattazione fissa di ogni voce
  // (vuoto: la voce sparisce), spunta del logo del museo. Si salva all'uscita dal campo, non a ogni tasto.
  const TOTEM_VOCI = [['nome', 'Nome dell’edificio (grassetto, grande, nero)', true], ['facolta', 'Facoltà (piccolo, grassetto, rosso)'],
    ['dipartimento', 'Dipartimento (normale, nero)'], ['aula', 'Aula (sottile, rosso, con il segnaposto)'], ['polo', 'Polo museale (piccolo, grassetto, rosso)'],
    ['museo', 'Museo (normale, nero)', true]];
  function totemFields(obj, change) {
    const nodes = [], code = el('input'); code.type = 'text'; code.maxLength = 12; code.value = obj.scritta != null ? obj.scritta : 'CU014';
    code.addEventListener('change', () => change('scritta', code.value.trim().toUpperCase()));
    nodes.push(el('label', '', 'Codice dell’edificio (es. CU014)'), code);
    const base = C.esterni.totemCartello || {}, cur = () => Object.assign({}, base, obj.cartello || {});
    for (const [k, lbl, multi] of TOTEM_VOCI) {
      const inp = el(multi ? 'textarea' : 'input'); if (!multi) inp.type = 'text'; else inp.style.minHeight = '56px';
      inp.value = cur()[k] || '';
      inp.addEventListener('change', () => { const c = cur(); c[k] = multi ? inp.value.replace(/\r/g, '') : inp.value.trim(); change('cartello', c); });
      nodes.push(el('label', '', lbl + (multi ? ' · Invio va a capo' : '')), inp);
    }
    const lab = el('label', 'ed-check'), box = el('input'); box.type = 'checkbox'; box.checked = obj.logoMuseo !== false;
    box.addEventListener('change', () => change('logoMuseo', box.checked));
    lab.append(box, document.createTextNode(' Logo «m» del museo accanto al Polo museale')); nodes.push(lab);
    return nodes;
  }
  function infoCard() {
    if (!sel || !cardWanted()) return;
    const title = sel.type === 'item' ? sel.it.label : `Pezzo: ${describe(sel.p.mesh)}`;
    const nodes = [el('h3', '', title), ...(sel.type === 'item' ? [modeSwitch()] : []), el('p', 'ed-meta', dims(sel.box)),
      rotOn() ? el('p', 'ed-meta', 'Modo Ruota: trascina la maniglia (o l’anello) per girare l’oggetto, passo 5° con aggancio a 0/90/180/270° e agli oggetti vicini; Alt lo sospende. R torna a Sposta.') : el('p', 'ed-meta', 'Facce: un lato · angoli: due lati · rossa in alto: sposta' + (sel.type === 'item' && sel.it.verts ? ' · gialle: vertici' : '') + (sel.type === 'item' && sel.it.lock.h0 ? ' · la base resta ferma' : '') + '.')];
    const row = el('div', 'ed-row');
    if (sel.alt) { const alt = sel.alt, back = sel.type === 'item' ? { type: 'item', it: sel.it } : { type: 'prim', p: sel.p }; row.append(button(alt.type === 'prim' ? 'Solo questo pezzo' : 'Oggetto intero', () => select(Object.assign({}, alt, { alt: back })))); }
    if (sel.type === 'item' && sel.it.primitiva) {
      const pr = sel.it.obj, pick = (lbl, opts, val, fn) => { const l = el('label', '', lbl), sl = el('select'); for (const [k, t] of opts) { const o = el('option', '', t); o.value = k; o.selected = k === val; sl.append(o); } sl.addEventListener('change', () => fn(sl.value)); return [l, sl]; };
      const change = (k, v) => { pr[k] = v; saveItem(sel.it); rebuild('aggiunta'); };
      const tool = (k, label) => { const b = button(label, () => { sel.tool = sel.tool === k ? null : k; infoCard(); hint(sel.tool ? TOOL_HINT[k] : ''); }); b.setAttribute('aria-pressed', String(sel.tool === k)); return b; };
      const redo = (fn) => () => { fn(pr); saveItem(sel.it); rebuild('aggiunta'); };
      if (pr.forma === 'oggetto') {
        nodes.push(...pick('Oggetto', C.esterni.catalogo, pr.modello, (v) => { pr.modello = v; if (v === 'totem' || v === 'scritta') pr.scritta = v === 'totem' ? 'CU014' : 'ISTITUTO'; redo(fitNatural)(); }));
        if (pr.modello === 'totem') nodes.push(...totemFields(pr, (k, v) => change(k, v)));
        if (pr.modello === 'scritta') {
          const inp = el('input'); inp.type = 'text'; inp.maxLength = 24; inp.value = pr.scritta != null ? pr.scritta : 'ISTITUTO';
          inp.addEventListener('change', () => change('scritta', inp.value.trim()));
          nodes.push(el('label', '', 'Testo della scritta'), inp);
        }
        const wall = A_PARETE.includes(pr.modello), r2 = el('div', 'ed-row'); // le porte restano parallele al muro: niente rotazione a mano
        if (!wall) r2.append(button('Ruota di 90°', redo(turn90)));
        r2.append(button('Misure originali', redo(fitNatural))); nodes.push(r2);
        if (wall) nodes.push(el('p', 'ed-meta', 'Porta: poggiata al suolo e attaccata alla parete più vicina (entro 1 m), con la faccia posteriore a filo del muro e parallela ad esso; si orienta da sola quando la sposti.'));
        else nodes.push(...angleSlider(pr)); // angolo libero oltre ai 90° di «ruota»
        const mr = el('div', 'ed-row'); mr.append(mirrorButton('Specchia ↔', 'u'), mirrorButton('Specchia ↕', 'v')); nodes.push(mr);
      } else if (pr.forma === 'aiuola') {
        nodes.push(...pick('Forma dell’aiuola', Object.entries(TIPI_AIUOLA), pr.tipo || 'squadrata', (v) => { reshapeBed(pr, v); saveItem(sel.it); rebuild('aggiunta'); }));
        nodes.push(...pick('Terreno', Object.entries(TERRENI), pr.terreno || 'prato', (v) => change('terreno', v)));
      } else if (pr.forma !== 'marciapiede') {
        nodes.push(...pick('Forma', [['box', FORME.box], ['cilindro', FORME.cilindro], ['sfera', FORME.sfera]], pr.forma || 'box', (v) => change('forma', v)));
        nodes.push(...pick('Materiale', C.esterni.materiali.map((m) => [m, m]), pr.materiale || 'travertino', (v) => change('materiale', v)));
        const r3 = el('div', 'ed-row'); r3.append(button('Ruota di 90°', redo(turnFree))); nodes.push(r3, ...angleSlider(pr));
      }
      if (sel.it.verts) { // raggio degli angoli arrotondati: tutti insieme o solo quello scelto toccando la sua maniglia gialla
        const P = pr.poligono, all = pr.raggio != null ? Number(pr.raggio) : pr.forma === 'marciapiede' ? 0.3 : 0;
        nodes.push(...slider('Raggio di tutti gli angoli', all, 3, (v) => { pr.raggio = v; delete pr.raggi; }));
        if (sel.corner != null && sel.corner < P.length) {
          const own = Array.isArray(pr.raggi) ? pr.raggi[sel.corner] : null;
          nodes.push(...slider(`Raggio dell’angolo ${sel.corner + 1} (maniglia blu)`, own != null ? own : all, 3, (v) => {
            if (!Array.isArray(pr.raggi) || pr.raggi.length !== P.length) pr.raggi = P.map((_, i) => (Array.isArray(pr.raggi) && pr.raggi[i] != null ? pr.raggi[i] : null));
            pr.raggi[sel.corner] = v;
          }));
        } else nodes.push(el('p', 'ed-meta', 'Tocca una maniglia gialla (senza trascinarla) per cambiare il raggio di un solo angolo.'));
        const mr = el('div', 'ed-row'); mr.append(mirrorButton('Specchia ↔', 'u'), mirrorButton('Specchia ↕', 'v')); nodes.push(mr);
        const tr = el('div', 'ed-row');
        if (pr.forma === 'marciapiede') tr.append(tool('discesa', 'Discese'));
        tr.append(tool('angolo+', 'Aggiungi angolo'), tool('angolo-', 'Togli angolo'));
        nodes.push(tr);
      }
    }
    if (sel.type === 'item' && sel.it.totem) { const it = sel.it; nodes.push(...totemFields(it.obj, (k, v) => { it.obj[k] = v; saveItem(it); rebuild(it.sorgente); })); }
    if (overrideOf()) row.append(button(sel.type === 'item' && !baseValue(sel.it) ? 'Annulla aggiunta' : 'Ripristina originale', restore));
    if (sel.type === 'item' && !['pavimento', 'portico'].includes(sel.it.percorso)) row.append(button('Duplica', duplicateSel));
    if (sel.type === 'item' && sel.it.remove) row.append(button('Elimina', removeSel));
    if (sel.type === 'prim') row.append(button('Elimina', removePrim));
    row.append(button('Fine', () => deselect(), true));
    nodes.push(row); openCard(nodes, 'dock');
  }
  // «Specchia»: poligoni (marciapiedi, aiuole) → vertici, raggi e discese specchiati rispetto al centro della scatola; oggetti del catalogo → campo
  // `specchio` ('u', 'v' o 'uv': scala −1 sull'asse, il costruttore la applica con le normali corrette)
  function mirrorPoly(pr, ax) {
    const P = pr.poligono, b = bboxPts(P), n = P.length, i = ax === 'u' ? 0 : 1, c = ax === 'u' ? b.u0 + b.u1 : b.v0 + b.v1;
    pr.poligono = P.map((q) => { const o = q.slice(); o[i] = round(c - q[i]); return o; }).reverse(); // l'ordine si inverte per tenere il verso del contorno
    if (Array.isArray(pr.raggi)) pr.raggi = pr.raggi.slice().reverse();
    if (Array.isArray(pr.discese)) pr.discese = pr.discese.map((d) => Object.assign({}, d, { lato: (2 * n - 2 - d.lato) % n, t: round(1 - d.t) })); // il lato k diventa n−2−k, percorso al contrario
  }
  const mirrorButton = (label, ax) => button(label, () => {
    const it = sel.it, pr = it.obj;
    if (pr.forma === 'oggetto') { const m = String(pr.specchio || ''), has = m.includes(ax), next = (has ? m.replace(ax, '') : m + ax).split('').sort().join(''); if (next) pr.specchio = next; else delete pr.specchio; } // 'uv' in ordine fisso
    else mirrorPoly(pr, ax);
    saveItem(it); rebuild(it.sorgente); hint('Specchiato ' + (ax === 'u' ? 'lungo u (↔)' : 'lungo v (↕)') + '.');
  });
  const TOOL_HINT = { discesa: 'Tocca un lato del marciapiede dove mettere la discesa verso la strada; tocca una discesa per toglierla.', 'angolo+': 'Tocca un lato: lì nasce un nuovo angolo, poi trascina la sua maniglia gialla.', 'angolo-': 'Tocca un angolo (maniglia gialla) per toglierlo.' };
  const segParam = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((q.u - a[0]) * dx + (q.v - a[1]) * dy) / L)); return { t, d: Math.hypot(q.u - a[0] - t * dx, q.v - a[1] - t * dy) }; };
  function nearestEdge(P, q) { let best = null; P.forEach((a, i) => { const r = segParam(q, a, P[(i + 1) % P.length]); if (!best || r.d < best.d) best = { i, t: r.t, d: r.d }; }); return best; }
  // aiuola: squadrata, rotonda (ellisse nella scatola) o con angoli spezzati (smussi di 1/5 del lato corto)
  function reshapeBed(pr, tipo) {
    const b = pr.tipo === 'rotonda' ? pr.box : { ...bboxPts(pr.poligono), h0: Number(pr.base) || 0, h1: (Number(pr.base) || 0) + (Number(pr.altezza) || 0.3) };
    pr.tipo = tipo; delete pr.raggi; // nuovi vertici: i raggi per angolo non valgono più
    if (tipo === 'rotonda') { pr.box = roundBox(b); delete pr.poligono; return; }
    const c = round(Math.min(b.u1 - b.u0, b.v1 - b.v0) / 5);
    pr.poligono = tipo === 'spezzata'
      ? [[b.u0 + c, b.v0], [b.u1 - c, b.v0], [b.u1, b.v0 + c], [b.u1, b.v1 - c], [b.u1 - c, b.v1], [b.u0 + c, b.v1], [b.u0, b.v1 - c], [b.u0, b.v0 + c]].map(([u, v]) => [round(u), round(v)])
      : [[b.u0, b.v0], [b.u1, b.v0], [b.u1, b.v1], [b.u0, b.v1]];
    pr.base = round(b.h0); pr.altezza = round(Math.max(0.05, b.h1 - b.h0)); delete pr.box;
  }
  function itemTool(hit) {
    const pr = sel.it.obj, P = pr.poligono, q = toLocal(frameBy('lato0'), hit.point);
    if (!Array.isArray(P)) return;
    if (sel.tool === 'angolo+') {
      const e = nearestEdge(P, q), a = P[e.i], b = P[(e.i + 1) % P.length];
      P.splice(e.i + 1, 0, [round(a[0] + (b[0] - a[0]) * e.t), round(a[1] + (b[1] - a[1]) * e.t)]);
      if (Array.isArray(pr.raggi)) pr.raggi.splice(e.i + 1, 0, null);
      sel.corner = null;
      for (const d of pr.discese || []) { if (d.lato > e.i) d.lato += 1; else if (d.lato === e.i) { if (d.t > e.t) { d.lato += 1; d.t = round((d.t - e.t) / (1 - e.t || 1)); } else d.t = round(d.t / (e.t || 1)); } }
      hint('Angolo aggiunto: trascina la nuova maniglia gialla.');
    } else if (sel.tool === 'angolo-') {
      let k = -1, best = 1.2; P.forEach((p, i) => { const d = Math.hypot(p[0] - q.u, p[1] - q.v); if (d < best) { best = d; k = i; } });
      if (k < 0) { hint('Tocca più vicino a un angolo.'); return; }
      if (P.length <= 3) { hint('Servono almeno tre angoli.'); return; }
      P.splice(k, 1);
      if (Array.isArray(pr.raggi)) pr.raggi.splice(k, 1);
      sel.corner = null;
      const n = P.length + 1;
      pr.discese = (pr.discese || []).filter((d) => d.lato !== k && d.lato !== (k - 1 + n) % n).map((d) => Object.assign(d, { lato: d.lato > k ? d.lato - 1 : d.lato }));
      hint('Angolo tolto.');
    } else if (sel.tool === 'discesa') {
      const e = nearestEdge(P, q), list = pr.discese || (pr.discese = []);
      const a = P[e.i], b = P[(e.i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = list.findIndex((d) => d.lato === e.i && Math.abs(d.t - e.t) * L < 1);
      if (k >= 0) { list.splice(k, 1); hint('Discesa tolta.'); } else { list.push({ lato: e.i, t: round(e.t), larghezza: 1.4, profondita: 0.9 }); hint('Discesa aggiunta verso la strada.'); }
    }
    saveItem(sel.it); rebuild('aggiunta');
  }
  // «Duplica»: una copia accanto all'originale (spostata della sua larghezza più 50 cm), come oggetto aggiunto nella stessa
  // cornice; gli oggetti del modello diventano la voce del catalogo corrispondente, le aiuole aiuole, il resto travertino
  const COPIE = [[/\.panchine\.\d+$/, 'panchina'], [/\.palme\.\d+$/, 'palma'], [/\.totem\.\d+$/, 'totem'], [/\.rastrelliera$/, 'rastrelliera'], [/\.porta$/, 'portone'], [/\.fiori$/, 'fiori'],
    [/\.ringhiere\.\d+$/, 'ringhiera'], [/^magnolie\.\d+$/, 'magnolia'], [/^serbatoio$/, 'silos'], [/^gabbia$/, 'gabbia'], [/^tombini\.\d+$/, 'tombino'], [/^transenne\.\d+$/, 'transenna']];
  function copyOf(it, b, shift) {
    const P = it.percorso, e = it.obj;
    if (it.sorgente === 'aggiunta') {
      const pr = clone(e); // porta con sé anche angolo e ruota
      if (pr.box) pr.box = { ...pr.box, u0: round(pr.box.u0 + shift), u1: round(pr.box.u1 + shift) };
      if (Array.isArray(pr.poligono)) pr.poligono = pr.poligono.map(([u, v]) => [round(u + shift), v]);
      return pr;
    }
    const model = (COPIE.find(([re]) => re.test(P)) || [])[1] || (it.sorgente === 'esterni' && /^elementi\.\d+$/.test(P) && ['scala', 'palo', 'lampione', 'pergolato'].includes(e.tipo) ? e.tipo : null);
    if (model) {
      const m = C.esterni.misura(model, 0), turn = !!m && (m.du > m.dv) !== (b.u1 - b.u0 > b.v1 - b.v0); // orientata come l'originale
      const pr = { forma: 'oggetto', modello: model, ruota: turn ? 90 : 0, box: b };
      if (model === 'totem') pr.scritta = e.scritta != null ? e.scritta : 'CU014';
      if (model === 'totem') { if (e.cartello) pr.cartello = clone(e.cartello); if (e.logoMuseo === false) pr.logoMuseo = false; }
      return pr;
    }
    if (/aiuole\.\d+$|\.prato$/.test(P)) return { forma: 'aiuola', tipo: 'squadrata', terreno: it.sorgente === 'cortile' ? 'foglie' : 'prato', cordolo: 0.16, poligono: [[b.u0, b.v0], [b.u1, b.v0], [b.u1, b.v1], [b.u0, b.v1]], base: b.h0, altezza: round(Math.max(0.1, b.h1 - b.h0)) };
    return { forma: 'box', materiale: it.sorgente === 'cortile' ? 'travertino a lastre' : 'travertino', box: b };
  }
  function duplicateSel() {
    const it = sel.it, b = roundBox(it.box()), ang = it.primitiva ? (angleOf(it.obj) * Math.PI) / 180 : 0, shift = round(Math.abs((b.u1 - b.u0) * Math.cos(ang)) + Math.abs((b.v1 - b.v0) * Math.sin(ang)) + 0.5), done = (n) => { if (!n) return; saveItem(n); select({ type: 'item', it: n }); hint('Copia creata accanto all’originale: spostala con la maniglia rossa.'); };
    if (it.sorgente === 'albero') {
      const t = it.obj, f = frameBy('lato0'), q = toLocal(f, C.project(t.p)), ll = C.toLonLat(toWorld(f, q.u + shift, q.v, 0));
      const copy = { id: newId('n'), p: [Number(ll[0].toFixed(7)), Number(ll[1].toFixed(7))], r: t.r, g: t.g || null, nuovo: true };
      C.alberi.list.push(copy); C.alberi.rebuild(); done(findItem('albero:' + copy.id));
      return;
    }
    const pr = Object.assign(copyOf(it, { ...b, u0: round(b.u0 + shift), u1: round(b.u1 + shift) }, shift), { id: newId('p') });
    delete pr.rimosso;
    if (it.frameKey === 'lato0') delete pr.cornice; else pr.cornice = it.frameKey;
    const E = C.esterni.cfg; (E.primitive = E.primitive || []).push(pr);
    rebuild('aggiunta'); done(findItem('aggiunta:' + pr.id));
  }
  // elimina l'oggetto selezionato (resta nel file con rimosso: true) e offre di annullare
  function removeSel() {
    const it = sel.it, prev = it.get();
    it.remove(); saveItem(it); rebuild(it.sorgente); deselect();
    removed = { it, prev };
    openCard([el('h3', '', 'Eliminato: ' + it.label), el('p', 'ed-meta', 'Resta nel file come "rimosso": Claude lo toglie anche dai dati.'),
      (() => { const r = el('div', 'ed-row'); r.append(button('Annulla', () => { const x = removed; removed = null; if (!x) return; x.it.set(x.prev); saveItem(x.it); rebuild(x.it.sorgente); closeCard(); }), button('Chiudi', closeCard, true)); return r; })()], 'dock');
  }

  // elimina il pezzo selezionato (documento prim:… con rimosso: true) e offre di annullare
  function removePrim() {
    const p = sel.p, id = primId(p), label = 'Pezzo: ' + describe(p.mesh), orig = sel.orig, box = clone(sel.box);
    primRemove(p); primsFromDb.set(id, p); deselect();
    saveDoc(id, { sorgente: 'primitiva', percorso: p.path, istanza: p.inst, cornice: p.frameKey, oggetto: 'pezzo di ' + describe(p.mesh), tipo: 'primitiva', originale: orig, valore: box, rimosso: true, stato: 'da applicare', autore: myId, aggiornato: new Date().toISOString() });
    openCard([el('h3', '', 'Eliminato: ' + label), el('p', 'ed-meta', 'Resta nel file come "rimosso": Claude lo toglie anche dai dati.'),
      (() => { const r = el('div', 'ed-row'); r.append(button('Annulla', () => { primRestore(p); primsFromDb.delete(id); dropDoc(id); closeCard(); }), button('Chiudi', closeCard, true)); return r; })()], 'dock');
  }

  /* ---------- trascinamento ---------- */
  function startDrag(m, e) {
    const h = m.userData.handle, wp = m.position.clone(), baseMove = h.role === 'move' && sel.type === 'item' && sel.it.vincolo === 'parete', f = frameBy(baseMove ? frameBaseOfItem(sel.it) : sel.frameKey);
    let plane;
    if (h.role === 'rotate') { // l'angolo segue il puntatore proiettato sul piano orizzontale dell'anello, a partire da dove lo si afferra
      const pr = sel.it.obj, fb = frameBy(frameBaseOfItem(sel.it)), b = sel.box, p0 = new T.Vector3(), vert = turnKind() === 'vertici';
      plane = new T.Plane(new T.Vector3(0, 1, 0), -wp.y); if (!fb || !rayFrom(e).ray.intersectPlane(plane, p0)) return false;
      const [um, vm] = ringCentre(sel.it, b), q = toLocal(fb, p0);
      drag = { h, plane, box0: clone(b), pointerId: e.pointerId, rot: { fb, um, vm, ang0: Math.atan2(q.v - vm, q.u - um), a0: vert ? 0 : angOfItem(sel.it), cur: vert ? 0 : angOfItem(sel.it), raw0: vert ? undefined : sel.it.primitiva ? pr.angolo : pr[sel.it.angKey], vts0: vert ? clone(sel.it.verts.get()) : null } };
      if (vert) sel.vAng = 0;
      return true;
    }
    if (h.role === 'face' && h.axis === 'h') { const dir = new T.Vector3(); camera.getWorldDirection(dir); dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); plane = new T.Plane().setFromNormalAndCoplanarPoint(dir.normalize(), wp); }
    else plane = new T.Plane(new T.Vector3(0, 1, 0), -wp.y);
    const p0 = new T.Vector3(); if (!rayFrom(e).ray.intersectPlane(plane, p0)) return false;
    drag = { h, plane, q0: toLocal(f, p0), box0: clone(sel.box), verts: sel.type === 'item' && sel.it.verts ? clone(sel.it.verts.get()) : null, pointerId: e.pointerId, baseMove, pv: sel.type === 'item' && sel.it.vincolo && !sel.it.primitiva ? pivotOf(sel.it) : null };
    return true;
  }
  function moveDrag(e) {
    if (drag.h.role === 'rotate') { rotMove(e); return; }
    const p = new T.Vector3(); if (!rayFrom(e).ray.intersectPlane(drag.plane, p)) return;
    const q = toLocal(frameBy(drag.baseMove ? frameBaseOfItem(sel.it) : sel.frameKey), p), d = { u: q.u - drag.q0.u, v: q.v - drag.q0.v, h: q.h - drag.q0.h }, h = drag.h, b = clone(drag.box0);
    const setSide = (ax, s) => { const k = ax + s, val = snap(drag.box0[k] + d[ax]); b[k] = s === '0' ? Math.min(val, b[ax + '1'] - MIN) : Math.max(val, b[ax + '0'] + MIN); };
    if (h.role === 'face') setSide(h.axis, h.side);
    else if (h.role === 'corner') { setSide('u', h.u); setSide('v', h.v); }
    else if (h.role === 'move') { const du = snap(d.u), dv = snap(d.v); b.u0 += du; b.u1 += du; b.v0 += dv; b.v1 += dv; }
    else if (h.role === 'vertex') { drag.vNew = clone(drag.verts); drag.vNew[h.k] = [round(snap(q.u)), round(snap(q.v))]; }
    if (drag.baseMove) { // porte e portoni: poggiati al suolo e attaccati al muro più vicino, con l'angolo preso dal muro
      const w = snapParete(b, drag.box0); drag.wall = w; sel.box = roundBox(w.box); sel.frameKey = 'tmp'; placeTmpFrame(w);
      drawSel(); drawGuides([]); hint(sel.it.label + ': ' + dims(sel.box) + (w.hit ? ` · attaccata al muro, ruotata di ${w.ang}°` : ' · nessun muro entro 1 m') + ' · poggiata a terra');
      return;
    }
    const vinc = sel.type === 'item' && sel.it.vincolo, caught = vinc ? [] : magnet(h, b); // con un vincolo niente calamita
    if (vinc) { const c = constrainBox(b); Object.assign(b, c); }
    sel.box = roundBox(b);
    if (sel.type === 'prim') primApply(sel.p, sel.orig, sel.box); // le primitive si deformano subito
    if (h.role === 'vertex') { const vb = bboxPts(drag.vNew); Object.assign(sel.box, roundBox({ ...vb, h0: b.h0, h1: b.h1 })); }
    drawSel(); drawGuides(caught);
    hint((sel.type === 'item' ? sel.it.label : 'Pezzo') + ': ' + dims(sel.box) + caught.map((g) => ' · ' + g.text).join('') + (caught.length ? ' (Alt sospende la calamita)' : ''));
  }
  /* ---------- vincoli: suolo, superficie sottostante, parete ---------- */
  // raggi verso la scena (senza gli strati dell'editor): solo superfici vere, non il guscio dell'oggetto che si sta muovendo né le chiome degli alberi
  const castTargets = () => scene.children.filter((o) => o !== fx && o !== pins && o !== patchGroup && o.visible);
  const okHit = (h) => { const o = h.object, mat = Array.isArray(o.material) ? o.material[(h.face && h.face.materialIndex) || 0] : o.material; return o.isMesh && !!h.face && shown(o) && !(mat && mat.visible === false); };
  function ownHit(o, box, fb) {
    for (let x = o; x; x = x.parent) { if (x.name === 'alberi') return true; if (sel.it.primitiva && x.userData && x.userData.primitiva === sel.it.obj.id) return true; }
    const bb = new T.Box3().setFromObject(o); if (bb.isEmpty()) return false;
    return inBox(box, toLocal(fb, bb.getCenter(new T.Vector3())), 0.05); // un pezzo con il centro dentro la scatola è dell'oggetto stesso
  }
  // quota (nella cornice fb) della prima superficie orizzontale sotto il punto (u, v), partendo da `from`
  function floorAt(fb, u, v, from, box) {
    const rc = new T.Raycaster(toWorld(fb, u, v, from), new T.Vector3(0, -1, 0), 0, 60);
    for (const h of rc.intersectObjects(castTargets(), true)) {
      if (!okHit(h) || ownHit(h.object, box, fb)) continue;
      if (h.face.normal.clone().transformDirection(h.object.matrixWorld).y < 0.5) continue; // solo piani quasi orizzontali
      return toLocal(fb, h.point).h;
    }
    return null;
  }
  // scatola vincolata, nella cornice della selezione: 'suolo' = base alla quota 0 della cornice (terreno / pavimento del cortile, mai sopra altri oggetti);
  // 'superficie' = base sulla superficie orizzontale sotto l'oggetto (a filo del pavimento), senza uscire dal piano orizzontale
  function constrainBox(b) {
    const it = sel.it, hh = b.h1 - b.h0, fb = frameBy(frameBaseOfItem(it)); if (!fb) return b;
    if (it.vincolo === 'suolo') return { ...b, h0: 0, h1: hh };
    if (it.vincolo === 'superficie') {
      const a = angOfItem(it), bb = a ? unturnBox(b, drag.box0, a, drag.pv || undefined) : b, cu = (bb.u0 + bb.u1) / 2, cv = (bb.v0 + bb.v1) / 2;
      const f = floorAt(fb, cu, cv, Math.max(drag.box0.h0, b.h0) + 0.6, { ...bb, h0: bb.h0 - 0.3, h1: bb.h1 + 0.3 });
      return f == null ? b : { ...b, h0: round(f), h1: round(f + hh) };
    }
    return b;
  }
  // porta o portone: base sulla superficie sotto, faccia posteriore a filo del muro più vicino (raggi orizzontali entro 1 m dal bordo), parallela al muro.
  // «Davanti» = +z locale dell'oggetto, cioè verso −v a angolo 0: l'angolo è quindi atan2(nu, −nv) con (nu, nv) la normale uscente dal muro.
  function snapParete(b, box0) {
    const it = sel.it, pr = it.obj, fb = frameBy(frameBaseOfItem(it)), odd = (((Number(pr.ruota) || 0) % 180) + 180) % 180 === 90;
    const w0 = (b.u1 - b.u0), d0 = (b.v1 - b.v0), sw = odd ? d0 : w0, sd = odd ? w0 : d0, hh = b.h1 - b.h0, cu = (b.u0 + b.u1) / 2, cv = (b.v0 + b.v1) / 2;
    const f = floorAt(fb, cu, cv, b.h0 + 0.6, { ...b, h0: b.h0 - 0.3, h1: b.h1 + 0.3 }), h0 = f == null ? b.h0 : f;
    const cur = angOfItem(it), out = { box: { u0: b.u0, u1: b.u1, v0: b.v0, v1: b.v1, h0, h1: h0 + hh }, ang: cur, hit: false };
    const selBx = { u0: cu - sw / 2 - 0.05, u1: cu + sw / 2 + 0.05, v0: cv - sd / 2 - 0.05, v1: cv + sd / 2 + 0.05, h0: h0 - 0.1, h1: h0 + hh + 0.1 };
    const o = toWorld(fb, cu, cv, h0 + 1), range = sd / 2 + 1, targets = castTargets();
    let best = null;
    for (let k = 0; k < 16; k += 1) {
      const dir = new T.Vector3(Math.cos((k * Math.PI) / 8), 0, Math.sin((k * Math.PI) / 8));
      for (const h of new T.Raycaster(o, dir, 0, range).intersectObjects(targets, true)) {
        if (!okHit(h) || ownHit(h.object, selBx, fb)) continue;
        const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
        if (Math.abs(n.y) > 0.35) continue; // solo pareti verticali
        if (n.dot(dir) > 0) n.negate();
        if (!best || h.distance < best.d) best = { d: h.distance, n, pt: h.point };
        break;
      }
    }
    if (!best) return out;
    const nl = fb.worldToLocal(o.clone().add(best.n)).sub(fb.worldToLocal(o.clone())), L = Math.hypot(nl.x, nl.z) || 1, nu = nl.x / L, nv = -nl.z / L;
    const W = toLocal(fb, best.pt), c0 = W.u + nu * (sd / 2), c1 = W.v + nv * (sd / 2); // centro: faccia posteriore a filo del muro
    out.ang = normAng(Math.round((Math.atan2(nu, -nv) * 180) / Math.PI * 2) / 2); out.hit = true;
    out.box = { u0: c0 - sw / 2, u1: c0 + sw / 2, v0: c1 - sd / 2, v1: c1 + sd / 2, h0, h1: h0 + hh };
    return out;
  }
  // cornice provvisoria durante lo spostamento di una porta: ruotata dell'angolo del muro agganciato attorno al centro della scatola
  function placeTmpFrame(w) {
    const base = frameBy(frameBaseOfItem(sel.it)); if (!base) return;
    if (!tmpFrame || tmpFrame.parent !== base) { if (tmpFrame && tmpFrame.parent) tmpFrame.parent.remove(tmpFrame); tmpFrame = new T.Object3D(); tmpFrame.name = 'ed-tmp'; base.add(tmpFrame); }
    const rad = (w.ang * Math.PI) / 180, c = new T.Vector3((w.box.u0 + w.box.u1) / 2, 0, -(w.box.v0 + w.box.v1) / 2);
    tmpFrame.rotation.set(0, rad, 0); tmpFrame.position.copy(c).sub(c.clone().applyAxisAngle(new T.Vector3(0, 1, 0), rad)); tmpFrame.updateMatrix();
  }
  /* ---------- calamita: allineamenti e proporzioni con gli oggetti vicini ---------- */
  // Mentre si sposta o si ridimensiona una scatola, bordi, centro e quota si agganciano a quelli degli oggetti vicini
  // (entro 15 m, stessa cornice); le misure a quelle di un vicino o ai rapporti 1:1 e 1:2 fra i lati della scatola; la
  // posizione alla stessa spaziatura di due vicini in fila. Mentre aggancia, una linea guida colorata attraversa gli oggetti.
  // Alt (da computer) o un secondo dito sullo schermo la sospendono.
  const MAG_RANGE = 15, GUIDE_COLOR = { bordo: 0x1e88e5, misura: 0xd81b60, spazio: 0xf39c12 };
  const AXIS_NAME = { u: 'larghezza', v: 'profondità', h: 'altezza' };
  let magnetOff = false;
  const touches = new Set();
  const mid = (b, a) => (b[a + '0'] + b[a + '1']) / 2;
  function neighbours() {
    const me = sel.type === 'item' ? sel.it.key : null, b = drag.box0, out = [];
    for (const it of liveItems()) {
      if (it.key === me || it.frameKey !== sel.frameKey || it.gone() || (it.primitiva && angleOf(it.obj))) continue; // niente vicini di un'altra cornice, né ruotati
      let nb = null; try { nb = it.box(); } catch (_) { /* scatola non calcolabile */ }
      if (!nb || !KEYS.every((k) => Number.isFinite(nb[k]))) continue;
      if (Math.hypot(mid(nb, 'u') - mid(b, 'u'), mid(nb, 'v') - mid(b, 'v')) > MAG_RANGE) continue;
      out.push({ b: nb, label: it.label });
    }
    return out;
  }
  // soglia: circa 10 px sullo schermo alla distanza della scatola, almeno 15 cm
  function magnetThreshold(b) {
    const w = toWorld(frameBy(sel.frameKey), mid(b, 'u'), mid(b, 'v'), mid(b, 'h'));
    const px = (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(w)) / (canvas.clientHeight || 800);
    return Math.min(0.6, Math.max(0.15, 10 * px));
  }
  const closest = (cands, thr) => { let best = null; for (const c of cands) { const d = Math.abs(c.delta); if (d <= thr && (!best || d < Math.abs(best.delta))) best = c; } return best; };
  // candidati per un bordo che si muove (side '0' o '1' sull'asse a), con il bordo opposto fermo
  function edgeCands(a, side, b, near) {
    const x = b[a + side], o = b[a + (side === '0' ? '1' : '0')], dir = side === '1' ? 1 : -1, out = [];
    for (const n of near) {
      for (const [t, what] of [[n.b[a + '0'], 'al bordo di'], [n.b[a + '1'], 'al bordo di'], [mid(n.b, a), 'al centro di']]) out.push({ kind: 'bordo', a, t, n, delta: t - x, text: `allineato ${what} ${n.label}` });
      const size = n.b[a + '1'] - n.b[a + '0'];
      if (size > MIN) out.push({ kind: 'misura', a, n, delta: o + dir * size - x, text: `stessa ${AXIS_NAME[a]} di ${n.label}` });
    }
    for (const a2 of ['u', 'v', 'h']) {
      if (a2 === a) continue;
      const s2 = b[a2 + '1'] - b[a2 + '0']; if (s2 <= MIN) continue;
      for (const [k, r] of [[1, '1:1'], [2, '2:1'], [0.5, '1:2']]) out.push({ kind: 'misura', a, a2, ratio: r, delta: o + dir * k * s2 - x, text: `${AXIS_NAME[a]} e ${AXIS_NAME[a2]} ${r}` });
    }
    return out;
  }
  // candidati per uno spostamento sull'asse a: bordi e centro contro quelli dei vicini, e spaziature uguali
  function moveCands(a, b, near) {
    const out = [], refs = [b[a + '0'], b[a + '1'], mid(b, a)];
    for (const n of near) for (const t of [n.b[a + '0'], n.b[a + '1'], mid(n.b, a)]) for (const r of refs) out.push({ kind: 'bordo', a, t, n, delta: t - r, text: `allineato a ${n.label}` });
    const size = b[a + '1'] - b[a + '0'], row = near.slice().sort((p, q) => p.b[a + '0'] - q.b[a + '0']);
    for (let i = 0; i + 1 < row.length; i += 1) {
      const A = row[i], B = row[i + 1], g = B.b[a + '0'] - A.b[a + '1'];
      if (g <= 0.05) continue;
      out.push({ kind: 'spazio', a, A, B, gap: g, delta: B.b[a + '1'] + g - b[a + '0'], text: `stessa spaziatura di ${A.label} e ${B.label}` });
      out.push({ kind: 'spazio', a, A, B, gap: g, delta: A.b[a + '0'] - g - size - b[a + '0'], text: `stessa spaziatura di ${A.label} e ${B.label}` });
    }
    return out;
  }
  // corregge b (e il vertice trascinato) e restituisce gli agganci per le guide
  function magnet(h, b) {
    if (magnetOff || touches.size > 1) return [];
    const near = drag.near || (drag.near = neighbours()); if (!near.length) return [];
    const thr = magnetThreshold(b), caught = [];
    const take = (c) => { if (c) caught.push(c); return c; };
    if (h.role === 'face') { const c = take(closest(edgeCands(h.axis, h.side, b, near), thr)); if (c) b[h.axis + h.side] += c.delta; }
    else if (h.role === 'corner') for (const [a, side] of [['u', h.u], ['v', h.v]]) { const c = take(closest(edgeCands(a, side, b, near), thr)); if (c) b[a + side] += c.delta; }
    else if (h.role === 'move') for (const a of ['u', 'v']) { const c = take(closest(moveCands(a, b, near), thr)); if (c) { b[a + '0'] += c.delta; b[a + '1'] += c.delta; } }
    else if (h.role === 'vertex' && drag.vNew) {
      const q = drag.vNew[h.k];
      ['u', 'v'].forEach((a, i) => {
        const cands = []; for (const n of near) for (const t of [n.b[a + '0'], n.b[a + '1'], mid(n.b, a)]) cands.push({ kind: 'bordo', a, t, n, delta: t - q[i], text: `allineato a ${n.label}` });
        const c = take(closest(cands, thr)); if (c) q[i] = round(q[i] + c.delta);
      });
    }
    for (const c of caught) c.box = b;
    return caught;
  }
  function drawGuides(caught) {
    if (!guides) return;
    guides.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); guides.clear();
    const f = sel && frameBy(sel.frameKey); if (!f || !caught.length) return;
    const P = (u, v, h) => toWorld(f, u, v, h);
    for (const c of caught) {
      const b = c.box, pts = [], h0 = Math.min(b.h0, c.n ? c.n.b.h0 : b.h0) + 0.03;
      const span = (x, y, other, z) => { // linea sull'asse "other" alla coordinata x dell'asse c.a
        const lo = Math.min(...y) - 0.6, hi = Math.max(...y) + 0.6;
        if (c.a === 'u') pts.push(P(x, lo, z), P(x, hi, z)); else if (c.a === 'v') pts.push(P(lo, x, z), P(hi, x, z));
        else pts.push(P(other[0], other[1], x), P(other[2], other[3], x));
      };
      const dim = (bb, a) => { // misura di una scatola lungo l'asse a, appena fuori dal suo bordo
        if (a === 'u') pts.push(P(bb.u0, bb.v0 - 0.15, bb.h0 + 0.03), P(bb.u1, bb.v0 - 0.15, bb.h0 + 0.03));
        else if (a === 'v') pts.push(P(bb.u0 - 0.15, bb.v0, bb.h0 + 0.03), P(bb.u0 - 0.15, bb.v1, bb.h0 + 0.03));
        else pts.push(P(bb.u0 - 0.15, bb.v0 - 0.15, bb.h0), P(bb.u0 - 0.15, bb.v0 - 0.15, bb.h1));
      };
      if (c.kind === 'bordo') {
        const o = c.a === 'u' ? 'v' : 'u';
        if (c.a === 'h') span(c.t, [], [mid(b, 'u'), mid(b, 'v'), mid(c.n.b, 'u'), mid(c.n.b, 'v')]);
        else span(c.t, [b[o + '0'], b[o + '1'], c.n.b[o + '0'], c.n.b[o + '1']], null, h0);
      } else if (c.kind === 'misura') { dim(b, c.a); if (c.n) dim(c.n.b, c.a); else dim(b, c.a2); }
      else if (c.kind === 'spazio') {
        const o = c.a === 'u' ? 'v' : 'u', at = (bb) => mid(bb, o), seg = (x0, x1, y) => { if (c.a === 'u') pts.push(P(x0, y, h0), P(x1, y, h0)); else pts.push(P(y, x0, h0), P(y, x1, h0)); };
        seg(c.A.b[c.a + '1'], c.B.b[c.a + '0'], (at(c.A.b) + at(c.B.b)) / 2);
        if (b[c.a + '0'] >= c.B.b[c.a + '1']) seg(c.B.b[c.a + '1'], b[c.a + '0'], (at(c.B.b) + at(b)) / 2);
        else seg(b[c.a + '1'], c.A.b[c.a + '0'], (at(b) + at(c.A.b)) / 2);
      }
      const line = new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: GUIDE_COLOR[c.kind], depthTest: false, transparent: true }));
      line.renderOrder = 1001; guides.add(line);
    }
  }

  function endDrag() {
    drawGuides([]);
    if (drag.h.role === 'rotate') { // salva come il cursore «Rotazione»: stesso campo `angolo`
      const r = drag.rot; drag = null; freeView(); clearTimeout(slideTimer); slideTimer = 0;
      if (r.vts0) sel.vAng = 0;
      if (r.cur !== r.a0) { saveItem(sel.it); rebuild(sel.it.sorgente); }
      sel.frameKey = frameOfItem(sel.it); sel.box = selBox(); drawSel(); return;
    }
    if (drag.baseMove && drag.wall) { // porta: scatola e angolo presi dal muro agganciato
      const w = drag.wall, it = sel.it, pr = it.obj; drag = null; freeView();
      if (tmpFrame) { if (tmpFrame.parent) tmpFrame.parent.remove(tmpFrame); tmpFrame = null; }
      const moved = KEYS.some((k) => pr.box[k] !== roundBox(w.box)[k]) || angleOf(pr) !== w.ang || (w.hit && Number(pr.ruota));
      if (moved) { pr.box = roundBox(w.box); if (w.ang) pr.angolo = w.ang; else delete pr.angolo; if (w.hit) pr.ruota = 0; saveItem(it); rebuild(it.sorgente); }
      sel.frameKey = frameOfItem(it); sel.box = selBox(); drawSel(); infoCard(); return;
    }
    const h = drag.h, changed = h.role === 'vertex' ? !!drag.vNew && JSON.stringify(drag.vNew) !== JSON.stringify(drag.verts) : KEYS.some((k) => sel.box[k] !== drag.box0[k]);
    const box0 = drag.box0, vNew = drag.vNew; drag = null; freeView();
    if (!changed) {
      if (h.role === 'vertex' && sel.type === 'item' && sel.it.primitiva) { sel.corner = sel.corner === h.k ? null : h.k; sel.cardHidden = false; sel.box = selBox(); drawSel(); } // la scheda torna col raggio di quell'angolo
      infoCard(); return;
    }
    if (sel.type === 'item') {
      const it = sel.it;
      if (h.role === 'vertex') it.verts.set(vNew); else it.apply(box0, sel.box);
      saveItem(it); rebuild(it.sorgente);
    } else saveSelPrim();
  }


  /* ---------- aggiunta di primitive e alberi ---------- */
  function addCard() {
    if (mode !== 'modifica') return;
    deselect();
    const shape = el('select'), mat = el('select'), matLbl = el('label', '', 'Materiale'), tipo = el('select'), tipoLbl = el('label', '', 'Forma dell’aiuola'), terr = el('select'), terrLbl = el('label', '', 'Terreno');
    const obj = el('select'), objLbl = el('label', '', 'Quale oggetto');
    const fill = (sl, entries) => { for (const [k, t] of entries) { const o = el('option', '', t); o.value = k; sl.append(o); } };
    fill(shape, Object.entries(FORME)); fill(mat, C.esterni.materiali.map((m) => [m, m])); fill(tipo, Object.entries(TIPI_AIUOLA)); fill(terr, Object.entries(TERRENI)); fill(obj, C.esterni.catalogo);
    const sync = () => { const f = shape.value, solid = ['box', 'cilindro', 'sfera'].includes(f); mat.hidden = matLbl.hidden = !solid; tipo.hidden = tipoLbl.hidden = terr.hidden = terrLbl.hidden = f !== 'aiuola'; obj.hidden = objLbl.hidden = f !== 'oggetto'; };
    shape.addEventListener('change', sync); sync();
    const row = el('div', 'ed-row');
    row.append(button('Annulla', () => { placing = null; closeCard(); setMode('modifica'); }), button('Tocca dove metterlo', () => {
      placing = { forma: shape.value, materiale: mat.value, tipo: tipo.value, terreno: terr.value, modello: obj.value }; closeCard();
      const what = placing.forma === 'oggetto' ? nomeOggetto(placing.modello) : FORME[placing.forma] + (['box', 'cilindro', 'sfera'].includes(placing.forma) ? ' in ' + placing.materiale : '');
      hint('Tocca il punto della scena dove mettere: ' + what.toLowerCase() + '.');
    }, true));
    openCard([el('h3', '', 'Aggiungi'), el('label', '', 'Cosa aggiungere'), shape, objLbl, obj, matLbl, mat, tipoLbl, tipo, terrLbl, terr, row], 'dock');
  }
  const newId = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  function placeAt(hit) {
    const what = placing; placing = null;
    if (what.forma === 'albero' || what.forma === 'pino') {
      if (!C.alberi.list) return;
      const ll = C.toLonLat(hit.point), t = { id: newId('n'), p: [Number(ll[0].toFixed(7)), Number(ll[1].toFixed(7))], r: what.forma === 'pino' ? 4 : 3, g: what.forma === 'pino' ? 'needleleaved' : null, nuovo: true };
      C.alberi.list.push(t); C.alberi.rebuild();
      const it = findItem('albero:' + t.id); if (it) { saveItem(it); select({ type: 'item', it }); }
      return;
    }
    const q = toLocal(frameBy('lato0'), hit.point), u = snap(q.u), v = snap(q.v), h = rootOf(hit.object) ? round(q.h) : 0; // sul terreno: a quota 0, non sotto il piano
    let pr = { id: newId('p'), forma: what.forma, materiale: what.materiale, box: { u0: round(u - 0.5), u1: round(u + 0.5), v0: round(v - 0.5), v1: round(v + 0.5), h0: h, h1: round(h + 1) } };
    if (what.forma === 'marciapiede') pr = { id: pr.id, forma: 'marciapiede', poligono: [[u - 3, v - 0.9], [u + 3, v - 0.9], [u + 3, v + 0.9], [u - 3, v + 0.9]].map(([a, b]) => [round(a), round(b)]), base: h, altezza: 0.15, raggio: 0.3, discese: [] };
    if (what.forma === 'aiuola') { pr = { id: pr.id, forma: 'aiuola', terreno: what.terreno || 'prato', cordolo: 0.16, poligono: [[u - 1.5, v - 1], [u + 1.5, v - 1], [u + 1.5, v + 1], [u - 1.5, v + 1]].map(([a, b]) => [round(a), round(b)]), base: h, altezza: 0.42 }; reshapeBed(pr, what.tipo || 'squadrata'); }
    if (what.forma === 'oggetto') { // copia di un oggetto del modello con le sue misure naturali, appoggiata dove hai toccato
      pr = { id: pr.id, forma: 'oggetto', modello: what.modello, ruota: 0, box: { u0: u, u1: u, v0: v, v1: v, h0: h, h1: h } };
      if (what.modello === 'totem') pr.scritta = 'CU014';
      if (what.modello === 'scritta') pr.scritta = 'ISTITUTO';
      fitNatural(pr);
    }
    const E = C.esterni.cfg; (E.primitive = E.primitive || []).push(pr); C.esterni.rebuild();
    const it = findItem('aggiunta:' + pr.id); if (it) { saveItem(it); select({ type: 'item', it }); }
  }

  /* ---------- edifici: texture della facciata e finestre ---------- */
  // ogni cella di facciata (una campata × un piano) ha una finestra; un riquadro appoggiato sul muro la toglie (muro pieno)
  // o ne aggiunge una (finestra singola); i riquadri sono in coordinate di mondo, salvati con l'edificio
  function facadeOf(code) { if (!facadeState.has(code)) facadeState.set(code, clone(base.facciate[code] || { facciata: null, finestre: [] })); return facadeState.get(code); }
  function drawPatches(code) {
    for (const m of patchGroup.children.filter((c) => c.userData.codice === code)) { patchGroup.remove(m); m.geometry.dispose(); }
    const st = facadeOf(code), name = C.facciate.nomeDi(code);
    // prima i muri con un'altra texture, poi finestre tolte o aggiunte (un po' più in fuori)
    for (const f of (st.finestre || []).slice().sort((a, b) => (a.tipo === 'texture' ? 0 : 1) - (b.tipo === 'texture' ? 0 : 1))) {
      const g = new T.PlaneGeometry(f.w, f.h), uv = g.attributes.uv;
      if (f.tipo !== 'aggiungi') for (let i = 0; i < uv.count; i += 1) uv.setXY(i, f.u0 + uv.getX(i) * f.du, f.v0 + uv.getY(i) * f.dv); // stesse coordinate del muro: mattoni e finestre combaciano
      const m = new T.Mesh(g, C.facciate.materiale(f.palette || name, f.kind, f.tipo === 'togli' ? 'muro' : f.tipo === 'texture' ? 'facciata' : 'finestra'));
      const x = new T.Vector3(Math.cos(f.ang), 0, Math.sin(f.ang)), y = new T.Vector3(0, 1, 0), z = new T.Vector3().crossVectors(x, y);
      m.matrixAutoUpdate = false; m.matrix.makeBasis(x, y, z).setPosition(f.x, f.y, f.z); m.matrixWorldNeedsUpdate = true;
      m.userData.codice = code; m.receiveShadow = true; patchGroup.add(m);
    }
  }
  function applyFacade(code) { const st = facadeOf(code); C.facciate.set(code, st.facciata || null); drawPatches(code); }
  function applyFacadeDoc(o) {
    const code = o.codice; if (!code) return;
    const st = facadeOf(code), next = { facciata: o.facciata || null, finestre: clone(o.finestre || []) };
    if (JSON.stringify(st) === JSON.stringify(next)) return;
    facadeState.set(code, next); applyFacade(code);
    if (sel && sel.type === 'edificio' && sel.code === code) buildingCard();
  }
  function saveFacade(code) {
    const st = facadeOf(code);
    return saveDoc(docId('edificio:' + code), { sorgente: 'edificio', codice: code, oggetto: 'Facciata ' + code, tipo: 'facciata', facciata: st.facciata || null, finestre: st.finestre || [], originale: base.facciate[code] || null, stato: 'da applicare', autore: myId, aggiornato: new Date().toISOString() });
  }
  // la cella sotto il dito: campata e piano dalle stesse coordinate usate per le texture del muro
  function cellFromHit(h) {
    const m = h.object, ud = m.userData;
    if (!ud.facadeCode || !ud.kind || !h.face) return null;
    m.updateWorldMatrix(true, false);
    const n = h.face.normal.clone().transformDirection(m.matrixWorld);
    if (Math.abs(n.y) > 0.5) return null; // tetto
    const pos = m.geometry.attributes.position, vs = [h.face.a, h.face.b, h.face.c].map((i) => new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
    let dx = 0, dz = 0, best = -1;
    for (let a = 0; a < 3; a += 1) for (let b = a + 1; b < 3; b += 1) { const ex = vs[b].x - vs[a].x, ez = vs[b].z - vs[a].z, l = ex * ex + ez * ez; if (l > best) { best = l; dx = ex; dz = ez; } }
    const len = Math.sqrt(best) || 1; dx /= len; dz /= len;
    if (dx < -1e-6 || (Math.abs(dx) <= 1e-6 && dz < 0)) { dx = -dx; dz = -dz; }
    const bay = C.facciate.campata, fh = ud.floorH, y0 = ud.y0, along = (p) => p.x * dx + p.z * dz;
    const sHit = along(h.point), i = Math.floor(sHit / bay), j = Math.floor((h.point.y - y0) / fh), sa = vs.map(along), ys = vs.map((v) => v.y);
    const s0 = Math.max(i * bay, Math.min(...sa)), s1 = Math.min((i + 1) * bay, Math.max(...sa)), ya = Math.max(y0 + j * fh, Math.min(...ys)), yb = Math.min(y0 + (j + 1) * fh, Math.max(...ys));
    if (s1 - s0 < 0.3 || yb - ya < 0.3) return null;
    const c = h.point.clone().addScaledVector(new T.Vector3(dx, 0, dz), (s0 + s1) / 2 - sHit).addScaledVector(new T.Vector3(n.x, 0, n.z).normalize(), 0.025);
    return { line: { dx, dz, nx: n.x, nz: n.z, perp: h.point.z * dx - h.point.x * dz }, code: ud.facadeCode, kind: ud.kind, x: round(c.x), y: round((ya + yb) / 2), z: round(c.z), w: round(s1 - s0), h: round(yb - ya), ang: Math.round(Math.atan2(dz, dx) * 1e4) / 1e4, u0: s0 / bay, v0: (ya - y0) / fh, du: (s1 - s0) / bay, dv: (yb - ya) / fh };
  }
  // tutto il muro su cui si è toccato (ogni pezzo dell'edificio, dal piano terra all'attico) con un'altra texture
  function wallPatches(c, palette) {
    const { dx, dz, nx, nz, perp } = c.line, out = [], bay = C.facciate.campata, nrm = new T.Vector3(nx, 0, nz).normalize();
    for (const m of C.scene.getObjectByName('edifici').children) {
      const ud = m.userData; if (ud.facadeCode !== c.code || !ud.kind || !m.geometry) continue;
      const pos = m.geometry.attributes.position; m.updateWorldMatrix(true, false);
      let s0 = Infinity, s1 = -Infinity, ya = Infinity, yb = -Infinity;
      for (let i = 0; i + 2 < pos.count; i += 3) {
        const vs = [0, 1, 2].map((k) => new T.Vector3().fromBufferAttribute(pos, i + k).applyMatrix4(m.matrixWorld));
        if (!vs.every((v) => Math.abs(v.z * dx - v.x * dz - perp) < 0.05)) continue; // non sta sulla linea del muro
        const ys = vs.map((v) => v.y); if (Math.max(...ys) - Math.min(...ys) < 0.05) continue; // tetto o pavimento
        for (const v of vs) { const s = v.x * dx + v.z * dz; s0 = Math.min(s0, s); s1 = Math.max(s1, s); ya = Math.min(ya, v.y); yb = Math.max(yb, v.y); }
      }
      if (!(s1 - s0 > 0.3 && yb - ya > 0.3)) continue;
      const sm = (s0 + s1) / 2, ctr = new T.Vector3(dx * sm - dz * perp, 0, dz * sm + dx * perp).addScaledVector(nrm, 0.012);
      out.push({ tipo: 'texture', palette, kind: ud.kind, x: round(ctr.x), y: round((ya + yb) / 2), z: round(ctr.z), w: round(s1 - s0), h: round(yb - ya), ang: c.ang, u0: s0 / bay, v0: (ya - ud.y0) / ud.floorH, du: (s1 - s0) / bay, dv: (yb - ya) / ud.floorH, perp: round(perp) });
    }
    return out;
  }
  function togglePatch(h) {
    const c = cellFromHit(h);
    if (!c || c.code !== sel.code) { hint(c ? 'Questa è la facciata di un altro edificio: selezionalo prima.' : 'Qui non c’è una cella di facciata (tetto o muro troppo stretto).'); return; }
    const st = facadeOf(c.code), list = st.finestre || (st.finestre = []);
    const onLine = (f) => f.tipo === 'texture' && Math.abs(f.ang - c.ang) < 1e-3 && Math.abs(f.perp - c.line.perp) < 0.1;
    if (sel.tool === 'muro') {
      if (list.some(onLine)) { st.finestre = list.filter((f) => !onLine(f)); hint('Il muro torna alla texture dell’edificio.'); }
      else { const ws = wallPatches(c, sel.palette || 'arancione'); if (!ws.length) { hint('Non trovo il muro sotto il dito.'); return; } list.push(...ws); hint('Muro in ' + (TEXTURE[sel.palette] || sel.palette) + '.'); }
      drawPatches(c.code); saveFacade(c.code); return;
    }
    const k = list.findIndex((f) => f.tipo !== 'texture' && Math.hypot(f.x - c.x, f.y - c.y, f.z - c.z) < 0.3);
    if (k >= 0) { list.splice(k, 1); hint('Cella ripristinata com’era.'); }
    else if (sel.tool === 'togli' && c.kind === 'attic') { hint('Nell’attico non ci sono finestre da togliere.'); return; }
    else {
      const wall = list.find(onLine), f = Object.assign({ tipo: sel.tool, palette: wall ? wall.palette : undefined }, c);
      delete f.code; delete f.line; list.push(f); hint(sel.tool === 'togli' ? 'Finestra tolta.' : 'Finestra aggiunta.');
    }
    drawPatches(c.code); saveFacade(c.code);
  }
  function selectBuilding(h) {
    const code = h.object.userData.facadeCode;
    if (!code) { deselect(); hint('Edificio del quartiere: non si modifica.'); return; }
    deselect();
    // il lato toccato (riga di muro, interno o esterno): la tendina della texture cambia solo quello; sul tetto resta null → tutto l'edificio
    const wall = cellFromHit(h), onSide = wall && wall.code === code ? wall : null;
    sel = { type: 'edificio', code, tool: null, vis: new T.Group(), handles: [], wall: onSide, tutto: !onSide };
    fx.add(sel.vis); buildingCard();
    hint(onSide ? 'La texture cambia solo il lato toccato. Spunta «Tutto l’edificio» per cambiarli tutti.' : 'Toccato il tetto: la texture cambia tutto l’edificio.');
  }
  function buildingCard() {
    if (!sel || sel.type !== 'edificio' || !cardWanted()) return;
    const code = sel.code, st = facadeOf(code), sl = el('select');
    for (const k of C.facciate.nomi) { const o = el('option', '', TEXTURE[k] || k); o.value = k; o.selected = k === C.facciate.nomeDi(code); sl.append(o); }
    const w = sel.wall, onLine = (f) => w && f.tipo === 'texture' && Math.abs(f.ang - w.ang) < 1e-3 && Math.abs(f.perp - w.line.perp) < 0.1;
    const sideTex = (st.finestre || []).find(onLine); // texture già data a questo lato
    if (!sel.tutto && sideTex) for (const o of sl.options) o.selected = o.value === sideTex.palette;
    sl.addEventListener('change', () => {
      if (sel.tutto || !w) { st.facciata = sl.value; applyFacade(code); saveFacade(code); return; }
      const ws = wallPatches(w, sl.value); if (!ws.length) { hint('Non trovo il muro sotto il dito.'); return; }
      st.finestre = (st.finestre || []).filter((f) => !onLine(f)).concat(ws);
      drawPatches(code); saveFacade(code); buildingCard(); hint('Lato in ' + (TEXTURE[sl.value] || sl.value) + '.');
    });
    const all = el('input'); all.type = 'checkbox'; all.checked = sel.tutto; all.disabled = !w;
    all.addEventListener('change', () => { sel.tutto = all.checked; buildingCard(); });
    const allLabel = el('label', '', ''); allLabel.append(all, document.createTextNode(w ? ' Tutto l’edificio (non solo il lato toccato)' : ' Tutto l’edificio (lato non determinabile)'));
    const tool = (k, label) => { const b = button(label, () => { sel.tool = sel.tool === k ? null : k; buildingCard(); hint(sel.tool ? 'Tocca una cella della facciata. Toccala di nuovo per rimetterla com’era.' : ''); }); b.setAttribute('aria-pressed', String(sel.tool === k)); return b; };
    const row = el('div', 'ed-row'), n = (st.finestre || []).length, wl = el('select');
    for (const k of C.facciate.nomi) { const o = el('option', '', TEXTURE[k] || k); o.value = k; o.selected = k === (sel.palette || 'arancione'); wl.append(o); }
    wl.addEventListener('change', () => { sel.palette = wl.value; });
    sel.palette = sel.palette || 'arancione';
    row.append(tool('togli', 'Togli finestre'), tool('aggiungi', 'Aggiungi finestre'), tool('muro', 'Texture di un muro'));
    if (st.facciata || n) row.append(button('Ripristina originale', () => { facadeState.set(code, clone(base.facciate[code] || { facciata: null, finestre: [] })); applyFacade(code); saveFacade(code); buildingCard(); }));
    row.append(button('Fine', () => deselect(), true));
    openCard([el('h3', '', 'Edificio ' + code), el('p', 'ed-meta', 'L’edificio non si deforma: si cambiano la texture e le finestre.' + (n ? ` Celle modificate: ${n}.` : '')), el('label', '', sel.tutto || !w ? 'Texture della facciata (tutto l’edificio)' : 'Texture del lato toccato'), sl, allLabel, el('label', '', 'Texture per «Texture di un muro»'), wl, row], 'dock');
  }

  /* ---------- salvataggio ---------- */
  const docId = (key) => String(key).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_');
  // una scrittura alla volta per documento: un «Ripristina» subito dopo un trascinamento non deve arrivare prima del salvataggio
  const writes = new Map();
  function queued(id, fn) { const p = (writes.get(id) || Promise.resolve()).catch(() => {}).then(fn); writes.set(id, p); return p; }
  async function saveDoc(id, data) {
    if (runtimeOnly) return;
    if (!db) {
      const docs = new Map(localDocs().map((item) => [item.id, item]));
      docs.set(id, Object.assign({ id }, data)); overrides = [...docs.values()];
      hint(saveLocalDocs() ? `Modifica salvata in questo editor: ${data.oggetto}.` : 'Spazio locale esaurito: la modifica resta visibile solo finché questa pagina è aperta.');
      return;
    }
    try { await queued(id, () => db.collection('modifiche').doc(id).set(data)); hint('Modifica salvata: ' + data.oggetto + '. Claude la vede e la riporta nei file.'); }
    catch (e) { hint('Non sono riuscito a salvare (' + ((e && e.code) || 'errore') + ').'); }
  }
  async function dropDoc(id) {
    if (runtimeOnly) return;
    if (!db) {
      overrides = localDocs().filter((item) => item.id !== id);
      saveLocalDocs(); hint('Modifica rimossa dall’editor.'); return;
    }
    try { await queued(id, () => db.collection('modifiche').doc(id).delete()); hint('Ripristinato com’era nel file.'); }
    catch (e) { hint('Non sono riuscito a ripristinare (' + ((e && e.code) || 'errore') + '): riprova.'); }
  }
  function saveItem(it) {
    return saveDoc(docId(it.key), { sorgente: it.sorgente, percorso: it.percorso, nome: it.nome || '', oggetto: it.label, tipo: 'oggetto', valore: it.get(), originale: baseValue(it), scatola: roundBox(it.box()), stato: 'da applicare', autore: myId, aggiornato: new Date().toISOString() });
  }
  function saveSelPrim() {
    const p = sel.p;
    infoCard();
    return saveDoc(primId(p), { sorgente: 'primitiva', percorso: p.path, istanza: p.inst, cornice: p.frameKey, oggetto: 'pezzo di ' + describe(p.mesh), tipo: 'primitiva', originale: sel.orig, valore: clone(sel.box), stato: 'da applicare', autore: myId, aggiornato: new Date().toISOString() });
  }
  async function restore() {
    if (!sel) return;
    if (sel.type === 'item') {
      const it = sel.it, orig = baseValue(it);
      if (!orig) { if (it.remove) { it.remove(); rebuild(it.sorgente); } } // aggiunto sul posto: annullare vuol dire toglierlo
      else { it.set(orig); rebuild(it.sorgente); }
      await dropDoc(docId(it.key));
    } else {
      primRestore(sel.p); sel.box = primBox(sel.p); drawSel();
      await dropDoc(primId(sel.p));
    }
    infoCard();
  }
  function refreshSel() {
    if (!sel || !boxed()) return;
    if (sel.type === 'item') { const it = findItem(sel.it.key); if (!it) { deselect(); return; } sel.it = it; sel.frameKey = frameOfItem(it); } // l'angolo può essere cambiato: cornice base o ruotata
    else if (!rootOf(sel.p.mesh) || !scene.getObjectById(sel.p.mesh.id)) { deselect(); return; }
    if (!drag) { sel.box = selBox(); drawSel(); if (!sliding) infoCard(); } // il cursore del raggio non va ridisegnato mentre lo trascini
  }
  function rebuild(sorgente) {
    const court = sorgente === 'aggiunta' && (C.esterni.cfg.primitive || []).some((p) => p.cornice === 'cortile'); // aggiunte nel cortile
    const r = sorgente === 'cortile' ? C.cortile.rebuild() : sorgente === 'albero' ? C.alberi.rebuild() : court ? Promise.all([C.esterni.rebuild(), C.cortile.rebuild()]) : C.esterni.rebuild();
    Promise.resolve(r).then(() => { reapplyPrims(); refreshSel(); });
  }
  // chiavi degli oggetti cambiati dal db: se la loro modifica sparisce (ripristinata, scartata, cancellata da un altro
  // schermo o da Claude) tornano subito come nel file, senza ricaricare la pagina
  let fromDb = new Set();
  function applyOverrides() {
    const touched = new Set(), live = new Set();
    for (const o of overrides) {
      if ((o.stato && o.stato !== 'da applicare') || o.sorgente === 'primitiva') continue;
      if (o.sorgente === 'edificio') { applyFacadeDoc(o); continue; }
      if (!o.valore) continue;
      live.add(`${o.sorgente}:${o.percorso}`);
      let it = findItem(`${o.sorgente}:${o.percorso}`);
      if (!it && o.sorgente === 'aggiunta') { const E = C.esterni.cfg; (E.primitive = E.primitive || []).push(Object.assign({ id: o.percorso }, clone(o.valore))); touched.add('aggiunta'); continue; }
      if (!it && o.sorgente === 'albero' && C.alberi.list) { C.alberi.list.push(Object.assign({ id: o.percorso }, clone(o.valore))); touched.add('albero'); continue; }
      if (!it) continue;
      if (JSON.stringify(it.get()) === JSON.stringify(o.valore)) continue;
      it.set(o.valore); touched.add(it.sorgente);
    }
    for (const key of fromDb) {
      if (live.has(key) || (drag && sel && sel.it && sel.it.key === key)) continue;
      const it = findItem(key); if (!it) continue;
      const orig = baseValue(it);
      if (orig) it.set(orig);
      else if (it.sorgente === 'aggiunta') { const E = C.esterni.cfg; E.primitive = (E.primitive || []).filter((p) => p !== it.obj); }
      else if (it.sorgente === 'albero') { const L = C.alberi.list; const k = L.indexOf(it.obj); if (k >= 0) L.splice(k, 1); }
      touched.add(it.sorgente);
    }
    fromDb = live;
    if (touched.size) for (const s of touched) rebuild(s);
    else { reapplyPrims(); refreshSel(); }
  }

  /* ---------- commenti ---------- */
  function pinTexture(n, done) {
    const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
    x.fillStyle = done ? '#6f6866' : '#822433'; x.beginPath(); x.arc(48, 42, 34, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(30, 66); x.lineTo(48, 94); x.lineTo(66, 66); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.arc(48, 42, 34, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#fff'; x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 48, 43);
    const t = new T.CanvasTexture(c); return t;
  }
  function drawPins() {
    pins.traverse((o) => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    pins.clear();
    comments.filter((c) => c.data.stato !== 'fatta' && c.data.punto).forEach((c, i) => {
      const s = new T.Sprite(new T.SpriteMaterial({ map: pinTexture(i + 1, false), depthTest: false, sizeAttenuation: false }));
      s.center.set(0.5, 0.02); s.scale.set(0.05, 0.05, 1); s.renderOrder = 1001;
      const p = c.data.punto; s.position.set(p.x, p.y, p.z); s.userData.comment = c; pins.add(s);
    });
  }
  // foto: ridotte a 2048 px e salvate in JPEG (anche le HEIC dell'iPad); se il browser non le decodifica, il file così com'è
  async function photoBlob(file) {
    try {
      const bmp = await createImageBitmap(file), k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
      const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
      if (b) return b;
    } catch (_) { /* non decodificabile qui */ }
    return file;
  }
  async function uploadPhotos(files) {
    const ids = [];
    for (const [i, f] of files.entries()) { hint(`Carico la foto ${i + 1} di ${files.length}…`); ids.push((await assets.upload(await photoBlob(f))).id); }
    return ids;
  }
  const photoError = (err) => ({ too_large: 'foto troppo grande', unsupported_type: 'formato non supportato', quota_or_state: 'spazio dell’artifact esaurito', rate_limited: 'troppi caricamenti, riprova tra poco', not_granted: 'serve il permesso di modifica' }[err && err.code] || (err && err.code) || 'errore');
  // scelta delle foto (sull'iPad: fotocamera o libreria); onPick riceve i file scelti
  function photoInput(onPick) {
    const input = el('input'); input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.hidden = true;
    input.addEventListener('change', () => { const files = [...input.files]; input.value = ''; if (files.length) onPick(files); });
    return input;
  }
  function lightbox(src) {
    const box = el('div', 'ed-lightbox'), im = el('img'); im.src = src; im.alt = 'Foto del commento, ingrandita';
    box.append(im); box.addEventListener('click', () => box.remove()); ui.host.append(box);
  }
  function thumbs(srcs) {
    const g = el('div', 'ed-fotos');
    for (const src of srcs) {
      const im = el('img'); im.src = src; im.alt = 'Foto allegata'; im.loading = 'lazy';
      im.addEventListener('click', () => lightbox(src));
      im.addEventListener('error', () => im.replaceWith(el('span', 'ed-meta', 'foto non disponibile')));
      g.append(im);
    }
    return g;
  }
  function newComment(hit, e) {
    const ta = el('textarea'); ta.placeholder = 'Cosa va cambiato qui?'; ta.setAttribute('aria-label', 'Testo del commento');
    const meta = el('p', 'ed-meta', describe(hit.object));
    const row = el('div', 'ed-row'), files = [], shots = el('div');
    const nodes = [el('h3', '', 'Nuovo commento'), meta, ta, shots];
    if (assets) {
      const input = photoInput((fs) => { files.push(...fs); shots.replaceChildren(thumbs(files.map((f) => URL.createObjectURL(f)))); });
      nodes.push(input); row.append(button('📷 Foto', () => input.click()));
    }
    row.append(button('Annulla', closeCard), button('Salva', async () => {
      const testo = ta.value.trim(); if (!testo && !files.length) { ta.focus(); return; }
      if (!db) { hint('Per salvare i commenti apri la pagina da claude.ai.'); return; }
      if (saving) return; saving = true;
      try {
        let foto = [];
        if (files.length) { try { foto = await uploadPhotos(files); } catch (err) { hint('Foto non caricate (' + photoError(err) + '): il commento non è stato salvato.'); return; } }
        const doc = commentDoc(hit, testo); if (foto.length) doc.foto = foto;
        await db.collection('segnalazioni').add(doc); closeCard(); hint('Commento salvato' + (foto.length ? ` con ${foto.length} foto` : '') + '. Claude lo legge con le coordinate.');
      } catch (err) { hint('Non sono riuscito a salvare (' + (err && err.code || 'errore') + ').'); }
      finally { saving = false; }
    }, true));
    nodes.push(row);
    openCard(nodes, e.clientX, e.clientY);
    setTimeout(() => ta.focus(), 30);
  }
  function commentDoc(hit, testo) {
    const w = hit.point, it = treeItemFromHit(hit) || itemAt(w), lonLat = C.toLonLat ? C.toLonLat(w) : null;
    const f0 = frameEsterni(0), fc = frameCortile();
    const loc = (f) => { if (!f) return null; const q = toLocal(f, w); return { u: round(q.u), v: round(q.v), h: round(q.h) }; };
    const lc = loc(fc), inCourt = lc && lc.u > -6 && lc.u < 24 && lc.v > -8 && lc.v < 16;
    const tg = controls ? controls.target : new T.Vector3();
    const r3 = (v) => [round(v.x), round(v.y), round(v.z)];
    return {
      testo, stato: 'aperta', creato: new Date().toISOString(), autore: myId,
      punto: { x: round(w.x), y: round(w.y), z: round(w.z) }, quota: round(w.y),
      lonLat: lonLat ? [Number(lonLat[0].toFixed(7)), Number(lonLat[1].toFixed(7))] : null,
      lato0: loc(f0), cortile: inCourt ? lc : null,
      oggetto: describe(hit.object),
      elemento: it ? { chiave: it.key, nome: it.nome || '', etichetta: it.label, sorgente: it.sorgente, percorso: it.percorso } : null,
      vista: { camera: r3(camera.position), target: r3(tg) },
    };
  }
  function showComment(c, e) {
    const d = c.data, nodes = [el('h3', '', 'Commento'), el('p', '', d.testo || ''), el('p', 'ed-meta', `${d.oggetto || ''}${d.creato ? ' · ' + new Date(d.creato).toLocaleString('it-IT') : ''}`)];
    const foto = Array.isArray(d.foto) ? d.foto.filter((id) => /^[0-9a-f]{32}$/.test(id)) : [];
    if (foto.length) nodes.push(thumbs(foto.map((id) => '/_blob/' + id)));
    const row = el('div', 'ed-row');
    if (db && assets) { // altre foto su un commento già salvato
      const input = photoInput(async (fs) => {
        if (saving) return; saving = true;
        try { const ids = await uploadPhotos(fs), all = foto.concat(ids); await db.collection('segnalazioni').doc(c.id).update({ foto: all }); c.data = Object.assign({}, d, { foto: all }); hint(`${ids.length} foto aggiunte al commento.`); showComment(c, e); }
        catch (err) { hint('Foto non aggiunte (' + photoError(err) + ').'); }
        finally { saving = false; }
      });
      nodes.push(input); row.append(button('📷 Foto', () => input.click()));
    }
    if (db) {
      row.append(button('Elimina', async () => { try { await db.collection('segnalazioni').doc(c.id).delete(); closeCard(); } catch (_) { hint('Non riesco a eliminarlo.'); } }));
      row.append(button('Fatto', async () => { try { await db.collection('segnalazioni').doc(c.id).update({ stato: 'fatta', chiuso: new Date().toISOString() }); closeCard(); } catch (_) { hint('Non riesco ad aggiornarlo.'); } }));
    }
    row.append(button('Chiudi', closeCard, true));
    nodes.push(row); openCard(nodes, e.clientX, e.clientY);
  }

  /* ---------- puntatore ---------- */
  // dopo un trascinamento la vista dall'alto torna libera, ma non durante la passeggiata in prima persona (cammina.js)
  const freeView = () => { controls.enabled = !(window.campus3dCammina && window.campus3dCammina.attivo); };
  function onDown(e) {
    if (!mode || drag || (e.button !== undefined && e.button !== 0)) return; // un secondo dito durante un trascinamento non conta
    down = { x: e.clientX, y: e.clientY };
    if (mode === 'modifica' && sel && !sel.tool) { // con un comando attivo (discese, angoli, finestre) il tocco va al comando
      const m = handleAt(e);
      if (m && startDrag(m, e)) {
        controls.enabled = false;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* nessuna cattura */ }
        e.stopImmediatePropagation(); e.preventDefault();
      }
    }
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    moveDrag(e);
    e.stopImmediatePropagation(); e.preventDefault();
  }
  // tocco interrotto dal sistema (gesto di iPadOS, notifica…): annulla il trascinamento e ridà il controllo della vista
  function onCancel(e) {
    down = null;
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    sel.box = drag.box0; if (sel.type === 'prim') primApply(sel.p, sel.orig, sel.box);
    if (drag.rot && drag.rot.vts0) { clearTimeout(slideTimer); slideTimer = 0; sel.it.verts.set(drag.rot.vts0); sel.vAng = 0; sel.box = selBox(); rebuild(sel.it.sorgente); }
    else if (drag.rot) { // rotazione interrotta: torna l'angolo di prima
      const pr = sel.it.obj; clearTimeout(slideTimer); slideTimer = 0;
      const k = sel.it.primitiva ? 'angolo' : sel.it.angKey;
      if (drag.rot.raw0 === undefined) delete pr[k]; else pr[k] = drag.rot.raw0;
      sel.frameKey = frameOfItem(sel.it); rebuild(sel.it.sorgente);
    }
    if (tmpFrame) { if (tmpFrame.parent) tmpFrame.parent.remove(tmpFrame); tmpFrame = null; }
    if (sel.type === 'item') sel.frameKey = frameOfItem(sel.it);
    drag = null; freeView(); drawGuides([]); drawSel(); infoCard();
  }
  function onUp(e) {
    if (drag && e.pointerId !== drag.pointerId) return;
    if (drag) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* già rilasciato */ }
      endDrag(); e.stopImmediatePropagation(); return;
    }
    if (!mode || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 6) return; // era una rotazione della vista
    tap(e);
  }
  // un tocco nella scena in (e.clientX, e.clientY) col modo attuale
  function tap(e) {
    if (mode === 'commenta') {
      const rc = rayFrom(e), ph = rc.intersectObjects(pins.children, false)[0];
      if (ph) { showComment(ph.object.userData.comment, e); return; }
      const hit = hits(e)[0]; if (hit) newComment(hit, e);
    } else if (mode === 'modifica') {
      const hit = hits(e)[0];
      if (placing) { if (hit) placeAt(hit); else hint('Tocca un punto della scena.'); return; }
      if (!hit) { deselect(); return; }
      const root = rootOf(hit.object);
      if (sel && sel.type === 'edificio' && sel.tool && root && root.name === 'edifici') { togglePatch(hit); return; }
      if (sel && sel.type === 'item' && sel.tool) { itemTool(hit); return; }
      if (root && root.name === 'edifici') { selectBuilding(hit); return; }
      if (root && root.name === 'alberi') { const t = treeItemFromHit(hit); if (t) select({ type: 'item', it: t }); return; }
      const prim = primFromHit(hit), it = itemAt(hit.point);
      if (it) select({ type: 'item', it, alt: prim ? { type: 'prim', p: prim } : null });
      else if (prim) select({ type: 'prim', p: prim, alt: null });
      else { deselect(); hint('Qui c’è solo il terreno: tocca un edificio, un muro, un oggetto o un pezzo.'); }
    }
  }
  // il tasto flottante «⟳ Ruota» sta accanto a «▤ Scheda»: solo con un oggetto selezionato e la scheda nascosta
  function syncRot() {
    // Su /campus-3d/ l'editor e' caricato ma la sua barra non viene costruita: senza
    // questa guardia il ciclo di animazione solleva un errore a ogni fotogramma.
    if (!ui.rot) return;
    const on = !!(mode === 'modifica' && sel && sel.type === 'item' && sel.cardHidden), kind = on ? turnKind() : null;
    if (ui.rot.hidden === on) ui.rot.hidden = !on;
    const pr = String(rotOn()); if (ui.rot.getAttribute('aria-pressed') !== pr) ui.rot.setAttribute('aria-pressed', pr);
    ui.rot.classList.toggle('ed-off', on && !kind);
  }
  function loop() { syncRot(); scaleHandles(); requestAnimationFrame(loop); }

  /* ---------- avvio ---------- */
  async function connect() {
    const cl = window.claude;
    const remoteDocs = () => {
      const value = window.MAPPA3D_EDITOR_EDITS;
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') return Object.entries(value).map(([id, data]) => Object.assign({ id }, data));
      return [];
    };
    if (!cl || typeof cl.use !== 'function') {
      overrides = runtimeOnly ? remoteDocs() : localDocs();
      if (overrides.length) applyOverrides();
      return;
    }
    try {
      const [d, u, a] = await Promise.all([cl.use('db'), cl.use('user'), cl.use('assets').catch(() => null)]);
      db = d; assets = a; myId = u ? await u.id() : null; // assets: null per chi non può modificare l'artifact (niente tasto foto)
    } catch (_) { db = null; }
    if (!db) {
      overrides = runtimeOnly ? remoteDocs() : localDocs();
      if (overrides.length) applyOverrides();
      return;
    }
    db.collection('modifiche').onSnapshot((snap) => { overrides = snap.docs.filter((x) => x.exists).map((x) => Object.assign({ id: x.id }, x.data())); if (!drag) applyOverrides(); }, () => {});
    if (mode) setMode(mode);
  }
  function start() {
    C = window.campus3d; T = window.THREE; scene = C.scene; camera = C.camera; controls = C.controls; canvas = C.renderer.domElement;
    base.esterni = clone(C.esterni.cfg); base.cortile = clone(C.cortile.M); base.alberi = C.alberi.list ? clone(C.alberi.list) : [];
    fx = new T.Group(); fx.name = 'editor-maniglie'; pins = new T.Group(); pins.name = 'editor-commenti'; patchGroup = new T.Group(); patchGroup.name = 'editor-facciate';
    guides = new T.Group(); guides.name = 'editor-guide'; fx.add(guides);
    scene.add(fx, pins, patchGroup);
    // facciate già riportate nei file da Claude (texture e finestre per edificio)
    fetch('cortile/facciate.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((f) => {
      base.facciate = (f && f.edifici) || {};
      for (const code of Object.keys(base.facciate)) if (!facadeState.has(code)) applyFacade(code);
    }).catch(() => {});
    if (!runtimeOnly) { css(); buildUi(); }
    let alberiOn = true; try { alberiOn = localStorage.getItem('campus-alberi') !== '0'; } catch (e) { /* memoria non disponibile */ }
    if (!runtimeOnly) setTrees(alberiOn);
    for (const t of ['keydown', 'keyup']) window.addEventListener(t, (e) => { if (e.key === 'Alt') magnetOff = e.type === 'keydown'; });
    window.addEventListener('blur', () => { magnetOff = false; touches.clear(); });
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touches.add(e.pointerId); }, { capture: true });
    for (const t of ['pointerup', 'pointercancel']) window.addEventListener(t, (e) => touches.delete(e.pointerId), { capture: true });
    canvas.addEventListener('pointerdown', onDown, { capture: true });
    canvas.addEventListener('pointermove', onMove, { capture: true });
    canvas.addEventListener('pointerup', onUp, { capture: true });
    canvas.addEventListener('pointercancel', onCancel, { capture: true });
    canvas.addEventListener('lostpointercapture', (e) => { if (drag && e.pointerId === drag.pointerId) setTimeout(() => { if (drag && drag.pointerId === e.pointerId) onCancel(e); }, 0); });
    document.addEventListener('keydown', (e) => { // R: Sposta ↔ Ruota, non mentre si scrive in un campo
      const tg = e.target, typing = tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable);
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey && !typing && mode === 'modifica' && sel && sel.type === 'item') { toggleRot(); e.preventDefault(); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (ui.card.hidden) setMode(null); else closeCard(); } });
    loop(); connect();
    window.campus3dEditor = {
      facciate: () => clone(Object.fromEntries(facadeState)), // sola lettura, per riportare le facciate nei file
      // mirino della passeggiata: commenta o modifica quello che sta al centro dello schermo; true se si è aperto qualcosa
      mira(kind) {
        if (runtimeOnly || kind !== 'modifica') return false;
        const r = canvas.getBoundingClientRect(), e = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        if (mode !== kind) setMode(kind);
        tap(e);
        return !ui.card.hidden;
      },
      chiudi: () => setMode(null),
      get scheda() { return ui.card; },
    };
  }
  // aspetta la scena, le due configurazioni (esterni di Chimica e cortile) e gli alberi
  let tries = 0;
  const wait = setInterval(() => {
    const c = window.campus3d;
    tries += 1;
    if (c && c.scene && c.renderer && c.controls && c.esterni && c.esterni.cfg && c.cortile && c.cortile.M && c.scene.getObjectByName('chimica-esterni') && c.scene.getObjectByName('cortile-modello') && (c.alberi.list || tries > 40)) { clearInterval(wait); start(); }
  }, 400);
})();

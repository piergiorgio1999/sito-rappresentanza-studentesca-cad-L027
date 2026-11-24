/* Edificio di Fisica «Enrico Fermi» (CU033 della Città Universitaria): modello procedurale
   degli esterni. Caricato dopo campus-3d.js; aspetta window.campus3d e window.MAPPA3D_READY,
   poi aggiunge alla scena il gruppo «fisica-fermi» e nasconde l'estrusione OSM di CU033.

   COMPOSIZIONE. Non è un parallelepipedo. Le planimetrie ufficiali Sapienza del piano di
   emergenza CU033 (novembre 2012) mostrano tre masse distinte, che qui sono tre volumi separati:
     - ala lunga      — corpo a sviluppo poligonale spezzato (curvo) con studi e laboratori
                        seriali affacciati sui due lati di un corridoio longitudinale;
     - corpo trasversale («cerniera») — blocco più largo all'estremità nord dell'ala, con i due
                        corpi scala contrapposti e l'ingresso;
     - volume dell'aula — corpo terminale di ingombro diverso, sporgente verso est, che contiene
                        aule a gradoni ed è più basso degli altri due.

   FONTI DELLE QUOTE. Nessuna quota è messa a occhio; dove è stimata il commento lo dice.
   1. Impronta OSM di CU033 in campus-buildings.json (© OpenStreetMap contributors, ODbL):
      è l'unica fonte georiferita del pacchetto e fissa posizione, orientamento e scala nel
      mondo. Il perimetro del modello è esattamente quel poligono, vertice per vertice: non è
      stato ridisegnato né ruotato, e nessun azimut è stato attribuito a mano (le schede del
      pacchetto vietano di assegnare azimut finché non registrati su GIS).
   2. Planimetrie di piano del «Piano di emergenza ed evacuazione, edificio CU033 Fisica Enrico
      Fermi», Ufficio Speciale Prevenzione e Protezione, rev. 00 novembre 2012 (fonte S07 del
      pacchetto), pp. 17-23: una tavola per livello, dal seminterrato al piano quinto.
      Le tavole sono state registrate sull'impronta OSM con una stima ai minimi quadrati di
      rotazione, scala e traslazione: sovrapposizione IoU 0,935, scala risultante 0,0418 m/px a
      300 dpi, errore residuo sui vertici riconoscibili entro circa 1 m. La registrazione è
      confermata da un controllo indipendente: i gradini delle scale disegnate misurano con
      quella scala 0,314 m di pedata, cioè una scala reale.
   3. Dalla registrazione vengono: il numero di livelli per massa, il passo delle campate dei
      due fronti lunghi e la posizione della piattaforma d'ingresso (vedi sotto).
   4. Scheda ufficiale Sapienza ACU033 (fonte S02): la freccia dell'ingresso principale indica
      il fronte ovest, cioè quello dove la pianta del piano terra disegna la piattaforma esterna.

   LIVELLI. Il piano di emergenza 2012 dichiara «sei piani fuori terra e un piano seminterrato»
   (p. 3). Le planimetrie aggiungono il dato che qui conta di più: al piano quinto il volume
   dell'aula non è occupato — è disegnato come semplice contorno, cioè è copertura. L'aula ha
   quindi cinque livelli fuori terra e l'ala sei: le due masse NON hanno la stessa quota.

   QUOTE NON DOCUMENTATE, DICHIARATE COME STIME. L'altezza interpiano non è in nessuna fonte del
   pacchetto (il JSON la riporta come null). Si usa 3,8 m, che è la convenzione già adottata da
   campus-3d.js per gli edifici senza tag height in OSM (levels × 3,8 + 1 di parapetto), ed è
   compatibile con la scala interna misurata (due rampe da ~12 alzate per piano, pedata 0,314 m).
   Sono stimati anche: altezza del parapetto, dimensione dei serramenti, altezza del
   piano di calpestio della piattaforma d'ingresso.

   QUELLO CHE NON C'È, PERCHÉ LE FONTI NON BASTANO. Il pacchetto classifica esplicitamente come
   «ipotesi dell'utente non verificata» le finiture del Fermi: laterizio, fasce di travertino,
   frangisole in alluminio anodizzato, basamento vetrato con pensilina. Non essendo provate da
   nessun prospetto o fotografia, qui NON sono modellate come geometria: niente fasce marcapiano
   in pietra, niente lamelle, niente pensilina, niente basamento vetrato. Resta solo il colore
   della muratura, preso dalla palette «laterizio_rosso_bruno_ipotesi_fermi» del pacchetto come
   proxy visivo dichiarato e sostituibile con un override. Non sono modellati nemmeno: volumi
   tecnici di copertura (il pacchetto li dà «da verificare»), scale esterne di sicurezza
   (disegnate in pianta ma di forma tridimensionale ignota), serramenti dell'aula (il corpo è
   cieco nelle piante, con gradoni e nessuna stanza affacciata).

   Parametri sovrascrivibili senza push su git: window.MAPPA3D_OVERRIDES.fermi (vedi
   MAPPA-3D-API.md). Si leggono in readParams(), chiamata da build(): overrides.js riempie
   l'oggetto in modo asincrono, quindi leggerli al caricamento dello script sarebbe troppo
   presto. Con overrides vuoti i valori sono quelli originali e il render è identico. */
(function () {
  'use strict';

  const CODE = 'CU033';

  /* Impronta OSM di CU033 (way 58897244, «Nuovo Edificio di Fisica»), copiata da
     campus-buildings.json. Anello aperto, 15 vertici, senso dell'originale.
     Indici usati più sotto: 0 estremità sud dell'ala, 0-3 fronte est (convesso),
     3-4-5-6-7 volume dell'aula, 7-8 risvolto nord, 8-9 fronte dell'ingresso,
     9-14 fronte ovest (concavo), 14-0 testata sud. */
  const RING = [
    [12.5159761, 41.9011837], [12.5160085, 41.9013505], [12.5160137, 41.9014446],
    [12.5159874, 41.9015688], [12.5161648, 41.9016054], [12.516149, 41.9016904],
    [12.5160963, 41.9017545], [12.5159241, 41.9016904], [12.5159013, 41.9017322],
    [12.5156537, 41.9016708], [12.5157239, 41.9015231], [12.5157397, 41.9014172],
    [12.515731, 41.9013335], [12.5157136, 41.9012413], [12.5157081, 41.901212],
  ];
  // baricentro d'area del poligono, come registrato in campus-buildings.json
  const REF = { lon: 12.515885765341412, lat: 41.9014829833499 };

  // masse: indici dei vertici dell'anello. La corda 7-3 è il muro fra aula e ala.
  const IDX_AULA = [3, 4, 5, 6, 7];
  const IDX_ALA = [7, 8, 9, 10, 11, 12, 13, 14, 0, 1, 2, 3];

  let P = {};
  let DX, DN,                       // ritocco dell'intero gruppo in metri (est, nord)
    H_PIANO, N_ALA, N_AULA, PARAP,  // interpiano, livelli fuori terra per massa, parapetto
    PASSO_EST, PASSO_OVEST,         // passo delle campate dei due fronti lunghi
    WIN_W_EST, WIN_W_OVEST, WIN_H, WIN_SILL, WIN_OUT, // serramenti
    ING_T0, ING_T1, ING_OUT, ING_H, ING_PORTE;        // piattaforma e porte d'ingresso

  function readParams() {
    P = (window.MAPPA3D_OVERRIDES && window.MAPPA3D_OVERRIDES.fermi) || {};
    DX = P.DX ?? 0; DN = P.DN ?? 0;
    /* 3,8 m: convenzione di campus-3d.js per gli edifici senza height in OSM. Non è un
       rilievo: è la stima dichiarata nell'intestazione. */
    H_PIANO = P.H_PIANO ?? 3.8;
    // documentati da S07: 6 livelli fuori terra; l'aula si ferma al quarto (al quinto è tetto)
    N_ALA = P.N_ALA ?? 6; N_AULA = P.N_AULA ?? 5;
    PARAP = P.PARAP ?? 0.95;            // parapetto di copertura: stimato
    /* Passi misurati sulla pianta registrata: sul fronte est (convesso) affacciano
       laboratori larghi, sul fronte ovest (concavo) studi più stretti. I valori sono la
       mediana dei setti e delle lesene leggibili sul disegno, ±0,2 m. */
    PASSO_EST = P.PASSO_EST ?? 4.70; PASSO_OVEST = P.PASSO_OVEST ?? 3.15;
    // dimensione dei serramenti: stimata, le piante non quotano le aperture
    WIN_W_EST = P.WIN_W_EST ?? 2.55; WIN_W_OVEST = P.WIN_W_OVEST ?? 1.70;
    WIN_H = P.WIN_H ?? 1.95; WIN_SILL = P.WIN_SILL ?? 1.05; WIN_OUT = P.WIN_OUT ?? 0.10;
    /* Piattaforma esterna d'ingresso sul fronte ovest del corpo trasversale: estensione
       letta sulla pianta del piano terra (da 1,2 a 8,9 m dal vertice 8, sporgenza 2,8 m).
       L'altezza del piano di calpestio e il numero di porte sono stimati. */
    ING_T0 = P.ING_T0 ?? 1.2; ING_T1 = P.ING_T1 ?? 8.9;
    ING_OUT = P.ING_OUT ?? 2.8; ING_H = P.ING_H ?? 0.45; ING_PORTE = P.ING_PORTE ?? 3;
  }

  function whenReady(fn) {
    const c = window.campus3d;
    if (window.MAPPA3D_READY === true && typeof THREE !== 'undefined' && c && c.scene
      && typeof c.project === 'function' && c.scene.getObjectByName('edifici')) fn(c);
    else setTimeout(() => whenReady(fn), 500);
  }

  /* Cortina di laterizio: corsi orizzontali con giunti. I toni vengono dalla palette
     «laterizio_rosso_bruno_ipotesi_fermi» del pacchetto (#814B3B / #9C5D47 / #6F3A32), che il
     pacchetto stesso marca come proxy visivo non misurato. La scena è molto luminosa: con i
     valori nominali il muro esce slavato, quindi la texture è disegnata un gradino più in basso. */
  const TILE = 4;
  function laterizioTexture() {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const rows = 20, rh = S / rows, cols = 10, cw = S / cols; // corsi di 20 cm, elementi di 40 cm
    g.fillStyle = '#5d3326'; g.fillRect(0, 0, S, S);          // fondo = colore dei giunti
    for (let r = 0; r < rows; r += 1) {
      const off = (r % 2) * cw * 0.5;
      for (let i = -1; i <= cols; i += 1) {
        const t = 0.88 + Math.random() * 0.24;
        g.fillStyle = `rgb(${Math.round(129 * t)},${Math.round(75 * t)},${Math.round(59 * t)})`;
        g.fillRect(i * cw + off + 0.8, r * rh + 0.8, cw - 1.6, rh - 1.6);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    tex.repeat.set(1 / TILE, 1 / TILE); // le UV di ExtrudeGeometry sono in metri
    return tex;
  }

  function build(c) {
    readParams();
    const scene = c.scene;
    const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.94, metalness: 0 }, extra));

    const muro = std(P.MURO ?? 0xbdb0a9, { map: laterizioTexture(), roughness: 0.92 });
    const coron = std(P.CORON ?? 0x7c5c50, { roughness: 0.9 });   // coronamento e parapetto
    const tetto = std(P.TETTO ?? 0x79756f, { roughness: 1 });     // guaina della copertura
    const vetro = std(P.VETRO ?? 0x2d3a41, { roughness: 0.22, metalness: 0.2 }); // proxy «vetro_infissi_scuri»
    const pietra = std(P.PIETRA ?? 0xa9a295, { roughness: 0.95 }); // piattaforma d'ingresso

    const group = new THREE.Group(); group.name = 'fisica-fermi';
    const origin = c.project([REF.lon + DX / (111320 * Math.cos(REF.lat * Math.PI / 180)),
      REF.lat + DN / 111320]);
    group.position.set(origin.x, 0, origin.z);

    /* Coordinate locali: ogni vertice dell'anello passa per c.project(), così il modello sta
       esattamente sopra l'impronta OSM senza nessuna conversione gradi→metri fatta qui.
       V[i] = [x, z] locale; x cresce verso est, z verso sud. */
    const o0 = c.project([REF.lon, REF.lat]);
    const V = RING.map((ll) => { const p = c.project(ll); return [p.x - o0.x, p.z - o0.z]; });

    const inPoly = (x, z) => {               // punto in poligono, sull'anello completo
      let on = false;
      for (let i = 0, j = V.length - 1; i < V.length; j = i, i += 1) {
        const [xi, zi] = V[i], [xj, zj] = V[j];
        if ((zi > z) !== (zj > z) && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) on = !on;
      }
      return on;
    };
    // normale uscente di un lato: si prova una candidata e si rovescia se cade dentro
    const outward = (a, b) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      let nx = -dz / L, nz = dx / L;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (inPoly(mx + nx * 0.6, mz + nz * 0.6)) { nx = -nx; nz = -nz; }
      return [nx, nz, L, dx / L, dz / L];
    };

    /* flat(pts, y, mat, h) — poligono orizzontale in pianta, estruso in altezza.
       pts sono coppie [x, z] nel riferimento locale, come in matematica-castelnuovo.js. */
    const flat = (pts, y, mat, h, name) => {
      const s = new THREE.Shape();
      pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
      const geo = h ? new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false })
        : new THREE.ShapeGeometry(s);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2; m.position.y = y;
      if (name) m.name = name;
      group.add(m); return m;
    };
    /* box orientato su un lato: lungo L lungo la direzione del lato, spesso t, da y0 a y1,
       centrato nel punto (px, pz) e scostato di off lungo la normale uscente. */
    const slab = (px, pz, dirx, dirz, nx, nz, L, t, y0, y1, off, mat, name) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(L, y1 - y0, t), mat);
      m.position.set(px + nx * off, (y0 + y1) / 2, pz + nz * off);
      m.rotation.y = Math.atan2(-dirz, dirx);
      if (name) m.name = name;
      group.add(m); return m;
    };

    const H_ALA = N_ALA * H_PIANO, H_AULA = N_AULA * H_PIANO;

    /* ---------------- le tre masse ----------------
       Ala + corpo trasversale sono un'unica estrusione (in pianta non c'è giunto fra loro:
       il corridoio passa dall'uno all'altro); l'aula è separata perché è più bassa. */
    const ala = flat(IDX_ALA.map((i) => V[i]), 0, muro, H_ALA, 'ala-e-corpo-trasversale');
    const aula = flat(IDX_AULA.map((i) => V[i]), 0, muro, H_AULA, 'volume-aula');
    [[IDX_ALA, H_ALA], [IDX_AULA, H_AULA]].forEach(([idx, H]) => {
      // coronamento: fascia di 0,5 m in tinta piena sotto il filo di gronda, e piano di copertura
      flat(idx.map((i) => V[i]), H - 0.5, coron, 0.5, 'coronamento');
      flat(idx.map((i) => V[i]), H + 0.02, tetto, 0.06, 'copertura');
      // parapetto: un listello per lato, arretrato di 12 cm dal filo
      for (let k = 0; k < idx.length; k += 1) {
        const a = V[idx[k]], b = V[idx[(k + 1) % idx.length]];
        const [nx, nz, L, dx, dz] = outward(a, b);
        const p = slab((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, dx, dz, nx, nz,
          L, 0.24, H, H + PARAP, -0.12, coron, 'parapetto');
        p.raycast = () => {};
      }
    });

    /* ---------------- finestre ----------------
       Una campata per ambiente, come mostrano le piante: ambienti seriali affacciati sui due
       lati del corridoio. Passo misurato sulla pianta registrata; larghezza e altezza del
       serramento stimate. L'aula resta cieca: nelle piante non ha ambienti affacciati.
       Ogni lato è trattato per sé, così le finestre restano sul proprio piano di facciata. */
    const fronti = [
      { lati: [[0, 1], [1, 2], [2, 3]], passo: PASSO_EST, w: WIN_W_EST },        // est, convesso
      { lati: [[7, 8]], passo: PASSO_OVEST, w: WIN_W_OVEST },                    // risvolto nord
      { lati: [[8, 9]], passo: PASSO_OVEST, w: WIN_W_OVEST },                    // fronte ingresso
      { lati: [[9, 10], [10, 11], [11, 12], [12, 13], [13, 14]], passo: PASSO_OVEST, w: WIN_W_OVEST },
      { lati: [[14, 0]], passo: PASSO_OVEST, w: WIN_W_OVEST },                   // testata sud
    ];
    const ingBuchi = [];  // campate del piano terra occupate dall'ingresso
    fronti.forEach((fr) => fr.lati.forEach(([ia, ib]) => {
      const a = V[ia], b = V[ib];
      const [nx, nz, L, dx, dz] = outward(a, b);
      const n = Math.max(1, Math.round(L / fr.passo));
      for (let k = 0; k < n; k += 1) {
        const t = L * ((k + 0.5) / n);
        const px = a[0] + dx * t, pz = a[1] + dz * t;
        for (let p = 0; p < N_ALA; p += 1) {
          const y0 = p * H_PIANO + WIN_SILL;
          if (p === 0 && ia === 8 && t > ING_T0 && t < ING_T1) { ingBuchi.push([px, pz]); continue; }
          const m = slab(px, pz, dx, dz, nx, nz, fr.w, 0.26, y0, y0 + WIN_H, 0.07, vetro, 'finestra');
          m.raycast = () => {};
        }
      }
    }));

    /* ---------------- ingresso sul fronte ovest ----------------
       La scheda ufficiale ACU033 segna l'ingresso principale su questo fronte; la pianta del
       piano terra 2012 vi disegna una piattaforma esterna lunga 7,7 m e sporgente 2,8 m.
       Si modellano la piattaforma, i gradini e le porte vetrate: nessuna pensilina, perché
       la pensilina è fra le ipotesi non verificate del pacchetto. */
    {
      const a = V[8], b = V[9];
      const [nx, nz, , dx, dz] = outward(a, b);
      const t0 = ING_T0, t1 = ING_T1, Lp = t1 - t0, tc = (t0 + t1) / 2;
      const cx = a[0] + dx * tc, cz = a[1] + dz * tc;
      const piano = slab(cx, cz, dx, dz, nx, nz, Lp, ING_OUT, 0, ING_H, ING_OUT / 2, pietra, 'piattaforma-ingresso');
      piano.raycast = () => {};
      for (let k = 0; k < 2; k += 1) {        // due gradini sul bordo esterno
        const g = slab(cx, cz, dx, dz, nx, nz, Lp + 0.5, 0.34, (ING_H / 2) * k, (ING_H / 2) * (k + 1),
          ING_OUT + 0.17 + 0.34 * (1 - k), pietra, 'gradino-ingresso');
        g.raycast = () => {};
      }
      const pw = 1.4, gap = Lp / (ING_PORTE + 1);
      for (let k = 1; k <= ING_PORTE; k += 1) {
        const t = t0 + gap * k;
        const porta = slab(a[0] + dx * t, a[1] + dz * t, dx, dz, nx, nz, pw, 0.22,
          ING_H, ING_H + 2.55, 0.06, vetro, 'porta-ingresso');
        porta.raycast = () => {};
      }
    }

    ala.castShadow = true; ala.receiveShadow = true;
    aula.castShadow = true; aula.receiveShadow = true;
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.renderOrder = 2;
    scene.add(group);

    /* ---------------- visibilità e sostituzione dell'estrusione OSM ----------------
       Come matematica-castelnuovo.js: questo modulo prende il posto dell'estrusione OSM di
       CU033 ma non tocca campus-3d.js, quindi nasconde da qui le mesh dell'edificio cercandole
       nel gruppo «edifici» per userData.code / userData.facadeCode. Si controlla a intervalli
       perché campus-3d ricostruisce il gruppo quando cambia vista, editor o palette.
       Si nascondono solo le mesh, non le LineSegments del contorno, che servono
       all'evidenziazione di CU033 quando l'utente la seleziona; e l'estrusione torna visibile
       appena questo gruppo si spegne, così la planimetria resta intera. */
    const sync = () => {
      const ex = scene.getObjectByName('minerva'), ed = scene.getObjectByName('edifici');
      const on = !group.userData.force && (ex ? ex.visible : true) && (ed ? ed.visible : true);
      group.visible = on;
      if (!ed) return;
      ed.traverse((o) => {
        if (!o.isMesh) return;
        const u = o.userData || {};
        if (u.code === CODE || u.facadeCode === CODE) {
          if (on) { if (o.visible) { o.userData.fermiHidden = true; o.visible = false; } }
          else if (o.userData.fermiHidden) { o.userData.fermiHidden = false; o.visible = true; }
        }
      });
    };
    sync(); setInterval(sync, 250);
    window.campus3d.fisicaFermi = group;
  }

  whenReady(build);
})();

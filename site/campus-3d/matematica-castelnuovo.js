/* Istituto Matematico «Guido Castelnuovo» (edificio CU006 della Città Universitaria, Gio Ponti 1932-1935):
   modello procedurale. Caricato dopo campus-3d.js; aspetta window.campus3d e window.MAPPA3D_READY,
   poi aggiunge alla scena il gruppo «matematica-castelnuovo».

   COMPOSIZIONE. L'edificio non è un parallelepipedo: sono tre volumi di altezza e impronta diverse
   disposti attorno a una corte interna. Si usano i nomi del volume della Getty Conservation Institute
   («The School of Mathematics…»), capitolo sulla struttura portante:
     - front building      — il parallelepipedo del fronte, con atrio e biblioteca; è la facciata nota;
     - curved wings        — le ali curve delle aule da disegno, due livelli fuori terra, il superiore
                             più stretto dell'inferiore;
     - tower of classrooms — la torre delle aule, in fondo alla corte, il volume più alto: sette telai
                             radiali con travi di 16 m di luce e aule a gradoni sovrapposte.

   FONTI DELLE QUOTE (nessuna quota è inventata a occhio; dove è stimata lo dice il commento):
   1. Impronta OSM di CU006 in campus-buildings.json (© OpenStreetMap contributors, ODbL). Dà la
      posizione nel mondo e, in pianta: fronte rettilineo di 35,43 m (lato 2-3 del poligono), centro
      degli archi a 30,8 m dietro il filo di facciata, raggio esterno delle ali curve 30,3 m,
      raggio esterno della torre 34,3 m su un centro 3,7 m più profondo. I valori vengono da un fit
      ai minimi quadrati dei tre gruppi di vertici (errore massimo 0,12-0,23 m).
   2. Disegni di progetto riprodotti nella Figura 8 di Heritage 2025, 8, 114 (prospetto anteriore
      «Apparecchio della pietra», sezione longitudinale A-B 1:100, pianta del piano terreno). Le quote
      scritte sui disegni sono illeggibili alla risoluzione disponibile: si sono misurati i pixel e si
      è tarata la scala sulla vetrata del fronte.
   3. Quota certa di taratura: la grande vetrata verticale del fronte misura 10,58 × 4,56 m. Con essa
      la scala del prospetto risulta 0,0890 m/px, e con quella scala la larghezza del fronte misurata
      sul disegno (398 px) dà 35,4 m, cioè esattamente l'impronta OSM: le due fonti si confermano.
   4. Foto frontale della facciata fornita dal proprietario (controllo delle quote delle finestre e
      delle iscrizioni, che coincidono con il disegno entro pochi centimetri sulla fila alta).

   STATO ATTUALE, NON PROGETTO DI PONTI. Sono qui modellate anche tre aggiunte documentate:
   i due blocchi degli anni '70 che prolungano le ali curve verso il fronte (sono nell'impronta OSM)
   e le tre scale antincendio cilindriche costruite nella corte negli anni '80.

   Parametri sovrascrivibili senza push su git: window.MAPPA3D_OVERRIDES.castelnuovo (vedi
   MAPPA-3D-API.md). Si leggono in readParams(), chiamata da build(): overrides.js riempie l'oggetto
   in modo asincrono, quindi leggerli al caricamento dello script sarebbe troppo presto. Con overrides
   vuoti i valori sono quelli originali e il render è identico. */
(function () {
  'use strict';

  /* Baricentro dell'impronta OSM di CU006 e terna locale ricavata dal suo lato di facciata.
     u = lungo la facciata (est, nord), n = normale uscente dalla facciata (verso la strada).
     Lo scostamento del punto medio della facciata dal baricentro vale (-11,225 ; +30,345) m. */
  const REF = { lon: 12.51526263297108, lat: 41.901429655605625 };
  const MID_EN = [-11.225, 30.345];
  const U = [0.9323, 0.3616];   // (est, nord) lungo la facciata
  const NOUT = [-0.3616, 0.9323]; // (est, nord) normale uscente: la facciata guarda a N 21° O

  let P = {};
  let U_MID, V_MID,                       // ritocco dell'intero gruppo lungo facciata e profondità
    W_FRONT, D_FRONT, H_FRONT,            // front building: larghezza, profondità, altezza al filo del cornicione
    H_CORN, CORN_OUT, H_BASE,             // cornicione piatto sporgente e basamento più scuro
    WIN_X,                                // semi-scostamenti degli assi delle 4 finestre per lato
    WIN_W_UP, WIN_H_UP, WIN_SILL_UP,      // fila alta
    WIN_W_LO, WIN_H_LO, WIN_SILL_LO,      // fila bassa
    C_W, C_BACK,                          // corpo centrale: larghezza e arretramento dal filo di facciata
    G_W, G_H, G_SILL, G_BACK, G_ROWS,     // vetrata verticale continua: luce, quota, arretramento, traversi
    TXT_TOP_Y, TXT_TOP_H, TXT_BOT_Y, TXT_BOT_H, // bande delle due iscrizioni incise
    DOOR_H, STEPS, GRID_W, GRID_Y, GRID_H,      // ingresso, gradini, cancellata a barre verticali
    SKY_X, SKY_Z0, SKY_Z1, SKY_H,         // lucernario in vetrocemento della biblioteca, sul tetto
    SIDE_Z0, SIDE_Z1, SIDE_H, SIDE_L, SIDE_R,   // blocchi anni '70 ai lati del fronte
    CZ, R_OUT, R_IN, A_MAX, A_MIN,        // ali curve: centro, raggi, settore angolare
    H_W1, H_W2, SETBACK,                  // livelli delle ali curve, arretramento del livello alto
    T_CZ, T_R, T_RIN, T_A, T_H, T_H_IN,   // torre delle aule
    CYL, CYL_R, CYL_H;                    // scale antincendio cilindriche nella corte

  function readParams() {
    P = (window.MAPPA3D_OVERRIDES && window.MAPPA3D_OVERRIDES.castelnuovo) || {};
    U_MID = P.U_MID ?? 0; V_MID = P.V_MID ?? 0;
    // OSM: lato 2-3 del poligono, 35,43 m. Profondità: rapporto letto sulla pianta di progetto
    // (265/503 px della larghezza) → 18,5 m; la sezione ne suggerirebbe 16,4, quindi è una stima.
    W_FRONT = P.W_FRONT ?? 35.43; D_FRONT = P.D_FRONT ?? 18.5;
    // prospetto: 229 px × 0,0890 m/px
    H_FRONT = P.H_FRONT ?? 20.4;
    H_CORN = P.H_CORN ?? 1.2; CORN_OUT = P.CORN_OUT ?? 0.42; H_BASE = P.H_BASE ?? 1.15;
    /* Assi delle finestre: misurati sul prospetto come frazioni della semilarghezza
       (0,3613 0,5161 0,6776 0,8332) e riportati in metri. Passo ≈ 2,79 m. */
    WIN_X = Array.isArray(P.WIN_X) && P.WIN_X.length ? P.WIN_X.slice() : [6.40, 9.14, 12.00, 14.76];
    WIN_W_UP = P.WIN_W_UP ?? 1.54; WIN_H_UP = P.WIN_H_UP ?? 2.40; WIN_SILL_UP = P.WIN_SILL_UP ?? 6.85;
    /* Fila bassa: il disegno dà l'architrave a 5,43 m, la foto a 6,05; si usa la media. */
    WIN_W_LO = P.WIN_W_LO ?? 1.72; WIN_H_LO = P.WIN_H_LO ?? 4.62; WIN_SILL_LO = P.WIN_SILL_LO ?? 1.18;
    // corpo centrale: 88/398 della larghezza del fronte. L'arretramento è una lettura della foto.
    C_W = P.C_W ?? 7.85; C_BACK = P.C_BACK ?? 0.26;
    G_W = P.G_W ?? 4.56; G_H = P.G_H ?? 10.58; G_SILL = P.G_SILL ?? 6.14;
    G_BACK = P.G_BACK ?? 1.55; G_ROWS = P.G_ROWS ?? 16;
    TXT_TOP_Y = P.TXT_TOP_Y ?? 16.76; TXT_TOP_H = P.TXT_TOP_H ?? 0.66;
    TXT_BOT_Y = P.TXT_BOT_Y ?? 4.92; TXT_BOT_H = P.TXT_BOT_H ?? 0.40;
    DOOR_H = P.DOOR_H ?? 4.75; STEPS = P.STEPS ?? 4;
    GRID_W = P.GRID_W ?? 3.10; GRID_Y = P.GRID_Y ?? 6.14; GRID_H = P.GRID_H ?? 2.70;
    /* Lucernario della sala di lettura: nel vero è una volta di mattonelle di vetrocemento.
       Posizione e misure lette sull'assonometria BIM, quindi stimate. */
    SKY_X = P.SKY_X ?? 11.5; SKY_Z0 = P.SKY_Z0 ?? 4.6; SKY_Z1 = P.SKY_Z1 ?? 13.2; SKY_H = P.SKY_H ?? 1.25;
    /* Blocchi anni '70: sono i due tratti rettilinei dell'impronta OSM ai fianchi del fronte
       (x da ±17,8 a -30,8 / +29,0, profondità da 13,1 a ~31). Altezza 11,0 m = quota delle ali
       laterali misurata sul prospetto (123 px). */
    SIDE_Z0 = P.SIDE_Z0 ?? 13.1; SIDE_Z1 = P.SIDE_Z1 ?? 31.0; SIDE_H = P.SIDE_H ?? 11.0;
    SIDE_L = P.SIDE_L ?? -30.77; SIDE_R = P.SIDE_R ?? 29.0;
    // ali curve: fit OSM (centro a 30,8 m dietro la facciata, R 30,3). R interno dalla pianta: 0,49·R.
    CZ = P.CZ ?? 30.8; R_OUT = P.R_OUT ?? 30.3; R_IN = P.R_IN ?? 14.9;
    A_MAX = P.A_MAX ?? 90; A_MIN = P.A_MIN ?? 33;
    // due livelli fuori terra (Getty, cap. struttura); il superiore più stretto: arretramento stimato.
    H_W1 = P.H_W1 ?? 6.0; H_W2 = P.H_W2 ?? 10.8; SETBACK = P.SETBACK ?? 3.0;
    // torre: fit OSM (centro 34,5 / R 34,33 / ±30°). Altezze dalla sezione A-B: 24,4 e 18,8 m.
    T_CZ = P.T_CZ ?? 34.5; T_R = P.T_R ?? 34.33; T_RIN = P.T_RIN ?? 11.5;
    T_A = P.T_A ?? 31; T_H = P.T_H ?? 24.4; T_H_IN = P.T_H_IN ?? 18.8;
    /* Scale antincendio cilindriche, anni '80: posizioni lette sulla pianta BIM della Figura 8
       (due simmetriche verso il fronte, una sull'asse verso la torre). Raggio e altezza stimati
       sull'assonometria. CYL è un array piatto x,z per cilindro (l'API non ammette oggetti annidati). */
    CYL = Array.isArray(P.CYL) && P.CYL.length >= 2 ? P.CYL.slice() : [-8.9, 29.4, 8.9, 29.4, 0, 42.5];
    CYL_R = P.CYL_R ?? 2.6; CYL_H = P.CYL_H ?? 16.0;
  }

  function whenReady(fn) {
    const c = window.campus3d;
    if (window.MAPPA3D_READY === true && typeof THREE !== 'undefined' && c && c.scene
      && typeof c.project === 'function' && c.scene.getObjectByName('edifici')) fn(c);
    else setTimeout(() => whenReady(fn), 500);
  }

  /* Travertino a corsi regolari, giunti ben visibili: è il rivestimento di tutto il fronte.
     Il riquadro disegnato vale TILE metri di lato, così il repeat si calcola in metri. */
  const TILE = 6;
  function travertinoTexture() {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const rows = 7, rh = S / rows, cols = 4, cw = S / cols; // corsi di ~0,86 m, lastre di 1,5 m
    g.fillStyle = '#b3a890'; g.fillRect(0, 0, S, S); // fondo = colore dei giunti
    for (let r = 0; r < rows; r += 1) {
      const off = (r % 2) * cw * 0.5;
      for (let i = -1; i <= cols; i += 1) {
        const x = i * cw + off, t = 0.93 + Math.random() * 0.12;
        g.fillStyle = `rgb(${Math.round(222 * t)},${Math.round(212 * t)},${Math.round(192 * t)})`;
        g.fillRect(x + 1.1, r * rh + 1.1, cw - 2.2, rh - 2.2);
        // venature e cavità del travertino, appena accennate
        for (let k = 0; k < 26; k += 1) {
          const vx = x + 2 + Math.random() * (cw - 6), vy = r * rh + 2 + Math.random() * (rh - 6);
          g.fillStyle = `rgba(150,138,116,${0.05 + Math.random() * 0.1})`;
          g.fillRect(vx, vy, 2 + Math.random() * 9, 1 + Math.random() * 2);
        }
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    return tex;
  }

  /* Iscrizione architettonica incisa nella pietra: lettere capitali spaziate, scure sul fondo
     trasparente, con un filo chiaro sotto che fa leggere lo scasso. Non è un logo: è testo inciso. */
  function incisioneTexture(lines, wM, hM) {
    const W = 1024, H = Math.max(64, Math.round(W * hM / wM));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    const n = lines.length, lh = H / n, fs = lh * 0.62;
    g.textBaseline = 'middle';
    lines.forEach((t, i) => {
      const y = lh * (i + 0.5);
      const sp = fs * 0.34; // spaziatura fra le lettere, come nelle incise del 1935
      g.font = `${fs}px "Helvetica Neue", Arial, sans-serif`;
      let w = 0; for (const ch of t) w += g.measureText(ch).width + sp;
      w -= sp;
      const k = Math.min(1, (W * 0.94) / w);
      g.save(); g.translate(W / 2 - (w * k) / 2, y); g.scale(k, 1);
      let x = 0;
      for (const ch of t) {
        g.fillStyle = 'rgba(255,252,245,0.5)';            // bordo illuminato dello scasso
        g.fillText(ch, x + fs * 0.05, fs * 0.05);
        g.fillStyle = 'rgba(58,52,44,0.92)';              // fondo dell'incisione
        g.fillText(ch, x, 0);
        x += g.measureText(ch).width + sp;
      }
      g.restore();
    });
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    return tex;
  }

  /* Mattonelle di vetrocemento del lucernario della biblioteca. */
  function vetrocementoTexture() {
    const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'); g.fillStyle = '#9fb6bd'; g.fillRect(0, 0, S, S);
    const n = 8, s = S / n;
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
      g.fillStyle = `rgba(${210 + Math.random() * 30 | 0},${226 + Math.random() * 20 | 0},230,0.9)`;
      g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
    }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    return tex;
  }

  function build(c) {
    readParams();
    const scene = c.scene;

    const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.95, metalness: 0 }, extra));
    const baseTrav = travertinoTexture();
    /* La scena è molto luminosa: con il colore chiaro usato dagli altri moduli (0xe7e0cf) il travertino
       a corsi esce slavato e i giunti spariscono. Si tiene quindi la texture sui toni del campus
       (palette «travertino» di campus-3d: #ddd3bf / #cfc3ab) e si modula con un colore leggermente
       più basso, 0xd7cdb8, che al sole restituisce la pietra della foto senza bruciare i giunti. */
    const TRAV_COL = P.TRAV_COL ?? 0xcbc0a8;
    const travMats = [];
    const trav = (wM, hM) => {
      const t = baseTrav.clone(); t.needsUpdate = true;
      t.repeat.set(Math.max(0.2, wM / TILE), Math.max(0.2, hM / TILE));
      const m = std(TRAV_COL, { map: t, roughness: 0.92 });
      travMats.push(m); return m;
    };
    const travPlain = std(P.TRAV_PLAIN ?? 0xc8bda6, { roughness: 0.92 });   // fasce lisce: cornicione, architravi
    const travDark = std(P.TRAV_DARK ?? 0x9b9280, { roughness: 0.95 });     // basamento, appena più scuro
    const shadow = std(0x2d2b27, { roughness: 1 });                          // fondo degli scassi: con l'illuminazione della scena un grigio piu' chiaro esce slavato
    const glass = std(0x33454f, { roughness: 0.14, metalness: 0.3, transparent: true, opacity: 0.9 });
    const glassDark = std(0x2a373d, { roughness: 0.2, metalness: 0.2 });
    const metal = std(0x8e918d, { roughness: 0.5, metalness: 0.25 });
    const vetroc = std(0xcfdfe4, { map: vetrocementoTexture(), roughness: 0.35, transparent: true, opacity: 0.9 });
    const pav = std(0x9a948a, { roughness: 1 });

    const group = new THREE.Group(); group.name = 'matematica-castelnuovo';

    // posizione: punto medio della facciata, più l'eventuale ritocco lungo u (facciata) e v (profondità)
    const dE = MID_EN[0] + U[0] * U_MID - NOUT[0] * V_MID;
    const dN = MID_EN[1] + U[1] * U_MID - NOUT[1] * V_MID;
    const origin = c.project([REF.lon + dE / (111320 * Math.cos(REF.lat * Math.PI / 180)),
      REF.lat + dN / 111320]);
    group.position.set(origin.x, 0, origin.z);
    // locale: x lungo la facciata, z = profondità verso l'interno dell'edificio, y in alto
    group.rotation.y = Math.atan2(U[1], U[0]);

    /* box(x0,x1, y0,y1, z0,z1, mat) — mat può essere un materiale o l'array dei 6 materiali
       di BoxGeometry, così il fronte può avere il passo dei corsi giusto su ogni faccia. */
    const box = (x0, x1, y0, y1, z0, z1, mat, name) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      if (name) m.name = name;
      group.add(m); return m;
    };
    /* flat(pts, y, mat, h) — poligono orizzontale in pianta, eventualmente estruso in altezza.
       pts sono coppie [x, z] nel riferimento locale. */
    const flat = (pts, y, mat, h, name) => {
      const s = new THREE.Shape();
      pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
      const geo = h ? new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }) : new THREE.ShapeGeometry(s);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2; m.position.y = y; // l'estrusione cresce verso +y dopo la rotazione
      if (name) m.name = name;
      group.add(m); return m;
    };
    // settore di corona circolare centrato su (0, cz): a0..a1 in gradi, 0° = verso il fondo
    const ringPts = (cz, r0, r1, a0, a1, step) => {
      const out = [], n = Math.max(2, Math.round(Math.abs(a1 - a0) / (step || 4)));
      for (let i = 0; i <= n; i += 1) {
        const a = (a0 + (a1 - a0) * (i / n)) * Math.PI / 180;
        out.push([r1 * Math.sin(a), cz + r1 * Math.cos(a)]);
      }
      for (let i = n; i >= 0; i -= 1) {
        const a = (a0 + (a1 - a0) * (i / n)) * Math.PI / 180;
        out.push([r0 * Math.sin(a), cz + r0 * Math.cos(a)]);
      }
      return out;
    };

    const HW = W_FRONT / 2, CHW = C_W / 2, GHW = G_W / 2;
    const CLAD = P.CLAD ?? 0.26; // spessore del rivestimento in lastre: è la profondità degli scassi

    /* ---------------- front building: il parallelepipedo della facciata ----------------
       La facciata è costruita a strati perché le finestre devono essere vere aperture: dietro c'è
       la massa muraria, davanti un rivestimento in travertino spesso CLAD bucato dalle finestre.
       Lo sguancio che ne nasce è ciò che, nella foto, fa leggere le finestre «architravate, senza
       cornici sporgenti»: niente cornice in rilievo, solo lo spessore della lastra. */
    const fSide = trav(D_FRONT, H_FRONT), fFront = trav(W_FRONT, H_FRONT);
    const fWing = trav(HW - CHW, H_FRONT);
    // massa muraria dietro il rivestimento, divisa in ali e corpo centrale arretrato
    box(-HW, -CHW, 0, H_FRONT - H_CORN, CLAD, D_FRONT,
      [fSide, fSide, travPlain, travPlain, fFront, fFront], 'front-building-ala-sx');
    box(CHW, HW, 0, H_FRONT - H_CORN, CLAD, D_FRONT,
      [fSide, fSide, travPlain, travPlain, fFront, fFront], 'front-building-ala-dx');
    // fascia liscia sotto il cornicione e cornicione piatto sporgente, continui su tutto il fronte
    box(-HW, HW, H_FRONT - H_CORN, H_FRONT - 0.42, -0.02, D_FRONT + 0.02, travPlain, 'fascia-sommitale');
    box(-HW - CORN_OUT, HW + CORN_OUT, H_FRONT - 0.42, H_FRONT,
      -CORN_OUT, D_FRONT + CORN_OUT, travPlain, 'cornicione');
    // basamento appena accennato, più scuro; si interrompe sul corpo centrale, dove ci sono i gradini
    box(-HW - 0.09, -CHW, 0, H_BASE, -0.09, D_FRONT, travDark, 'basamento-sx');
    box(CHW, HW + 0.09, 0, H_BASE, -0.09, D_FRONT, travDark, 'basamento-dx');

    /* fasciaForata: una fascia orizzontale del rivestimento, con i vuoti delle finestre.
       holes è l'elenco ordinato delle coppie [x0, x1] da lasciare aperte. */
    const fasciaForata = (xa, xb, y0, y1, holes, mat) => {
      let x = xa;
      holes.forEach(([h0, h1]) => {
        if (h0 > x + 0.01) box(x, h0, y0, y1, 0, CLAD, mat, 'rivestimento');
        x = Math.max(x, h1);
      });
      if (xb > x + 0.01) box(x, xb, y0, y1, 0, CLAD, mat, 'rivestimento');
    };
    /* Finestre rettangolari architravate, quattro per lato su due file allineate verticalmente.
       Il davanzale della fila bassa coincide col filo alto del basamento, come nella foto. */
    const rows = [
      { y0: WIN_SILL_LO, y1: WIN_SILL_LO + WIN_H_LO, w: WIN_W_LO, t: 4 },
      { y0: WIN_SILL_UP, y1: WIN_SILL_UP + WIN_H_UP, w: WIN_W_UP, t: 2 },
    ];
    [[-HW, -CHW, -1], [CHW, HW, 1]].forEach(([xa, xb, s]) => {
      const xs = WIN_X.map((d) => s * d).sort((a, b) => a - b);
      let y = 0;
      rows.forEach((r) => {
        fasciaForata(xa, xb, y, r.y0, [], fWing);
        fasciaForata(xa, xb, r.y0, r.y1, xs.map((cx) => [cx - r.w / 2, cx + r.w / 2]), fWing);
        y = r.y1;
      });
      fasciaForata(xa, xb, y, H_FRONT - H_CORN, [], fWing);
      // dentro ogni apertura: il vetro scuro in fondo allo sguancio e i traversi
      xs.forEach((cx) => rows.forEach((r) => {
        const v = box(cx - r.w / 2, cx + r.w / 2, r.y0, r.y1, CLAD - 0.05, CLAD - 0.02, glassDark, 'vetro');
        v.raycast = () => {};
        for (let k = 1; k < r.t; k += 1) {
          const yy = r.y0 + (r.y1 - r.y0) * (k / r.t);
          box(cx - r.w / 2, cx + r.w / 2, yy - 0.035, yy + 0.035, CLAD - 0.1, CLAD - 0.05, metal, 'traverso');
        }
      }));
    });

    /* ---------------- corpo centrale e vetrata verticale continua ----------------
       Il corpo centrale è appena arretrato rispetto al filo delle ali (C_BACK) e non è più alto:
       il cornicione corre continuo sopra di esso, come mostrano la foto e il prospetto (nella
       Figura 8 il filo di gronda non ha risalti sull'asse). Dentro, la grande vetrata è incassata
       di G_BACK e divisa da montanti sottili. Il corpo è costruito come cornice di pietra attorno
       al vano, così vetrata e ingresso sono vuoti veri. */
    const cTrav = trav(CHW - GHW, H_FRONT), cLint = trav(G_W, 4);
    box(-CHW, -GHW, 0, H_FRONT - H_CORN, C_BACK, D_FRONT, cTrav, 'spalla-sx');
    box(GHW, CHW, 0, H_FRONT - H_CORN, C_BACK, D_FRONT, cTrav, 'spalla-dx');
    box(-GHW, GHW, G_SILL + G_H, H_FRONT - H_CORN, C_BACK, D_FRONT, cLint, 'architrave-vetrata');
    box(-GHW, GHW, DOOR_H, G_SILL, C_BACK, D_FRONT, cLint, 'parapetto-vetrata');
    // fondo scuro del vano, dietro vetrata e porte
    box(-GHW, GHW, 0, G_SILL + G_H, C_BACK + G_BACK, D_FRONT, shadow, 'interno-vano');
    const vetrata = box(-GHW + 0.05, GHW - 0.05, G_SILL + 0.04, G_SILL + G_H - 0.04,
      C_BACK + G_BACK - 0.08, C_BACK + G_BACK - 0.04, glass, 'vetrata');
    vetrata.raycast = () => {};
    // montante centrale e traversi: la vetrata è a due luci con molti traversi orizzontali
    box(-0.05, 0.05, G_SILL, G_SILL + G_H, C_BACK + G_BACK - 0.13, C_BACK + G_BACK - 0.03, metal, 'montante');
    for (let k = 1; k < G_ROWS; k += 1) {
      const y = G_SILL + G_H * (k / G_ROWS);
      box(-GHW + 0.05, GHW - 0.05, y - 0.035, y + 0.035,
        C_BACK + G_BACK - 0.12, C_BACK + G_BACK - 0.03, metal, 'traverso-vetrata');
    }
    // cancellata metallica a barre verticali nella parte bassa della vetrata
    const gz = C_BACK + G_BACK - 0.3;
    box(-GRID_W / 2, GRID_W / 2, GRID_Y + GRID_H - 0.07, GRID_Y + GRID_H, gz - 0.05, gz + 0.05, metal, 'cancellata-corrente');
    box(-GRID_W / 2, GRID_W / 2, GRID_Y, GRID_Y + 0.07, gz - 0.05, gz + 0.05, metal, 'cancellata-corrente');
    const nb = Math.max(4, Math.round(GRID_W / 0.21));
    for (let k = 0; k <= nb; k += 1) {
      const x = -GRID_W / 2 + GRID_W * (k / nb);
      box(x - 0.025, x + 0.025, GRID_Y, GRID_Y + GRID_H, gz - 0.03, gz + 0.03, metal, 'cancellata-barra');
    }

    /* Iscrizioni incise: SCUOLA DI MATEMATICA sopra la vetrata, ISTITUTO MATEMATICO /
       GUIDO CASTELNUOVO su due righe sotto. Sono testo inciso nella pietra del corpo centrale,
       non targhe applicate: il piano sta a un paio di centimetri dal filo. */
    const incisione = (lines, y, h, w) => {
      const tex = incisioneTexture(lines, w, h);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(0, y + h / 2, C_BACK - 0.03);
      m.rotation.y = Math.PI; // il piano guarda verso -z, cioè la strada: cosi' il testo si legge dritto
      m.name = 'iscrizione'; m.raycast = () => {}; group.add(m);
    };
    incisione(['SCUOLA DI MATEMATICA'], TXT_TOP_Y, TXT_TOP_H, C_W * 0.92);
    incisione(['ISTITUTO MATEMATICO', 'GUIDO CASTELNUOVO'], TXT_BOT_Y, TXT_BOT_H * 2, G_W * 0.98);

    /* Ingresso centrale arretrato, con gradini. Le porte sono vetrate e partite da montanti
       verticali, come nella foto. */
    const SH = H_BASE / STEPS;
    for (let k = 0; k < STEPS; k += 1) {
      const d = (STEPS - k) * 0.33;
      box(-GHW - 0.6, GHW + 0.6, k * SH, (k + 1) * SH, -d, C_BACK + 0.3, travPlain, 'gradino');
    }
    const porta = box(-GHW + 0.25, GHW - 0.25, H_BASE, DOOR_H - 0.35,
      C_BACK + G_BACK - 0.14, C_BACK + G_BACK - 0.08, glassDark, 'porta');
    porta.raycast = () => {};
    for (let k = 0; k <= 6; k += 1) {
      const x = -GHW + 0.25 + (G_W - 0.5) * (k / 6);
      box(x - 0.045, x + 0.045, H_BASE, DOOR_H - 0.35,
        C_BACK + G_BACK - 0.2, C_BACK + G_BACK - 0.07, metal, 'montante-porta');
    }

    /* Lucernario della sala di lettura della biblioteca: nastro rialzato sul tetto, chiuso da
       mattonelle di vetrocemento (Getty, cap. struttura: «a glass brick vault»). */
    box(-SKY_X, SKY_X, H_FRONT - 0.42, H_FRONT + SKY_H * 0.35, SKY_Z0, SKY_Z1, travPlain, 'zoccolo-lucernario');
    box(-SKY_X + 0.25, SKY_X - 0.25, H_FRONT + SKY_H * 0.35, H_FRONT + SKY_H,
      SKY_Z0 + 0.25, SKY_Z1 - 0.25, vetroc, 'lucernario-vetrocemento');

    /* ---------------- blocchi degli anni '70 ai fianchi del fronte ----------------
       Non sono di Ponti: prolungano le ali curve fino al corpo di facciata e stanno
       nell'impronta OSM, perciò ci sono nello stato attuale. */
    const wTravOut = trav(28, H_W2);
    [[SIDE_L, -HW], [HW, SIDE_R]].forEach(([a, b]) => {
      box(a, b, 0, SIDE_H - 0.5, SIDE_Z0, SIDE_Z1, wTravOut, 'blocco-anni70');
      box(a - 0.2, b + 0.2, SIDE_H - 0.5, SIDE_H, SIDE_Z0 - 0.15, SIDE_Z1, travPlain, 'cornicione-blocco');
      box(a - 0.06, b + 0.06, 0, 0.9, SIDE_Z0 - 0.06, SIDE_Z1, travDark, 'basamento-blocco');
      // due file di finestre sul fronte del blocco
      const w = Math.abs(b - a), n = Math.max(2, Math.round(w / 3.0));
      for (let k = 0; k < n; k += 1) {
        const cx = a + (w / n) * (k + 0.5);
        [2.2, 6.4].forEach((y0) => {
          box(cx - 0.8, cx + 0.8, y0, y0 + 2.2, SIDE_Z0 - 0.2, SIDE_Z0 + 0.02, shadow, 'scasso-finestra');
          box(cx - 0.72, cx + 0.72, y0 + 0.06, y0 + 2.14, SIDE_Z0 - 0.17, SIDE_Z0 - 0.14, glassDark, 'vetro');
        });
      }
    });

    /* ---------------- curved wings: le ali curve ----------------
       Ferro di cavallo attorno alla corte, non semicerchio pieno: due livelli fuori terra,
       il superiore più stretto dell'inferiore (Getty, cap. struttura). */
    const wTrav = trav(40, H_W2);
    const roofMat = std(0xa8a39a, { roughness: 1 });
    [[A_MIN, A_MAX], [-A_MAX, -A_MIN]].forEach(([a0, a1]) => {
      flat(ringPts(CZ, R_IN, R_OUT, a0, a1, 3), 0, wTrav, H_W1 - 0.35, 'ala-curva-livello-terra');
      flat(ringPts(CZ, R_IN - 0.25, R_OUT + 0.25, a0, a1, 3), H_W1 - 0.35, travPlain, 0.35, 'marcapiano-ala');
      flat(ringPts(CZ, R_IN + SETBACK, R_OUT, a0, a1, 3), H_W1, wTrav, H_W2 - H_W1 - 0.35, 'ala-curva-livello-alto');
      flat(ringPts(CZ, R_IN + SETBACK - 0.25, R_OUT + 0.25, a0, a1, 3), H_W2 - 0.35, travPlain, 0.35, 'cornicione-ala');
      // terrazza che resta sopra il livello basso, sul lato della corte
      flat(ringPts(CZ, R_IN, R_IN + SETBACK, a0, a1, 3), H_W1 - 0.02, roofMat, 0.06, 'terrazza-ala');
      // finestre: una fila per livello sul fronte esterno e una sul fronte della corte
      const n = Math.max(6, Math.round(Math.abs(a1 - a0) / 4.4));
      for (let k = 0; k < n; k += 1) {
        const a = (a0 + (a1 - a0) * ((k + 0.5) / n)) * Math.PI / 180;
        const sx = Math.sin(a), cs = Math.cos(a);
        const put = (r, y0, h, w, dep) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), glassDark);
          m.position.set(r * sx, y0 + h / 2, CZ + r * cs);
          m.rotation.y = a; m.name = 'finestra-ala'; m.raycast = () => {}; group.add(m);
        };
        put(R_OUT - 0.02, 1.9, 2.3, 1.5, 0.34);
        put(R_OUT - 0.02, 7.3, 2.3, 1.5, 0.34);
        put(R_IN + 0.02, 1.9, 2.3, 1.4, 0.34);
        /* Oblò verso la corte al livello superiore: Ponti usa aperture circolari; la loro presenza
           è documentata, il passo no, quindi è uno a campata come le finestre sotto. */
        const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.34, 16), glassDark);
        ob.rotation.z = Math.PI / 2; ob.rotation.y = a;
        ob.position.set((R_IN + SETBACK - 0.02) * sx, 8.4, CZ + (R_IN + SETBACK - 0.02) * cs);
        ob.name = 'oblo'; ob.raycast = () => {}; group.add(ob);
      }
    });

    /* ---------------- tower of classrooms: la torre delle aule ----------------
       Volume più alto, in fondo alla corte. La sezione A-B dà la copertura più bassa sul lato
       della corte (18,8 m) e più alta all'esterno (24,4 m): si rende con tre fasce a gradino,
       semplificazione della falda inclinata del vero. Le gradinate delle aule sono interne e non
       si vedono da fuori: non sono modellate. */
    const tTrav = trav(50, T_H);
    const bands = [[T_RIN, T_RIN + (T_R - T_RIN) * 0.34, T_H_IN],
      [T_RIN + (T_R - T_RIN) * 0.34, T_RIN + (T_R - T_RIN) * 0.67, (T_H_IN + T_H) / 2],
      [T_RIN + (T_R - T_RIN) * 0.67, T_R, T_H]];
    bands.forEach(([r0, r1, h], i) => {
      flat(ringPts(T_CZ, r0, r1, -T_A, T_A, 3), 0, tTrav, h - 0.45, `torre-fascia-${i}`);
      flat(ringPts(T_CZ, r0 - 0.2, r1 + (i === 2 ? 0.3 : 0.2), -T_A, T_A, 3), h - 0.45, travPlain, 0.45, `torre-cornicione-${i}`);
    });
    /* Finestre del fronte esterno della torre: una campata per ciascuno dei sette telai radiali
       di cui parla il volume Getty, su tre livelli (quanti sono gli ordini di aule a gradoni che
       si leggono nella sezione A-B). Larghezza e quote sono stimate dall'assonometria. */
    const T_BAYS = P.T_BAYS ?? 7;
    for (let k = 0; k < T_BAYS; k += 1) {
      const a = (-T_A + 2 * T_A * ((k + 0.5) / T_BAYS)) * Math.PI / 180;
      [3.0, 8.4, 13.8].forEach((y0) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 0.36), glassDark);
        m.position.set((T_R - 0.02) * Math.sin(a), y0 + 1.3, T_CZ + (T_R - 0.02) * Math.cos(a));
        m.rotation.y = a; m.name = 'finestra-torre'; m.raycast = () => {}; group.add(m);
      });
    }

    /* ---------------- corte interna ----------------
       Lastricata in pietra (foto nel volume Getty). Il disco è limitato al tratto dietro il fronte. */
    const court = ringPts(CZ, 0.01, R_IN, -A_MAX, A_MAX, 3)
      .filter(([, z]) => z >= D_FRONT - 0.2);
    if (court.length > 3) flat(court, 0.06, pav, 0, 'corte-lastricato').receiveShadow = true;

    /* Tre scale antincendio cilindriche nella corte (anni '80, non di Ponti).
       Non sono muratura bianca ma gabbie in ferro verniciato rosso-marrone, e a ogni
       piano un passaggio le collega all'edificio: senza quei collegamenti non sarebbero
       vie di fuga. Il passaggio esce radialmente dal centro della corte verso il muro
       delle ali, a R_IN. */
    const ferro = std(P.FERRO ?? 0x6e3524, { roughness: 0.72, metalness: 0.35 });
    const ferroScuro = std(P.FERRO_SCURO ?? 0x4e2619, { roughness: 0.78, metalness: 0.3 });
    const PIANI = Array.isArray(P.CYL_PIANI) && P.CYL_PIANI.length ? P.CYL_PIANI.slice() : [4.3, 8.1, 11.9];
    const PASS_W = P.CYL_PASS_W ?? 1.4;
    for (let i = 0; i + 1 < CYL.length; i += 2) {
      const cx = CYL[i], cz = CYL[i + 1];
      // fusto: anima piena sottile, montanti e parapetti in ferro
      const cy = new THREE.Mesh(new THREE.CylinderGeometry(CYL_R - 0.35, CYL_R - 0.35, CYL_H, 20), ferroScuro);
      cy.position.set(cx, CYL_H / 2, cz); cy.name = 'scala-antincendio'; group.add(cy);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(CYL_R + 0.12, CYL_R + 0.12, 0.35, 20), ferro);
      cap.position.set(cx, CYL_H + 0.17, cz); cap.name = 'coronamento-scala'; group.add(cap);
      for (let k = 0; k < 12; k += 1) {                    // montanti verticali
        const a = (k / 12) * Math.PI * 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, CYL_H, 0.14), ferro);
        m.position.set(cx + Math.sin(a) * CYL_R, CYL_H / 2, cz + Math.cos(a) * CYL_R);
        m.rotation.y = a; m.raycast = () => {}; group.add(m);
      }
      // direzione radiale verso il muro della corte
      const dx = cx - 0, dz = cz - CZ, dl = Math.hypot(dx, dz) || 1;
      const ux = dx / dl, uz = dz / dl, span = Math.max(1.2, R_IN - dl);
      PIANI.forEach((h, n) => {
        const anello = new THREE.Mesh(new THREE.TorusGeometry(CYL_R, 0.09, 6, 20), ferro);
        anello.rotation.x = Math.PI / 2; anello.position.set(cx, h + 1.05, cz);
        anello.name = 'parapetto-scala'; anello.raycast = () => {}; group.add(anello);
        const piano = new THREE.Mesh(new THREE.CylinderGeometry(CYL_R, CYL_R, 0.14, 20), ferroScuro);
        piano.position.set(cx, h, cz); piano.raycast = () => {}; group.add(piano);
        // passerella di collegamento all'edificio, a ogni piano
        const mid = CYL_R + span / 2 - 0.2, ang = Math.atan2(ux, uz);
        const pass = new THREE.Mesh(new THREE.BoxGeometry(PASS_W, 0.14, span), ferroScuro);
        pass.position.set(cx + ux * mid, h, cz + uz * mid);
        pass.rotation.y = ang;
        pass.name = 'passerella-scala-' + (n + 1); pass.raycast = () => {}; group.add(pass);
        [-1, 1].forEach((sgn) => {                          // parapetti della passerella
          const pr = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, span), ferro);
          const px = Math.cos(ang) * sgn * (PASS_W / 2), pz = -Math.sin(ang) * sgn * (PASS_W / 2);
          pr.position.set(pass.position.x + px, h + 0.57, pass.position.z + pz);
          pr.rotation.y = pass.rotation.y; pr.raycast = () => {}; group.add(pr);
        });
      });
    }

    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.renderOrder = 2;
    scene.add(group);

    /* ---------------- visibilità e sostituzione dell'estrusione OSM ----------------
       Questo modulo deve prendere il posto dell'estrusione OSM di CU006, ma non può toccare
       campus-3d.js: nasconde quindi da qui le mesh dell'edificio cercandole nel gruppo «edifici»
       per userData.code / userData.facadeCode. Si controlla a intervalli perché campus-3d
       ricostruisce il gruppo quando cambia vista, editor o palette delle facciate, e le mesh
       nuove tornerebbero visibili.
       Due accortezze: si nascondono solo le mesh, non le LineSegments del contorno, che servono
       all'evidenziazione di CU006 quando l'utente la seleziona; e l'estrusione torna visibile
       appena questo gruppo si spegne (vista 2D o edifici spenti), così la planimetria resta intera. */
    const CODE = 'CU006';
    const sync = () => {
      const ex = scene.getObjectByName('minerva'), ed = scene.getObjectByName('edifici');
      const on = !group.userData.force && (ex ? ex.visible : true) && (ed ? ed.visible : true);
      group.visible = on;
      if (!ed) return;
      ed.traverse((o) => {
        if (!o.isMesh) return;
        const u = o.userData || {};
        if (u.code === CODE || u.facadeCode === CODE) {
          if (on) { if (o.visible) { o.userData.castelnuovoHidden = true; o.visible = false; } }
          else if (o.userData.castelnuovoHidden) { o.userData.castelnuovoHidden = false; o.visible = true; }
        }
      });
    };
    sync(); setInterval(sync, 250);
    window.campus3d.matematicaCastelnuovo = group;
  }

  whenReady(build);
})();

/* Edificio di Fisica «Guglielmo Marconi» (CU013 della Città Universitaria, Giuseppe Pagano,
   progetto 1932-35, realizzazione 1936): modello procedurale degli esterni. Caricato dopo
   campus-3d.js; aspetta window.campus3d e window.MAPPA3D_READY, poi aggiunge alla scena il
   gruppo «fisica-marconi» e nasconde l'estrusione OSM di CU013, come fa matematica-castelnuovo.js
   con CU006.

   REGOLA SEGUITA. La stilizzazione semplifica superfici e tessiture, non inventa geometrie:
   ogni quota qui sotto ha la sua fonte nel commento, e quello che le fonti non dicono non è
   stato modellato (l'elenco è in fondo a questa intestazione).

   IMPRONTA E TERNA LOCALE (fonte 1). Relazione OSM 5457573 in campus-buildings.json
   (© OpenStreetMap contributors, ODbL): anello esterno di 12 vertici più due anelli interni,
   la corte centrale (434 m²) e un pozzo di luce nel settore est (49 m²). Area netta 4.221 m².
   La direzione della maglia, 69,645° da nord, è il fit pesato sulle lunghezze di tutti i lati
   dell'anello esterno modulo 90°: nella terna locale l'impronta risulta ortogonale entro ±0,4 m,
   quindi la maglia è quella e non una media di lati storti.
     x = lungo 69,645° (verso est-nord-est, cioè verso il piazzale della Minerva);
     z = lungo 159,645° (verso sud-sud-est, cioè verso lo stradone Chimica-Fisica).
   Origine: centroide OSM. L'impronta è usata tale e quale, vertice per vertice.

   RISCONTRO CON LA PLANIMETRIA UFFICIALE (fonte 2). ACU013.pdf (scheda Sapienza di CU013) e la
   stessa sagoma presente in site/index.html (MAPD.shapes, planimetria ufficiale in coordinate
   PDF). Registrata sull'immagine della scheda, l'impronta OSM coincide con quella disegnata:
   stessa corte, stesso pozzo di luce, stessa rientranza a ovest, stesso intaglio a est. Due
   differenze note: la planimetria ufficiale dà il fabbricato più corto di ~6 m a ovest e ha una
   rientranza di 7 m sul fronte nord-nord-ovest che OSM non ha. Non sono state recepite: la
   registrazione della planimetria ufficiale nel mondo ha residuo mediano 3,2 m
   (vector-alignment.json) e l'impronta OSM è il riferimento di posizione, orientamento e scala.

   INGRESSO PRINCIPALE (fonte 2). La scheda ACU013.pdf segna l'ingresso con una freccia. Posta
   la scheda in registro con l'impronta (rotazione, scala e traslazione ai minimi quadrati sul
   poligono disegnato), la freccia cade a x ≈ 22, z ≈ 52 e punta verso nord-nord-ovest: indica
   quindi il fronte interno all'intaglio sud-est, il muro z = 13,84 fra x 13,6 e 48,1, e non il
   fronte lungo. L'intaglio stesso (35 × 20 m, vuoto nell'impronta) è il piazzale d'ingresso di
   cui parlano le schede. La posizione lungo il muro è ±5 m: X_ENTR è un parametro.

   QUOTE (fonte 3). Il piano di emergenza Sapienza/INFN del novembre 2012 documenta per CU013
   «cinque piani fuori terra e un piano seminterrato». L'altezza di sommità 21 m è quella della
   tabella QUOTE_CORRETTE di campus-3d.js (il tag OSM «3 piani» è errato); il context pack non
   dà altezze, quindi 21 m resta l'unico dato disponibile. La scansione dei piani è quella
   misurata sull'edificio coevo CU014 (nota height_note in campus-buildings.json: «piano terra e
   quattro piani, primo piano a 5,25 m e interpiano 3,95 m»). Da quei due numeri discende anche
   la quota del piano terra: 5,25 - 3,95 = 1,30 m, cioè il piano terra è rialzato di 1,30 m sul
   terreno, quanto lo zoccolo in travertino. I cinque livelli stanno quindi a 1,30 / 5,25 / 9,20
   / 13,15 / 17,10 e l'ultimo solaio chiude a 21,05: le due fonti coincidono entro 5 cm, quindi
   i cinque piani documentati stanno esattamente nei 21 m del repository.

   ALTEZZE DIFFERENZIATE: PERCHÉ NON CI SONO. Le schede chiedono quote diverse per corpo
   (sopraelevazione di un piano sul fronte ovest 1959-61; settore est con parti a due livelli),
   ma nessuna fonte del pacchetto dice dove comincia e dove finisce ciascun corpo. L'unica
   misura indipendente disponibile è l'ortofoto AGEA 2020 del repository: l'ombra portata a
   nord-nord-ovest del fronte lungo è larga 6-7 m uniformemente da x = -35 a x = +40, cioè il
   fronte lungo non ha gradini di quota. Per il lato sud non c'è segnale (quel fronte è
   controsole). Perciò la massa è a quota unica e i corpi differenziati NON sono modellati;
   i parametri H_OVEST / X_OVEST e H_EST / X_EST esistono e valgono 0 (= disattivati) perché
   bastino un rilievo o una foto quotata per accenderli senza toccare il codice.

   MATERIALI (fonte 4). Rivestimento continuo a listelli di litoceramica giallo-arancio (non
   laterizio a vista) e zoccolo, pavimentazioni e dettagli in travertino romano: ArchiDiAP,
   Museo di Fisica e la relazione «Solarizzazione della Sapienza». I toni usati sono quelli che
   campus-3d.js assegna già a CU013 nella palette «giallo» di facciate.json (muro #d6a66b /
   #c7955c, giunti chiari, bande #e2dccf), che coincidono con la palette proxy del context pack
   (#C99451 / #D7A466 / #BE8140). La scena è molto luminosa: come in matematica-castelnuovo.js
   la texture porta i colori veri e il materiale li modula con un colore più basso, altrimenti
   listelli e giunti spariscono al sole.

   SCALA DEI COMPONENTI (fonte 5). Studio accademico Arts 2019, §3.2: molte finestre originali
   di 150 × 200 cm, lastre quadrate del piazzale d'ingresso di 60 cm di lato. Il passo
   orizzontale delle finestre non è documentato da nessuna fonte: si usa 3,60 m, lo stesso che
   campus-3d.js adopera per le facciate di CU014, edificio coevo dello stesso campus.

   NON MODELLATO, PER MANCANZA DI FONTI (dichiarato invece che immaginato):
   - gruppo scultoreo di Corrado Vigni nella corte e bassorilievi presso la scalinata: esistenza
     documentata, ubicazione e ingombro no;
   - volumi tecnici e gabbiotti metallici in copertura, impianto fotovoltaico (progetto 2018):
     presenza nel 2026 non accertata;
   - passerella «en plein air» al secondo livello sul lato nord e le sue chiusure successive;
   - sopraelevazione ovest 1959-61 e ala bassa est, per i motivi detti sopra;
   - seminterrato e dislivelli del terreno attorno all'edificio.

   Parametri sovrascrivibili senza push su git: window.MAPPA3D_OVERRIDES.marconi (vedi
   MAPPA-3D-API.md). Si leggono in readParams(), chiamata da build(): overrides.js riempie
   l'oggetto in modo asincrono. Con overrides vuoti il render è quello originale. */
(function () {
  'use strict';

  /* Centroide dell'impronta OSM di CU013 e direzione della maglia (est, nord). */
  const REF = { lon: 12.513346268489101, lat: 41.9031694828702 };
  const U = [0.937553, 0.347843];     // bearing 69,645°: lungo x locale
  const NOUT = [-0.347843, 0.937553]; // bearing 339,645°: il verso -z locale

  /* Anelli dell'impronta OSM nella terna locale, in metri [x, z]. Anello 0 esterno,
     anello 1 corte centrale, anello 2 pozzo di luce del settore est. */
  const RING_OUT = [[48.66, -26.95], [-42.40, -26.81], [-42.53, -3.97], [-29.43, -3.69],
    [-29.78, 1.57], [-41.77, 1.97], [-41.69, 25.70], [-39.52, 25.06], [-39.23, 34.23],
    [12.96, 33.67], [13.61, 13.83], [48.09, 13.84]];
  const RING_CORTE = [[-16.93, 4.89], [-16.11, 4.86], [4.06, 4.27], [4.99, 4.24],
    [5.02, 23.96], [-17.63, 24.15]];
  const RING_POZZO = [[37.08, -8.39], [29.43, -8.54], [29.47, -1.90], [36.80, -1.87]];

  let P = {};
  let X_MID, Z_MID,                       // ritocco dell'intero gruppo nella terna locale
    H, H_CORN, CORN_OUT, H_ZOCC, ZOCC_OUT, // sommità, fascia di coronamento, zoccolo
    PIANI, WIN_W, WIN_H, WIN_PITCH, WIN_DEP, SILLS, // scansione dei piani e delle finestre
    X_ENTR, DOOR_W, DOOR_H, PENS_W, PENS_D, PENS_Y, PENS_T, // ingresso e pensilina
    PLAT_Z, PLAT_H, STEPS, LASTRA,        // piazzale rialzato, scalinata, lato delle lastre
    H_OVEST, X_OVEST, H_EST, X_EST;       // corpi a quota diversa: spenti, vedi intestazione

  function readParams() {
    P = (window.MAPPA3D_OVERRIDES && window.MAPPA3D_OVERRIDES.marconi) || {};
    X_MID = P.X_MID ?? 0; Z_MID = P.Z_MID ?? 0;
    // 21 m: QUOTE_CORRETTE di campus-3d.js; coincide con i 5 livelli del piano di emergenza 2012
    H = P.H ?? 21.0;
    // fascia di coronamento: 0,9 m è la quota d'attico che campus-3d.js usa su tutto il campus
    H_CORN = P.H_CORN ?? 0.9; CORN_OUT = P.CORN_OUT ?? 0.34;
    /* Zoccolo in travertino documentato; l'altezza no, ma la scansione misurata su CU014 la
       determina: con il primo piano a 5,25 m e interpiano 3,95 m, il piano terra comincia a
       5,25 - 3,95 = 1,30 m sopra il terreno, cioè l'edificio ha il piano terra rialzato e lo
       zoccolo è alto quanto quel rialzo (nel repository interno-aldo-moro.js usa 1,20 m per il
       piano rialzato di CU015 e CU016, due edifici dello stesso campus). */
    H_ZOCC = P.H_ZOCC ?? 1.3; ZOCC_OUT = P.ZOCC_OUT ?? 0.12;
    PIANI = P.PIANI ?? 5;
    // 150 × 200 cm: finestre originali documentate (Arts 2019 §3.2); orientamento largh./alt.
    WIN_W = P.WIN_W ?? 1.5; WIN_H = P.WIN_H ?? 2.0; WIN_DEP = P.WIN_DEP ?? 0.32;
    // passo non documentato: 3,60 m, lo stesso delle facciate di CU014 in campus-3d.js
    WIN_PITCH = P.WIN_PITCH ?? 3.6;
    /* Davanzali: i cinque piani fuori terra stanno a 1,30 / 5,25 / 9,20 / 13,15 / 17,10
       (piano terra rialzato e interpiano 3,95 m misurati su CU014), più 0,95 m di parapetto
       interno. L'ultima fila chiude a 20,05 m, appena sotto la fascia di coronamento. */
    SILLS = Array.isArray(P.SILLS) && P.SILLS.length ? P.SILLS.slice() : [2.25, 6.20, 10.15, 14.10, 18.05];
    // ingresso: asse letto sulla freccia della scheda ACU013 (±5 m), luce e altezza stilizzate
    X_ENTR = P.X_ENTR ?? 22.5; DOOR_W = P.DOOR_W ?? 6.4; DOOR_H = P.DOOR_H ?? 4.0;
    // pensilina documentata, dimensioni no: lastra piatta sopra l'ingresso
    PENS_W = P.PENS_W ?? 11.0; PENS_D = P.PENS_D ?? 3.6; PENS_Y = P.PENS_Y ?? 5.3; PENS_T = P.PENS_T ?? 0.38;
    /* Piazzale rialzato in travertino dentro l'intaglio sud-est: profondità e numero di alzate
       non documentati; la quota è quella dello zoccolo, le lastre sono i 60 cm documentati. */
    PLAT_Z = P.PLAT_Z ?? 24.0; PLAT_H = P.PLAT_H ?? H_ZOCC; STEPS = P.STEPS ?? 5; LASTRA = P.LASTRA ?? 0.6;
    // corpi a quota diversa: 0 = non modellati, vedi intestazione
    H_OVEST = P.H_OVEST ?? 0; X_OVEST = P.X_OVEST ?? -29.6;
    H_EST = P.H_EST ?? 0; X_EST = P.X_EST ?? 13.6;
  }

  function whenReady(fn) {
    const c = window.campus3d;
    if (window.MAPPA3D_READY === true && typeof THREE !== 'undefined' && c && c.scene
      && typeof c.project === 'function' && c.scene.getObjectByName('edifici')) fn(c);
    else setTimeout(() => whenReady(fn), 500);
  }

  /* Litoceramica: listelli rettangolari posati a corsi orizzontali sfalsati, giunti chiari
     sottili. Il riquadro disegnato vale TILE_L metri di lato, così il repeat si calcola in metri. */
  const TILE_L = 3.0;
  function litoceramicaTexture() {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const rows = 24, rh = S / rows, cols = 6, cw = S / cols; // corsi di 12,5 cm, listelli di 50 cm
    g.fillStyle = '#e6d8c0'; g.fillRect(0, 0, S, S); // fondo = colore dei giunti
    for (let r = 0; r < rows; r += 1) {
      const off = (r % 2) * cw * 0.5;
      for (let i = -1; i <= cols; i += 1) {
        const x = i * cw + off, t = 0.9 + Math.random() * 0.2;
        const base = (r + i) % 3 === 0 ? [199, 149, 92] : [214, 166, 107]; // #c7955c e #d6a66b
        g.fillStyle = `rgb(${Math.round(base[0] * t)},${Math.round(base[1] * t)},${Math.round(base[2] * t)})`;
        g.fillRect(x + 0.9, r * rh + 0.9, cw - 1.8, rh - 1.8);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    return tex;
  }

  /* Travertino a corsi regolari per zoccolo, coronamento e pavimentazioni. */
  function travertinoTexture(rows, cols, tile) {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const rh = S / rows, cw = S / cols;
    g.fillStyle = '#b3a890'; g.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r += 1) {
      for (let i = 0; i < cols; i += 1) {
        const t = 0.93 + Math.random() * 0.12;
        g.fillStyle = `rgb(${Math.round(222 * t)},${Math.round(212 * t)},${Math.round(192 * t)})`;
        g.fillRect(i * cw + 1.1, r * rh + 1.1, cw - 2.2, rh - 2.2);
        for (let k = 0; k < 14; k += 1) { // pori e venature, appena accennati
          const vx = i * cw + 2 + Math.random() * (cw - 6), vy = r * rh + 2 + Math.random() * (rh - 6);
          g.fillStyle = `rgba(150,138,116,${0.05 + Math.random() * 0.1})`;
          g.fillRect(vx, vy, 2 + Math.random() * 7, 1 + Math.random() * 2);
        }
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    tex.userData = { tile: tile };
    return tex;
  }

  /* --- geometria di servizio sugli anelli dell'impronta --- */
  function inRing(ring, x, z) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, zi] = ring[i], [xj, zj] = ring[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
  }
  /* Normale unitaria del lato i verso lo spazio aperto: fuori dall'anello esterno,
     dentro l'anello di una corte. */
  function openNormal(ring, i, hole) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    let nx = -dz / L, nz = dx / L;
    const inside = inRing(ring, (a[0] + b[0]) / 2 + nx * 0.4, (a[1] + b[1]) / 2 + nz * 0.4);
    if (inside !== !!hole) { nx = -nx; nz = -nz; }
    return [nx, nz];
  }

  function build(c) {
    readParams();
    const scene = c.scene;
    const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.95, metalness: 0 }, extra));

    /* Colori: la scena è molto luminosa, quindi i materiali modulano le texture verso il basso.
       0xbe9058 sul giallo della palette «giallo» di campus-3d restituisce la litoceramica senza
       bruciare i giunti; 0xcbc0a8 è lo stesso travertino di matematica-castelnuovo.js. */
    const baseLito = litoceramicaTexture();
    const LITO_COL = P.LITO_COL ?? 0xbe9058;
    const lito = (wM, hM) => {
      const t = baseLito.clone(); t.needsUpdate = true;
      t.repeat.set(Math.max(0.2, wM / TILE_L), Math.max(0.2, hM / TILE_L));
      return std(LITO_COL, { map: t, roughness: 0.88 });
    };
    const litoWall = lito(TILE_L, TILE_L); // facce verticali dell'estrusione: UV in metri
    const baseTrav = travertinoTexture(6, 4, 3.0);
    const TRAV_COL = P.TRAV_COL ?? 0xcbc0a8;
    const trav = (wM, hM, tex, tile) => {
      const t = (tex || baseTrav).clone(); t.needsUpdate = true;
      const s = tile || 3.0;
      t.repeat.set(Math.max(0.2, wM / s), Math.max(0.2, hM / s));
      return std(TRAV_COL, { map: t, roughness: 0.9 });
    };
    const travPlain = std(P.TRAV_PLAIN ?? 0xc8bda6, { roughness: 0.92 });
    const travDark = std(P.TRAV_DARK ?? 0x9c9280, { roughness: 0.95 });
    const shadow = std(0x2d2b27, { roughness: 1 });
    const glassDark = std(P.VETRO ?? 0x2a373d, { roughness: 0.2, metalness: 0.2 });
    const metal = std(0x8e918d, { roughness: 0.5, metalness: 0.25 });
    const roofMat = std(P.ROOF ?? 0x8d877c, { roughness: 1 }); // guaina chiara: al sole della scena un grigio piu' alto esce bianco
    const corteMat = std(P.CORTE ?? 0x51603a, { roughness: 1 }); // corte piantumata (ortofoto AGEA 2020): verde basso, al sole della scena un verde piu' alto esce slavato
    const lastre = trav(1, 1, travertinoTexture(Math.round(3 / LASTRA), Math.round(3 / LASTRA), 3), 3);

    const group = new THREE.Group(); group.name = 'fisica-marconi';
    const dE = U[0] * X_MID - NOUT[0] * Z_MID;
    const dN = U[1] * X_MID - NOUT[1] * Z_MID;
    const origin = c.project([REF.lon + dE / (111320 * Math.cos(REF.lat * Math.PI / 180)),
      REF.lat + dN / 111320]);
    group.position.set(origin.x, 0, origin.z);
    group.rotation.y = Math.atan2(U[1], U[0]);

    const box = (x0, x1, y0, y1, z0, z1, mat, name) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      if (name) m.name = name;
      group.add(m); return m;
    };
    /* flat(pts, y, mat, h, name, holes) — poligono orizzontale in pianta, eventualmente estruso.
       pts e holes sono elenchi di coppie [x, z] nel riferimento locale. */
    const flat = (pts, y, mat, h, name, holes) => {
      const mk = (list) => {
        const p = new THREE.Path();
        list.forEach(([x, z], i) => (i ? p.lineTo(x, -z) : p.moveTo(x, -z)));
        p.closePath(); return p;
      };
      const s = new THREE.Shape();
      pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
      s.closePath();
      if (holes) holes.forEach((hl) => s.holes.push(mk(hl)));
      const geo = h ? new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }) : new THREE.ShapeGeometry(s);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2; m.position.y = y;
      if (name) m.name = name;
      group.add(m); return m;
    };
    /* banda(ring, y0, y1, out, mat) — fascia continua di pietra lungo tutti i lati dell'anello,
       sporgente di «out» dal filo del muro: serve per zoccolo e coronamento, che su una pianta
       così articolata non si possono ottenere con un semplice offset del poligono. */
    const banda = (ring, y0, y1, out, mat, hole, name) => {
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
        if (L < 0.2) continue;
        const [nx, nz] = openNormal(ring, i, hole);
        const dep = out + 0.7, off = out - dep / 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(L + out * 2, y1 - y0, dep), mat);
        m.position.set((a[0] + b[0]) / 2 + nx * off, (y0 + y1) / 2, (a[1] + b[1]) / 2 + nz * off);
        m.rotation.y = Math.atan2(-dz / L, dx / L);
        m.name = name || 'fascia'; m.raycast = () => {};
        group.add(m);
      }
    };

    /* ---------------- massa muraria ----------------
       Estrusione dell'impronta OSM, corte e pozzo di luce compresi, fino all'imposta della
       fascia di coronamento. Le facce verticali prendono la litoceramica con UV in metri. */
    const H_MURO = H - H_CORN;
    const massa = flat(RING_OUT, 0, [roofMat, litoWall], H_MURO, 'massa-muraria', [RING_CORTE, RING_POZZO]);
    massa.castShadow = true; massa.receiveShadow = true;

    /* Zoccolo in travertino e fascia di coronamento, su tutti e tre gli anelli. */
    banda(RING_OUT, 0, H_ZOCC, ZOCC_OUT, travDark, false, 'zoccolo');
    banda(RING_CORTE, 0, H_ZOCC, ZOCC_OUT, travDark, true, 'zoccolo-corte');
    banda(RING_OUT, H_MURO, H, CORN_OUT, travPlain, false, 'coronamento');
    banda(RING_CORTE, H_MURO, H, CORN_OUT * 0.6, travPlain, true, 'coronamento-corte');
    banda(RING_POZZO, H_MURO, H, CORN_OUT * 0.6, travPlain, true, 'coronamento-pozzo');

    /* Copertura piana praticabile dentro il parapetto formato dal coronamento. */
    flat(RING_OUT, H_MURO + 0.05, roofMat, 0, 'copertura', [RING_CORTE, RING_POZZO]).receiveShadow = true;

    /* Corte centrale e pozzo di luce: la corte è piantumata (ortofoto AGEA 2020), con una
       fascia lastricata lungo i muri; il pozzo resta un fondo in pietra. */
    flat(RING_CORTE, 0.05, corteMat, 0, 'corte-verde');
    flat(RING_POZZO, 0.05, travDark, 0, 'fondo-pozzo');

    /* ---------------- finestre ----------------
       Un'apertura per campata e per piano, passo WIN_PITCH, centrate sul lato. Ogni finestra è
       un unico volume scuro incassato nel muro: lo sguancio che ne nasce è ciò che fa leggere
       l'apertura, senza cornici in rilievo che le fonti non documentano. */
    const winGeo = new THREE.BoxGeometry(WIN_W, WIN_H, WIN_DEP);
    const sills = SILLS.slice(0, PIANI);
    let nwin = 0;
    const fileDiFinestre = (ring, hole) => {
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
        if (L < WIN_PITCH * 1.5) continue; // i risvolti corti non prendono la fila
        const ux = dx / L, uz = dz / L;
        const [nx, nz] = openNormal(ring, i, hole);
        const n = Math.floor(L / WIN_PITCH);
        const start = (L - (n - 1) * WIN_PITCH) / 2;
        const ang = Math.atan2(-uz, ux);
        const fronteIngresso = !hole && Math.abs(nz - 1) < 0.01 && Math.abs(a[1] - 13.84) < 0.4;
        for (let k = 0; k < n; k += 1) {
          const t = start + k * WIN_PITCH;
          const cx = a[0] + ux * t, cz = a[1] + uz * t;
          if (fronteIngresso && Math.abs(cx - X_ENTR) < (DOOR_W + WIN_W) / 2 + 0.3) continue;
          sills.forEach((y0) => {
            const m = new THREE.Mesh(winGeo, glassDark);
            // lo scasso sta dentro il muro e affiora di 2 cm: e' lo spessore del rivestimento
            // a far leggere l'apertura, senza cornici in rilievo che le fonti non documentano
            const off = 0.02 - WIN_DEP / 2;
            m.position.set(cx + nx * off, y0 + WIN_H / 2, cz + nz * off);
            m.rotation.y = ang; m.name = 'finestra'; m.raycast = () => {};
            group.add(m); nwin += 1;
          });
        }
      }
    };
    fileDiFinestre(RING_OUT, false);
    fileDiFinestre(RING_CORTE, true);

    /* ---------------- piazzale rialzato, scalinata e ingresso ----------------
       Stanno nell'intaglio sud-est dell'impronta, davanti al muro z = 13,84. Il piazzale è
       lastricato in travertino con lastre quadrate di 60 cm (misura documentata); la scalinata
       scende verso il piazzale della Minerva. */
    const PX0 = 13.61, PX1 = 48.09, PZ0 = 13.84;
    flat([[PX0, PZ0], [PX1, PZ0], [PX1, PLAT_Z], [PX0, PLAT_Z]], 0, lastre, PLAT_H, 'piazzale-travertino')
      .receiveShadow = true;
    const SH = PLAT_H / STEPS;
    for (let k = 0; k < STEPS; k += 1) {
      const d = (STEPS - k) * 0.36;
      box(PX0, PX1, k * SH, (k + 1) * SH, PLAT_Z - 0.01, PLAT_Z + d, travPlain, 'gradino');
    }
    // vano d'ingresso: fondo scuro, porte vetrate partite da montanti, pensilina piatta sopra
    /* La massa e' un'estrusione piena: la profondita' dell'incasso si legge solo dal fronte,
       quindi il vano e' una campitura scura a filo e porte e montanti stanno appena davanti. */
    box(X_ENTR - DOOR_W / 2, X_ENTR + DOOR_W / 2, PLAT_H, PLAT_H + DOOR_H,
      PZ0 - 0.3, PZ0 + 0.02, shadow, 'vano-ingresso');
    const porta = box(X_ENTR - DOOR_W / 2 + 0.3, X_ENTR + DOOR_W / 2 - 0.3, PLAT_H + 0.02, PLAT_H + DOOR_H - 0.5,
      PZ0 + 0.02, PZ0 + 0.06, glassDark, 'porta');
    porta.raycast = () => {};
    for (let k = 0; k <= 6; k += 1) {
      const x = X_ENTR - DOOR_W / 2 + 0.3 + (DOOR_W - 0.6) * (k / 6);
      box(x - 0.05, x + 0.05, PLAT_H + 0.02, PLAT_H + DOOR_H - 0.5, PZ0 + 0.04, PZ0 + 0.1, metal, 'montante-porta');
    }
    // soglia in travertino sotto la porta, a filo del piazzale
    box(X_ENTR - DOOR_W / 2 - 0.3, X_ENTR + DOOR_W / 2 + 0.3, PLAT_H - 0.06, PLAT_H + 0.02,
      PZ0 - 1.1, PZ0 + 0.9, travPlain, 'soglia');
    box(X_ENTR - PENS_W / 2, X_ENTR + PENS_W / 2, PENS_Y, PENS_Y + PENS_T,
      PZ0 - 0.1, PZ0 + PENS_D, travPlain, 'pensilina');

    /* ---------------- corpi a quota diversa (spenti per mancanza di fonti) ----------------
       Accendendo H_OVEST o H_EST si sovrappone alla massa un volume più alto o più basso sul
       tratto indicato: serve quando arriverà un rilievo che dica dove cominciano i corpi. */
    if (H_OVEST > 0) {
      const p = RING_OUT.filter(([x]) => x <= X_OVEST);
      if (p.length > 2) flat(p.concat([[X_OVEST, p[p.length - 1][1]], [X_OVEST, p[0][1]]]), H_MURO,
        litoWall, H_OVEST - H_MURO, 'corpo-ovest');
    }
    if (H_EST > 0) {
      box(X_EST, 48.66, H_EST, H_MURO, -26.95, 13.84, roofMat, 'taglio-corpo-est');
    }

    group.traverse((o) => {
      if (o.isMesh && o.name !== 'finestra') { o.castShadow = true; o.receiveShadow = true; }
    });
    group.renderOrder = 2;
    scene.add(group);

    /* ---------------- visibilità e sostituzione dell'estrusione OSM ----------------
       Come matematica-castelnuovo.js con CU006: questo modulo prende il posto dell'estrusione
       OSM di CU013 senza toccare campus-3d.js, nascondendo le sole Mesh dell'edificio (non le
       LineSegments del contorno, che servono all'evidenziazione quando l'utente lo seleziona) e
       ripristinandole appena il gruppo si spegne. Si ricontrolla a intervalli perché campus-3d
       ricostruisce il gruppo «edifici» al cambio di vista, editor o palette delle facciate. */
    const CODE = 'CU013';
    const sync = () => {
      const ex = scene.getObjectByName('minerva'), ed = scene.getObjectByName('edifici');
      const on = !group.userData.force && (ex ? ex.visible : true) && (ed ? ed.visible : true);
      group.visible = on;
      if (!ed) return;
      ed.traverse((o) => {
        if (!o.isMesh) return;
        const u = o.userData || {};
        if (u.code === CODE || u.facadeCode === CODE) {
          if (on) { if (o.visible) { o.userData.marconiHidden = true; o.visible = false; } }
          else if (o.userData.marconiHidden) { o.userData.marconiHidden = false; o.visible = true; }
        }
      });
    };
    sync(); setInterval(sync, 250);
    group.userData.finestre = nwin;
    window.campus3d.fisicaMarconi = group;
  }

  whenReady(build);
})();

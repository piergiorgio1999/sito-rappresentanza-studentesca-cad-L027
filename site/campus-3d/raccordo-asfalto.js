/* Raccordo di asfalto fra le tre superfici pavimentate già presenti: il piazzale interno
   dell'ingresso di Viale Aldo Moro (interno-aldo-moro.js), lo stradone fra Chimica e Fisica
   (campus-3d.js, costante AVENUE) e il piazzale della vasca della Minerva (buildMinervaArea).
   Caricato dopo interno-aldo-moro.js; aspetta window.campus3d e window.MAPPA3D_READY.

   Riferimento locale: lo stesso del colonnato e del piazzale interno (u lungo le colonne,
   v cresce verso Piazzale Aldo Moro, quindi verso l'interno della Città Universitaria
   v è negativo). I riquadri sono stati ricavati misurando in Playwright i Box3 reali dei
   tre gruppi e sondando il terreno con raycast, non sommando le costanti dei tre sistemi:
   - piazzale interno: asfalto fino a v = -78 (u -46..46);
   - stradone: v ≈ -66 .. -166, u ≈ -9,7 .. 11,1;
   - vasca della Minerva: v ≈ -186 .. -205, u ≈ -18 .. 27.
   Il piano sta a quota 0,004 m, cioè SOTTO tutte le altre superfici (asfalto del piazzale
   0,02, stradone 0,005, prati 0,2, marciapiedi 0,15, vasca 0..0,95): così riempie i vuoti
   e resta nascosto ovunque ci sia già qualcosa, senza tagliare buchi nei poligoni. */
(function () {
  'use strict';
  const REF = { lon: 12.5122, lat: 41.9021 };
  const CENTER_EN = [10.005, 18.489];
  const A = [0.37442, -0.92726]; // (est, nord)
  const N = [-0.92726, -0.37442];
  /* Parametri sovrascrivibili senza push su git: window.MAPPA3D_OVERRIDES.raccordo
     (vedi MAPPA-3D-API.md). Si leggono in readParams(), chiamata da build(). */
  let P = {};
  let U_MID, V_MID, Y,
    V_A0, V_A1, W_A,      // riquadro A: giunzione col piazzale interno, a tutta larghezza
    V_B1, B_U0, B_U1,     // riquadri B: le due fasce laterali lungo lo stradone (entrano sotto i prati)
    V_C1, V_C2, W_C, C_USX, C_UDX, // riquadri C: piazzale davanti alla vasca della Minerva e le due ali di fianco
    TILE, COL_1, COL_2;
  function readParams() {
    P = (window.MAPPA3D_OVERRIDES && window.MAPPA3D_OVERRIDES.raccordo) || {};
    U_MID = P.U_MID ?? 2.1; V_MID = P.V_MID ?? -0.6; // come interno-aldo-moro.js: stesso riferimento
    Y = P.Y ?? 0.004;
    V_A0 = P.V_A0 ?? -74; V_A1 = P.V_A1 ?? -98; W_A = P.W_A ?? 46;
    V_B1 = P.V_B1 ?? -156; B_U0 = P.B_U0 ?? 22; B_U1 = P.B_U1 ?? 46;
    V_C1 = P.V_C1 ?? -188; V_C2 = P.V_C2 ?? -206; W_C = P.W_C ?? 42;
    /* le ali si fermano fuori dall'ingombro della vasca (u da circa -18 a 27): dentro c'è
       l'acqua, che sta a quota -0,4 e verrebbe coperta da un piano a quota 0,004. */
    C_USX = P.C_USX ?? -19; C_UDX = P.C_UDX ?? 26;
    TILE = P.TILE ?? 32;
    COL_1 = P.COL_1 ?? '#55565a'; COL_2 = P.COL_2 ?? '#45464a';
  }

  function whenReady(fn) {
    const c = window.campus3d;
    if (window.MAPPA3D_READY === true && typeof THREE !== 'undefined' && c && c.scene && typeof c.project === 'function' && c.scene.getObjectByName('edifici')) fn(c);
    else setTimeout(() => whenReady(fn), 500);
  }

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* Asfalto consumato, stessa ricetta dello stradone (avenueTexture in campus-3d.js):
     fondo rumoroso, granuli chiari e scuri, rappezzi e crepe. Il riquadro è ripetibile,
     così una sola texture copre riquadri di dimensioni diverse senza stirarsi. */
  function asphaltTexture() {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const rand = rng(20261118);
    g.fillStyle = COL_1; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 40000; i += 1) { g.fillStyle = rand() > 0.5 ? COL_2 : COL_1; g.fillRect(rand() * S, rand() * S, 2.2, 2.2); }
    for (let i = 0; i < 26000; i += 1) { g.fillStyle = rand() > 0.5 ? 'rgba(205,203,196,.28)' : 'rgba(20,20,20,.28)'; g.fillRect(rand() * S, rand() * S, 1.3, 1.3); }
    for (let i = 0; i < 8; i += 1) { // rappezzi appena accennati: più marcati si leggerebbero come ripetizione
      g.fillStyle = rand() > 0.5 ? 'rgba(40,41,43,.07)' : 'rgba(110,111,112,.05)';
      g.fillRect(rand() * S, rand() * S, 40 + 130 * rand(), 24 + 80 * rand());
    }
    g.strokeStyle = 'rgba(20,20,20,.35)'; g.lineWidth = 1.1; // crepe
    for (let i = 0; i < 12; i += 1) {
      let x = rand() * S, y = rand() * S; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 12; k += 1) { x += (rand() - 0.4) * 24; y += (rand() - 0.5) * 18; g.lineTo(x, y); }
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function build(c) {
    readParams();
    const scene = c.scene;
    const group = new THREE.Group(); group.name = 'raccordo-asfalto';

    const origin = c.project([REF.lon + (CENTER_EN[0] + A[0] * U_MID + N[0] * V_MID) / (111320 * Math.cos(REF.lat * Math.PI / 180)),
      REF.lat + (CENTER_EN[1] + A[1] * U_MID + N[1] * V_MID) / 111320]);
    group.position.set(origin.x, 0, origin.z);
    const ax = A[0], az = -A[1];
    group.rotation.y = Math.atan2(-az, ax);

    const mat = new THREE.MeshStandardMaterial({
      map: asphaltTexture(), roughness: 0.97, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4
    });
    /* Un riquadro [u0,u1] x [v0,v1]: le coordinate uv si calcolano dalla posizione in metri,
       così tutti i riquadri condividono una sola texture e combaciano senza giunte. */
    const quad = (u0, u1, v0, v1, name) => {
      const geo = new THREE.PlaneGeometry(u1 - u0, v1 - v0);
      geo.rotateX(-Math.PI / 2);
      geo.translate((u0 + u1) / 2, 0, (v0 + v1) / 2);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i += 1) uv.setXY(i, pos.getX(i) / TILE, pos.getZ(i) / TILE);
      uv.needsUpdate = true;
      const m = new THREE.Mesh(geo, mat);
      m.position.y = Y; m.receiveShadow = true; m.name = name; group.add(m); return m;
    };

    quad(-W_A, W_A, V_A1, V_A0, 'giunzione-piazzale');          // dal piazzale interno all'inizio dei prati dello stradone
    quad(-B_U1, -B_U0, V_B1, V_A1, 'fascia-stradone-sx');       // fasce laterali: fuori dai prati, dove si vedeva il terreno
    quad(B_U0, B_U1, V_B1, V_A1, 'fascia-stradone-dx');
    quad(-W_C, W_C, V_C1, V_B1, 'piazzale-minerva');            // dalla fine dello stradone fino al fronte della vasca
    quad(-W_C, C_USX, V_C2, V_C1, 'piazzale-minerva-sx');       // ali di fianco alla vasca, fuori dall'acqua
    quad(C_UDX, W_C, V_C2, V_C1, 'piazzale-minerva-dx');

    group.traverse((o) => { o.raycast = () => {}; });
    group.renderOrder = 1;
    scene.add(group);

    // visibile solo in 3D e solo con gli edifici accesi (come il piazzale interno)
    const sync = () => {
      const ex = scene.getObjectByName('minerva'), ed = scene.getObjectByName('edifici');
      group.visible = !group.userData.force && (ex ? ex.visible : true) && (ed ? ed.visible : true);
    };
    sync(); setInterval(sync, 250);
    window.campus3d.raccordoAsfalto = group;
  }

  whenReady(build);
})();

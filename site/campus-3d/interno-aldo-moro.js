/* Piazzale interno dell'ingresso di Viale Aldo Moro / Viale Piero Gobetti (lato Città Universitaria): modello procedurale.
   Caricato dopo ingresso-aldo-moro.js; aspetta window.campus3d e la scena, poi aggiunge il gruppo «interno-aldo-moro».
   Stesso riferimento locale del colonnato: u corre lungo le colonne, v cresce verso Piazzale Aldo Moro (esterno),
   quindi l'interno sta a v negativo. Posizioni e proporzioni stimate dalla foto zenitale del proprietario, non da un rilievo:
   edifici, alberi, stalli, aiuole e arredi sono indicativi. */
(function () {
  'use strict';
  const REF = { lon: 12.5122, lat: 41.9021 };
  const CENTER_EN = [10.005, 18.489];
  const A = [0.37442, -0.92726]; // (est, nord)
  const N = [-0.92726, -0.37442];
  /* Parametri sovrascrivibili senza push su git: window.MAPPA3D_OVERRIDES.interno
     (vedi MAPPA-3D-API.md). Si leggono in readParams(), chiamata da build(): overrides.js
     riempie l'oggetto in modo asincrono, quindi leggerli al caricamento dello script
     sarebbe troppo presto. Con overrides vuoti i valori sono quelli originali. */
  let P = {};
  let U_MID, V_MID,
    V_NEAR, V_FAR,        // dal retro del colonnato alla fine dell'area modellata (oltre c'è già il viale del modello)
    U_MAX,                // semilarghezza dell'area
    ROAD_L, ROAD_R,       // cordoli della carreggiata centrale (u)
    FACADE_L, FACADE_R,   // filo reale delle facciate dei due edifici OSM che fiancheggiano il piazzale
    WALK_L, WALK_R,       // filo interno dei marciapiedi: oltre c'e' asfalto, dove sta il filare di alberi
    BLD_V0, BLD_V1,       // tratto in v occupato dai due edifici (marciapiedi lungo le facciate)
    VC, RAISE,            // v della scalinata d'ingresso e quota del piano rialzato
    RAMP_U0, RAMP_U1, RAMP_V0, RAMP_V1, RAMP_H, // rampa carrabile davanti a Igiene
    STALL_D,
    BLOCKS,               // blocchi di stalli: v di inizio (lato interno), primo stallo, numero e larghezza
    ROW3;                 // tre stalli sopra la prima aiuola
  function readParams() {
    P = (window.MAPPA3D_OVERRIDES && window.MAPPA3D_OVERRIDES.interno) || {};
    U_MID = P.U_MID ?? 2.1; V_MID = P.V_MID ?? -0.6;
    V_NEAR = P.V_NEAR ?? -6.1; V_FAR = P.V_FAR ?? -78;
    U_MAX = P.U_MAX ?? 46;
    ROAD_L = P.ROAD_L ?? 15.7; ROAD_R = P.ROAD_R ?? -16;
    /* Fili di facciata e tratto in v presi dalle impronte OSM dei due edifici, non stimati:
       CU016 Ortopedia (u positiva) u 30,5..109,8 e v -2,6..-56,6; CU015 Igiene (u negativa)
       u -31,2..-82 e v -6..-56. */
    FACADE_L = P.FACADE_L ?? 30.5; FACADE_R = P.FACADE_R ?? -31.2;
    WALK_L = P.WALK_L ?? FACADE_L - 7; WALK_R = P.WALK_R ?? FACADE_R + 7;
    BLD_V0 = P.BLD_V0 ?? -4.5; BLD_V1 = P.BLD_V1 ?? -56.3;
    VC = P.VC ?? -35; RAISE = P.RAISE ?? 1.2;
    RAMP_U0 = P.RAMP_U0 ?? -30.2; RAMP_U1 = P.RAMP_U1 ?? -24.6;
    RAMP_V0 = P.RAMP_V0 ?? -66.5; RAMP_V1 = P.RAMP_V1 ?? -41.5; RAMP_H = P.RAMP_H ?? RAISE;
    STALL_D = P.STALL_D ?? 5.2;
    /* BLOCKS si sovrascrive con un array piatto di numeri, 4 per blocco: v, u0, n, w
       (l'API non ammette oggetti annidati). */
    BLOCKS = Array.isArray(P.BLOCKS) && P.BLOCKS.length >= 4
      ? Array.from({ length: Math.floor(P.BLOCKS.length / 4) }, (_, i) => {
        const b = P.BLOCKS.slice(i * 4, i * 4 + 4);
        return { v: b[0], u0: b[1], n: b[2], w: b[3] };
      })
      : [{ v: -38.9, u0: -10, n: 8, w: 2.4 }, { v: -57.4, u0: -9.5, n: 7, w: 2.6 }];
    ROW3 = { u0: P.ROW3_U0 ?? -4.9, u1: P.ROW3_U1 ?? 4.9, v0: P.ROW3_V0 ?? -18.4, v1: P.ROW3_V1 ?? -13.5 };
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

  function build(c) {
    readParams();
    const scene = c.scene;
    const rand = rng(20261117);
    const loader = new THREE.TextureLoader();
    const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.95, metalness: 0 }, extra));
    const lay = (color, n, extra) => std(color, Object.assign({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -n, polygonOffsetUnits: -n * 4 }, extra));
    const trMat = std(0xe7e0cf);
    loader.load('tex/travertino_COL_1k.jpg', (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.25, 0.25); t.anisotropy = 4; trMat.map = t; trMat.needsUpdate = true; });
    const trDark = std(0xcfc6b0);
    const asphaltMat = lay(0x131417, 1);
    const sideMat = std(0x34322f, { roughness: 1 });
    const lawnMat = lay(0x1a3a13, 3);
    const curbMat = lay(0xd8b43c, 2);
    const glassMat = std(0x4f7088, { roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.8 });
    const group = new THREE.Group(); group.name = 'interno-aldo-moro';

    const origin = c.project([REF.lon + (CENTER_EN[0] + A[0] * U_MID + N[0] * V_MID) / (111320 * Math.cos(REF.lat * Math.PI / 180)),
      REF.lat + (CENTER_EN[1] + A[1] * U_MID + N[1] * V_MID) / 111320]);
    group.position.set(origin.x, 0.08, origin.z);
    const ax = A[0], az = -A[1];
    group.rotation.y = Math.atan2(-az, ax);

    const box = (x0, x1, y0, y1, z0, z1, mat, name) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); if (name) m.name = name; group.add(m); return m;
    };
    const flat = (pts, y, mat, h) => {
      const s = new THREE.Shape(); pts.forEach(([u, v], i) => (i ? s.lineTo(u, -v) : s.moveTo(u, -v)));
      const geo = h ? new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }) : new THREE.ShapeGeometry(s);
      const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; group.add(m); return m;
    };
    /* Decalcomania a terra: draw(g, X, Y) disegna su un canvas in cui u e v diventano pixel (la riga 0 è il v più negativo). */
    const decal = (draw, u0, u1, v0, v1, ppm, y, n, name) => {
      const cv = document.createElement('canvas'); cv.width = Math.round((u1 - u0) * ppm); cv.height = Math.round((v1 - v0) * ppm);
      const g = cv.getContext('2d');
      draw(g, (u) => (u - u0) * ppm, (v) => (v - v0) * ppm, ppm);
      const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 8;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(u1 - u0, v1 - v0), lay(0xffffff, n, { map: tex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set((u0 + u1) / 2, y, (v0 + v1) / 2); m.name = name; group.add(m); return m;
    };

    // asfalto su tutta l'area e marciapiedi rialzati sotto i due palazzi
    flat([[-U_MAX, V_NEAR], [U_MAX, V_NEAR], [U_MAX, V_FAR], [-U_MAX, V_FAR]], 0.02, asphaltMat, 0).name = 'asfalto';
    box(WALK_L, FACADE_L, 0, 0.12, V_FAR, BLD_V0, sideMat, 'marciapiede-sx');
    box(FACADE_R, WALK_R, 0, 0.12, V_FAR, BLD_V0, sideMat, 'marciapiede-dx');
    box(WALK_L, U_MAX, 0, 0.12, BLD_V1, V_FAR, sideMat, 'marciapiede-fondo-sx');
    box(-U_MAX, WALK_R, 0, 0.12, BLD_V1, V_FAR, sideMat, 'marciapiede-fondo-dx');
    box(WALK_L, FACADE_L, 0, 0.12, V_NEAR, BLD_V0, sideMat, 'marciapiede-bar');
    box(FACADE_R, WALK_R, 0, 0.12, V_NEAR, BLD_V0, sideMat, 'marciapiede-guardiola');

    // segnaletica generale: cordoli gialli, corsie tratteggiate, frecce, scritte
    const arrow = (g, X, Y, ppm, u, v, du, dv) => {
      g.save(); g.translate(X(u), Y(v)); g.rotate(Math.atan2(dv, du)); g.fillStyle = '#ecebe4';
      const L = 4.2 * ppm, w = 0.35 * ppm, hw = 1.0 * ppm;
      g.fillRect(-L / 2, -w / 2, L * 0.62, w);
      g.beginPath(); g.moveTo(L / 2, 0); g.lineTo(L * 0.1, -hw); g.lineTo(L * 0.1, hw); g.closePath(); g.fill();
      g.restore();
    };
    decal((g, X, Y, ppm) => {
      g.strokeStyle = '#d8b43c'; g.lineWidth = 0.28 * ppm;
      [ROAD_L - 0.15, ROAD_R + 0.15].forEach((u) => { g.beginPath(); g.moveTo(X(u), Y(V_FAR)); g.lineTo(X(u), Y(-26)); g.stroke(); });
      g.lineWidth = 0.16 * ppm; g.setLineDash([2.2 * ppm, 2.2 * ppm]);
      [9.8, -10.6].forEach((u) => { g.beginPath(); g.moveTo(X(u), Y(-62)); g.lineTo(X(u), Y(-29)); g.stroke(); });
      g.setLineDash([]); g.strokeStyle = '#ecebe4'; g.lineWidth = 0.14 * ppm;
      [-12, -15.5].forEach((u) => { g.beginPath(); g.moveTo(X(u), Y(-26)); g.lineTo(X(u), Y(-8)); g.stroke(); }); // corsie d'accesso alla guardiola
      g.lineWidth = 0.4 * ppm; // strisce pedonali sotto il colonnato
      for (let k = 0; k < 5; k++) { const u = -16.6 + k * 0.7; g.beginPath(); g.moveTo(X(u), Y(-6.6)); g.lineTo(X(u), Y(-8)); g.stroke(); }
      arrow(g, X, Y, ppm, 6.8, -26.8, 1, 0); arrow(g, X, Y, ppm, -4, -26.3, 1, 0);
      arrow(g, X, Y, ppm, 4.1, -43.7, 1, 0); arrow(g, X, Y, ppm, -5.7, -60.5, -1, 0);
      arrow(g, X, Y, ppm, -14, -28.5, 0, 1); arrow(g, X, Y, ppm, 6.8, -9.6, 0, -1);
    }, -U_MAX, U_MAX, V_FAR, V_NEAR, 20, 0.03, 4, 'segnaletica');

    // due blocchi di parcheggio: due file di stalli schiena contro schiena, bordo giallo
    const stalls = []; // [u, v, lungo v: +1 / -1]
    BLOCKS.forEach((bk, bi) => {
      const u0 = bk.u0, u1 = bk.u0 + bk.w * bk.n, v0 = bk.v, v1 = bk.v + 2 * STALL_D;
      decal((g, X, Y, ppm) => {
        g.strokeStyle = '#d8b43c'; g.lineWidth = 0.2 * ppm; g.strokeRect(X(u0 - 0.1), Y(v0 - 0.1), (u1 - u0 + 0.2) * ppm, (v1 - v0 + 0.2) * ppm);
        g.strokeStyle = '#ecebe4'; g.lineWidth = 0.1 * ppm;
        for (let i = 0; i <= bk.n; i++) { const u = u0 + i * bk.w; g.beginPath(); g.moveTo(X(u), Y(v0)); g.lineTo(X(u), Y(v1)); g.stroke(); }
        g.beginPath(); g.moveTo(X(u0), Y(v0 + STALL_D)); g.lineTo(X(u1), Y(v0 + STALL_D)); g.stroke();
      }, u0 - 0.5, u1 + 0.5, v0 - 0.5, v1 + 0.5, 64, 0.045, 5, 'blocco-parcheggio-' + (bi + 1));
      for (let i = 0; i < bk.n; i++) for (let r = 0; r < 2; r++) stalls.push([u0 + (i + 0.5) * bk.w, v0 + (r + 0.5) * STALL_D]);
    });
    // fila di tre stalli sul lato alto della prima aiuola
    decal((g, X, Y, ppm) => {
      g.strokeStyle = '#ecebe4'; g.lineWidth = 0.1 * ppm;
      const n = 3, w = (ROW3.u1 - ROW3.u0) / n;
      for (let i = 0; i <= n; i++) { const u = ROW3.u0 + i * w; g.beginPath(); g.moveTo(X(u), Y(ROW3.v0)); g.lineTo(X(u), Y(ROW3.v1)); g.stroke(); }
      g.beginPath(); g.moveTo(X(ROW3.u0), Y(ROW3.v0)); g.lineTo(X(ROW3.u1), Y(ROW3.v0)); g.stroke();
    }, ROW3.u0 - 0.5, ROW3.u1 + 0.5, ROW3.v0 - 0.5, ROW3.v1 + 0.5, 64, 0.045, 5, 'stalli-aiuola');
    for (let i = 0; i < 3; i++) stalls.push([ROW3.u0 + (i + 0.5) * ((ROW3.u1 - ROW3.u0) / 3), (ROW3.v0 + ROW3.v1) / 2]);


    // aiuola 1: trapezio sotto la fila dei tre stalli, bordata di giallo
    const lawn = (pts, grow, name) => {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const outer = pts.map(([u, v]) => { const d = Math.hypot(u - cx, v - cz) || 1; return [u + (u - cx) / d * grow, v + (v - cz) / d * grow]; });
      flat(outer, 0, curbMat, 0.2).name = name + '-cordolo'; flat(pts, 0.2, lawnMat, 0.04).name = name;
    };
    lawn([[-4.8, -19.2], [4.8, -19.2], [7.6, -24.6], [-7.6, -24.6]], 0.45, 'aiuola-1');
    // aiuola 2 in fondo: trapezio che si restringe verso il fondo, con il tondo decorativo al centro
    const cu2 = -0.6, cv2 = -69.5;
    lawn([[cu2 - 9.9, -64.2], [cu2 + 9.9, -64.2], [cu2 + 5.5, -74.5], [cu2 - 5.5, -74.5]], 0.5, 'aiuola-2');
    const tondo = new THREE.Mesh(new THREE.CircleGeometry(2.9, 40), lay(0xa5683c, 6));
    tondo.rotation.x = -Math.PI / 2; tondo.position.set(cu2, 0.27, cv2); tondo.name = 'tondo'; group.add(tondo);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.4, 40), lay(0xd9c9a8, 7)); ring.rotation.x = -Math.PI / 2; ring.position.set(cu2, 0.28, cv2); group.add(ring);
    for (let i = 0; i < 70; i++) { // ghiaia di cotto
      const a = rand() * 6.28, r = Math.sqrt(rand()) * 2.6;
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.13 + rand() * 0.1, 6), lay(0x8a502c, 8)); p.rotation.x = -Math.PI / 2; p.position.set(cu2 + Math.cos(a) * r, 0.29, cv2 + Math.sin(a) * r); group.add(p);
    }

    /* Ingressi dei due edifici che fiancheggiano il piazzale. I volumi NON si costruiscono
       qui: ci sono già nella scena come estrusioni OSM (CU015 Igiene a u negativa, CU016
       Ortopedia a u positiva), e i palazzi inventati che stavano qui li duplicavano,
       coprendo per di più l'Edificio di Fisica dietro Igiene. Restano solo i dettagli a
       terra che OSM non ha e che si leggono nella foto zenitale — scalinata, portone,
       pensilina — appoggiati al filo reale della facciata. */
    const addEntrance = (side) => {
      const inner = side > 0 ? FACADE_L : FACADE_R, hw = 5.5;
      for (let k = 0; k < 6; k++) { // scalinata larga al centro della facciata
        const d = 1.6 + 0.4 * (5 - k), a = inner - side * d;
        box(Math.min(a, inner), Math.max(a, inner), 0, (RAISE / 6) * (k + 1), VC - hw, VC + hw, trMat, 'gradino');
      }
      const span = (d) => [Math.min(inner, inner - side * d), Math.max(inner, inner - side * d)];
      box(...span(0.4).concat([RAISE, 6.2, VC - 2.6, VC + 2.6]), trMat, 'cornice-portone');
      box(...span(0.5).concat([RAISE, 5.5, VC - 1.9, VC + 1.9]), std(0x2b2320, { roughness: 0.5 }), 'portone');
      box(...span(1.2).concat([5.5, 5.7, VC - 2.6, VC + 2.6]), trMat, 'pensilina');
    };
    addEntrance(1); addEntrance(-1);

    /* Rampa carrabile davanti a Igiene, accanto alla scalinata (foto zenitale: ~25 m, sale
       dal piazzale al piano rialzato dell'edificio). Non sostituisce nulla: si affianca.
       Piano inclinato in asfalto, muretti di contenimento in travertino sui due lati e
       cordolo al piede. RAMP_V1 è l'estremo alto, verso la scalinata. */
    {
      const u0 = Math.min(RAMP_U0, RAMP_U1), u1 = Math.max(RAMP_U0, RAMP_U1), W = 0.4;
      const vL = RAMP_V0, vH = RAMP_V1, h = RAMP_H;
      const deck = new THREE.BufferGeometry();
      deck.setAttribute('position', new THREE.Float32BufferAttribute([
        u0, 0.03, vL, u1, 0.03, vL, u1, h, vH, u0, h, vH], 3));
      deck.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      deck.setIndex([0, 1, 2, 0, 2, 3]);
      deck.computeVertexNormals();
      const piano = new THREE.Mesh(deck, std(0x1a1b1f, { roughness: 1, side: THREE.DoubleSide }));
      piano.name = 'rampa-piano'; group.add(piano);
      // muretto: profilo nel piano (v, quota), estruso in spessore lungo u
      const muretto = (uOuter, name) => {
        const s = new THREE.Shape();
        s.moveTo(vL, 0); s.lineTo(vH, h); s.lineTo(vH, h + 0.9); s.lineTo(vL, 0.9); s.closePath();
        const g = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false });
        g.rotateY(-Math.PI / 2); g.translate(uOuter, 0, 0); // l'estrusione va verso -u
        const m = new THREE.Mesh(g, trMat); m.name = name; group.add(m); return m;
      };
      muretto(u0, 'rampa-muretto-interno');        // lato facciata: contiene il piano rialzato
      muretto(u1 + W, 'rampa-muretto-piazzale');   // lato piazzale
      box(u0 - W, u1 + W, 0, 0.18, vL - 0.3, vL, trDark, 'rampa-cordolo');
    }

    // alberi a chioma scura in fila davanti a ciascun palazzo
    const trunkMat = std(0x4a3a2c), crownMats = [0x08140c, 0x0c1a0e, 0x06100a].map((c0) => std(c0, { roughness: 1, flatShading: true }));
    const tree = (u, v, r) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 4.4, 8), trunkMat); t.position.set(u, 0.12 + 2.2, v); t.name = 'tronco'; group.add(t);
      const cm = crownMats[Math.floor(rand() * crownMats.length)];
      const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cm); c1.scale.set(1, 0.95, 1); c1.position.set(u, 4.6 + r * 0.85, v); c1.name = 'chioma'; group.add(c1);
      const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.72, 1), cm); c2.position.set(u + (rand() - 0.5) * r * 0.7, 4.0 + r * 0.55, v + (rand() - 0.5) * r * 0.9); c2.name = 'chioma'; group.add(c2);
    };
    for (let i = 0; i < 7; i++) {
      tree(20.5 + (rand() - 0.5) * 0.6, -19 - 7.4 * i + (rand() - 0.5) * 1.2, 4.1 + rand() * 0.7);
      tree(-20.5 + (rand() - 0.5) * 0.6, -19 - 7.4 * i + (rand() - 0.5) * 1.2, 4.1 + rand() * 0.7);
    }

    // piazzola del bar: quattro ombrelloni quadrati affiancati (2x2) con tavolini e sedie
    const umbMat = std(0xe9e2cf, { roughness: 0.9, side: THREE.DoubleSide }), poleMat = std(0x8a8a88, { roughness: 0.5, metalness: 0.4 });
    const tabMat = std(0x7b6a58), chairMat = std(0x3a3a3c);
    [[27.8, -9.6], [30.7, -9.6], [27.8, -12.5], [30.7, -12.5]].forEach(([u, v]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 6), poleMat); pole.position.set(u, 0.12 + 1.35, v); pole.name = 'palo-ombrellone'; group.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(2.05, 0.7, 4), umbMat); top.rotation.y = Math.PI / 4; top.position.set(u, 0.12 + 3.05, v); top.name = 'ombrellone'; group.add(top);
      const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 14), tabMat); tb.position.set(u, 0.12 + 0.75, v); tb.name = 'tavolino'; group.add(tb);
      box(u - 0.04, u + 0.04, 0.12, 0.12 + 0.75, v - 0.04, v + 0.04, poleMat, 'gamba-tavolino');
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; box(u + Math.cos(a) * 1 - 0.2, u + Math.cos(a) * 1 + 0.2, 0.12, 0.12 + 0.45, v + Math.sin(a) * 1 - 0.2, v + Math.sin(a) * 1 + 0.2, chairMat, 'sedia'); }
    });

    // guardiola: piccolo volume a tetto piano con vetrate, e due barriere a sbarra bianche e rosse
    const gu1 = WALK_R, gu0 = gu1 - 3.6, gv0 = -12.7, gv1 = -8.5; // a fine marciapiede, sul filo verso la carreggiata
    box(gu0, gu1, 0.12, 3.1, gv0, gv1, std(0x7a211c), 'guardiola'); // rossa come dal vero
    box(gu0 - 0.02, gu1 + 0.02, 0.9 + 0.12, 2.6 + 0.12, gv0 - 0.02, gv1 + 0.02, glassMat, 'guardiola-vetrate');
    box(gu0 - 0.5, gu1 + 0.5, 3.1, 3.35, gv0 - 0.5, gv1 + 0.5, std(0x55565a), 'guardiola-tetto');
    const barrier = (pu, dir, v) => {
      box(pu - 0.2, pu + 0.2, 0.12, 1.2, v - 0.2, v + 0.2, std(0xd9d9d6), 'barriera-fusto');
      const seg = 6, len = 3.0 / seg;
      for (let i = 0; i < seg; i++) {
        const a = pu + dir * (0.2 + i * len), b = a + dir * len;
        box(Math.min(a, b), Math.max(a, b), 1.1, 1.24, v - 0.07, v + 0.07, std(i % 2 ? 0xf3f1ec : 0xc0272d, { roughness: 0.6 }), 'barriera-sbarra');
      }
    };
    barrier(-15.6, 1, -9.2); barrier(-12, -1, -11.8);

    group.traverse((o) => { o.raycast = () => {}; });
    group.renderOrder = 2;
    scene.add(group);


    // visibile solo in 3D e solo con gli edifici accesi (come l'ingresso)
    const sync = () => {
      const ex = scene.getObjectByName('minerva'), ed = scene.getObjectByName('edifici');
      group.visible = !group.userData.force && (ex ? ex.visible : true) && (ed ? ed.visible : true);
    };
    sync(); setInterval(sync, 250);
    window.campus3d.internoAldoMoro = group;
  }

  whenReady(build);
})();

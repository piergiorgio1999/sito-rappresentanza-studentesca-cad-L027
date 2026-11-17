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
    FACADE_L, FACADE_R,   // filo delle facciate dei due palazzi
    WALK_L, WALK_R,       // filo interno dei marciapiedi: oltre c'e' asfalto, dove sta il filare di alberi
    BLD_V0, BLD_V1, BLD_H, ZOC,
    STALL_D,
    BLOCKS,               // blocchi di stalli: v di inizio (lato interno), primo stallo, numero e larghezza
    ROW3;                 // tre stalli sopra la prima aiuola
  function readParams() {
    P = (window.MAPPA3D_OVERRIDES && window.MAPPA3D_OVERRIDES.interno) || {};
    U_MID = P.U_MID ?? 2.1; V_MID = P.V_MID ?? -0.6;
    V_NEAR = P.V_NEAR ?? -6.1; V_FAR = P.V_FAR ?? -78;
    U_MAX = P.U_MAX ?? 46;
    ROAD_L = P.ROAD_L ?? 15.7; ROAD_R = P.ROAD_R ?? -16;
    FACADE_L = P.FACADE_L ?? 32.5; FACADE_R = P.FACADE_R ?? -30.5;
    WALK_L = P.WALK_L ?? FACADE_L - 7; WALK_R = P.WALK_R ?? FACADE_R + 7;
    BLD_V0 = P.BLD_V0 ?? -8.5; BLD_V1 = P.BLD_V1 ?? -67; BLD_H = P.BLD_H ?? 23.4; ZOC = P.ZOC ?? 1.2;
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

  function brickTexture(rand) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#b98558'; g.fillRect(0, 0, 256, 256);
    const rows = 32, bh = 256 / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 16;
      for (let x = -32; x < 288; x += 32) {
        const t = 0.88 + rand() * 0.2;
        g.fillStyle = `rgb(${Math.round(190 * t)},${Math.round(121 * t)},${Math.round(80 * t)})`;
        g.fillRect(x + off + 1, r * bh + 1, 30, bh - 1.5);
      }
    }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    return tex;
  }

  /* Una campata di facciata: 3,2 m x 3,6 m (un piano), mattoni con finestra a due ante. */
  function facadeTexture(rand) {
    const W = 256, H = 288, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#b57e55'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < 36; r++) {
      const off = (r % 2) * 10;
      for (let x = -20; x < W + 20; x += 20) {
        const t = 0.9 + rand() * 0.16;
        g.fillStyle = `rgb(${Math.round(188 * t)},${Math.round(121 * t)},${Math.round(80 * t)})`;
        g.fillRect(x + off + 1, r * 8 + 1, 18, 6.2);
      }
    }
    const wx = 56, wy = 48, ww = 144, wh = 160;
    g.fillStyle = '#d6cfbd'; g.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
    const grd = g.createLinearGradient(0, wy, 0, wy + wh); grd.addColorStop(0, '#53687a'); grd.addColorStop(1, '#222d36');
    g.fillStyle = grd; g.fillRect(wx, wy, ww, wh);
    g.strokeStyle = '#e4dfd0'; g.lineWidth = 6; g.strokeRect(wx, wy, ww, wh);
    g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.moveTo(wx, wy + wh * 0.32); g.lineTo(wx + ww, wy + wh * 0.32); g.stroke();
    g.fillStyle = '#cdc5b0'; g.fillRect(wx - 14, wy + wh + 6, ww + 28, 10);
    const tex = new THREE.CanvasTexture(g.canvas); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
    return tex;
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
    const roofMat = std(0x2e2c2a, { roughness: 1 });
    const roofRed = std(0x9c2a2a, { roughness: 0.9 });
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
      g.fillStyle = 'rgba(236,235,228,0.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold ${1.3 * ppm}px Arial, sans-serif`;
      g.save(); g.translate(X(-11.4), Y(-34)); g.rotate(Math.PI); g.fillText('USCITA', 0, 0); g.restore();
      g.save(); g.translate(X(-13.8), Y(-17)); g.rotate(Math.PI / 2); g.font = `bold ${1.0 * ppm}px Arial, sans-serif`; g.fillText('Viale Piero Gobetti', 0, 0); g.restore();
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

    // automobili negli stalli (istanziate)
    const cars = stalls.filter(() => rand() < 0.62);
    const palette = [0xe8e8e6, 0xc9ccd0, 0x8f9298, 0x2d2f33, 0xb32a2a, 0xdcdcdc, 0x3b4655];
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.62, 4.3), std(0xffffff, { roughness: 0.5, metalness: 0.2 }), cars.length);
    const cabins = new THREE.InstancedMesh(new THREE.BoxGeometry(1.55, 0.5, 2.3), std(0x23282d, { roughness: 0.3, metalness: 0.3 }), cars.length);
    const mt = new THREE.Matrix4(), col = new THREE.Color();
    cars.forEach(([u, v], i) => {
      mt.makeTranslation(u, 0.45, v); bodies.setMatrixAt(i, mt); bodies.setColorAt(i, col.set(palette[Math.floor(rand() * palette.length)]));
      mt.makeTranslation(u, 0.99, v - 0.1); cabins.setMatrixAt(i, mt);
    });
    bodies.name = 'automobili'; cabins.name = 'abitacoli'; group.add(bodies, cabins);

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

    // due palazzi in mattoni: basamento in travertino, facciata a campate con finestre, scalinata e portone al centro
    const facadeTex = facadeTexture(rand);
    const addBuilding = (side) => {
      const inner = side > 0 ? FACADE_L : FACADE_R, outer = side > 0 ? FACADE_L + 12 : FACADE_R - 12;
      const u0 = Math.min(inner, outer), u1 = Math.max(inner, outer), len = BLD_V0 - BLD_V1;
      const bays = Math.round(len / 3.2);
      const ft = facadeTex.clone(); ft.needsUpdate = true; ft.repeat.set(bays, 6);
      const bt = brickTexture(rand); bt.repeat.set(10, 4);
      const brick = std(0xffffff, { map: bt }), face = std(0xffffff, { map: ft });
      const mats = [brick, brick, roofMat, roofMat, brick, brick];
      mats[side > 0 ? 1 : 0] = face; // la facciata guarda verso il piazzale
      const m = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0, BLD_H - ZOC - 0.6, len), mats);
      m.position.set((u0 + u1) / 2, ZOC + (BLD_H - ZOC - 0.6) / 2, (BLD_V0 + BLD_V1) / 2); m.name = 'palazzo-' + (side > 0 ? 'sx' : 'dx'); group.add(m);
      box(u0 - 0.1, u1 + 0.1, 0, ZOC, BLD_V1 - 0.1, BLD_V0 + 0.1, trDark, 'basamento');
      box(u0 - 0.25, u1 + 0.25, BLD_H - 0.6, BLD_H, BLD_V1 - 0.25, BLD_V0 + 0.25, trMat, 'cornicione');
      box(u0 + 0.5, u1 - 0.5, BLD_H, BLD_H + 0.5, BLD_V1 + 0.5, BLD_V0 - 0.5, roofMat, 'terrazza');
      if (side < 0) box(u0 + 1.2, u0 + 5.2, BLD_H + 0.5, BLD_H + 0.75, -60, -20, roofRed, 'tetto-rosso');
      // scalinata larga e portone al centro della facciata
      const vc = -35, hw = 5.5;
      for (let k = 0; k < 6; k++) {
        const d = 1.6 + 0.4 * (5 - k), a = inner - side * d;
        box(Math.min(a, inner), Math.max(a, inner), 0, 0.2 * (k + 1), vc - hw, vc + hw, trMat, 'gradino');
      }
      const span = (d) => [Math.min(inner, inner - side * d), Math.max(inner, inner - side * d)];
      box(...span(0.4).concat([1.2, 6.2, vc - 2.6, vc + 2.6]), trMat, 'cornice-portone');
      box(...span(0.5).concat([1.2, 5.5, vc - 1.9, vc + 1.9]), std(0x2b2320, { roughness: 0.5 }), 'portone');
      box(...span(1.2).concat([5.5, 5.7, vc - 2.6, vc + 2.6]), trMat, 'pensilina');
    };
    addBuilding(1); addBuilding(-1);

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

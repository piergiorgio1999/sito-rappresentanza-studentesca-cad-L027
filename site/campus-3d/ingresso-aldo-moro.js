/* Ingresso monumentale di Piazzale Aldo Moro 5 (i Propilei): modello procedurale.
   Caricato dopo campus-3d.js; aspetta window.campus3d e la scena, poi aggiunge il gruppo «ingresso-aldo-moro».
   Posizione: way OSM 222784447 «Colonnato ingresso Università La Sapienza di Roma» (© OpenStreetMap contributors, ODbL),
   asse e fronte ricavati dai suoi vertici (analisi delle componenti principali); le proporzioni sono stimate dalla foto aerea
   e dall'ortofoto AGEA 2020, non da un rilievo. Lo stemma è un disegno generico, non il logo ufficiale. */
(function () {
  'use strict';
  // centro del poligono OSM (m rispetto a 12.5122E 41.9021N: est 10.0, nord 18.5); a = asse verso sud, n = fronte verso Piazzale Aldo Moro (ovest-sudovest)
  const REF = { lon: 12.5122, lat: 41.9021 };
  const CENTER_EN = [10.005, 18.489];
  const A = [0.37442, -0.92726]; // (est, nord)
  const N = [-0.92726, -0.37442];
  const U_MID = 2.1, V_MID = -0.6; // il centro del rettangolo che contiene il poligono rispetto al baricentro dei vertici
  const L = 87.6;                  // lunghezza totale lungo l'asse (estensione del poligono OSM)
  const END = 15;                  // lunghezza dei due corpi pieni in mattoni
  const BAYS = 7;                  // campate aperte tra i corpi
  const H_PILLAR = 12.4, H_TOT = 15.6, H_BLOCK = 15.6;
  const V_FRONT = 5.1;             // fronte dell'attico e dei pilastri
  const V_BACK = -2.9;             // retro dell'attico
  const BLOCK_FRONT = 4.4, BLOCK_BACK = -6.1;
  /* Aiuole del piazzale: isola centrale a goccia e due nastri curvi per lato, simmetrici rispetto all'asse dell'isola
     (CU, che nel vero non coincide col centro del colonnato) e attaccati al filo dei pilastri. Proporzioni stimate
     dalla foto aerea del proprietario e dall'ortofoto AGEA 2020, non da un rilievo. */
  const CU = 0;                    // asse dell'isola centrale e della simmetria delle aiuole
  const SL = V_FRONT + 0.6, PROF = 25; // dal filo dei pilastri fino al piazzale
  // nastri laterali: partono dritti dal colonnato, curvano verso l'esterno e finiscono con la punta tonda; larghezza quasi costante
  const CC = 0;                    // asse del colonnato: le aiuole laterali partono dalle colonne, non dall'isola
  const RIBBONS = [{ d: 12.34, p1: [14.0, 13], p2: [24.5, 22.8], w0: 2.7, w1: 2.2 },
    { d: 20.57, p1: [22.0, 11], p2: [37.0, 19.6], w0: 2.7, w1: 2.2 }];
  const DISC = [CU, SL + 15];

  function whenReady(fn) {
    const c = window.campus3d;
    if (typeof THREE !== 'undefined' && c && c.scene && typeof c.project === 'function' && c.scene.getObjectByName('edifici')) fn(c);
    else setTimeout(() => whenReady(fn), 500);
  }

  function brickTexture() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#c98c54'; g.fillRect(0, 0, 256, 256);
    const rows = 16, bh = 256 / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 16;
      for (let x = -32; x < 288; x += 32) {
        const t = 0.9 + Math.random() * 0.16;
        g.fillStyle = `rgb(${Math.round(201 * t)},${Math.round(140 * t)},${Math.round(84 * t)})`;
        g.fillRect(x + off + 1, r * bh + 1, 30, bh - 2);
      }
    }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    return tex;
  }

  /* Tondo dell'aiuola centrale: nel vero porta l'emblema Sapienza (il cherubino), che è il marchio dell'ateneo:
     qui resta un tondo in terracotta con la cornice chiara, senza emblema. Per metterci quello ufficiale serve il file
     del manuale di identità visiva: basta pubblicarlo accanto a questo script e passarlo a una texture al posto del disegno. */
  function stemmaTexture() {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'), c = S / 2;
    g.fillStyle = '#a9502f'; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    g.strokeStyle = '#d9a58a'; g.lineWidth = 10; g.beginPath(); g.arc(c, c, c * 0.93, 0, 7); g.stroke();
    g.fillStyle = '#c4714f'; g.beginPath(); g.arc(c, c, c * 0.84, 0, 7); g.fill();
    for (let i = 0; i < 1400; i += 1) { // ghiaia di cotto, niente emblema finto
      const a = Math.random() * 7, r = Math.sqrt(Math.random()) * c * 0.82;
      g.fillStyle = `rgba(${170 + Math.random() * 40 | 0},${90 + Math.random() * 35 | 0},${60 + Math.random() * 30 | 0},.5)`;
      g.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 3, 3);
    }
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; return tex;
  }

  function groundText(lines, w, h) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w);
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(236,234,226,0.9)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = cv.height / (lines.length + 0.6); g.font = `bold ${fs}px Arial, sans-serif`;
    lines.forEach((t, i) => g.fillText(t, cv.width / 2, cv.height * (i + 0.8) / (lines.length + 0.6)));
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; return tex;
  }

  function build(c) {
    const scene = c.scene;
    const loader = new THREE.TextureLoader();
    const trTex = loader.load('tex/travertino_COL_1k.jpg', (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.25, 0.25); t.anisotropy = 4; trMat.map = t; trMat.needsUpdate = true; });
    const trMat = new THREE.MeshStandardMaterial({ color: 0xe7e0cf, roughness: 0.9, metalness: 0 });
    const trDark = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 0.95, metalness: 0 });
    const brickTex = brickTexture();
    brickTex.repeat.set(5, 3);
    const brickMat = new THREE.MeshStandardMaterial({ color: 0xd08a52, map: brickTex, roughness: 0.95, metalness: 0 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x77716a, roughness: 1, metalness: 0 });
    const drappiRossi = []; // dove mettere l'emblema sui drappi, se arriva il file ufficiale
    const pavMat = new THREE.MeshStandardMaterial({ color: 0xcfc8ba, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x6f9fb5, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.86 });
    const lawnMat = new THREE.MeshStandardMaterial({ color: 0x3f7a2c, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xdcd6c6, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const group = new THREE.Group(); group.name = 'ingresso-aldo-moro';

    const origin = c.project([REF.lon + (CENTER_EN[0] + A[0] * U_MID + N[0] * V_MID) / (111320 * Math.cos(REF.lat * Math.PI / 180)),
      REF.lat + (CENTER_EN[1] + A[1] * U_MID + N[1] * V_MID) / 111320]);
    group.position.set(origin.x, 0, origin.z);
    // locale: x = asse (verso sud), z = fronte (verso Piazzale Aldo Moro); in mondo x = est, z = sud
    const ax = A[0], az = -A[1];
    group.rotation.y = Math.atan2(-az, ax); // sinθ = −az, cosθ = ax

    const box = (x0, x1, y0, y1, z0, z1, mat, name) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); if (name) m.name = name; group.add(m); return m;
    };
    const flat = (pts, y, mat, h) => { // pts [[u, v]]
      const s = new THREE.Shape(); pts.forEach(([u, v], i) => (i ? s.lineTo(u, -v) : s.moveTo(u, -v)));
      const geo = h ? new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }) : new THREE.ShapeGeometry(s);
      const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; group.add(m); return m;
    };

    const x0 = -L / 2, x1 = L / 2;
    // corpi in mattoni, con cornice e basamento in travertino
    for (const s of [-1, 1]) {
      const a = s < 0 ? x0 : x1 - END, b = s < 0 ? x0 + END : x1;
      box(a, b, 0, H_BLOCK - 0.9, BLOCK_BACK, BLOCK_FRONT, brickMat, 'corpo-mattoni');
      box(a - 0.15, b + 0.15, H_BLOCK - 0.9, H_BLOCK, BLOCK_BACK - 0.2, V_FRONT, trMat, 'cornice-corpo');
      box(a - 0.1, b + 0.1, 0, 0.7, BLOCK_BACK - 0.1, BLOCK_FRONT + 0.1, trDark, 'zoccolo');
      /* Davanti a ogni corpo in mattoni: una piazzola lastricata a mezzaluna e, centrata sul muro, una fontana
         rettangolare con la vasca rettangolare (foto zenitale del proprietario). */
      const cx = (a + b) / 2, R = 22, piazza = [];
      for (let i = 0; i <= 28; i += 1) { const ang = (i / 28) * Math.PI; piazza.push([cx + R * Math.cos(ang), BLOCK_FRONT + R * Math.sin(ang)]); }
      flat(piazza, 0.015, pavMat, 0).receiveShadow = true;
      const fw = 6.6, fd = 2.1, fv = BLOCK_FRONT + 3.4, rim = 0.45; // semilarghezza, semiprofondità, distanza dal muro
      box(cx - fw, cx + fw, 0, rim, fv - fd, fv + fd, trMat, 'fontana-bordo');
      box(cx - fw + 0.55, cx + fw - 0.55, rim - 0.12, rim - 0.06, fv - fd + 0.55, fv + fd - 0.55, waterMat, 'fontana-acqua');
      box(cx - 0.45, cx + 0.45, rim, rim + 0.9, fv - 0.45, fv + 0.45, trMat, 'fontana-zampillo');
    }
    // attico-ponte in travertino
    box(x0, x1, H_PILLAR, H_TOT, V_BACK, V_FRONT, trMat, 'attico');
    box(x0 + END, x1 - END, H_TOT, H_TOT + 0.35, V_BACK - 0.1, V_FRONT + 0.15, trMat, 'cornice-attico');
    box(x0 + END, x1 - END, H_PILLAR - 0.45, H_PILLAR, V_BACK, V_FRONT + 0.2, trMat, 'architrave');
    // soffitto scuro sotto il ponte
    box(x0 + END, x1 - END, H_PILLAR - 0.5, H_PILLAR - 0.44, V_BACK, V_FRONT, ceilMat, 'soffitto');
    // pilastri a lama in travertino
    const pitch = (L - 2 * END) / BAYS;
    for (let i = 1; i < BAYS; i++) {
      const cx = x0 + END + pitch * i;
      box(cx - 1.2, cx + 1.2, 0, H_PILLAR - 0.45, V_FRONT - 4.6, V_FRONT, trMat, 'pilastro');
    }
    // solaio intermedio arretrato (si intravede tra le campate)
    box(x0 + END, x1 - END, 5.3, 5.8, V_BACK, V_BACK + 2.2, trDark, 'solaio');
    /* Balconate con parapetto nelle campate, all'altezza del solaio: lastra sporgente in travertino e ringhiera
       a montanti e corrimano scuri, come nella foto del proprietario. */
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.6, metalness: 0.3 });
    const BAL = { y: 5.8, v: V_FRONT - 0.35, h: 1.05 };
    for (let i = 0; i < BAYS; i += 1) {
      const a0 = x0 + END + pitch * i + 1.3, b0 = a0 + pitch - 2.6;
      box(a0, b0, BAL.y, BAL.y + 0.22, BAL.v - 0.5, BAL.v + 0.5, trMat, 'balconata');
      box(a0, b0, BAL.y + BAL.h, BAL.y + BAL.h + 0.11, BAL.v + 0.3, BAL.v + 0.52, ringMat, 'corrimano');
      box(a0, b0, BAL.y + BAL.h * 0.55, BAL.y + BAL.h * 0.55 + 0.07, BAL.v + 0.36, BAL.v + 0.48, ringMat, 'traverso');
      const n = Math.max(2, Math.round((b0 - a0) / 1.15));
      for (let k = 0; k <= n; k += 1) {
        const px = a0 + (b0 - a0) * (k / n);
        box(px - 0.045, px + 0.045, BAL.y + 0.22, BAL.y + BAL.h, BAL.v + 0.38, BAL.v + 0.46, ringMat, 'montante');
      }
    }
    /* Drappi Sapienza nelle cinque campate centrali, alternati bordeaux e bianchi come nella foto del proprietario.
       Il telo è il drappo vero e proprio; l'emblema ci finisce sopra solo se nel sito c'è tex/cherubino.png. */
    const drappoR = new THREE.MeshStandardMaterial({ color: 0x2d0a13, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    const drappoB = new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    const DRAPPO = { w: 2.6, h: 4.2, top: H_PILLAR - 0.8, v: V_FRONT - 2.3 };
    for (let i = 1; i <= 5; i += 1) {
      const cx = x0 + END + pitch * (i + 0.5), rosso = i % 2 === 1;
      const d = new THREE.Mesh(new THREE.PlaneGeometry(DRAPPO.w, DRAPPO.h), rosso ? drappoR : drappoB);
      d.position.set(cx, DRAPPO.top - DRAPPO.h / 2, DRAPPO.v); d.name = 'drappo'; d.raycast = () => {}; group.add(d);
      box(cx - DRAPPO.w / 2 - 0.1, cx + DRAPPO.w / 2 + 0.1, DRAPPO.top, DRAPPO.top + 0.12, DRAPPO.v - 0.07, DRAPPO.v + 0.07, trDark, 'asta-drappo');
      if (rosso) drappiRossi.push([cx, DRAPPO.top - 1.6, DRAPPO.v]);
    }
    // fascia di lucernari sul tetto (lato sud), come nella foto
    box(x1 - END - 14, x1 - END - 2, H_TOT + 0.35, H_TOT + 0.95, V_BACK + 1.5, V_FRONT - 2.2, new THREE.MeshStandardMaterial({ color: 0xcfe0e6, roughness: 0.4 }), 'lucernari');

    // aiuole davanti all'ingresso
    const lawnY = 0.06, curbH = 0.22;
    // isola centrale: dal colonnato si allarga verso il piazzale, con gli angoli di fondo arrotondati (foto aerea)
    const island = (grow) => {
      const W = (t) => 6.5 + 3.6 * Math.pow(t, 1.25) + grow, V0 = SL - grow, V1 = SL + PROF + grow, r = 3;
      const right = [], left = [];
      for (let i = 0; i <= 16; i += 1) { const t = i / 16, v = V0 + (V1 - r - V0) * t; right.push([CU + W(t), v]); left.push([CU - W(t), v]); }
      const we = W(1), cr = [], cl = [];
      for (let i = 1; i <= 6; i += 1) {
        const a = (i / 6) * (Math.PI / 2);
        cr.push([CU + we - r + r * Math.cos(a), V1 - r + r * Math.sin(a)]);
        cl.push([CU - we + r - r * Math.cos(a), V1 - r + r * Math.sin(a)]);
      }
      return right.concat(cr, cl.reverse(), left.reverse());
    };
    flat(island(0.5), 0, curbMat, curbH); flat(island(0), curbH, lawnMat, 0.04);
    // nastri curvi: linea di mezzeria su una Bézier, bordi paralleli e calotta tonda in punta
    const ribbonPts = (p0, p1, p2, w0, w1) => {
      const Lp = [], Rp = []; let end = null;
      for (let i = 0; i <= 20; i += 1) {
        const t = i / 20, mt = 1 - t;
        const x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0], z = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1];
        const dx = 2 * mt * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), dz = 2 * mt * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
        const l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, w = (w0 + (w1 - w0) * t) / 2;
        Lp.push([x + nx * w, z + nz * w]); Rp.push([x - nx * w, z - nz * w]);
        end = { x, z, nx, nz, dx: dx / l, dz: dz / l, w };
      }
      const cap = [];
      for (let i = 1; i < 10; i += 1) {
        const a = (i / 10) * Math.PI;
        cap.push([end.x + (end.nx * Math.cos(a) + end.dx * Math.sin(a)) * end.w, end.z + (end.nz * Math.cos(a) + end.dz * Math.sin(a)) * end.w]);
      }
      return Lp.concat(cap, Rp.reverse());
    };
    RIBBONS.forEach((r) => [1, -1].forEach((side) => {
      const p0 = [CC + side * r.d, SL], p1 = [CC + side * r.p1[0], SL + r.p1[1]], p2 = [CC + side * r.p2[0], SL + r.p2[1]];
      flat(ribbonPts(p0, p1, p2, r.w0 + 1, r.w1 + 1), 0, curbMat, curbH);
      flat(ribbonPts(p0, p1, p2, r.w0, r.w1), curbH, lawnMat, 0.04);
    }));
    // tondo in terracotta con lo stemma
    const stem = new THREE.Mesh(new THREE.CircleGeometry(3.7, 48), new THREE.MeshStandardMaterial({ map: stemmaTexture(), roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    stem.rotation.x = -Math.PI / 2; stem.position.set(DISC[0], curbH + 0.07, DISC[1]); stem.name = 'stemma'; group.add(stem);
    /* Emblema al centro del tondo: nel vero è il cherubino, il marchio dell'ateneo, e va messo con il file ufficiale
       del manuale di identità visiva Sapienza, non ridisegnato. Basta salvarlo come tex/cherubino.png (sfondo
       trasparente, quadrato, almeno 512 px): se c'è, viene applicato da solo sopra il cotto; se manca, resta il tondo liscio. */
    new THREE.TextureLoader().load('tex/cherubino.png', (tx) => {
      tx.anisotropy = 4; tx.colorSpace = THREE.SRGBColorSpace || tx.colorSpace;
      const em = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
      em.rotation.x = -Math.PI / 2; em.position.set(DISC[0], curbH + 0.09, DISC[1]); em.name = 'cherubino'; em.raycast = () => {}; group.add(em);
      drappiRossi.forEach(([dx, dy, dv]) => {
        const e = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false }));
        e.position.set(dx, dy, dv + 0.02); e.name = 'cherubino-drappo'; e.raycast = () => {}; group.add(e);
      });
    }, undefined, () => { /* senza il file ufficiale il tondo resta liscio */ });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.7, 4.3, 48), curbMat); ring.rotation.x = -Math.PI / 2; ring.position.set(DISC[0], curbH + 0.06, DISC[1]); group.add(ring);
    // scritte a terra
    const label = (lines, u, v, w, h, rot) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: groundText(lines, w, h), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = rot || 0; m.position.set(u, 0.05, v); m.name = 'scritta'; group.add(m);
    };
    label(['INGRESSO', 'VISITATORI'], 6.5, V_FRONT + 25.5, 6.5, 2.6);
    label(['INGRESSO', 'AUTORIZZATI'], 13.8, V_FRONT + 27, 7, 2.6);

    group.traverse((o) => { o.raycast = () => {}; });
    group.renderOrder = 2;
    scene.add(group);

    // visibile solo in 3D (segue il gruppo di Minerva, spento in vista 2D) e solo con gli edifici accesi
    const sync = () => {
      const ex = scene.getObjectByName('minerva'), ed = scene.getObjectByName('edifici');
      group.visible = !group.userData.force && (ex ? ex.visible : true) && (ed ? ed.visible : true);
      // in 2D il gruppo è nascosto e il volume OSM resta com'era (appiattito dal sito)
    };
    sync(); setInterval(sync, 250);
    window.campus3d.ingressoAldoMoro = group;
  }

  whenReady(build);
})();

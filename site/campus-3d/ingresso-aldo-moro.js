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
  /* Aiuole del piazzale: disegno simmetrico rispetto all'asse del colonnato (u = 0), con le aiuole che partono dal
     filo dei pilastri. Proporzioni stimate dalla foto aerea del proprietario e dall'ortofoto AGEA 2020, non da un rilievo:
     un'isola centrale a goccia con il tondo, e due nastri curvi per lato che accompagnano le corsie d'ingresso. */
  const LAWN_V0 = V_FRONT + 0.6;   // le aiuole partono dal filo del colonnato
  const ISLAND = { w: 7.6, len: 26 };
  const RIBBONS = [{ u0: 15.6, u1: 19.2, u2: 24.4, len: 24, w: 2.4 }, { u0: 25.4, u1: 30.2, u2: 35.6, len: 19, w: 2.2 }];
  const DISC = [0, LAWN_V0 + 10.4]; // tondo in asse, come nella foto aerea

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
      // basamento a gradoni davanti al corpo
      const cx = (a + b) / 2;
      for (let k = 0; k < 3; k++) box(cx - 6.5 - (2 - k) * 0.4, cx + 6.5 + (2 - k) * 0.4, 0, 0.3 * (3 - k) + 0.1, BLOCK_FRONT, BLOCK_FRONT + 1.5 * (3 - k) - 0.3, trMat, 'gradone');
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
    // fascia di lucernari sul tetto (lato sud), come nella foto
    box(x1 - END - 14, x1 - END - 2, H_TOT + 0.35, H_TOT + 0.95, V_BACK + 1.5, V_FRONT - 2.2, new THREE.MeshStandardMaterial({ color: 0xcfe0e6, roughness: 0.4 }), 'lucernari');

    // aiuole davanti all'ingresso
    const lawnY = 0.06, curbH = 0.22;
    // isola centrale a goccia: lato dritto contro il colonnato, fianchi simmetrici, punta arrotondata verso il piazzale
    const island = (grow) => {
      const W = ISLAND.w + grow, Lg = ISLAND.len + grow, half = (t) => W * Math.pow(Math.max(0, 1 - Math.pow(t, 2.1)), 0.5);
      const tip = 0.93, right = [], left = [];
      for (let i = 0; i <= 22; i += 1) { const t = (i / 22) * tip, v = LAWN_V0 - grow + Lg * t, h = half(t); right.push([h, v]); left.push([-h, v]); }
      const rc = half(tip), vc = LAWN_V0 - grow + Lg * tip, cap = [];
      for (let i = 1; i < 12; i += 1) { const a = (i / 12) * Math.PI; cap.push([Math.cos(a) * rc, vc + Math.sin(a) * rc]); }
      return right.concat(cap, left.reverse());
    };
    // nastro curvo: linea di mezzeria su una Bézier quadratica dal colonnato verso l'esterno, poi allargata di mezza larghezza
    const ribbon = (r, side, grow) => {
      const w = r.w / 2 + grow, p0 = [side * r.u0, LAWN_V0 - grow], p1 = [side * r.u1, LAWN_V0 + r.len * 0.55], p2 = [side * r.u2, LAWN_V0 + r.len];
      const mid = [], nrm = [];
      for (let i = 0; i <= 18; i += 1) {
        const t = i / 18, k = 1 - t;
        mid.push([k * k * p0[0] + 2 * k * t * p1[0] + t * t * p2[0], k * k * p0[1] + 2 * k * t * p1[1] + t * t * p2[1]]);
        const du = 2 * k * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), dv = 2 * k * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]), m = Math.hypot(du, dv) || 1;
        nrm.push([dv / m, -du / m]);
      }
      const a = mid.map(([u, v], i) => [u + nrm[i][0] * w, v + nrm[i][1] * w]);
      const b = mid.map(([u, v], i) => [u - nrm[i][0] * w, v - nrm[i][1] * w]).reverse();
      return a.concat(b);
    };
    const lawns = [island(0)], curbs = [island(0.5)];
    RIBBONS.forEach((r) => [1, -1].forEach((side) => { lawns.push(ribbon(r, side, 0)); curbs.push(ribbon(r, side, 0.5)); }));
    lawns.forEach((p, i) => { flat(curbs[i], 0, curbMat, curbH); flat(p, curbH, lawnMat, 0.04); });
    // tondo in terracotta con lo stemma
    const stem = new THREE.Mesh(new THREE.CircleGeometry(3.5, 48), new THREE.MeshStandardMaterial({ map: stemmaTexture(), roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    stem.rotation.x = -Math.PI / 2; stem.position.set(DISC[0], curbH + 0.07, DISC[1]); stem.name = 'stemma'; group.add(stem);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.5, 4.1, 48), curbMat); ring.rotation.x = -Math.PI / 2; ring.position.set(DISC[0], curbH + 0.06, DISC[1]); group.add(ring);
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

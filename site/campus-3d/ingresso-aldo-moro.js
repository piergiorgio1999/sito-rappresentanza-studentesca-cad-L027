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

  function stemmaTexture() {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'), c = S / 2;
    g.fillStyle = '#a9502f'; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    g.strokeStyle = '#d9a58a'; g.lineWidth = 10; g.beginPath(); g.arc(c, c, c * 0.93, 0, 7); g.stroke();
    g.fillStyle = '#c4714f'; g.beginPath(); g.arc(c, c, c * 0.84, 0, 7); g.fill();
    // motivo chiaro generico: corona di foglie, due ali a ventaglio, scudo centrale
    g.fillStyle = g.strokeStyle = '#f1e6d4';
    for (let i = 0; i < 18; i++) {
      const a = Math.PI * 0.62 + (i / 17) * Math.PI * 1.76;
      g.save(); g.translate(c + Math.cos(a) * c * 0.70, c + Math.sin(a) * c * 0.70); g.rotate(a + Math.PI / 2);
      g.beginPath(); g.ellipse(0, 0, 9, 24, 0, 0, 7); g.fill(); g.restore();
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        g.save(); g.translate(c + s * 22, c - 40 + i * 6); g.rotate(s * (0.35 + i * 0.16) - Math.PI / 2 * 0 );
        g.beginPath(); g.ellipse(s * 62, -10, 66 - i * 5, 12, s * (-0.35 + i * 0.1), 0, 7); g.fill(); g.restore();
      }
    }
    g.beginPath(); g.moveTo(c - 34, c - 28); g.lineTo(c + 34, c - 28); g.lineTo(c + 34, c + 20); g.quadraticCurveTo(c + 34, c + 62, c, c + 80); g.quadraticCurveTo(c - 34, c + 62, c - 34, c + 20); g.closePath(); g.fill();
    g.fillStyle = '#a9502f'; g.fillRect(c - 5, c - 18, 10, 70); g.fillRect(c - 22, c, 44, 9);
    g.fillStyle = '#f1e6d4'; g.beginPath(); g.arc(c, c - 50, 17, 0, 7); g.fill();
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
    const drop = [];
    const SL = V_FRONT + 1.6, EL = V_FRONT + 26, CU = -5;
    const prof = (t) => 8.6 - 3.8 * Math.pow(t, 0.8); // semilarghezza, si stringe verso la strada
    const vEnd = EL - prof(1);
    for (let i = 0; i <= 12; i++) { const t = i / 12; drop.push([CU + prof(t), SL + (vEnd - SL) * t]); }
    for (let i = 1; i < 10; i++) { const a = (i / 10) * Math.PI; drop.push([CU + Math.cos(a) * prof(1), vEnd + Math.sin(a) * prof(1)]); }
    for (let i = 12; i >= 0; i--) { const t = i / 12; drop.push([CU - prof(t), SL + (vEnd - SL) * t]); }
    flat(drop, 0, curbMat, curbH);
    // l'aiuola vera e propria, un poco rientrata
    const inset = drop.map(([u, v]) => { const cu = -5, cv = (SL + EL) / 2; const k = 0.92; return [cu + (u - cu) * k, cv + (v - cv) * k]; });
    flat(inset, curbH, lawnMat, 0.04);
    // tondo in terracotta con lo stemma
    const stem = new THREE.Mesh(new THREE.CircleGeometry(3.7, 48), new THREE.MeshStandardMaterial({ map: stemmaTexture(), roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    stem.rotation.x = -Math.PI / 2; stem.position.set(-5, curbH + 0.07, V_FRONT + 13.5); stem.name = 'stemma'; group.add(stem);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.7, 4.3, 48), curbMat); ring.rotation.x = -Math.PI / 2; ring.position.set(-5, curbH + 0.06, V_FRONT + 13.5); group.add(ring);
    // strisce curve ai lati delle corsie
    const ribbon = (p0, p1, p2, w) => {
      const pts = ribbonPts(p0, p1, p2, w), inner = ribbonPts(p0, p1, p2, w * 0.72);
      flat(pts, 0, curbMat, curbH); flat(inner, curbH, lawnMat, 0.04);
    };
    const ribbonPts = (p0, p1, p2, w) => {
      const left = [], right = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14, mt = 1 - t;
        const x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0], z = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1];
        const dx = 2 * mt * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), dz = 2 * mt * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
        const l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, ww = w * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.15)));
        left.push([x + nx * ww / 2, z + nz * ww / 2]); right.push([x - nx * ww / 2, z - nz * ww / 2]);
      }
      return left.concat(right.reverse());
    };
    ribbon([-19.5, V_FRONT + 1.2], [-21.5, V_FRONT + 10], [-30, V_FRONT + 15.5], 2.6);
    ribbon([-12.5, V_FRONT + 1.5], [-14.5, V_FRONT + 9], [-22, V_FRONT + 14], 1.6);
    ribbon([7.3, V_FRONT + 1.8], [8.0, V_FRONT + 12], [10.4, V_FRONT + 19.5], 2.2);
    ribbon([14.0, V_FRONT + 1.8], [15.0, V_FRONT + 13], [20.5, V_FRONT + 20], 2.4);

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

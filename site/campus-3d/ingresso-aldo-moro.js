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
  // Aiuole estratte dall'ortofoto AGEA 2020 (campus-agea-2020.png, ≈1 m/px): maschera del verde (ExG), apertura/chiusura morfologica,
  // approxPolyDP (0,4 m) e smussatura Chaikin; coordinate locali [u, v] in metri (u lungo il colonnato verso sud, v verso Piazzale Aldo Moro).
  const DISC = [-1.0, 18.4]; // tondo: non risolvibile nell'ortofoto, messo al 56 % della lunghezza dell'aiuola centrale, come nella foto aerea
  // LAWNS = prato rilevato; CURBS = cordolo (prato + 0,5 m). Il tratto sotto l'ombra del ponte (v < 9,8) è stato esteso fino al fronte.
  const LAWNS = [[[-17.0,9.9],[-17.2,9.9],[-17.4,9.9],[-17.6,10.1],[-17.6,10.2],[-17.6,10.5],[-17.7,10.7],[-17.8,11.0],[-18.0,11.2],[-18.2,11.3],[-18.4,11.9],[-18.6,12.8],[-18.6,14.2],[-18.6,15.8],[-18.8,17.3],[-19.2,18.5],[-19.8,19.4],[-20.5,20.1],[-21.0,20.7],[-21.3,21.1],[-21.3,21.5],[-21.2,21.8],[-20.9,21.9],[-20.6,21.9],[-20.3,21.8],[-19.9,21.7],[-19.5,21.3],[-19.1,20.8],[-18.6,20.1],[-18.1,19.2],[-17.7,18.1],[-17.2,16.8],[-16.8,15.2],[-16.4,13.5],[-16.2,12.1],[-16.1,11.1],[-16.2,10.5],[-16.3,10.2],[-16.5,10.1],[-16.8,9.9]],[[-10.4,6.6],[-10.9,6.6],[-11.3,7.1],[-11.5,8.2],[-11.7,9.9],[-11.8,12.1],[-11.9,13.8],[-12.1,15.2],[-12.4,16.0],[-12.8,16.5],[-13.1,17.0],[-13.4,17.7],[-13.6,18.4],[-13.7,19.3],[-13.8,20.0],[-14.0,20.6],[-14.2,21.1],[-14.3,21.4],[-14.5,21.8],[-14.5,22.2],[-14.5,22.7],[-14.5,23.3],[-14.3,23.7],[-14.1,23.9],[-13.8,23.9],[-13.4,23.8],[-13.0,23.3],[-12.4,22.3],[-11.8,20.9],[-11.0,19.1],[-10.4,17.1],[-10.0,15.0],[-9.8,12.7],[-9.7,10.3],[-9.8,8.4],[-10.0,7.2]],[[-5.6,10.8],[-5.7,13.6],[-5.9,16.2],[-6.2,18.4],[-6.5,20.3],[-7.0,21.9],[-7.2,23.3],[-7.4,24.3],[-7.3,25.1],[-7.2,25.6],[-6.8,26.0],[-6.4,26.2],[-5.8,26.4],[-5.2,26.4],[-4.5,26.4],[-4.0,26.6],[-3.6,26.8],[-3.2,27.0],[-2.4,27.2],[-1.3,27.2],[0.3,27.2],[2.2,27.1],[3.8,26.9],[4.9,26.7],[5.6,26.5],[5.9,26.2],[6.1,26.0],[6.3,25.7],[6.4,25.4],[6.4,25.1],[6.2,24.5],[6.0,23.5],[5.6,22.3],[5.1,20.7],[4.8,19.0],[4.5,17.2],[4.4,15.3],[4.4,13.2],[3.8,11.5],[2.5,10.0],[0.7,8.8],[-1.7,7.9],[-3.6,8.0],[-4.9,8.9]],[[9.2,14.5],[9.3,17.0],[9.5,19.2],[9.8,21.1],[10.2,22.6],[10.8,23.7],[11.2,24.5],[11.6,25.1],[11.9,25.5],[12.1,25.5],[12.3,25.5],[12.5,25.5],[12.8,25.4],[13.0,25.3],[13.2,25.2],[13.3,25.0],[13.4,24.8],[13.4,24.5],[13.2,24.0],[12.9,23.1],[12.4,22.0],[11.8,20.5],[11.3,19.0],[11.0,17.3],[10.9,15.6],[10.9,13.7],[10.8,12.3],[10.5,11.3],[10.2,10.8],[9.8,10.7],[9.5,11.3],[9.3,12.6]],[[16.6,11.7],[16.4,11.8],[16.2,11.9],[16.1,12.1],[15.9,12.3],[15.8,12.7],[15.8,13.3],[15.9,14.2],[16.1,15.4],[16.4,16.9],[16.6,18.2],[16.8,19.5],[16.9,20.5],[16.9,21.5],[17.1,22.3],[17.4,23.0],[18.0,23.5],[18.8,24.0],[19.3,24.2],[19.6,24.1],[19.8,23.8],[19.7,23.2],[19.6,22.8],[19.5,22.5],[19.3,22.3],[19.2,22.2],[18.9,22.0],[18.7,21.6],[18.4,21.1],[18.1,20.4],[17.9,19.4],[17.7,18.1],[17.6,16.6],[17.6,14.7],[17.6,13.3],[17.5,12.3],[17.3,11.8],[17.2,11.7],[17.0,11.7],[16.8,11.7]]];
  const CURBS = [[[-17.2,6.6],[-17.6,6.6],[-17.8,6.9],[-18.0,7.4],[-18.1,8.1],[-18.1,9.1],[-18.2,9.9],[-18.3,10.5],[-18.5,10.9],[-18.8,11.1],[-18.9,11.7],[-19.1,12.6],[-19.1,13.9],[-19.1,15.6],[-19.3,17.0],[-19.7,18.2],[-20.2,19.2],[-21.0,19.8],[-21.6,20.4],[-21.9,20.9],[-22.1,21.2],[-22.1,21.5],[-22.0,21.7],[-21.9,22.0],[-21.7,22.2],[-21.3,22.3],[-21.0,22.4],[-20.6,22.4],[-20.1,22.2],[-19.6,22.0],[-19.1,21.6],[-18.6,21.0],[-18.1,20.3],[-17.6,19.4],[-17.2,18.3],[-16.7,16.8],[-16.3,15.1],[-15.9,13.1],[-15.7,11.4],[-15.7,10.0],[-15.8,8.8],[-16.2,7.9],[-16.5,7.3],[-16.8,6.8]],[[-11.9,7.8],[-12.1,8.6],[-12.2,9.6],[-12.3,10.7],[-12.4,11.8],[-12.4,13.2],[-12.5,14.2],[-12.7,15.1],[-12.9,15.8],[-13.3,16.2],[-13.6,16.8],[-13.9,17.4],[-14.1,18.2],[-14.2,19.1],[-14.3,19.8],[-14.5,20.4],[-14.7,20.8],[-14.8,21.2],[-15.0,21.5],[-15.1,21.9],[-15.1,22.3],[-15.1,22.7],[-15.1,23.1],[-15.0,23.5],[-14.8,23.8],[-14.7,24.2],[-14.4,24.3],[-14.0,24.4],[-13.6,24.3],[-13.1,24.2],[-12.6,23.6],[-11.9,22.6],[-11.2,21.2],[-10.5,19.3],[-9.9,17.4],[-9.5,15.2],[-9.3,12.9],[-9.2,10.4],[-9.3,8.5],[-9.6,7.2],[-10.1,6.6],[-10.7,6.6],[-11.2,6.8],[-11.6,7.2]],[[-6.1,10.7],[-6.2,13.5],[-6.4,16.0],[-6.7,18.2],[-7.0,20.1],[-7.5,21.7],[-7.8,23.1],[-7.9,24.2],[-7.8,25.1],[-7.7,25.7],[-7.3,26.2],[-6.8,26.5],[-6.2,26.7],[-5.3,26.8],[-4.6,26.9],[-4.0,27.0],[-3.6,27.2],[-3.2,27.5],[-2.4,27.6],[-1.2,27.7],[0.5,27.6],[2.5,27.4],[4.2,27.2],[5.3,27.0],[6.1,26.8],[6.4,26.5],[6.6,26.2],[6.8,25.9],[6.9,25.5],[6.9,25.0],[6.8,24.3],[6.5,23.3],[6.1,22.0],[5.6,20.5],[5.2,18.8],[5.0,17.0],[4.9,15.0],[4.9,13.0],[4.7,11.2],[4.3,9.8],[3.8,8.6],[3.0,7.8],[2.0,7.2],[0.6,6.8],[-1.0,6.6],[-3.0,6.6],[-4.5,7.3],[-5.5,8.7]],[[8.8,10.3],[8.7,10.4],[8.5,11.2],[8.5,12.6],[8.6,14.6],[8.7,17.2],[8.9,19.4],[9.3,21.3],[9.7,22.8],[10.3,23.9],[10.8,24.8],[11.2,25.4],[11.6,25.8],[11.9,25.9],[12.2,26.0],[12.6,26.0],[12.9,25.8],[13.3,25.7],[13.6,25.4],[13.8,25.1],[13.9,24.8],[13.9,24.4],[13.7,23.8],[13.4,22.9],[12.9,21.7],[12.3,20.3],[11.8,18.7],[11.5,17.1],[11.4,15.3],[11.4,13.4],[11.2,12.0],[11.0,11.0],[10.5,10.4],[10.0,10.3],[9.5,10.2],[9.1,10.2]],[[16.4,11.3],[16.1,11.4],[15.8,11.6],[15.6,11.8],[15.4,12.1],[15.3,12.4],[15.3,13.0],[15.4,14.0],[15.6,15.3],[15.9,16.9],[16.1,18.4],[16.3,19.7],[16.4,20.8],[16.4,21.7],[16.5,22.5],[16.8,23.2],[17.2,23.8],[17.8,24.2],[18.3,24.6],[18.7,24.8],[19.1,25.0],[19.4,25.0],[19.7,25.1],[19.9,25.1],[20.1,25.0],[20.2,25.0],[20.3,24.8],[20.3,24.4],[20.3,23.8],[20.2,23.2],[20.0,22.5],[19.8,21.7],[19.4,21.0],[18.9,20.2],[18.5,19.2],[18.2,17.9],[18.1,16.3],[18.1,14.4],[18.0,13.0],[17.9,12.0],[17.7,11.4],[17.3,11.3],[17.0,11.2],[16.7,11.2]]];

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
    LAWNS.forEach((p, i) => { flat(CURBS[i], 0, curbMat, curbH); flat(p, curbH, lawnMat, 0.04); });
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

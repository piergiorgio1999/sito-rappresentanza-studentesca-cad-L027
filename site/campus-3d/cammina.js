(() => {
  'use strict';
  // Passeggiata in prima persona, stile videogioco. Occhi a 1,7 m; si sale su gradini, cordoli e panchine fino a 45 cm,
  // muri, ringhiere, gabbie e tronchi fermano il passo; si cade dai bordi e si può saltare.
  // · Tastiera: W A S D (o frecce su e giù) per camminare, frecce sinistra e destra per girarsi, tasti 1–9 per la velocità
  //   (1 lentissimo … 9 velocissimo, 4 è il passo normale), Maiuscolo per correre, Spazio per saltare. Il mouse è catturato
  //   come in un videogioco: muovendolo ti guardi intorno; Esc lo libera (clic per riprenderlo), un secondo Esc esce.
  //   Se il browser non lo cattura si guarda trascinando.
  // · Cancelli: F (o il tasto «🚪 Apri» a schermo) apre o chiude l'anta più vicina che hai davanti, entro 3 m; aperta non blocca più.
  // · Mirino al centro: E modifica e C commenta quello che miri (tasti «Modifica» e «Commenta» anche a schermo). Il mouse si
  //   libera per la scheda dell'editor e le maniglie, ma si continua a camminare con tastiera e levetta; chiusa la scheda torna lo sguardo.
  // · Telefono e iPad (schermo touch): levetta in basso a sinistra per camminare (spinta fino in fondo corre), tasti «Corri»
  //   e «Salta», trascina altrove per guardarti intorno. Da computer levetta e tasti non compaiono.
  // Le collisioni usano una copia dei triangoli vicini (edifici, esterni di Chimica, cortile), divisa in celle di 2 m:
  // il corpo e il raggio verso terra controllano solo i triangoli delle celle che toccano.
  const EYE = 1.7, STEP = 0.45, RADIUS = 0.3, RUN = 2.5, JUMP = 4.4, GRAVITY = 9.8, LOOK = 0.0042, TURN = 1.9;
  // velocità dei tasti 1–9 in m/s (4 = passo normale); correre moltiplica per RUN
  const SPEEDS = [0.6, 1.2, 2, 3.2, 5, 8, 11, 15, 20], SPEED0 = 4;
  const ROOTS = ['edifici', 'chimica-esterni', 'cortile-modello', 'minerva'];
  const CELL = 2, HALF = 70; // regione di collisione: 140 × 140 m attorno a chi cammina
  let C = null, T = null, on = false, paused = false, saved = null, last = 0, tilesAt = 0;
  const ui = {};
  const st = { x: 0, feet: 0, z: 0, eye: 0, vy: 0, yaw: 0, pitch: 0, grounded: true, keys: new Set(), stick: { x: 0, y: 0, id: null }, look: null, jump: false, run: false, speed: SPEED0 };

  /* ---------- triangoli vicini, in celle ---------- */
  const soup = { cx: 0, cz: 0, tris: null, cells: null, sig: '', checked: 0 };
  const visible = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  const rootsNow = () => ROOTS.map((n) => C.scene.getObjectByName(n)).filter((r) => r && visible(r));
  function buildSoup(cx, cz) {
    const tris = [], m = new T.Matrix4(), inst = new T.Matrix4(), v = [new T.Vector3(), new T.Vector3(), new T.Vector3()], sph = new T.Sphere();
    const x0 = cx - HALF, x1 = cx + HALF, z0 = cz - HALF, z1 = cz + HALF;
    const take = (g, M, mats) => {
      const pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
      const groups = g.groups && g.groups.length ? g.groups : [{ start: 0, count: n, materialIndex: 0 }];
      for (const gr of groups) {
        const mat = Array.isArray(mats) ? mats[gr.materialIndex] : mats;
        if (!mat || mat.visible === false) continue; // tappi nascosti degli edifici
        for (let i = gr.start; i + 2 < Math.min(n, gr.start + gr.count); i += 3) {
          for (let k = 0; k < 3; k += 1) v[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(M);
          if (Math.max(v[0].x, v[1].x, v[2].x) < x0 || Math.min(v[0].x, v[1].x, v[2].x) > x1 || Math.max(v[0].z, v[1].z, v[2].z) < z0 || Math.min(v[0].z, v[1].z, v[2].z) > z1) continue;
          tris.push(v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z);
        }
      }
    };
    for (const root of rootsNow()) {
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || !visible(o) || o.isSprite) return;
        const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
        const near = (M) => { sph.copy(g.boundingSphere).applyMatrix4(M); return Math.abs(sph.center.x - cx) < HALF + sph.radius && Math.abs(sph.center.z - cz) < HALF + sph.radius; };
        if (o.isInstancedMesh) for (let i = 0; i < o.count; i += 1) { o.getMatrixAt(i, inst); m.multiplyMatrices(o.matrixWorld, inst); if (near(m)) take(g, m, o.material); }
        else if (near(o.matrixWorld)) take(g, o.matrixWorld, o.material);
      });
    }
    const P = new Float32Array(tris), N = (2 * HALF) / CELL, cells = Array.from({ length: N * N }, () => []);
    for (let t = 0; t < P.length; t += 9) {
      const ax = Math.min(P[t], P[t + 3], P[t + 6]), bx = Math.max(P[t], P[t + 3], P[t + 6]), az = Math.min(P[t + 2], P[t + 5], P[t + 8]), bz = Math.max(P[t + 2], P[t + 5], P[t + 8]);
      const i0 = Math.max(0, Math.floor((ax - x0) / CELL)), i1 = Math.min(N - 1, Math.floor((bx - x0) / CELL)), j0 = Math.max(0, Math.floor((az - z0) / CELL)), j1 = Math.min(N - 1, Math.floor((bz - z0) / CELL));
      for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) cells[j * N + i].push(t);
    }
    Object.assign(soup, { cx, cz, tris: P, cells, sig: signature() });
  }
  const signature = () => rootsNow().map((r) => r.uuid + ':' + r.children.length).join('|');
  function cellAt(x, z) {
    const N = (2 * HALF) / CELL, i = Math.floor((x - soup.cx + HALF) / CELL), j = Math.floor((z - soup.cz + HALF) / CELL);
    return i < 0 || j < 0 || i >= N || j >= N ? null : soup.cells[j * N + i];
  }
  // raggio–triangolo (Möller–Trumbore, entrambe le facce): distanza lungo il raggio o −1
  function hit(t, ox, oy, oz, dx, dy, dz) {
    const P = soup.tris, ax = P[t], ay = P[t + 1], az = P[t + 2];
    const e1x = P[t + 3] - ax, e1y = P[t + 4] - ay, e1z = P[t + 5] - az, e2x = P[t + 6] - ax, e2y = P[t + 7] - ay, e2z = P[t + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) return -1;
    const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az, u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return -1;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, w = (dx * qx + dy * qy + dz * qz) * inv;
    if (w < 0 || u + w > 1) return -1;
    return (e2x * qx + e2y * qy + e2z * qz) * inv;
  }
  // la superficie più alta sotto (x, from, z), o null
  function groundAt(x, z, from) {
    const list = cellAt(x, z); if (!list) return null;
    let best = null;
    for (const t of list) { const d = hit(t, x, from, z, 0, -1, 0); if (d >= 0 && (best === null || from - d > best)) best = from - d; }
    return best;
  }
  // il corpo è una scatola larga 2·RADIUS dalle ginocchia (sopra STEP: gradini e cordoli si scavalcano) alla testa;
  // un passo è bloccato se la scatola nella nuova posizione tocca un triangolo (anche barre e reti sottili)
  let stamp = 0, marks = new Uint32Array(0);
  function triBox(t, cx, cy, cz, hx, hy, hz) { // sovrapposizione triangolo–scatola (assi separatori, Akenine-Möller)
    const P = soup.tris;
    const ax = P[t] - cx, ay = P[t + 1] - cy, az = P[t + 2] - cz, bx = P[t + 3] - cx, by = P[t + 4] - cy, bz = P[t + 5] - cz, qx = P[t + 6] - cx, qy = P[t + 7] - cy, qz = P[t + 8] - cz;
    if (Math.min(ax, bx, qx) > hx || Math.max(ax, bx, qx) < -hx || Math.min(ay, by, qy) > hy || Math.max(ay, by, qy) < -hy || Math.min(az, bz, qz) > hz || Math.max(az, bz, qz) < -hz) return false;
    const E = [[bx - ax, by - ay, bz - az], [qx - bx, qy - by, qz - bz], [ax - qx, ay - qy, az - qz]];
    const nx = E[0][1] * E[1][2] - E[0][2] * E[1][1], ny = E[0][2] * E[1][0] - E[0][0] * E[1][2], nz = E[0][0] * E[1][1] - E[0][1] * E[1][0];
    if (Math.abs(nx * ax + ny * ay + nz * az) > hx * Math.abs(nx) + hy * Math.abs(ny) + hz * Math.abs(nz)) return false;
    for (const [ex, ey, ez] of E) for (const [px, py, pz] of [[0, ez, -ey], [-ez, 0, ex], [ey, -ex, 0]]) {
      const p0 = px * ax + py * ay + pz * az, p1 = px * bx + py * by + pz * bz, p2 = px * qx + py * qy + pz * qz;
      const r = hx * Math.abs(px) + hy * Math.abs(py) + hz * Math.abs(pz);
      if (Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r) return false;
    }
    return true;
  }
  // il triangolo toccato dal corpo in (x, z), preferendo una parete (per scivolarci lungo); −1 se il posto è libero
  function touchAt(x, z) {
    const lo = st.feet + STEP + 0.05, hi = st.feet + EYE + 0.1, cy = (lo + hi) / 2, hy = (hi - lo) / 2;
    if (marks.length !== soup.tris.length / 9) marks = new Uint32Array(soup.tris.length / 9);
    stamp += 1; let any = -1;
    for (const ox of [-RADIUS, RADIUS]) for (const oz of [-RADIUS, RADIUS]) {
      const list = cellAt(x + ox, z + oz); if (!list) continue;
      for (const t of list) {
        if (marks[t / 9] === stamp) continue; marks[t / 9] = stamp;
        if (!triBox(t, x, cy, z, RADIUS, hy, RADIUS)) continue;
        if (wallNormal(t)) return t;
        any = t;
      }
    }
    return any;
  }
  // normale orizzontale di un triangolo quasi verticale (per scivolare lungo i muri), o null
  function wallNormal(t) {
    const P = soup.tris, e1x = P[t + 3] - P[t], e1y = P[t + 4] - P[t + 1], e1z = P[t + 5] - P[t + 2], e2x = P[t + 6] - P[t], e2y = P[t + 7] - P[t + 1], e2z = P[t + 8] - P[t + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x, l = Math.hypot(nx, nz);
    return l > 0.5 * Math.hypot(nx, ny, nz) ? [nx / l, nz / l] : null;
  }

  /* ---------- tronchi degli alberi: cerchi in pianta ---------- */
  let trunks = [], trunksAt = -1e9;
  function refreshTrunks(now) { // ogni 2 s: l'editor può spostare, togliere o aggiungere alberi
    if (now - trunksAt < 2000) return;
    trunksAt = now;
    const list = C.alberiVisibili && C.alberiVisibili() === false ? [] : (C.alberi && C.alberi.list) || []; // alberi nascosti: niente tronchi
    trunks = list.filter((t) => !t.rimosso && Array.isArray(t.p)).map((t) => { const p = C.project(t.p); return [p.x, p.z, /pinus|pino|needle/i.test(t.g || '') ? 0.35 : 0.3]; });
  }

  /* ---------- cancelli ---------- */
  // le ante le segna campus-3d.js (userData.anta: cardine nell'origine del gruppo, estremo libero `punta`, verso `apertura` facoltativo);
  // l'anta gira di 90° in 0,7 s, poi le collisioni si rifanno con l'anta nella nuova posizione
  const swings = new Set();
  function gateInFront() {
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), b = new T.Box3(), c = new T.Vector3();
    let best = null, bestD = 3;
    for (const root of rootsNow()) root.traverse((o) => {
      if (!o.userData || !o.userData.anta || !visible(o)) return;
      b.setFromObject(o); if (b.isEmpty()) return;
      if (st.feet + EYE < b.min.y - 0.5 || st.feet > b.max.y + 0.5) return; // a un altro piano
      const dx = Math.max(b.min.x - st.x, 0, st.x - b.max.x), dz = Math.max(b.min.z - st.z, 0, st.z - b.max.z), d = Math.hypot(dx, dz);
      b.getCenter(c);
      const cx = c.x - st.x, cz = c.z - st.z, cl = Math.hypot(cx, cz) || 1;
      if (d < bestD && (d < 0.8 || (cx * fx + cz * fz) / cl > 0.35)) { bestD = d; best = o; } // davanti, o comunque attaccata
    });
    return best;
  }
  function toggleGate() {
    const g = gateInFront();
    if (!g) { flash('Nessun cancello qui davanti'); return; }
    const a = g.userData.anta;
    if (a.base == null) a.base = g.rotation.y;
    let to = a.base;
    if (!a.aperta) {
      let ang = a.apertura;
      if (ang == null) { // si spinge: il verso che porta l'estremo libero più lontano da chi cammina
        const from = g.rotation.y, end = new T.Vector3();
        const far = (th) => { g.rotation.y = a.base + th; g.updateMatrixWorld(true); end.fromArray(a.punta || [1, 0, 0]).applyMatrix4(g.matrixWorld); return Math.hypot(end.x - st.x, end.z - st.z); };
        ang = far(Math.PI / 2) >= far(-Math.PI / 2) ? Math.PI / 2 : -Math.PI / 2;
        g.rotation.y = from; g.updateMatrixWorld(true);
      }
      to = a.base + ang;
    }
    for (const s of swings) if (s.g === g) swings.delete(s);
    a.aperta = !a.aperta;
    swings.add({ g, from: g.rotation.y, to, t0: performance.now() });
    flash(a.aperta ? 'Cancello aperto (F per chiuderlo)' : 'Cancello chiuso');
  }
  function swingGates(now) {
    for (const s of swings) {
      const k = Math.min(1, (now - s.t0) / 700), e = k < 0.5 ? 2 * k * k : 1 - ((2 - 2 * k) ** 2) / 2;
      s.g.rotation.y = s.from + (s.to - s.from) * e;
      if (k >= 1) { swings.delete(s); buildSoup(st.x, st.z); }
    }
  }

  /* ---------- movimento ---------- */
  function tryMove(dx, dz) {
    if (Math.hypot(dx, dz) < 1e-6) return;
    if (touchAt(st.x, st.z) >= 0) { st.x += dx; st.z += dz; return; } // già dentro qualcosa (partenza, oggetto appena aggiunto): si esce liberamente
    const t = touchAt(st.x + dx, st.z + dz);
    if (t < 0) { st.x += dx; st.z += dz; return; }
    const n = wallNormal(t); if (!n) return;
    const dot = dx * n[0] + dz * n[1], sx = dx - dot * n[0], sz = dz - dot * n[1]; // scivola lungo il muro
    if (Math.hypot(sx, sz) > 1e-4 && touchAt(st.x + sx, st.z + sz) < 0) { st.x += sx; st.z += sz; }
  }
  function trunksOut() { // i tronchi: cerchi in pianta
    for (const [tx, tz, r] of trunks) {
      const ex = st.x - tx, ez = st.z - tz, d = Math.hypot(ex, ez), min = r + RADIUS;
      if (d < min && d > 1e-4) { st.x = tx + (ex / d) * min; st.z = tz + (ez / d) * min; }
    }
  }
  function step(now = performance.now()) {
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
    if (Math.hypot(st.x - soup.cx, st.z - soup.cz) > HALF / 2 || (now - soup.checked > 1000 && ((soup.checked = now), signature() !== soup.sig))) buildSoup(st.x, st.z);
    refreshTrunks(now);
    if (swings.size) swingGates(now);
    const k = st.keys; // anche in pausa (scheda dell'editor aperta) si cammina con tastiera e levetta
    if (k.has('ArrowLeft')) st.yaw += TURN * dt;
    if (k.has('ArrowRight')) st.yaw -= TURN * dt;
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - st.stick.y;
    let s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + st.stick.x;
    const mag = Math.hypot(f, s); if (mag > 1) { f /= mag; s /= mag; }
    const run = st.run || k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(st.stick.x, st.stick.y) > 0.92;
    const sp = SPEEDS[st.speed - 1] * (run ? RUN : 1) * dt, sy = Math.sin(st.yaw), cy = Math.cos(st.yaw);
    const dx = (-sy * f + cy * s) * sp, dz = (-cy * f - sy * s) * sp;
    const moved = Math.abs(dx) + Math.abs(dz) > 1e-6;
    if (moved) { tryMove(dx, dz); trunksOut(); }
    // terreno sotto i piedi: si sale fino a STEP, si scende a scalini restando attaccati, altrimenti si cade
    const g = groundAt(st.x, st.z, st.feet + STEP + 0.05), gy = g === null ? 0 : g;
    if (st.jump && st.grounded) { st.vy = JUMP; st.grounded = false; }
    st.jump = false;
    if (st.vy > 0 || st.feet > gy + (st.grounded ? STEP : 0.001)) {
      st.vy -= GRAVITY * dt; st.feet += st.vy * dt;
      if (st.feet <= gy) { st.feet = gy; st.vy = 0; st.grounded = true; } else st.grounded = false;
    } else { st.feet = gy; st.vy = 0; st.grounded = true; }
    // la vista segue i piedi con un po' di morbidezza sui gradini, subito nei salti e nelle cadute
    const target = st.feet + EYE;
    st.eye = st.grounded ? st.eye + (target - st.eye) * Math.min(1, dt * 14) : target;
    const cam = C.camera;
    cam.position.set(st.x, st.eye, st.z);
    cam.rotation.set(st.pitch, st.yaw, 0, 'YXZ');
    if (moved && now - tilesAt > 1500) { tilesAt = now; C.tasselli(); } // tasselli dell'ortofoto attorno a chi cammina
  }

  /* ---------- entrata e uscita ---------- */
  // punto di partenza: il centro della vista a terra; se lì c'è un edificio, il primo punto libero verso la camera
  function startPoint() {
    const cam = C.camera, tg = C.controls.target, dx = cam.position.x - tg.x, dz = cam.position.z - tg.z, l = Math.hypot(dx, dz) || 1;
    for (let d = 0; d <= 60; d += 1) {
      const x = tg.x + (dx / l) * d, z = tg.z + (dz / l) * d, top = groundAt(x, z, 400);
      if (top === null || top <= Math.max(0, tg.y) + 1.3) return { x, z, yaw: Math.atan2(dx, dz) };
    }
    return { x: tg.x, z: tg.z, yaw: Math.atan2(dx, dz) };
  }
  function enter() {
    if (on || !C || !C.camera || !C.controls) return;
    const cam = C.camera;
    saved = { fov: cam.fov, near: cam.near };
    buildSoup(C.controls.target.x, C.controls.target.z);
    const p = startPoint();
    const g = groundAt(p.x, p.z, Math.max(0, C.controls.target.y) + 2);
    Object.assign(st, { x: p.x, z: p.z, feet: g === null ? 0 : g, vy: 0, yaw: p.yaw, pitch: -0.05, grounded: true, run: false, jump: false });
    st.eye = st.feet + EYE; st.keys.clear(); resetStick(); trunksAt = -1e9;
    cam.fov = 70; cam.near = 0.1; cam.updateProjectionMatrix();
    on = true; last = performance.now();
    ui.host.classList.add('cm-on'); ui.layer.hidden = false; ui.run.setAttribute('aria-pressed', 'false');
    const touch = isTouch(); ui.layer.classList.toggle('cm-touch', touch);
    ui.help.textContent = touch ? HELP.touch : HELP.free;
    const fx = C.scene.getObjectByName('editor-maniglie'); if (fx) fx.visible = false;
    C.primaPersona(step);
    ui.layer.focus({ preventScroll: true }); // non su un tasto: lo Spazio lo premerebbe
    if (!touch) lockMouse(); // il clic su «Cammina» basta al browser per catturare il mouse
  }
  function exit() {
    if (!on) return;
    if (paused) resume(false);
    unlockMouse();
    on = false; C.primaPersona(null);
    const cam = C.camera, sy = Math.sin(st.yaw), cy = Math.cos(st.yaw);
    cam.fov = saved.fov; cam.near = saved.near; cam.updateProjectionMatrix(); cam.rotation.order = 'XYZ';
    // la vista dall'alto riparte da dove sei arrivato, alle tue spalle
    C.controls.target.set(st.x - sy * 4, st.feet, st.z - cy * 4);
    cam.position.set(st.x + sy * 14, st.feet + 11, st.z + cy * 14);
    C.controls.update();
    ui.host.classList.remove('cm-on'); ui.layer.hidden = true;
    const fx = C.scene.getObjectByName('editor-maniglie'); if (fx) fx.visible = true;
    st.keys.clear(); resetStick();
    ui.walk.focus({ preventScroll: true });
  }

  /* ---------- mouse catturato ---------- */
  const locked = () => document.pointerLockElement === ui.layer;
  function lockMouse() {
    if (!on || paused || isTouch() || locked() || !ui.layer.requestPointerLock) return;
    try { const p = ui.layer.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* resta il trascinamento */ }
  }
  function unlockMouse() { if (locked()) document.exitPointerLock(); }
  function onLockChange() {
    if (locked() && (!on || paused)) { document.exitPointerLock(); return; } // concessa in ritardo, dopo l'uscita o la pausa
    if (!on) return;
    if (!isTouch()) ui.help.textContent = locked() ? HELP.locked : HELP.free;
  }
  const HELP = {
    locked: 'W A S D cammina · muovi il mouse per guardarti intorno · 1–9 velocità · Maiuscolo corre · Spazio salta · F apre i cancelli · E modifica · C commenta · Esc libera il mouse',
    free: 'Clic sulla scena per guardarti intorno col mouse · W A S D cammina · 1–9 velocità · F apre i cancelli · E modifica · C commenta · Esc esce',
    touch: 'Levetta: cammina (fino in fondo corre) · trascina per guardarti intorno · «Apri» apre il cancello davanti · Modifica e Commenta agiscono sul mirino',
  };

  /* ---------- mirino: modifica e commenta al centro dello schermo ---------- */
  let cardWatch = null;
  function aim(kind) {
    const E = window.campus3dEditor;
    if (!on || paused || !E || !E.mira) return;
    paused = true; st.keys.clear(); resetStick(); st.look = null;
    unlockMouse();
    ui.host.classList.add('cm-pausa'); ui.layer.classList.add('cm-pause'); ui.resume.hidden = false;
    const fx = C.scene.getObjectByName('editor-maniglie'); if (fx) fx.visible = true;
    if (!E.mira(kind)) { resume(true); flash(kind === 'commenta' ? 'Niente da commentare al centro: mira un oggetto' : 'Niente da modificare al centro: mira un oggetto'); return; }
    // chiusa la scheda (Fine, Annulla, Salva, ✕) si riprende a camminare
    cardWatch = new MutationObserver(() => { if (E.scheda.hidden) resume(true); });
    cardWatch.observe(E.scheda, { attributes: true, attributeFilter: ['hidden'] });
  }
  function resume(relock) {
    if (!paused) return;
    paused = false;
    if (cardWatch) { cardWatch.disconnect(); cardWatch = null; }
    const E = window.campus3dEditor; if (E && E.chiudi) E.chiudi();
    ui.host.classList.remove('cm-pausa'); ui.layer.classList.remove('cm-pause'); ui.resume.hidden = true;
    const fx = C.scene.getObjectByName('editor-maniglie'); if (fx) fx.visible = false;
    if (C.controls) C.controls.enabled = false;
    ui.layer.focus({ preventScroll: true });
    onLockChange();
    if (relock) lockMouse();
  }
  function flash(text) {
    ui.speed.textContent = text; ui.speed.classList.add('cm-show');
    clearTimeout(speedTimer); speedTimer = setTimeout(() => ui.speed.classList.remove('cm-show'), 1600);
  }

  /* ---------- comandi ---------- */
  function resetStick() { st.stick.x = 0; st.stick.y = 0; st.stick.id = null; if (ui.knob) ui.knob.style.transform = ''; }
  // comandi a schermo solo dove si tocca lo schermo: puntatore grossolano, o touch senza un puntatore fine
  const isTouch = () => matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
  let speedTimer = 0;
  function setSpeed(n) {
    st.speed = Math.max(1, Math.min(9, n));
    try { localStorage.setItem('cammina-velocita', String(st.speed)); } catch (_) { /* senza memoria del browser */ }
    flash(`Velocità ${st.speed}`);
  }
  const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']);
  function onKey(e) {
    if (!on) return;
    const typing = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.type === 'keydown' && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (paused) resume(true); else exit(); return; }
    if (typing) return;
    if (e.code === 'KeyE' || e.code === 'KeyC') { e.preventDefault(); e.stopImmediatePropagation(); if (e.type === 'keydown' && !e.repeat) aim(e.code === 'KeyE' ? 'modifica' : 'commenta'); return; }
    if (e.code === 'KeyF') { e.preventDefault(); e.stopImmediatePropagation(); if (e.type === 'keydown' && !e.repeat) toggleGate(); return; }
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) { e.preventDefault(); e.stopImmediatePropagation(); if (e.type === 'keydown' && !e.repeat) setSpeed(Number(digit[1])); return; }
    if (!KEYS.has(e.code)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type === 'keydown') { if (e.code === 'Space') st.jump = true; else st.keys.add(e.code); } else st.keys.delete(e.code);
  }
  function css() {
    const s = document.createElement('style');
    s.textContent = `
    .cm-on .ed-bar,.cm-on:not(.cm-pausa) .ed-card,.cm-on:not(.cm-pausa) .ed-hint{display:none!important}
    .cm-layer.cm-pause{pointer-events:none;cursor:default}
    .cm-layer.cm-pause .cm-aim,.cm-layer.cm-pause .cm-help{display:none}
    .cm-layer.cm-pause .cm-stick{pointer-events:auto}
    .cm-pausa .ed-card{max-height:calc(100% - 96px);overflow:auto}
    .cm-pausa .ed-hint{top:72px}
    .cm-layer.cm-pause .cm-cross{opacity:.35}
    .cm-layer{position:absolute;inset:0;z-index:30;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}
    .cm-layer:active{cursor:grabbing}
    .cm-layer:focus{outline:none}
    .cm-top{position:absolute;left:12px;right:12px;top:12px;display:flex;gap:8px;align-items:flex-start;justify-content:space-between;pointer-events:none}
    .cm-help{max-width:440px;padding:8px 12px;border-radius:10px;background:#211d1dd9;color:#fff;font:13px/1.4 Arial,Helvetica,sans-serif}
    .cm-btn{pointer-events:auto;min-height:44px;padding:0 14px;border-radius:10px;border:1px solid #d9d0cc;background:#fffffff2;color:#3b3431;box-shadow:0 4px 14px #32201b22;font:600 13px/1.2 Arial,Helvetica,sans-serif;cursor:pointer}
    .cm-btn[aria-pressed="true"]{background:#822433;border-color:#822433;color:#fff}
    .cm-btn:focus-visible{outline:3px solid #822433;outline-offset:2px}
    .cm-stick{position:absolute;left:20px;bottom:20px;width:128px;height:128px;border-radius:50%;background:#ffffff38;border:2px solid #ffffffb0;box-shadow:0 4px 18px #0004;touch-action:none}
    .cm-knob{position:absolute;left:39px;top:39px;width:46px;height:46px;border-radius:50%;background:#fffffff0;box-shadow:0 2px 8px #0005;pointer-events:none}
    .cm-acts{position:absolute;right:20px;bottom:20px;display:flex;flex-direction:column;gap:10px}
    .cm-acts .cm-btn{min-width:88px;min-height:52px}
    .cm-cross{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;pointer-events:none}
    .cm-cross::before,.cm-cross::after{content:'';position:absolute;background:#fff;box-shadow:0 0 0 1px #000a}
    .cm-cross::before{left:10px;top:0;width:2px;height:22px}
    .cm-cross::after{left:0;top:10px;width:22px;height:2px}
    .cm-tools{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-left:auto;pointer-events:none}
    .cm-layer:not(.cm-touch) .cm-stick,.cm-layer:not(.cm-touch) .cm-acts{display:none}
    .cm-speed{position:absolute;left:50%;top:38%;transform:translateX(-50%);padding:10px 18px;border-radius:12px;background:#211d1dd9;color:#fff;font:700 20px/1.2 Arial,Helvetica,sans-serif;opacity:0;transition:opacity .25s;pointer-events:none}
    .cm-speed.cm-show{opacity:1}`;
    document.head.appendChild(s);
  }
  function buildUi() {
    const host = document.querySelector('.maparea') || document.body, el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    ui.host = host;
    ui.walk = el('button', 'ed-btn', '🚶 Cammina'); ui.walk.type = 'button'; ui.walk.title = 'Passeggiata in prima persona';
    ui.walk.addEventListener('click', enter);
    ui.layer = el('div', 'cm-layer'); ui.layer.hidden = true; ui.layer.tabIndex = -1; ui.layer.setAttribute('role', 'application'); ui.layer.setAttribute('aria-label', 'Passeggiata in prima persona');
    const top = el('div', 'cm-top'), help = el('div', 'cm-help'); ui.help = help;
    ui.speed = el('div', 'cm-speed'); ui.speed.setAttribute('role', 'status'); ui.speed.setAttribute('aria-live', 'polite');
    try { const n = Number(localStorage.getItem('cammina-velocita')); if (n >= 1 && n <= 9) st.speed = n; } catch (_) { /* senza memoria del browser */ }
    ui.exit = el('button', 'cm-btn', '✕ Esci'); ui.exit.type = 'button'; ui.exit.setAttribute('aria-label', 'Esci dalla passeggiata'); ui.exit.addEventListener('click', exit);
    const tools = el('div', 'cm-tools');
    const edit = el('button', 'cm-btn cm-aim', '✎ Modifica'); edit.type = 'button'; edit.title = 'Modifica quello che sta nel mirino (E)'; edit.addEventListener('click', () => aim('modifica'));
    const note = el('button', 'cm-btn cm-aim', '💬 Commenta'); note.type = 'button'; note.title = 'Commenta quello che sta nel mirino (C)'; note.addEventListener('click', () => aim('commenta'));
    const gate = el('button', 'cm-btn', '🚪 Apri'); gate.type = 'button'; gate.title = 'Apri o chiudi il cancello che hai davanti (F)'; gate.addEventListener('click', toggleGate);
    ui.resume = el('button', 'cm-btn', '▶ Riprendi a camminare'); ui.resume.type = 'button'; ui.resume.hidden = true; ui.resume.addEventListener('click', () => resume(true));
    tools.append(gate, edit, note, ui.resume, ui.exit);
    top.append(help, tools);
    ui.stick = el('div', 'cm-stick'); ui.knob = el('div', 'cm-knob'); ui.stick.append(ui.knob); ui.stick.setAttribute('aria-hidden', 'true');
    const acts = el('div', 'cm-acts');
    ui.run = el('button', 'cm-btn', '🏃 Corri'); ui.run.type = 'button'; ui.run.setAttribute('aria-pressed', 'false');
    ui.run.addEventListener('click', () => { st.run = !st.run; ui.run.setAttribute('aria-pressed', String(st.run)); });
    const jump = el('button', 'cm-btn', '⤒ Salta'); jump.type = 'button'; jump.addEventListener('pointerdown', (e) => { e.stopPropagation(); st.jump = true; });
    acts.append(ui.run, jump);
    ui.layer.append(el('div', 'cm-cross'), top, ui.speed, ui.stick, acts);
    host.append(ui.layer);
    for (const b of [ui.exit, ui.run, jump, gate, edit, note, ui.resume]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    // levetta
    const R = 46;
    const stickMove = (e) => {
      const r = ui.stick.getBoundingClientRect(); let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(x, y); if (d > R) { x *= R / d; y *= R / d; }
      st.stick.x = x / R; st.stick.y = y / R; ui.knob.style.transform = `translate(${x}px,${y}px)`;
    };
    ui.stick.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); st.stick.id = e.pointerId; try { ui.stick.setPointerCapture(e.pointerId); } catch (_) { /* nessuna cattura */ } stickMove(e); });
    ui.stick.addEventListener('pointermove', (e) => { if (e.pointerId === st.stick.id) stickMove(e); });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) ui.stick.addEventListener(t, (e) => { if (e.pointerId === st.stick.id) resetStick(); });
    // sguardo: trascinamento sul resto dello schermo
    ui.layer.addEventListener('pointerdown', (e) => {
      if (paused) return;
      if (e.pointerType === 'mouse' && !isTouch()) { if (!locked()) lockMouse(); if (locked()) return; }
      if (st.look) return; st.look = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { ui.layer.setPointerCapture(e.pointerId); } catch (_) { /* nessuna cattura */ }
    });
    document.addEventListener('mousemove', (e) => {
      if (!on || paused || !locked()) return;
      st.yaw -= e.movementX * LOOK * 0.6; st.pitch = Math.max(-1.45, Math.min(1.45, st.pitch - e.movementY * LOOK * 0.6));
    });
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', () => { if (on) flash('Il browser non cattura il mouse: trascina per guardarti intorno'); });
    ui.layer.addEventListener('pointermove', (e) => {
      if (!st.look || e.pointerId !== st.look.id) return;
      st.yaw -= (e.clientX - st.look.x) * LOOK; st.pitch = Math.max(-1.45, Math.min(1.45, st.pitch - (e.clientY - st.look.y) * LOOK));
      st.look.x = e.clientX; st.look.y = e.clientY;
    });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) ui.layer.addEventListener(t, (e) => { if (st.look && e.pointerId === st.look.id) st.look = null; });
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('keyup', onKey, { capture: true });
    window.addEventListener('blur', () => { st.keys.clear(); resetStick(); });    // il tasto sta nella barra dell'editor quando c'è, altrimenti in una barra sua
    let tries = 0;
    const place = setInterval(() => {
      const bar = host.querySelector('.ed-bar');
      if (bar || ++tries > 25) {
        clearInterval(place);
        if (bar) bar.prepend(ui.walk);
        else { const own = el('div', 'ed-bar'); own.style.cssText = 'position:absolute;z-index:20;right:12px;bottom:12px;display:flex;gap:8px;font:600 13px/1.2 Arial,Helvetica,sans-serif'; ui.walk.style.cssText = 'min-height:44px;padding:0 14px;border-radius:10px;border:1px solid #d9d0cc;background:#fffffff2;cursor:pointer'; own.append(ui.walk); host.append(own); }
      }
    }, 400);
  }
  const wait = setInterval(() => {
    const c = window.campus3d;
    if (c && c.scene && c.camera && c.controls && c.renderer && typeof c.primaPersona === 'function') {
      clearInterval(wait); C = c; T = window.THREE; css(); buildUi();
      // per le prove: prova(secondi, tasti) fa avanzare la passeggiata a passi fissi di 1/60 s
      const prova = (sec, keys = []) => { st.keys = new Set(keys); let t = last; for (let i = 0; i < sec * 60; i += 1) { t += 1000 / 60; step(t); } st.keys = new Set(); last = performance.now(); };
      window.campus3dCammina = { entra: enter, esci: exit, prova, salta: () => { st.jump = true; }, get attivo() { return on; }, velocita: (n) => setSpeed(n), mira: (k) => aim(k), riprendi: () => resume(false), get pausa() { return paused; }, get stato() { return { x: st.x, piedi: st.feet, z: st.z, yaw: st.yaw, aTerra: st.grounded, velocita: st.speed }; } };
    }
  }, 400);
})();

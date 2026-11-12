(() => {
  'use strict';
  const SOURCE = 'campus-buildings.json';
  const CONTEXT_SOURCE = 'campus-context.geojson';
  const CHEMISTRY = new Set(['CU014', 'CU032', 'CU035']);
  const DISEGNATI = new Set(['CU014', 'CU032']); // edifici disegnati nella scena (CU035 tolto su richiesta, commento del 23/10)
  // Scena: Città Universitaria al centro, dintorni come cartina 2D muta.
  const bounds = { west: 12.5040, south: 41.8946, east: 12.5257, north: 41.9108 };
  // sfumatura circolare della cartina muta attorno al baricentro della CU (metri)
  const FADE = { center: [12.514862, 41.902740], inner: 470, outer: 860 };
  // Ritaglio AGEA locale (ripiego e vista ortofoto 2D).
  const PHOTO_BOUNDS = { west: 12.505, south: 41.898, east: 12.519, north: 41.906 };
  // Confine della CU in 3D fotografico: lato esterno delle strade che la circondano
  // (strade incluse), più piazzale Aldo Moro con il CNR e piazzale del Verano.
  const CAMPUS_POLY = [[12.520515, 41.901737], [12.515571, 41.905544], [12.510446, 41.904041], [12.512053, 41.901077], [12.512066, 41.900238], [12.512032, 41.900211], [12.512301, 41.899673], [12.518137, 41.901863], [12.519517, 41.90102]];
  // Area dell'ortofoto ad alta risoluzione: contiene il confine con un piccolo margine.
  const ORTHO_BOUNDS = { west: 12.5098, south: 41.8992, east: 12.5232, north: 41.9062 };
  // CNR: ospite d'onore. Sagoma di ripiego disegnata sull'ortofoto; se OSM la fornisce, si usa quella.
  const CNR = { code: 'CNR', name: 'Consiglio Nazionale delle Ricerche', note: '(non Sapienza ma omaggiato per simpatia)', height: 24,
    ring: [[12.512315, 41.900665], [12.512735, 41.900782], [12.513108, 41.900507], [12.513473, 41.900297], [12.513473, 41.900254], [12.512554, 41.899911], [12.512467, 41.899868], [12.51235, 41.899889]] };
  const $ = (id) => document.getElementById(id);
  const listNode = $('buildingList');
  const statusNode = $('status');
  const photoStage = $('photoStage');
  const planStage = $('planStage');
  const mapHost = $('map3dHost');
  const drawer = $('detailDrawer');
  const tourButton = $('tourButton');
  const modeButton = $('modeButton');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const metersPerLon = 111320 * Math.cos(((bounds.south + bounds.north) / 2) * Math.PI / 180);
  const metersPerLat = 111132;
  const mapWidth = (bounds.east - bounds.west) * metersPerLon;
  const mapDepth = (bounds.north - bounds.south) * metersPerLat;
  const embedded = new URLSearchParams(location.search).get('embedded') === '1';
  if (!embedded && window.parent === window && !new URLSearchParams(location.search).has('standalone')) {
    const code = (new URLSearchParams(location.search).get('code') || '').replace(/[^A-Za-z0-9]/g, '');
    location.replace(`../index.html?campus=3d-full#mappa${code ? '/' + code : ''}`);
    return;
  }
  document.body.classList.toggle('embedded', embedded);
  let buildings = [];
  let selectedCode = '';
  let chemistryOnly = false;
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let ground = null;
  let buildingGroup = null;
  let photoTexture = null;
  let normalSide = null;
  let treeGroup = null;
  // interruttore «Alberi» (editor.js): ogni albero costruito qui è marcato userData.albero e nasce già con la visibilità giusta,
  // così sopravvive a qualsiasi ricostruzione (esterni, cortile, alberi OSM)
  let alberiOn = true;
  const albero = (o) => { o.userData.albero = true; o.visible = alberiOn; return o; };
  let courtyardModel = null;
  let normalRoof = null;
  let selectedSide = null;
  let selectedRoof = null;
  let currentView = '3d';
  let showAerial = true;
  let showBuildings = true;
  let tourTimer = 0;
  let cameraTweenId = 0;
  let resizeObserver = null;
  let pickables = [];
  let activeCodeMeshes = new Map();
  let activeCodeOutlines = new Map();
  let baseBuildings = [];
  let contextFeatures = [];
  let alignment = null;
  let officialPlan = null;
  let officialPlanCodes = new Set();
  let planLayerGroup = null;
  let planBuildingsGroup = null;
  let planImagePlane = null;
  let planImageMaterial = null;
  let planTexture = null;
  let planMeshesByCode = new Map();
  let planOutlinesByCode = new Map();
  let planPointsByCode = new Map();
  let planVisible = true;
  let planOpacity = 0.8;
  let planColors = { lesson: '#f2b400', selected: '#2f8fd0', custom: {} };
  let parentActive = true;
  let pendingSelectedCode = '';
  let pendingCamera = null;
  let parentUnavailableSent = false;
  let latestParentContext = null;
  let occlusion = { right: 0, bottom: 0 };
  let orthoMesh = null;
  let orthoCanvas = null;
  let orthoSource = null;
  let baseCanvas = null;
  let baseTexture = null;
  let cnrMesh = null;
  let cnrOutline = null;
  let extraMask = [];
  let planMask = [];
  let maskCanvas = null;
  let roofTexture = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const setStatus = (html, error = false) => {
    statusNode.innerHTML = html;
    statusNode.classList.toggle('error', error);
  };
  const getName = (b) => b.name || 'Edificio senza nome in OSM';
  const getType = (b) => b.building && b.building !== 'yes' ? b.building : 'edificio';

  function project([lon, lat]) {
    return { x: (lon - bounds.west) * metersPerLon - mapWidth / 2, n: (lat - bounds.south) * metersPerLat - mapDepth / 2 };
  }
  /* ---------- vista focalizzata: solo Chimica (CU014) e ciò che sta entro 50 m dai suoi confini ---------- */
  const FOCUS = { code: 'CU014', radius: 50 };
  let focusRing = null;
  const ringXY = (ring) => closeRing(ring).map((pt) => { const p = project(pt); return [p.x, p.n]; });
  function getFocusRing() {
    if (!focusRing) { const b = buildings.find((x) => x.code === FOCUS.code); if (b && b.rings?.[0]) focusRing = ringXY(b.rings[0]); }
    return focusRing;
  }
  function pointSegDist(p, a, c) {
    const dx = c[0] - a[0], dy = c[1] - a[1], len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function pointInRing(p, ring) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function ringDistance(A, B) {
    if (A.some((p) => pointInRing(p, B)) || B.some((p) => pointInRing(p, A))) return 0;
    let d = Infinity;
    for (const p of A) for (let j = 1; j < B.length; j += 1) d = Math.min(d, pointSegDist(p, B[j - 1], B[j]));
    for (const p of B) for (let j = 1; j < A.length; j += 1) d = Math.min(d, pointSegDist(p, A[j - 1], A[j]));
    return d;
  }
  function nearFocusRing(ring) {
    const f = getFocusRing();
    if (!f) return true;
    const r = ringXY(ring);
    return r.length > 3 && ringDistance(r, f) <= FOCUS.radius;
  }
  function nearFocusPoint(lonLat) {
    const f = getFocusRing();
    if (!f) return true;
    const p = project(lonLat), q = [p.x, p.n];
    if (pointInRing(q, f)) return true;
    for (let j = 1; j < f.length; j += 1) if (pointSegDist(q, f[j - 1], f[j]) <= FOCUS.radius) return true;
    return false;
  }
  function focusCentroid() {
    const f = getFocusRing();
    if (!f) return campusCentroid();
    const lonLat = polygonCentroid(buildings.find((x) => x.code === FOCUS.code).rings[0]);
    return project(lonLat);
  }
  function imagePoint([lon, lat]) {
    return [((lon - PHOTO_BOUNDS.west) / (PHOTO_BOUNDS.east - PHOTO_BOUNDS.west)) * 1200, ((PHOTO_BOUNDS.north - lat) / (PHOTO_BOUNDS.north - PHOTO_BOUNDS.south)) * 923];
  }
  function campusCenter() {
    const lons = CAMPUS_POLY.map((p) => p[0]), lats = CAMPUS_POLY.map((p) => p[1]);
    return project([(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]);
  }
  function drawFootprints() {
    const svg = $('footprints');
    svg.replaceChildren();
    svg.hidden = !showBuildings;
    for (const b of buildings) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const d = b.rings.map((ring) => ring.map((pt, i) => {
        const [x, y] = imagePoint(pt);
        return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
      }).join(' ') + ' Z').join(' ');
      path.setAttribute('d', d);
      path.setAttribute('class', `footprint${selectedCode === b.code ? ' selected' : ''}`);
      path.setAttribute('fill-rule', 'evenodd');
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', `${b.code}: ${getName(b)}`);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${b.code} · ${getName(b)}`;
      path.append(title);
      path.addEventListener('click', () => selectBuilding(b.code, { animate: false }));
      path.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectBuilding(b.code, { animate: false }); }
      });
      svg.append(path);
    }
  }
  function renderList() {
    const query = $('search').value.trim().toLocaleLowerCase('it');
    const filtered = buildings.filter((b) => {
      if (chemistryOnly && !CHEMISTRY.has(b.code)) return false;
      return !query || `${b.code} ${getName(b)} ${b.building || ''}`.toLocaleLowerCase('it').includes(query);
    });
    $('count').textContent = `${filtered.length} / ${buildings.length}`;
    listNode.replaceChildren();
    for (const b of filtered) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'building-item';
      button.setAttribute('aria-current', selectedCode === b.code ? 'true' : 'false');
      button.innerHTML = `<span class="code-pill">${esc(b.code)}</span><span><span class="building-name">${esc(getName(b))}</span><span class="building-type">${esc(getType(b))}</span></span><span class="chev" aria-hidden="true">›</span>`;
      button.addEventListener('click', () => selectBuilding(b.code));
      listNode.append(button);
    }
    if (!filtered.length) listNode.innerHTML = '<p style="padding:8px 12px;color:#746c68;font:13px Arial">Nessun edificio corrisponde alla ricerca.</p>';
  }
  function heightInfo(b) {
    const raw = String(b.height ?? '').trim().replace(',', '.');
    const match = raw.match(/^(\d+(?:\.\d+)?)\s*(m|meter|meters|metre|metres|ft|feet|foot|')?$/i);
    if (match && Number(match[1]) > 0) {
      const feet = /^(ft|feet|foot|')$/i.test(match[2] || '');
      const value = Number(match[1]) * (feet ? 0.3048 : 1);
      return { value, label: `height OSM: ${raw}${feet ? ' ft' : ' m'}` };
    }
    const levelsText = String(b.levels ?? '').trim().replace(',', '.');
    const levels = /^\d+(?:\.\d+)?$/.test(levelsText) ? Number(levelsText) : NaN;
    if (Number.isFinite(levels) && levels > 0) return { value: levels * 3.8 + 1, label: `levels OSM: ${levels} × 3,8 m + parapetto` };
    return { value: 16, label: 'stima predefinita: height/levels assenti, circa 4 piani (16 m)' };
  }
  function openDetails(b) {
    const official = officialPlanUrl(b.code);
    $('detailCode').textContent = b.code;
    $('detailCode').href = official;
    const titleLink = $('detailTitle').querySelector('a');
    titleLink.textContent = getName(b);
    titleLink.href = official;
    $('officialPlanLink').href = official;
    const height = heightInfo(b);
    const items = [
      ['Categoria', b.building || 'non specificata'],
      ['Altezza tag OSM', b.height || 'non indicata'],
      ['Piani tag OSM', b.levels || 'non indicati'],
      ['Volume indicativo', `${height.value.toFixed(1)} m · ${height.label}`],
      ['Centroide', `${b.centroid.lat.toFixed(6)}, ${b.centroid.lon.toFixed(6)}`],
      ['Fonte', 'OpenStreetMap contributors']
    ];
    if ($('detailGrid')) $('detailGrid').innerHTML = items.map(([label, value]) => `<div><span class="detail-label">${esc(label)}</span><span class="detail-value">${esc(value)}</span></div>`).join('');
    if ($('osmLinks')) $('osmLinks').innerHTML = (b.osm_elements || [{ id: b.osm_id, type: b.osm_type || 'way' }]).map((entry) => {
      const type = ['way', 'node', 'relation'].includes(entry.type) ? entry.type : 'way';
      const id = String(entry.id || '').replace(/[^0-9]/g, '');
      return id ? `<a href="https://www.openstreetmap.org/${type}/${encodeURIComponent(id)}" target="_blank" rel="noopener">OSM ${esc(id)} ↗</a>` : '';
    }).join('');
    drawer.inert = false;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    $('detailTitle').focus({ preventScroll: true });
  }
  function closeDetails() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    if (drawer.contains(document.activeElement)) $('search').focus({ preventScroll: true });
    drawer.inert = true;
  }
  function stopTour() {
    if (tourTimer) window.clearTimeout(tourTimer);
    tourTimer = 0;
    const wasOn = Boolean(controls?.autoRotate);
    if (controls) controls.autoRotate = false;
    tourButton.textContent = 'Rotazione';
    tourButton.setAttribute('aria-pressed', 'false');
    if (wasOn) notifyParent('campus-rotation', { on: false });
  }
  /* baricentro (area) del confine CU e distanza che lo inquadra tutto */
  function campusCentroid() { return project(polygonCentroid(CAMPUS_POLY)); }
  function campusFitDistance() {
    const c = polygonCentroid(CAMPUS_POLY);
    const radius = Math.max(...CAMPUS_POLY.map((p) => Math.hypot((p[0] - c[0]) * metersPerLon, (p[1] - c[1]) * metersPerLat)));
    const aspect = Math.max(0.6, Math.min(1.6, camera?.aspect || 1));
    return radius * (aspect < 1 ? 1.9 / aspect : 1.55);
  }
  function stopCameraFlight() {
    if (cameraTweenId) cancelAnimationFrame(cameraTweenId);
    cameraTweenId = 0;
  }
  function flyTo(point, distance = 520, duration = 850) {
    if (!camera || !controls || !point) return;
    stopCameraFlight();
    const target = new THREE.Vector3(point.x, 0, -point.n);
    const offset = new THREE.Vector3(distance * 0.48, distance * 0.72, distance * 0.83);
    const fromTarget = controls.target.clone();
    const fromPosition = camera.position.clone();
    const toPosition = target.clone().add(offset);
    if (reducedMotion || duration <= 0) {
      controls.target.copy(target);
      camera.position.copy(toPosition);
      controls.update();
      return;
    }
    const start = performance.now();
    const frame = (now) => {
      const raw = Math.min(1, (now - start) / duration);
      const t = raw * raw * (3 - 2 * raw);
      controls.target.copy(fromTarget).lerp(target, t);
      camera.position.copy(fromPosition).lerp(toPosition, t);
      controls.update();
      if (raw < 1) cameraTweenId = requestAnimationFrame(frame);
      else cameraTweenId = 0;
    };
    cameraTweenId = requestAnimationFrame(frame);
  }
  function selectBuilding(code, options = {}) {
    const b = buildings.find((feature) => feature.code === code);
    if (!b) return;
    const changed = selectedCode !== code;
    stopTour();
    if (cnrMesh) showGuest(false);
    selectedCode = code;
    renderList();
    drawFootprints();
    updateSelectionMaterials();
    if (!embedded) openDetails(b);
    const planPoint = planPointsByCode.get(code);
    const point = planPoint || (b.centroid ? project([b.centroid.lon, b.centroid.lat]) : null);
    if (renderer && point && changed && options.animate !== false) flyTo(point, 500, 850);
    else if (renderer && point && changed && options.animate === false) flyTo(point, 500, 0);
    if (options.notify !== false && window.parent && window.parent !== window) {
      try { window.parent.postMessage({ type: 'campus-select', code: b.code }, location.origin); } catch (_) { /* stesso-origin solo */ }
    }
  }
  function officialPlanUrl(code) {
    const url = new URL('../index.html', location.href);
    url.hash = `mappa/${encodeURIComponent(code || '')}`;
    return url.href;
  }
  function returnToPlan() {
    const code = selectedCode || '';
    stopTour();
    let sameOriginParent = false;
    try { sameOriginParent = window.parent !== window && window.parent.location.origin === location.origin; } catch (_) { /* parent di altro origin */ }
    if (sameOriginParent) {
      window.parent.postMessage({ type: 'campus-return', code }, location.origin);
      return;
    }
    window.location.assign(officialPlanUrl(code));
  }
  function setView(view) {
    currentView = view;
    const is3d = view === '3d' && Boolean(renderer);
    const showPlan = !is3d && embedded && officialPlan && planVisible;
    planStage.hidden = !showPlan;
    photoStage.hidden = is3d || showPlan;
    mapHost.classList.toggle('active', is3d);
    modeButton.textContent = is3d ? 'Vista ortofoto' : 'Vista 3D';
    modeButton.setAttribute('aria-pressed', String(is3d));
    modeButton.disabled = !renderer;
    tourButton.disabled = reducedMotion || !is3d;
    if (is3d) setStatus('<b>Vista 3D locale pronta.</b> Volumi indicativi da OpenStreetMap; seleziona un edificio per consultare aule e lezioni.');
    else if (!renderer) setStatus('<b>WebGL non disponibile.</b> Ortofoto AGEA e impronte restano esplorabili.', true);
    else setStatus('<b>Ortofoto AGEA 2020.</b> Le sagome CU sono selezionabili; passa alla vista 3D quando vuoi.');
    resizeRenderer();
  }
  function startTour() {
    if (!controls || reducedMotion || currentView !== '3d' || viewDim === '2d') return;
    stopTour();
    flyTo(campusCentroid(), campusFitDistance(), 1100);
    tourButton.textContent = 'Ferma rotazione';
    tourButton.setAttribute('aria-pressed', 'true');
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    notifyParent('campus-rotation', { on: true });
  }
  function setAerial(visible) {
    showAerial = visible;
    $('aerialImage').hidden = !visible;
    if (photoTexture) {
      normalRoof.map = visible ? roofTexture : null;
      selectedRoof.map = visible ? roofTexture : null;
      normalRoof.needsUpdate = true;
      selectedRoof.needsUpdate = true;
    }
    if (orthoMesh) orthoMesh.visible = visible;
    if (cnrMesh) { cnrMesh.material[0].map = visible ? roofTexture : null; cnrMesh.material[0].needsUpdate = true; }
    extrasGroup?.traverse((o) => { if (o.userData.texturedTop) { o.material[0].map = visible ? roofTexture : null; o.material[0].needsUpdate = true; } });
    for (const mesh of planMeshesByCode.values()) {
      mesh.material[0].map = visible ? roofTexture : null;
      mesh.material[0].needsUpdate = true;
    }
    $('aerialToggle')?.setAttribute('aria-pressed', String(visible));
  }
  function setBuildingVisibility(visible) {
    showBuildings = visible;
    if (buildingGroup) buildingGroup.visible = visible;
    $('buildingsToggle').setAttribute('aria-pressed', String(visible));
    $('footprints').hidden = !visible;
    const planFallback = planStage.querySelector('.plan-fallback-paths');
    if (planFallback) planFallback.hidden = !visible;
    if (planBuildingsGroup) planBuildingsGroup.visible = visible;
    $('planBuildingsToggle')?.setAttribute('aria-pressed', String(visible));
  }

  function pdfToWorld(pdfX, pdfY) {
    const [ax, ay, ac] = alignment.affine.x;
    const [az, bz, cz] = alignment.affine.zSouth;
    const anchor = project(alignment.anchorLonLat);
    return { x: ax * pdfX + ay * pdfY + ac + anchor.x, z: az * pdfX + bz * pdfY + cz - anchor.n };
  }
  function parsePlanRings(pathText) {
    const rings = [];
    let ring = null;
    const tokens = String(pathText || '').match(/[MLZ]|[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g) || [];
    let i = 0;
    let command = '';
    while (i < tokens.length) {
      if (/^[MLZ]$/i.test(tokens[i])) command = tokens[i++];
      if (command.toUpperCase() === 'Z') { if (ring?.length >= 3) rings.push(ring); ring = null; command = ''; continue; }
      if (!command || i + 1 >= tokens.length) { i += 1; continue; }
      const x = Number(tokens[i++]), y = Number(tokens[i++]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (command.toUpperCase() === 'M') { if (ring?.length >= 3) rings.push(ring); ring = []; command = command === 'm' ? 'l' : 'L'; }
      ring ||= [];
      ring.push([x, y]);
    }
    if (ring?.length >= 3) rings.push(ring);
    return rings;
  }
  function planShape(pathText) {
    const rings = parsePlanRings(pathText);
    if (!rings.length) return null;
    const shapePath = new THREE.ShapePath();
    for (const ring of rings) {
      const first = pdfToWorld(ring[0][0], ring[0][1]);
      shapePath.moveTo(first.x, -first.z);
      for (const [x, y] of ring.slice(1)) {
        const point = pdfToWorld(x, y);
        shapePath.lineTo(point.x, -point.z);
      }
      shapePath.currentPath.closePath();
    }
    const shapes = shapePath.toShapes(false);
    return { shapes, rings };
  }
  function buildPlanLayer(plan) {
    if (!plan || !alignment || !renderer) return;
    if (plan.colors) {
      if (typeof plan.colors.lesson === 'string' && /^#[\da-f]{6}$/i.test(plan.colors.lesson)) planColors.lesson = plan.colors.lesson;
      if (typeof plan.colors.selected === 'string' && /^#[\da-f]{6}$/i.test(plan.colors.selected)) planColors.selected = plan.colors.selected;
      planColors.custom = sanitizeCustom(plan.colors.custom);
    }
    if (planLayerGroup) {
      scene.remove(planLayerGroup);
      planLayerGroup.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      });
      pickables = pickables.filter((mesh) => !mesh.userData.planFeature);
      planTexture?.dispose();
    }
    officialPlan = plan;
    officialPlanCodes = new Set(plan.features.map((feature) => String(feature.code || '').toUpperCase()));
    planLayerGroup = new THREE.Group(); planLayerGroup.name = 'planimetria';
    planBuildingsGroup = new THREE.Group();
    planLayerGroup.add(planBuildingsGroup);
    scene.add(planLayerGroup);
    planMeshesByCode.clear(); planOutlinesByCode.clear(); planPointsByCode.clear(); planMask = [];
    for (const feature of plan.features) {
      const code = String(feature.code || '').toUpperCase();
      if (!code) continue;
      const parsed = planShape(feature.path);
      if (!parsed?.shapes?.length) continue;
      const osmBuilding = baseBuildings.find((building) => building.code.toUpperCase() === code);
      const osmFeature = contextFeatures.find((item) => {
        const props = item.properties || {};
        return String(props['addr:housenumber'] || props.ref || '').toUpperCase() === code;
      });
      const props = osmFeature?.properties || {};
      const height = heightInfo({ height: osmBuilding?.height || props.height, levels: osmBuilding?.levels || props['building:levels'] }).value;
      const geometry = new THREE.ExtrudeGeometry(parsed.shapes, { depth: height, bevelEnabled: false, curveSegments: 1 });
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, 0.16, 0);
      applyRoofUVs(geometry);
      const roof = new THREE.MeshBasicMaterial({ color: feature.lesson ? planColors.lesson : 0xffffff, map: showAerial ? roofTexture : null, toneMapped: false });
      const walls = new THREE.MeshStandardMaterial({ color: feature.lesson ? planColors.lesson : 0xb6a99e, roughness: 0.94, metalness: 0 });
      const mesh = new THREE.Mesh(geometry, [roof, walls]);
      mesh.userData.code = code;
      mesh.userData.planFeature = feature;
      mesh.userData.height = height;
      mesh.castShadow = true; mesh.receiveShadow = true;
      planBuildingsGroup.add(mesh); pickables.push(mesh);
      planMeshesByCode.set(code, mesh);
      if (code === MINERVA.arches.code) cutArches(mesh, parsed.rings);
      for (const ring of parsed.rings) planMask.push(ring.map(([x, y]) => worldToLonLat(pdfToWorld(x, y))));
      const pts = parsed.rings.flat().map(([x, y]) => pdfToWorld(x, y));
      const centroid = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, z: a.z + p.z / pts.length }), { x: 0, z: 0 });
      planPointsByCode.set(code, { x: centroid.x, n: -centroid.z });
      const linePoints = [];
      for (const ring of parsed.rings) for (let i = 0; i < ring.length; i += 1) {
        const a = pdfToWorld(...ring[i]), b = pdfToWorld(...ring[(i + 1) % ring.length]);
        linePoints.push(a.x, 0.18, a.z, b.x, 0.18, b.z);
      }
      const outlineGeo = new THREE.BufferGeometry();
      outlineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));
      const outline = new THREE.LineSegments(outlineGeo, new THREE.LineBasicMaterial({ color: planColors.lesson, transparent: true, opacity: 0.95 }));
      outline.userData.code = code; planBuildingsGroup.add(outline); planOutlinesByCode.set(code, outline);
    }
    if (plan.image) {
      // la carta bianca della planimetria diventa trasparente e i bordi sfumano: sotto si vede la cartina muta
      const planCanvas = document.createElement('canvas');
      planTexture = new THREE.CanvasTexture(planCanvas);
      planTexture.encoding = THREE.sRGBEncoding;
      planTexture.anisotropy = 8;
      const planImg = new Image();
      planImg.onload = () => {
        planCanvas.width = planImg.naturalWidth; planCanvas.height = planImg.naturalHeight;
        const pctx = planCanvas.getContext('2d', { willReadFrequently: true });
        pctx.drawImage(planImg, 0, 0);
        const data = pctx.getImageData(0, 0, planCanvas.width, planCanvas.height);
        const px = data.data, w = planCanvas.width, h = planCanvas.height;
        for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const light = Math.min(px[i], px[i + 1], px[i + 2]);
          let a = light > 246 ? 0 : light > 226 ? (246 - light) / 20 : 1;
          const ex = (x / w - 0.5) * 2, ey = (y / h - 0.5) * 2;
          const r = Math.sqrt(ex * ex + ey * ey);
          a *= r < 0.82 ? 1 : Math.max(0, 1 - (r - 0.82) / 0.3);
          px[i + 3] = Math.round(px[i + 3] * a);
        }
        pctx.putImageData(data, 0, 0);
        planTexture.needsUpdate = true;
        if (officialPlan === plan) notifyParent('campus-overlay-ready');
      };
      planImg.onerror = () => { if (officialPlan === plan) fallbackToPhoto('La planimetria non può essere caricata.'); };
      planImg.src = plan.image;
      const box = plan.viewBox;
      const corners = [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]].map(([x, y]) => pdfToWorld(x, y));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((p) => [p.x, 0.12, p.z]), 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
      geometry.setIndex([0, 2, 1, 0, 3, 2]);
      planImageMaterial = new THREE.MeshBasicMaterial({ map: planTexture, transparent: true, opacity: planOpacity, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
      planImagePlane = new THREE.Mesh(geometry, planImageMaterial); planLayerGroup.add(planImagePlane);
    }
    planLayerGroup.visible = true;
    if (planImagePlane) planImagePlane.visible = planVisible;
    planBuildingsGroup.visible = showBuildings;
    if (embedded) setupPlanFallback(plan);
    document.body.classList.toggle('has-plan-layer', true);
    updatePlanSelection();
    mergeOfficialBuildings(plan.features);
    renderList(); drawFootprints();
    if (planImageMaterial) planImageMaterial.opacity = planOpacity;
    for (const child of [...buildingGroup.children]) {
      if (child.userData.code && officialPlanCodes.has(child.userData.code)) {
        buildingGroup.remove(child); pickables = pickables.filter((mesh) => mesh !== child);
        child.geometry?.dispose();
        if (child.material && !Array.isArray(child.material)) child.material.dispose();
      }
    }
    for (const code of officialPlanCodes) { activeCodeMeshes.delete(code); activeCodeOutlines.delete(code); }
    buildMinervaArea();
    compositeOrtho();
    applyViewMode();
  }
  function worldToLonLat(w) {
    return [bounds.west + (w.x + mapWidth / 2) / metersPerLon, bounds.south + (-w.z + mapDepth / 2) / metersPerLat];
  }
  function setupPlanFallback(plan) {
    const image = document.createElement('img'); image.src = plan.image; image.alt = 'Planimetria vettoriale originale Sapienza';
    planStage.replaceChildren(image);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const vb = plan.viewBox; svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); svg.classList.add('plan-fallback-paths');
    for (const feature of plan.features) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', feature.path); path.setAttribute('data-code', feature.code); path.setAttribute('fill-rule', 'evenodd');
      path.classList.add('plan-fallback-path'); if (feature.lesson) path.classList.add('lesson');
      path.addEventListener('click', () => selectBuilding(feature.code, { animate: false })); svg.append(path);
    }
    planStage.append(svg);
  }
  function mergeOfficialBuildings(features) {
    const byCode = new Map(baseBuildings.map((b) => [b.code.toUpperCase(), b]));
    for (const feature of features) {
      const code = String(feature.code || '').toUpperCase();
      if (!code) continue;
      const existing = byCode.get(code);
      if (existing) { existing.officialName = feature.name || existing.name; existing.name = existing.officialName; }
      else {
        const point = planPointsByCode.get(code) || { x: 0, n: 0 };
        const worldX = point.x, worldN = point.n;
        const lon = bounds.west + (worldX + mapWidth / 2) / metersPerLon;
        const lat = bounds.south + (worldN + mapDepth / 2) / metersPerLat;
        byCode.set(code, { code, name: feature.name || code, officialName: feature.name || code, building: 'Planimetria ufficiale', rings: [], centroid: { lon, lat }, osm_elements: [] });
      }
    }
    buildings = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, 'it', { numeric: true }));
    if (pendingSelectedCode && buildings.some((building) => building.code === pendingSelectedCode)) {
      const code = pendingSelectedCode; pendingSelectedCode = '';
      selectBuilding(code, { notify: false, animate: false });
    }
  }
  function sanitizeCustom(value) {
    const out = {};
    if (value && typeof value === 'object') for (const [code, color] of Object.entries(value)) {
      if (/^CU\d{3}$/i.test(code) && typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) out[code.toUpperCase()] = color;
    }
    return out;
  }
  function updatePlanSelection() {
    for (const [code, mesh] of planMeshesByCode) {
      const feature = mesh.userData.planFeature || {};
      const custom = planColors.custom[code];
      // il colore scelto dall'utente vale anche quando l'edificio è selezionato; la selezione resta nel contorno
      mesh.material[0].color.set(custom || (code === selectedCode ? planColors.selected : feature.lesson ? planColors.lesson : 0xffffff));
      mesh.material[1].color.set(custom || (code === selectedCode ? planColors.selected : feature.lesson ? planColors.lesson : 0xb6a99e));
    }
    for (const [code, outline] of planOutlinesByCode) {
      outline.material.color.set(code === selectedCode ? (planColors.custom[code] ? 0x1f1f1f : planColors.selected) : planColors.custom[code] || (planFeaturesLesson(code) ? planColors.lesson : 0x822433));
      outline.visible = planVisible;
    }
    planStage.querySelectorAll('.plan-fallback-path').forEach((path) => path.classList.toggle('selected', path.dataset.code === selectedCode));
  }
  function planFeaturesLesson(code) { return Boolean(officialPlan?.features.find((feature) => String(feature.code).toUpperCase() === code)?.lesson); }
  function applyParentContext(context) {
    latestParentContext = context;
    if (context?.plan?.features) officialPlanCodes = new Set(context.plan.features.map((feature) => String(feature.code || '').toUpperCase()));
    if (renderer && context?.plan?.features) buildPlanLayer(context.plan);
    if (context?.selectedCode) {
      pendingSelectedCode = context.selectedCode;
      if (buildings.some((building) => building.code === pendingSelectedCode)) selectBuilding(pendingSelectedCode, { notify: false, animate: false });
    }
  }
  function notifyParent(type, payload = {}) {
    if (window.parent === window) return;
    window.parent.postMessage({ type, ...payload }, location.origin);
  }
  function handleParentMessage(event) {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const message = event.data || {};
    if (message.type === 'campus-context' && message.plan) applyParentContext(message);
    else if (message.type === 'campus-colors') {
      if (typeof message.lesson === 'string' && /^#[\da-f]{6}$/i.test(message.lesson)) planColors.lesson = message.lesson;
      if (typeof message.selected === 'string' && /^#[\da-f]{6}$/i.test(message.selected)) planColors.selected = message.selected;
      planColors.custom = sanitizeCustom(message.custom);
      updatePlanSelection();
    } else if (message.type === 'campus-select' && typeof message.code === 'string') {
      pendingSelectedCode = message.code;
      if (buildings.some((building) => building.code === message.code)) selectBuilding(message.code, { notify: false });
    }
    else if (message.type === 'campus-clear') { stopCameraFlight(); selectedCode = ''; updateSelectionMaterials(); updatePlanSelection(); renderList(); drawFootprints(); }
    else if (message.type === 'campus-camera') {
      if (!controls) pendingCamera = message;
      else if (message.action === 'fit') flyTo(campusCentroid(), campusFitDistance(), 700);
      else if (message.action === 'zoom') camera.position.lerp(controls.target, 1 - (1 / Math.max(0.2, Number(message.factor) || 1)));
    } else if (message.type === 'campus-viewport') {
      occlusion = { right: Math.max(0, Number(message.right) || 0), bottom: Math.max(0, Number(message.bottom) || 0) };
      resizeRenderer();
    } else if (message.type === 'campus-active') { parentActive = Boolean(message.active); handleVisibility(); }
    else if (message.type === 'campus-view') {
      if (message.dim === '2d' || message.dim === '3d') viewDim = message.dim;
      if (message.base === 'satellite' || message.base === 'carta') viewBase = message.base;
      applyViewMode(); scheduleTiles(50);
    } else if (message.type === 'campus-rotate') { if (message.on) startTour(); else stopTour(); }
  }

  function polygonCentroid(ring) {
    let area = 0, x = 0, y = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const cross = a[0] * b[1] - b[0] * a[1];
      area += cross;
      x += (a[0] + b[0]) * cross;
      y += (a[1] + b[1]) * cross;
    }
    if (Math.abs(area) < 1e-12) return ring.reduce((acc, pt) => [acc[0] + pt[0] / ring.length, acc[1] + pt[1] / ring.length], [0, 0]);
    return [x / (3 * area), y / (3 * area)];
  }
  function insideMap([lon, lat]) {
    return lon >= bounds.west && lon <= bounds.east && lat >= bounds.south && lat <= bounds.north;
  }
  function closeRing(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return [];
    const points = ring.filter((pt) => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
    if (points.length < 3) return [];
    const first = points[0], last = points[points.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) points.push(first);
    return points;
  }
  /* ---------- suolo: cartina muta dei dintorni + ortofoto ritagliata sul confine CU ---------- */
  const smallScreen = Math.min(screen.width || 9999, screen.height || 9999) < 700;
  const BASE_COLORS = { bg: '#e9e4df', green: '#dfe5d4', water: '#cfdde6', casing: '#d8d0c7', road: '#fbfaf8', minor: '#f6f3ef', building: '#dcd5cd', buildingLine: '#cec5bb', rail: '#c4bbb1' };
  function canvasMapper(area, width, height) {
    return ([lon, lat]) => [((lon - area.west) / (area.east - area.west)) * width, ((area.north - lat) / (area.north - area.south)) * height];
  }
  function metersToPx(area, width) {
    return width / ((area.east - area.west) * metersPerLon);
  }
  function tracePath(ctx, ring, toPx, close = true) {
    ring.forEach((pt, i) => { const [x, y] = toPx(pt); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    if (close) ctx.closePath();
  }
  function planeMesh(area, material, y) {
    const sw = project([area.west, area.south]), ne = project([area.east, area.north]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      sw.x, y, -ne.n, ne.x, y, -ne.n, ne.x, y, -sw.n, sw.x, y, -sw.n
    ], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    geometry.setIndex([0, 2, 1, 0, 3, 2]);
    return new THREE.Mesh(geometry, material);
  }
  function orthoSize() {
    const aspect = ((ORTHO_BOUNDS.north - ORTHO_BOUNDS.south) * metersPerLat) / ((ORTHO_BOUNDS.east - ORTHO_BOUNDS.west) * metersPerLon);
    const width = smallScreen ? 2048 : 4096;
    return { width, height: Math.round(width * aspect) };
  }
  /* tetti stilizzati (30/10/2026, richiesta dell'utente): come le facciate, niente foto aerea. Guaina grigio chiaro a teli di 1 m con i
     sormonti, qualche toppa e colatura, ripetuta in metri sulle UV dell'ortofoto (i tetti usano già quelle coordinate) */
  function stylizedRoofTexture(blu) {
    // guaina a teli di 1 m, paralleli: grigio-azzurra sulla Ginestra (foto dell'utente del 30/10), chiara sul resto di CU014
    const tile = 8, c = document.createElement('canvas'); c.width = c.height = 512;
    const ctx = c.getContext('2d'), px = 512 / tile, base = blu ? [140, 148, 162] : [185, 182, 174];
    ctx.fillStyle = `rgb(${base})`; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i += 1) { const d = Math.floor(24 * hash01(i, 91)) - 12; ctx.fillStyle = `rgba(${base.map((x) => x + d)},0.35)`; ctx.fillRect(hash01(i, 92) * 512, hash01(i, 93) * 512, 2, 2); }
    for (let k = 0; k < tile; k += 1) {
      ctx.fillStyle = 'rgba(40,44,54,0.28)'; ctx.fillRect(0, k * px, 512, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, k * px + 2, 512, 2);
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(((ORTHO_BOUNDS.east - ORTHO_BOUNDS.west) * metersPerLon) / tile, ((ORTHO_BOUNDS.north - ORTHO_BOUNDS.south) * metersPerLat) / tile);
    return t;
  }
  /* tetto della Ginestra (commento del 1/11): ogni falda chiusa dalle cornici di travertino è un riempimento unico. Le falde di CU014 il cui
     centro cade nel settore del ventaglio prendono per intero la guaina grigio-azzurra, le altre restano con l'ortofoto: niente falde a metà */
  let ginestraRoofMat = null;
  function paintGinestraRoofs() {
    if (!buildingGroup || !cuSolido || !cuSolido.ventaglio) return;
    const f = cuFrame(); if (!f) return;
    const V = cuSolido.ventaglio, [cx, cy] = V.centro, rOut = Number(V.raggioEsterno) || 40.3;
    if (!ginestraRoofMat) ginestraRoofMat = new THREE.MeshBasicMaterial({ map: stylizedRoofTexture(true), toneMapped: false });
    for (const m of buildingGroup.children) {
      if (!m.isMesh || !Array.isArray(m.material) || m.material[0] !== normalRoof || m.userData.ginestraTetto === false) continue;
      if (m.userData.ginestraTetto == null) {
        m.geometry.computeBoundingBox(); const c = m.geometry.boundingBox.getCenter(new THREE.Vector3()); m.localToWorld(c);
        const { u, v } = f.toUV({ x: c.x, n: -c.z }), r = Math.hypot(u - cx, v - cy), a = Math.atan2(v - cy, u - cx) * 180 / Math.PI;
        m.userData.ginestraTetto = r >= 12 && r <= rOut + 0.5 && a >= -121 && a <= -59;
      }
      const dentro = m.userData.ginestraTetto;
      if (dentro) { m.material = [ginestraRoofMat].concat(m.material.slice(1)); if (m.userData.mats) m.userData.mats = m.material; }
    }
  }
  setInterval(() => { try { paintGinestraRoofs(); } catch (_) { /* scena non pronta */ } }, 1500);
  function createOrthoTexture() {
    const { width, height } = orthoSize();
    orthoCanvas = document.createElement('canvas');
    orthoCanvas.width = width; orthoCanvas.height = height;
    orthoSource = document.createElement('canvas');
    orthoSource.width = width; orthoSource.height = height;
    roofTexture = new THREE.CanvasTexture(orthoSource);
    roofTexture.encoding = THREE.sRGBEncoding;
    roofTexture.anisotropy = 8;
    const texture = new THREE.CanvasTexture(orthoCanvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 8;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    // Ripiego immediato: il ritaglio AGEA locale, poi sostituito dai riquadri ad alta risoluzione.
    const local = new Image();
    local.onload = () => {
      const toPx = canvasMapper(ORTHO_BOUNDS, width, height);
      const [x0, y0] = toPx([PHOTO_BOUNDS.west, PHOTO_BOUNDS.north]);
      const [x1, y1] = toPx([PHOTO_BOUNDS.east, PHOTO_BOUNDS.south]);
      const ctx = orthoSource.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      if (!orthoSource.dataset.hires) ctx.drawImage(local, x0, y0, x1 - x0, y1 - y0);
      compositeOrtho();
    };
    local.src = 'campus-agea-2020.png';
    return texture;
  }
  /* applica il confine: fuori dal poligono l'ortofoto è trasparente e si vede la cartina muta */
  function compositeOrtho() {
    if (!orthoCanvas) return;
    const ctx = orthoCanvas.getContext('2d');
    const { width, height } = orthoCanvas;
    const toPx = canvasMapper(ORTHO_BOUNDS, width, height);
    if (!maskCanvas) { maskCanvas = document.createElement('canvas'); maskCanvas.width = width; maskCanvas.height = height; }
    const mask = maskCanvas.getContext('2d', { willReadFrequently: true });
    mask.clearRect(0, 0, width, height);
    mask.fillStyle = '#000'; mask.strokeStyle = '#000'; mask.lineJoin = 'round'; mask.lineCap = 'round';
    mask.beginPath(); tracePath(mask, CAMPUS_POLY, toPx); mask.fill();
    const px = metersToPx(ORTHO_BOUNDS, width);
    for (const ring of extraMask) {
      mask.beginPath(); tracePath(mask, ring, toPx); mask.fill();
      mask.lineWidth = 24 * px; mask.stroke();
    }
    // ogni edificio CU resta dentro il confine, con qualche metro di margine
    for (const ring of planMask) { mask.beginPath(); tracePath(mask, ring, toPx); mask.fill(); mask.lineWidth = 12 * px; mask.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(orthoSource, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (photoTexture) photoTexture.needsUpdate = true;
    if (roofTexture) roofTexture.needsUpdate = true;
  }
  function loadHighResOrtho() {
    const { width, height } = orthoCanvas;
    const cols = Math.ceil(width / 2048), rows = Math.ceil(height / 2048);
    const ctx = orthoSource.getContext('2d');
    let pending = cols * rows, loaded = 0;
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
      const x0 = Math.round((c * width) / cols), x1 = Math.round(((c + 1) * width) / cols);
      const y0 = Math.round((r * height) / rows), y1 = Math.round(((r + 1) * height) / rows);
      const lon = (x) => ORTHO_BOUNDS.west + (x / width) * (ORTHO_BOUNDS.east - ORTHO_BOUNDS.west);
      const lat = (y) => ORTHO_BOUNDS.north - (y / height) * (ORTHO_BOUNDS.north - ORTHO_BOUNDS.south);
      const bbox = [lon(x0), lat(y1), lon(x1), lat(y0)].map((v) => v.toFixed(6)).join(',');
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (!orthoSource.dataset.hires) { orthoSource.dataset.hires = '1'; }
        ctx.drawImage(image, x0, y0, x1 - x0, y1 - y0);
        loaded += 1; pending -= 1;
        compositeOrtho();
      };
      image.onerror = () => { pending -= 1; };
      image.src = `/api/campus-ortho?bbox=${bbox}&w=${x1 - x0}&h=${y1 - y0}`;
    }
  }
  function drawBase(map) {
    const ctx = baseCanvas.getContext('2d');
    const { width, height } = baseCanvas;
    const toPx = canvasMapper(bounds, width, height);
    const px = metersToPx(bounds, width);
    ctx.fillStyle = BASE_COLORS.bg; ctx.fillRect(0, 0, width, height);
    const fillRings = (rings, color, line) => {
      ctx.beginPath();
      for (const ring of rings) if (Array.isArray(ring) && ring.length > 2) tracePath(ctx, ring, toPx);
      ctx.fillStyle = color; ctx.fill('evenodd');
      if (line) { ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, 0.5 * px); ctx.stroke(); }
    };
    for (const [, rings] of map.green || []) fillRings(rings, BASE_COLORS.green);
    for (const rings of map.water || []) fillRings(rings, BASE_COLORS.water);
    const roads = (map.roads || []).filter((road) => !road[3]);
    const major = (kind) => /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)/.test(kind);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const pass of ['casing', 'fill']) for (const [kind, meters, line] of roads) {
      const w = Math.max(1, meters * px);
      ctx.beginPath(); tracePath(ctx, line, toPx, false);
      if (pass === 'casing') { if (!major(kind)) continue; ctx.strokeStyle = BASE_COLORS.casing; ctx.lineWidth = w + Math.max(2, 1.2 * px); }
      else { ctx.strokeStyle = major(kind) ? BASE_COLORS.road : BASE_COLORS.minor; ctx.lineWidth = w; }
      ctx.stroke();
    }
    ctx.setLineDash([3 * px, 3 * px]);
    for (const line of map.rail || []) { ctx.beginPath(); tracePath(ctx, line, toPx, false); ctx.strokeStyle = BASE_COLORS.rail; ctx.lineWidth = Math.max(1, 1.2 * px); ctx.stroke(); }
    ctx.setLineDash([]);
    for (const rings of map.buildings || []) fillRings(rings, BASE_COLORS.building, BASE_COLORS.buildingLine);
    // bordo circolare: la cartina si dissolve nel colore dello sfondo, niente rettangolo
    const [cx, cy] = toPx(FADE.center);
    const fade = ctx.createRadialGradient(cx, cy, FADE.inner * px, cx, cy, FADE.outer * px);
    fade.addColorStop(0, 'rgba(233,228,223,0)');
    fade.addColorStop(1, 'rgba(233,228,223,1)');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, width, height);
    if (baseTexture) baseTexture.needsUpdate = true;
  }
  function createGround(context) {
    baseCanvas = document.createElement('canvas');
    baseCanvas.width = smallScreen ? 2048 : 4096;
    baseCanvas.height = Math.round(baseCanvas.width * (mapDepth / mapWidth));
    // Prima dei dati OSM completi: le impronte locali del quartiere.
    drawBase({ buildings: (context.features || []).filter((f) => f.geometry?.type === 'Polygon').map((f) => f.geometry.coordinates) });
    baseTexture = new THREE.CanvasTexture(baseCanvas);
    baseTexture.encoding = THREE.sRGBEncoding;
    baseTexture.anisotropy = 8;
    ground = planeMesh(bounds, new THREE.MeshBasicMaterial({ map: baseTexture, color: 0xffffff, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }), -0.12);
    ground.renderOrder = -2; // i livelli piatti non scrivono la profondità: niente sfarfallio tra cartina, ortofoto e tasselli
    scene.add(ground);
    orthoMesh = planeMesh(ORTHO_BOUNDS, new THREE.MeshBasicMaterial({ map: photoTexture, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }), -0.06);
    orthoMesh.renderOrder = 1;
    scene.add(orthoMesh);
  }
  /* ---------- facciate procedurali: basamento, corpo a finestre, cornicione ---------- */
  const FACADE_BAY = 3.6;
  // Palette ricavate dalle foto del cortile di Chimica: cortina di mattoni arancio, cornici e basamento in travertino, tapparelle marroni.
  const FACADE_PALETTES = {
    cortina: { wall: '#c98a5c', wall2: '#b97a4f', mortar: 'rgba(236,214,186,.55)', frame: '#e2d8c5', base: '#d4c8b2', attic: 0xddd3c0, brick: true },
    travertino: { wall: '#ddd3bf', wall2: '#cfc3ab', mortar: 'rgba(120,105,85,.28)', frame: '#ece5d7', base: '#cfc3ab', attic: 0xe6decd, slabs: true },
    ocra: { wall: '#d8b083', wall2: '#cba172', mortar: 'rgba(0,0,0,0)', frame: '#ece2cf', base: '#d4c7ae', attic: 0xe5d9c3 },
    giallo: { wall: '#d6a66b', wall2: '#c7955c', mortar: 'rgba(242,226,200,.55)', frame: '#e6dccb', base: '#e2dccf', attic: 0xe2d9c8, brick: true },
    arancione: { wall: '#c98a5c', wall2: '#be7f52', mortar: 'rgba(0,0,0,0)', frame: '#e2d8c5', base: '#d4c8b2', attic: 0xddd3c0 },
    intonaco: { wall: '#e0c9a6', wall2: '#d3ba95', mortar: 'rgba(0,0,0,0)', frame: '#efe7d8', base: '#cdbfa5', attic: 0xe9dfcd },
  };
  const TRAVERTINE_CODES = new Set(['CU001', 'CU002', 'CU003']);
  const OCRA_CODES = new Set(['CU006']);
  let facadeSets = {};
  function hash01(i, k) { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); }
  function noiseFill(ctx, w, h, c1, c2, n) {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = c2;
    for (let i = 0; i < n; i += 1) {
      ctx.globalAlpha = 0.15 + 0.35 * hash01(i, 3);
      ctx.fillRect(hash01(i, 1) * w, hash01(i, 2) * h, 1 + (i % 3), 1);
    }
    ctx.globalAlpha = 1;
  }
  function facadeTexture(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(0.5, 0.5); // una tessera = 2 campate × 2 piani, così finestre e tapparelle variano
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    return tex;
  }
  function stains(ctx, w, h, seed) {
    // colature e sporco verso il basso, come sui travertini del cortile
    for (let i = 0; i < 14; i += 1) {
      const x = hash01(seed + i, 4) * w, len = h * (0.15 + 0.4 * hash01(seed + i, 5));
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(60,50,40,.10)'); g.addColorStop(1, 'rgba(60,50,40,0)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 2 + 4 * hash01(seed + i, 6), len);
    }
  }
  function drawWindow(ctx, p, x, y, w, h, shutter, seed) {
    ctx.fillStyle = p.frame; ctx.fillRect(x - 5, y - 5, w + 10, h + 9); // cornice in travertino
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x - 5, y + h + 4, w + 10, 2);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#8aa2b6'); g.addColorStop(0.45, '#3d4b58'); g.addColorStop(1, '#1d242b');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = p.frame; ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
    const sh = Math.round(h * shutter); // tapparella abbassata in parte
    if (sh > 0) {
      ctx.fillStyle = '#7b5439'; ctx.fillRect(x, y, w, sh);
      ctx.fillStyle = 'rgba(40,25,15,.35)';
      for (let yy = y + 3; yy < y + sh; yy += 3) ctx.fillRect(x, yy, w, 1);
    }
    if (hash01(seed, 9) > 0.78) { // condizionatore sotto la finestra
      ctx.fillStyle = '#e9e9e6'; ctx.fillRect(x + w * 0.15, y + h + 10, w * 0.7, 14);
      ctx.fillStyle = '#9ea3a6'; ctx.beginPath(); ctx.arc(x + w * 0.62, y + h + 17, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  function windowCanvas(p, seed, windows = true) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    noiseFill(ctx, 256, 256, p.wall, p.wall2, 2600);
    if (p.brick) {
      ctx.fillStyle = p.mortar;
      for (let y = 0; y < 256; y += 4) {
        ctx.fillRect(0, y, 256, 1);
        for (let x = (y / 4) % 2 ? 0 : 6; x < 256; x += 12) ctx.fillRect(x, y, 1, 4);
      }
      for (let i = 0; i < 400; i += 1) { // mattoni con tono leggermente diverso
        ctx.fillStyle = hash01(i, 7) > 0.5 ? 'rgba(150,80,45,.18)' : 'rgba(230,170,120,.16)';
        ctx.fillRect(Math.floor(hash01(i, 8) * 21) * 12 + ((i % 2) ? 0 : 6), Math.floor(hash01(i, 10) * 64) * 4 + 1, 11, 3);
      }
    }
    if (p.slabs) {
      ctx.fillStyle = p.mortar;
      for (let y = 0; y < 256; y += 42) ctx.fillRect(0, y, 256, 1.5);
      for (let y = 0; y < 256; y += 42) for (let x = (y / 42) % 2 ? 0 : 40; x < 256; x += 80) ctx.fillRect(x, y, 1.5, 42);
    }
    stains(ctx, 256, 256, seed * 31);
    if (windows) for (let fy = 0; fy < 2; fy += 1) for (let fx = 0; fx < 2; fx += 1) {
      const k = seed * 7 + fy * 2 + fx;
      const shutter = [0, 0.35, 0.6, 0.15, 0.9][Math.floor(hash01(k, 11) * 5)];
      drawWindow(ctx, p, fx * 128 + 38, fy * 128 + 26, 52, 70, shutter, k);
    }
    return facadeTexture(c);
  }
  // Piano terra: lastre di travertino (foto in tex/trav_c.jpg, sostituibile) con finestre e inferriate.
  const baseCanvases = [];
  let travImg = null;
  function drawBaseFacade(c, p, seed, windows = true) {
    const ctx = c.getContext('2d');
    if (travImg && travImg.complete && travImg.naturalWidth) {
      for (let y = 0; y < 256; y += 128) for (let x = 0; x < 256; x += 128) ctx.drawImage(travImg, x, y, 128, 128); // tessera ≈ 1,8 × 2,2 m
      ctx.fillStyle = 'rgba(255,250,240,.18)'; ctx.fillRect(0, 0, 256, 256); // il travertino del campus è più chiaro e caldo
    } else noiseFill(ctx, 256, 256, p.base, '#b5a68b', 3000);
    if (!(travImg && travImg.complete && travImg.naturalWidth)) {
      ctx.fillStyle = 'rgba(90,75,60,.38)'; // giunti delle lastre (solo finché la foto non è caricata)
      for (let y = 0; y < 256; y += 64) ctx.fillRect(0, y, 256, 1.2);
    }
    const dirt = ctx.createLinearGradient(0, 200, 0, 256);
    dirt.addColorStop(0, 'rgba(70,60,45,0)'); dirt.addColorStop(1, 'rgba(70,60,45,.28)');
    ctx.fillStyle = dirt; ctx.fillRect(0, 200, 256, 56);
    if (windows) for (let fy = 0; fy < 2; fy += 1) for (let fx = 0; fx < 2; fx += 1) drawBaseWindow(ctx, fx * 128 + 38, fy * 128 + 37, 52, 64); // finestra da 0,9 a 3,1 m sopra il marciapiede
  }
  function drawBaseWindow(ctx, x, y, w, h) {
    ctx.fillStyle = '#ece4d4'; ctx.fillRect(x - 5, y - 5, w + 10, h + 9);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#71859a'); g.addColorStop(0.45, '#2f3a45'); g.addColorStop(1, '#171d23');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(25,25,25,.75)'; // inferriata
    for (let gx = x + 4; gx < x + w; gx += 6) ctx.fillRect(gx, y, 1.6, h);
    ctx.fillRect(x, y + h * 0.33, w, 1.6); ctx.fillRect(x, y + h * 0.66, w, 1.6);
  }
  function baseCanvas2(p, seed, windows = true) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    drawBaseFacade(c, p, seed, windows);
    const tex = facadeTexture(c);
    baseCanvases.push({ c, p, seed, tex, windows });
    if (!travImg) {
      travImg = new Image();
      travImg.onload = () => { for (const e of baseCanvases) { drawBaseFacade(e.c, e.p, e.seed, e.windows); e.tex.needsUpdate = true; } };
      travImg.src = 'tex/travertino_COL_1k.jpg'; // TilesTravertine001 fornita dall'utente
    }
    return tex;
  }
  // un'apertura «scavata» nel muro (nicchia del catalogo) segna lo stencil a 1: lì le facciate non si disegnano e si vede la rientranza
  const FORO_STENCIL = { stencilWrite: true, stencilRef: 1, stencilFunc: 517, stencilWriteMask: 0 }; // 517 = THREE.NotEqualStencilFunc (THREE qui non è ancora caricato)
  function createFacadeSets() {
    facadeSets = {};
    for (const [name, p] of Object.entries(FACADE_PALETTES)) {
      facadeSets[name] = [0, 1].map((seed) => ({
        body: new THREE.MeshStandardMaterial({ map: windowCanvas(p, seed + 1), roughness: 0.88, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...FORO_STENCIL }),
        base: new THREE.MeshStandardMaterial({ map: baseCanvas2(p, seed + 1), roughness: 0.9, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...FORO_STENCIL }),
        attic: new THREE.MeshStandardMaterial({ color: new THREE.Color(p.attic).convertSRGBToLinear(), roughness: 0.8, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...FORO_STENCIL }),
      }));
    }
  }
  // texture della facciata per edificio: quella scelta nell'editor, altrimenti travertino, ocra o cortina secondo il codice
  const facadeOverride = new Map();
  const codeHash = (code) => { let h = 0; for (const ch of String(code)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  function facadeNameFor(code) {
    const key = String(code).toUpperCase();
    if (facadeOverride.has(key)) return facadeOverride.get(key);
    if (TRAVERTINE_CODES.has(key)) return 'travertino';
    if (OCRA_CODES.has(key)) return 'ocra';
    if (/^CU\d+$/.test(key)) return 'cortina'; // la Città Universitaria è in gran parte cortina di mattoni e travertino
    return ['intonaco', 'ocra', 'cortina', 'intonaco'][codeHash(code) % 4]; // quartiere
  }
  function facadeSetFor(code) { return facadeSets[facadeNameFor(code)][codeHash(code) % 2]; }
  function setFacade(code, name) {
    const key = String(code).toUpperCase();
    if (name && FACADE_PALETTES[name]) facadeOverride.set(key, name); else facadeOverride.delete(key);
    if (!buildingGroup) return;
    const set = facadeSetFor(key);
    for (const m of buildingGroup.children) {
      if (m.userData.facadeCode !== key || !m.userData.kind) continue;
      if (m.userData.mats) m.userData.mats[1] = set[m.userData.kind];
      if (Array.isArray(m.material)) m.material[1] = set[m.userData.kind];
    }
  }
  // riquadri che l'editor appoggia sulle celle di facciata: muro senza finestra, oppure una finestra sola
  function singleWindowTex(p, kind) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    if (kind === 'base') drawBaseWindow(ctx, 38, 37, 52, 64); else drawWindow(ctx, p, 38, 26, 52, 70, 0.35, 5);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  const patchMats = new Map();
  function facadePatchMaterial(name, kind, tipo) {
    const key = `${name}|${kind}|${tipo}`;
    if (patchMats.has(key)) return patchMats.get(key);
    const p = FACADE_PALETTES[name] || FACADE_PALETTES.cortina;
    const common = { roughness: 0.88, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...FORO_STENCIL };
    const mat = tipo === 'finestra' ? new THREE.MeshStandardMaterial(Object.assign({ map: singleWindowTex(p, kind), transparent: true, alphaTest: 0.4 }, common))
      : tipo === 'facciata' && kind !== 'attic' ? new THREE.MeshStandardMaterial(Object.assign({ map: kind === 'base' ? baseCanvas2(p, 1) : windowCanvas(p, 1) }, common)) // un muro con un'altra texture, finestre comprese
      : kind === 'attic' ? new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(p.attic).convertSRGBToLinear() }, common))
      : new THREE.MeshStandardMaterial(Object.assign({ map: kind === 'base' ? baseCanvas2(p, 1, false) : windowCanvas(p, 1, false) }, common));
    patchMats.set(key, mat);
    return mat;
  }
  // cerchio ai minimi quadrati (Kåsa) per una serie di punti [x, z], attorno al loro baricentro (coordinate di centinaia di metri);
  // null se i punti sono quasi allineati
  function fitCircle(pts) {
    const n = pts.length; let mx = 0, mz = 0;
    for (const [x, z] of pts) { mx += x; mz += z; }
    mx /= n; mz /= n;
    let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
    for (const [x, z] of pts) { const u = x - mx, v = z - mz; suu += u * u; suv += u * v; svv += v * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
    const det = suu * svv - suv * suv;
    if (!(Math.abs(det) > 1e-9)) return null;
    const bu = (suuu + suvv) / 2, bv = (svvv + svuu) / 2, uc = (bu * svv - bv * suv) / det, vc = (suu * bv - suv * bu) / det;
    return { x: mx + uc, z: mz + vc, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / n) };
  }
  function applyWallUVs(geometry, y0, bay, floorH) {
    // Pareti: u = metri lungo il muro / campata, v = metri da terra / interpiano. Così finestre e piani sono in scala reale.
    // Muro dritto: u = posizione proiettata sulla direzione del muro (uguale per tutti i pezzi dello stesso muro).
    // Muro curvo (catena di almeno 3 lati che girano poco e stanno su una circonferenza): u = raggio × angolo attorno al centro,
    // continuo da un lato all'altro e uguale per tutti i pezzi dello stesso arco. Prima ogni lato dell'arco ripartiva da capo con
    // la sua proiezione e la facciata tonda del ventaglio era piena di finestre spezzate.
    const pos = geometry.attributes.position, uv = geometry.attributes.uv;
    const key = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
    const segs = new Map(); // lato del contorno → estremi, chiavi e triangoli
    for (const group of geometry.groups) {
      if (group.materialIndex !== 1) continue;
      for (let i = group.start; i < group.start + group.count; i += 3) {
        let best = -1, pa = i, pb = i + 1;
        for (let a = 0; a < 3; a += 1) for (let b = a + 1; b < 3; b += 1) {
          const ex = pos.getX(i + b) - pos.getX(i + a), ez = pos.getZ(i + b) - pos.getZ(i + a), l = ex * ex + ez * ez;
          if (l > best) { best = l; pa = i + a; pb = i + b; }
        }
        const A = [pos.getX(pa), pos.getZ(pa)], Bq = [pos.getX(pb), pos.getZ(pb)], ka = key(A[0], A[1]), kb = key(Bq[0], Bq[1]), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        if (!segs.has(k)) segs.set(k, { a: A, b: Bq, ka, kb, tris: [] });
        segs.get(k).tris.push(i);
      }
    }
    const dir = (s) => { const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    const ends = new Map();
    for (const s of segs.values()) for (const k of [s.ka, s.kb]) { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(s); }
    const COS = Math.cos((25 * Math.PI) / 180), arcOf = new Map(), seen = new Set();
    for (const s0 of segs.values()) {
      if (seen.has(s0)) continue;
      const chain = [s0]; seen.add(s0);
      for (const side of [0, 1]) { // allunga la catena dai due estremi finché i lati girano di poco
        let cur = s0, at = side ? s0.kb : s0.ka;
        for (;;) {
          const here = ends.get(at) || [], next = here.find((t) => t !== cur);
          if (here.length !== 2 || !next || seen.has(next)) break;
          const [ax, az] = dir(cur), [bx, bz] = dir(next);
          if (Math.abs(ax * bx + az * bz) < COS) break;
          seen.add(next); if (side) chain.push(next); else chain.unshift(next);
          at = next.ka === at ? next.kb : next.ka; cur = next;
        }
      }
      if (chain.length < 3) continue;
      const pts = []; for (const s of chain) pts.push(s.a, s.b);
      const c = fitCircle(pts);
      if (!c || !(c.r < 300) || pts.some(([x, z]) => Math.abs(Math.hypot(x - c.x, z - c.z) - c.r) > Math.max(0.05, c.r * 0.01))) continue;
      const th0 = Math.atan2(chain[0].a[1] - c.z, chain[0].a[0] - c.x);
      for (const s of chain) arcOf.set(s, { c, th0 });
    }
    for (const s of segs.values()) {
      const arc = arcOf.get(s);
      let [dx, dz] = dir(s);
      if (dx < -1e-6 || (Math.abs(dx) <= 1e-6 && dz < 0)) { dx = -dx; dz = -dz; }
      for (const i of s.tris) for (let k = 0; k < 3; k += 1) {
        const j = i + k, x = pos.getX(j), z = pos.getZ(j);
        let u;
        if (arc) { let th = Math.atan2(z - arc.c.z, x - arc.c.x) - arc.th0; th -= 2 * Math.PI * Math.round(th / (2 * Math.PI)); u = (arc.c.r * (arc.th0 + th)) / bay; }
        else u = (x * dx + z * dz) / bay;
        uv.setXY(j, u, (pos.getY(j) - y0) / floorH);
      }
    }
    uv.needsUpdate = true;
  }
  function buildingPieces(height, levels) {
    const BASE = 4.4, ATTIC = 0.9;
    if (height < 8.5) {
      const n = Math.max(1, Math.round(height / 3.6));
      return [{ y0: 0, h: height, kind: 'body', floorH: height / n }];
    }
    const bodyH = height - BASE - ATTIC;
    const n = Math.max(1, Number.isFinite(levels) && levels > 1 ? Math.round(levels - 1) : Math.round(bodyH / 3.8));
    return [
      { y0: 0, h: BASE, kind: 'base', floorH: BASE },
      { y0: BASE, h: bodyH, kind: 'body', floorH: bodyH / n },
      { y0: height - ATTIC, h: ATTIC, kind: 'attic', floorH: ATTIC },
    ];
  }
  /* Foto ad alta risoluzione sui tetti (commento 6 del 27/10/2026: vista dall'alto della Ginestra mandata dall'utente, circa 4,5 cm
     per pixel contro 1 m dell'ortofoto AGEA). Dentro il riquadro della foto i tetti la usano al posto dell'ortofoto, con una sfumatura
     ai bordi. `m` porta le coordinate dell'ortofoto dei tetti (applyRoofUVs: 0…1 su ORTHO_BOUNDS) in quelle della foto (s, t: 0…1, t dal
     basso): la foto è agganciata alla quota dei tetti sugli estremi dell'arco del ventaglio della sagoma OSM di CU014. */
  const ROOF_PHOTOS = [] && [{ src: 'tex/tetto-ginestra-maschera.png', m: [[17.251845, 4.706138, -6.467596], [-8.880557, 15.982978, -2.577765]], sfuma: 0.03 }]; // 30/10: solo il tetto della Ginestra in guaina grigio-azzurra (maschera nel riquadro della vecchia foto); gli altri tetti restano l'ortofoto
  function withRoofPhotos(mat) {
    const P = ROOF_PHOTOS[0];
    if (!P) return mat;
    const tex = new THREE.TextureLoader().load(P.src, () => { mat.userData.fotoPronta = true; if (mat.userData.shader) mat.userData.shader.uniforms.roofPhotoOn.value = 1; });
    tex.anisotropy = 8; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; const blu = stylizedRoofTexture(true);
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { roofPhoto: { value: tex }, roofPhotoS: { value: new THREE.Vector3(...P.m[0]) }, roofPhotoT: { value: new THREE.Vector3(...P.m[1]) },
        roofPhotoFade: { value: P.sfuma }, roofBlu: { value: blu }, roofRep: { value: blu.repeat.clone() }, roofPhotoOn: { value: mat.userData.fotoPronta ? 1 : 0 } });
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_pars_fragment>', `#include <map_pars_fragment>
uniform sampler2D roofPhoto; uniform sampler2D roofBlu; uniform vec2 roofRep; uniform vec3 roofPhotoS; uniform vec3 roofPhotoT; uniform float roofPhotoFade; uniform float roofPhotoOn;`)
        .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 texelColor = texture2D( map, vUv );
  vec2 ou = vUv;
  vec2 fq = vec2( dot( roofPhotoS, vec3( ou, 1.0 ) ), dot( roofPhotoT, vec3( ou, 1.0 ) ) );
  if ( roofPhotoOn > 0.5 && fq.x > 0.0 && fq.x < 1.0 && fq.y > 0.0 && fq.y < 1.0 ) {
    vec2 e = min( fq, 1.0 - fq ) / roofPhotoFade;
    float k = texture2D( roofPhoto, fq ).r * clamp( min( e.x, e.y ), 0.0, 1.0 );
    texelColor = mix( texelColor, texture2D( roofBlu, vUv * roofRep ), k );
  }
  texelColor = mapTexelToLinear( texelColor );
  diffuseColor *= texelColor;
#endif`);
      mat.userData.shader = shader;
    };
    mat.customProgramCacheKey = () => 'tetti-foto';
    return mat;
  }
  function createMaterials(texture) {
    createFacadeSets();
    // Tetti non illuminati: stessa luminosità dell'ortofoto al suolo, nessuna sovraesposizione.
    normalSide = new THREE.MeshStandardMaterial({ color: 0xd8d0c7, roughness: 0.88, metalness: 0 });
    normalRoof = withRoofPhotos(new THREE.MeshBasicMaterial({ color: 0xffffff, map: texture, toneMapped: false }));
    selectedSide = new THREE.MeshStandardMaterial({ color: 0x822433, roughness: 0.78, metalness: 0 });
    selectedRoof = withRoofPhotos(new THREE.MeshBasicMaterial({ color: 0xf2d4d9, map: texture, toneMapped: false }));
  }
  /* ---------- CNR, ospite d'onore ---------- */
  function addGuestBuilding(ring, height) {
    if (cnrMesh) {
      buildingGroup.remove(cnrMesh, cnrOutline);
      pickables = pickables.filter((mesh) => mesh !== cnrMesh);
      cnrMesh.geometry.dispose(); cnrOutline.geometry.dispose();
    }
    const shape = makeShape([ring]);
    if (!shape) return;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0.04, 0);
    applyRoofUVs(geometry);
    geometry.computeVertexNormals();
    cnrMesh = new THREE.Mesh(geometry, [new THREE.MeshBasicMaterial({ color: 0xffffff, map: showAerial ? roofTexture : null, toneMapped: false }), new THREE.MeshStandardMaterial({ color: 0xcfc8bf, roughness: 0.9, metalness: 0 })]);
    cnrMesh.castShadow = true; cnrMesh.receiveShadow = true;
    cnrMesh.userData.guest = true;
    buildingGroup.add(cnrMesh);
    pickables.push(cnrMesh);
    cnrOutline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), new THREE.LineBasicMaterial({ color: 0x1f5f8b, transparent: true, opacity: 0.95 }));
    cnrOutline.visible = false;
    buildingGroup.add(cnrOutline);
    CNR.centroid = polygonCentroid(ring);
  }
  function showGuest(on) {
    const card = $('guestCard');
    if (card) { card.hidden = !on; if (on) card.querySelector('h2').focus({ preventScroll: true }); }
    if (cnrOutline) cnrOutline.visible = on;
    if (cnrMesh) cnrMesh.material[1].color.set(on ? 0x1f5f8b : 0xcfc8bf);
    if (on && CNR.centroid) flyTo(project(CNR.centroid), 520, reducedMotion ? 0 : 850);
  }
  function convexHull(points) {
    const pts = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (const p of pts.slice().reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }
  function ringArea(ring) {
    let a = 0;
    for (let i = 0; i < ring.length; i += 1) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(a / 2);
  }
  async function loadSurroundings() {
    let map;
    try {
      const response = await fetch('/api/campus-osm');
      if (!response.ok) return;
      map = await response.json();
    } catch (_) { return; }
    if (!map || !Array.isArray(map.roads)) return;
    drawBase(map);
    const center = CAMPUS_POLY.reduce((a, p) => [a[0] + p[0] / CAMPUS_POLY.length, a[1] + p[1] / CAMPUS_POLY.length], [0, 0]);
    const near = (ring) => { const c = polygonCentroid(ring); return Math.hypot((c[0] - center[0]) * metersPerLon, (c[1] - center[1]) * metersPerLat) < 700; };
    extraMask = [];
    let cnrRing = null;
    for (const item of map.named || []) {
      const outer = (item.rings || []).filter((ring) => Array.isArray(ring) && ring.length > 3);
      if (!outer.length || !near(outer[0])) continue;
      const label = `${item.name} ${item.operator || ''}`;
      if (/consiglio nazionale delle ricerche|\bcnr\b/i.test(label) && item.building) {
        const best = outer.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
        if (!cnrRing || ringArea(best) > ringArea(cnrRing)) cnrRing = best;
      }
      const verano = /piazzale del verano/i.test(item.name) && (item.highway || item.place);
      const mensa = /lollis/i.test(label) && (item.building || item.amenity);
      if (verano || mensa) outer.forEach((ring) => extraMask.push(ring));
    }
    const veranoPts = (map.named || []).filter((item) => /piazzale del verano/i.test(item.name || '')).flatMap((item) => (item.rings || []).filter(Array.isArray).flat());
    if (veranoPts.length >= 3) extraMask.push(convexHull(veranoPts));
    if (cnrRing) {
      const levels = Number(String((map.named.find((n) => n.rings?.includes(cnrRing)) || {}).levels || '').replace(',', '.'));
      addGuestBuilding(cnrRing, Number.isFinite(levels) && levels > 0 ? levels * 3.6 : CNR.height);
      CNR.osm = true;
    }
    compositeOrtho();
  }
  /* ---------- piazzale della Minerva: vasca, scalinata del Rettorato, arcate, statua ---------- */
  // Coordinate in punti della planimetria ufficiale (stessa calibrazione dei volumi CU).
  const MINERVA = {
    // aiuole a U attorno alla statua, rialzate; dentro la U una vasca ribassata con acqua
    basin: [[270.8, 535.8], [315, 535.8], [315, 555], [305.8, 555], [305.8, 540], [280, 540], [280, 555], [270.8, 555]],
    basinHeight: 0.95,
    pool: [280, 540, 305.8, 555], poolDepth: 0.75, waterLevel: -0.4,
    statue: [292.5, 536.6],
    // scalinata: bordo inferiore, lati verso le arcate, pianerottolo davanti al corpo centrale
    stairs: { front: 518.3, left: 271.7, right: 313.3, facade: 497.5, landingLeft: 285, landingRight: 299.2, landingFront: 505.8, steps: 14, riser: 0.15 },
    // arcate del Rettorato (CU001): rettangoli sottratti al volume fino a una quota
    arches: { code: 'CU001', rects: [[266.0, 489.5, 272.5, 499.0], [312.3, 489.5, 318.8, 499.0]], heightRatio: 0.62, maxHeight: 12 }
  };
  let extrasGroup = null;
  function pdfShape(points) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) => { const w = pdfToWorld(x, y); if (i) shape.lineTo(w.x, -w.z); else shape.moveTo(w.x, -w.z); });
    return shape;
  }
  function extrudeShape(shapes, depth, base) {
    const geometry = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 1 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, base, 0);
    return geometry;
  }
  /* differenza poligono − rettangolo allineato agli assi (coordinate planimetria):
     il piano fuori dal rettangolo è diviso in quattro regioni convesse e il poligono
     viene ritagliato su ciascuna (Sutherland–Hodgman). */
  function clipConvex(poly, inside, intersect) {
    let out = poly;
    const result = [];
    for (let i = 0; i < out.length; i += 1) {
      const a = out[i], b = out[(i + 1) % out.length];
      const ia = inside(a), ib = inside(b);
      if (ia) result.push(a);
      if (ia !== ib) result.push(intersect(a, b));
    }
    return result.length >= 3 ? result : null;
  }
  function clipHalf(poly, axis, value, keepLess) {
    const inside = (p) => (keepLess ? p[axis] <= value : p[axis] >= value);
    const intersect = (a, b) => { const t = (value - a[axis]) / (b[axis] - a[axis]); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; };
    return clipConvex(poly, inside, intersect);
  }
  function subtractRect(poly, [x0, y0, x1, y1]) {
    const pieces = [];
    const left = clipHalf(poly, 0, x0, true); if (left) pieces.push(left);
    const right = clipHalf(poly, 0, x1, false); if (right) pieces.push(right);
    let mid = clipHalf(poly, 0, x0, false); mid = mid && clipHalf(mid, 0, x1, true);
    if (mid) {
      const top = clipHalf(mid, 1, y0, true); if (top) pieces.push(top);
      const bottom = clipHalf(mid, 1, y1, false); if (bottom) pieces.push(bottom);
    }
    return pieces;
  }
  function polyArea(poly) { let a = 0; for (let i = 0; i < poly.length; i += 1) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); }
  function cutArches(mesh, rings) {
    const cfg = MINERVA.arches;
    const height = mesh.userData.height || 15;
    const archTop = Math.min(cfg.maxHeight, height * cfg.heightRatio);
    let pieces = rings.map((ring) => ring.slice());
    for (const rect of cfg.rects) pieces = pieces.flatMap((piece) => subtractRect(piece, rect));
    pieces = pieces.filter((piece) => polyArea(piece) > 0.5);
    if (!pieces.length) return;
    // parte superiore: sagoma intera sopra le arcate
    const upperShapes = rings.map((ring) => pdfShape(ring));
    const upper = extrudeShape(upperShapes, height - archTop, 0.16 + archTop);
    applyRoofUVs(upper);
    mesh.geometry.dispose();
    mesh.geometry = upper;
    // parte inferiore: sagoma meno le arcate
    const lower = extrudeShape(pieces.map((piece) => pdfShape(piece)), archTop, 0.16);
    applyRoofUVs(lower);
    const base = new THREE.Mesh(lower, mesh.material);
    base.userData = { ...mesh.userData, part: 'arcades' };
    base.castShadow = true; base.receiveShadow = true;
    mesh.parent.add(base);
    pickables.push(base);
  }
  /* acqua 3D leggera: griglia di ~1000 vertici, onde calcolate nella GPU (somma di sinusoidi),
     riflesso del sole e trasparenza ai bordi; nessuna texture né file da scaricare */
  function waterGrid([x0, y0, x1, y1], level, nx, ny) {
    const pos = new Float32Array((nx + 1) * (ny + 1) * 3), idx = [];
    for (let j = 0; j <= ny; j += 1) for (let i = 0; i <= nx; i += 1) {
      const w = pdfToWorld(x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny), k = (j * (nx + 1) + i) * 3;
      pos[k] = w.x; pos[k + 1] = level; pos[k + 2] = w.z;
    }
    for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
    return g;
  }
  function waterMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        uniform float uTime; varying vec3 vWorld; varying vec3 vNormal;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float x = wp.x, z = wp.z, t = uTime;
          float h = 0.035 * sin(x * 1.1 + t * 1.5) + 0.028 * sin(z * 1.6 - t * 1.2) + 0.018 * sin((x + z) * 2.7 + t * 2.1);
          float dx = 0.0385 * cos(x * 1.1 + t * 1.5) + 0.0486 * cos((x + z) * 2.7 + t * 2.1);
          float dz = 0.0448 * cos(z * 1.6 - t * 1.2) + 0.0486 * cos((x + z) * 2.7 + t * 2.1);
          wp.y += h; vWorld = wp.xyz; vNormal = normalize(vec3(-dx, 1.0, -dz));
          gl_Position = projectionMatrix * viewMatrix * wp;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        uniform float uTime; varying vec3 vWorld; varying vec3 vNormal;
        void main() {
          #include <logdepthbuf_fragment>
          vec3 n = normalize(vNormal), v = normalize(cameraPosition - vWorld), l = normalize(vec3(0.4, 0.8, 0.3));
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          float spec = pow(max(dot(reflect(-l, n), v), 0.0), 60.0);
          float caus = pow(0.5 + 0.5 * sin(vWorld.x * 3.1 + uTime * 1.3) * sin(vWorld.z * 2.7 - uTime * 1.1), 6.0);
          vec3 col = mix(vec3(0.33, 0.70, 0.85), vec3(0.72, 0.90, 0.97), fres) + caus * 0.12 + spec * 0.9;
          gl_FragColor = vec4(col, 0.62 + fres * 0.3 + spec * 0.3);
        }`
    });
  }
  function updateWater(now) {
    const mat = MINERVA.water; if (!mat || reducedMotion) return;
    mat.uniforms.uTime.value = now / 1000;
  }
  /* facciata del Rettorato: foto raddrizzata (rettorato-facciata.jpg) sul fronte del portico,
     con i quattro pilastri e l'attico «STUDIUM VRBIS» in rilievo */
  const FACADE = { left: 285, right: 299.2, front: 505.9, base: 2.1, atticV: 55 / 600, rise: 3,
    pillars: [[0, 50], [128, 178], [336, 386], [460, 512]].map(([a, b]) => [a / 512, b / 512]) };
  function buildRettoratoFacade(sideMat) {
    const building = planMeshesByCode.get('CU001');
    const top = 0.16 + (building?.userData.height || 20) + FACADE.rise;
    const A = pdfToWorld(FACADE.left, FACADE.front), B = pdfToWorld(FACADE.right, FACADE.front);
    const C = pdfToWorld((FACADE.left + FACADE.right) / 2, FACADE.front + 1);
    const right = new THREE.Vector3(B.x - A.x, 0, B.z - A.z), width = right.length(); right.normalize();
    const mid = new THREE.Vector3((A.x + B.x) / 2, 0, (A.z + B.z) / 2);
    const normal = new THREE.Vector3(C.x - mid.x, 0, C.z - mid.z).normalize();
    const up = new THREE.Vector3(0, 1, 0), height = top - FACADE.base;
    const basis = new THREE.Matrix4().makeBasis(right, up, normal);
    const group = extrasGroup;
    new THREE.TextureLoader().load('rettorato-facciata.jpg', (texture) => {
    texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 4;
    const part = (u0, u1, v0, v1) => { const t = texture.clone(); t.needsUpdate = true; t.repeat.set(u1 - u0, v1 - v0); t.offset.set(u0, 1 - v1); return new THREE.MeshBasicMaterial({ map: t, toneMapped: false }); };
    const place = (mesh, u, vTop, vBottom, out) => {
      // u = centro orizzontale (0..1), v = dall'alto (0..1), out = sporgenza del centro rispetto al fronte
      const cy = top - (vTop + vBottom) / 2 * height;
      const pos = mid.clone().addScaledVector(right, (u - 0.5) * width).addScaledVector(normal, out); pos.y = cy;
      mesh.quaternion.setFromRotationMatrix(basis); mesh.position.copy(pos);
      mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    };
    // fondo del portico: foto intera, leggermente arretrata
    place(new THREE.Mesh(new THREE.PlaneGeometry(width, height), part(0, 1, 0, 1)), 0.5, 0, 1, 0.05);
    const side = new THREE.MeshStandardMaterial({ color: 0xd8d1c4, roughness: 0.85, metalness: 0 });
    // pilastri in rilievo, con la loro porzione di foto sul fronte
    const depth = 1.6, pillarTop = FACADE.atticV;
    for (const [u0, u1] of FACADE.pillars) {
      const geo = new THREE.BoxGeometry((u1 - u0) * width, (1 - pillarTop) * height, depth);
      place(new THREE.Mesh(geo, [side, side, side, side, part(u0, u1, pillarTop, 1), side]), (u0 + u1) / 2, pillarTop, 1, depth / 2 + 0.05);
    }
    // attico con la scritta, sporgente come i pilastri e profondo fin dentro l'edificio
    const atticDepth = depth + 6;
    const attic = new THREE.BoxGeometry(width + 0.4, pillarTop * height, atticDepth);
    place(new THREE.Mesh(attic, [side, side, side, side, part(0, 1, 0, pillarTop), side]), 0.5, 0, pillarTop, depth + 0.05 - atticDepth / 2);
    // corpo del portico che sale sopra le ali (fino all'attico)
    const tower = new THREE.BoxGeometry(width, FACADE.rise, 12);
    place(new THREE.Mesh(tower, sideMat), 0.5, 0, FACADE.rise / height, -6);
    });
  }
  function buildMinervaArea() {
    if (!alignment) return;
    if (extrasGroup) { extrasGroup.parent?.remove(extrasGroup); extrasGroup.traverse((o) => { o.geometry?.dispose(); }); }
    extrasGroup = new THREE.Group(); extrasGroup.name = 'minerva';
    queueMicrotask(() => { if (extrasGroup) extrasGroup.visible = viewDim !== '2d'; });
    (planLayerGroup || scene).add(extrasGroup); // senza planimetria ufficiale la Minerva va direttamente nella scena
    const stone = new THREE.MeshStandardMaterial({ color: 0xb9ae9c, roughness: 0.92, metalness: 0 });
    const stoneTop = new THREE.MeshStandardMaterial({ color: 0xebe4d7, roughness: 0.9, metalness: 0 });
    const edge = new THREE.LineBasicMaterial({ color: 0x9c9282, transparent: true, opacity: 0.7 });
    // vasca
    const basin = extrudeShape([pdfShape(MINERVA.basin)], MINERVA.basinHeight, 0);
    applyRoofUVs(basin);
    const basinMesh = new THREE.Mesh(basin, [new THREE.MeshBasicMaterial({ color: 0xffffff, map: showAerial ? roofTexture : null, toneMapped: false }), stone]);
    basinMesh.userData.texturedTop = true;
    basinMesh.castShadow = true; basinMesh.receiveShadow = true;
    extrasGroup.add(basinMesh);
    // vasca ribassata dentro la U: pareti in pietra, fondo scuro e acqua in stile videogioco anni '90
    {
      const [x0, y0, x1, y1] = MINERVA.pool, d = MINERVA.poolDepth;
      const ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const pit = extrudeShape([pdfShape(ring)], d, -d);
      const hidden = new THREE.MeshBasicMaterial({ visible: false });
      const walls = new THREE.MeshStandardMaterial({ color: 0x9e9484, roughness: 0.95, metalness: 0, side: THREE.BackSide });
      extrasGroup.add(new THREE.Mesh(pit, [hidden, walls]));
      const floor = extrudeShape([pdfShape(ring)], 0.01, -d);
      extrasGroup.add(new THREE.Mesh(floor, new THREE.MeshStandardMaterial({ color: 0x31515a, roughness: 1, metalness: 0 })));
      const waterMesh = new THREE.Mesh(waterGrid(MINERVA.pool, MINERVA.waterLevel, 40, 24), waterMaterial());
      waterMesh.renderOrder = 2;
      extrasGroup.add(waterMesh);
      MINERVA.water = waterMesh.material;
    }
    // scalinata: gradini concentrici che girano di 90° agli angoli (diagonali dal bordo al pianerottolo)
    const s = MINERVA.stairs;
    for (let i = 0; i < s.steps; i += 1) {
      const t = i / s.steps;
      const front = s.front + t * (s.landingFront - s.front);
      const left = s.left + t * (s.landingLeft - s.left);
      const right = s.right + t * (s.landingRight - s.right);
      const step = extrudeShape([pdfShape([[left, s.facade], [right, s.facade], [right, front], [left, front]])], (i + 1) * s.riser, 0);
      const mesh = new THREE.Mesh(step, [stoneTop, stone]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      extrasGroup.add(mesh);
      extrasGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(step, 20), edge));
    }
    const statue = pdfToWorld(...MINERVA.statue);
    MINERVA.world = { x: statue.x, z: statue.z, y: MINERVA.basinHeight };
    const axisA = pdfToWorld(292.4, 500), axisB = pdfToWorld(292.4, 600);
    MINERVA.facing = Math.atan2(axisB.x - axisA.x, axisB.z - axisA.z);
    // la vista iniziale resta su Chimica; il Rettorato non si disegna più, quindi niente facciata
    loadMinervaModel();
    loadFountains();
    loadScan3d();
  }
  /* statua: si carica solo se esiste models/minerva.json (es. {"file":"minerva.glb","height":9,"rotationDeg":0}) */
  let minervaLoaded = false;
  async function loadMinervaModel() {
    if (minervaLoaded) { if (MINERVA.holder && MINERVA.holder.parent !== extrasGroup) extrasGroup.add(MINERVA.holder); return; }
    if (!MINERVA.world) return;
    let config;
    try { const response = await fetch('models/minerva.json', { cache: 'no-cache' }); if (!response.ok) return; config = await response.json(); } catch (_) { return; }
    if (!config?.file || !/^[\w.-]+\.(glb|gltf|json)$/i.test(config.file)) return;
    minervaLoaded = true;
    try {
      await loadDependency('vendor/GLTFLoader.js', () => typeof THREE.GLTFLoader === 'function');
    } catch (_) { minervaLoaded = false; return; }
    const onModel = (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = (Number(config.height) || 9) / Math.max(0.001, size.y);
      model.scale.setScalar(scale);
      const scaled = new THREE.Box3().setFromObject(model);
      const center = scaled.getCenter(new THREE.Vector3());
      const holder = new THREE.Group();
      model.position.set(-center.x, -scaled.min.y, -center.z);
      holder.add(model);
      const pedestal = Math.max(0, Number(config.pedestal) || 0);
      const baseX = MINERVA.world.x + (Number(config.offset?.[0]) || 0), baseZ = MINERVA.world.z + (Number(config.offset?.[1]) || 0);
      if (pedestal > 0) {
        // basamento in pietra sotto la statua (dimensioni indicative)
        const size = Number(config.pedestalSize) || 2.4;
        const block = new THREE.Mesh(new THREE.BoxGeometry(size, pedestal, size), new THREE.MeshStandardMaterial({ color: 0xe2d9c8, roughness: 0.9, metalness: 0 }));
        block.position.set(baseX, MINERVA.world.y + pedestal / 2, baseZ);
        block.rotation.y = MINERVA.facing;
        block.castShadow = true; block.receiveShadow = true;
        extrasGroup.add(block);
      }
      holder.position.set(baseX, MINERVA.world.y + pedestal, baseZ);
      holder.rotation.y = MINERVA.facing + ((Number(config.rotationDeg) || 0) * Math.PI / 180);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } if (o.isMesh && o.material) { o.material.metalness = Math.min(o.material.metalness ?? 0.35, 0.35); o.material.needsUpdate = true; } });
      holder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      holder.userData.minerva = true;
      extrasGroup.add(holder);
      // cliccabile: ogni parte della statua avvia il rimbalzo
      holder.traverse((o) => { if (o.isMesh) { o.userData.minervaPart = true; pickables.push(o); } });
      MINERVA.holder = holder; MINERVA.baseY = holder.position.y; MINERVA.scale = 1;
    };
    const fail = () => { minervaLoaded = false; };
    if (/\.json$/i.test(config.file)) {
      // variante per hosting che non serve file .glb: il GLB è codificato in base64 dentro un JSON
      fetch(`models/${config.file}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((data) => {
        const bin = Uint8Array.from(atob(data.glb_base64), (c) => c.charCodeAt(0));
        new THREE.GLTFLoader().parse(bin.buffer, 'models/', onModel, fail);
      }).catch(fail);
    } else new THREE.GLTFLoader().load(`models/${config.file}`, onModel, undefined, fail);
  }

  /* fontanelle Sapienza (modello esclusivo della Città universitaria): models/fontanelle.json → {"file":"fontanella.glb","height":2.4,"points":[[x,y],…]} in punti PDF */
  let fountainsLoaded = false;
  async function loadFountains() {
    if (fountainsLoaded) return;
    let config;
    try { const response = await fetch('models/fontanelle.json', { cache: 'no-cache' }); if (!response.ok) return; config = await response.json(); } catch (_) { return; }
    if (!config?.file || !/^[\w.-]+\.(glb|json)$/i.test(config.file) || !Array.isArray(config.points)) return;
    fountainsLoaded = true;
    try { await loadDependency('vendor/GLTFLoader.js', () => typeof THREE.GLTFLoader === 'function'); } catch (_) { fountainsLoaded = false; return; }
    const onModel = (gltf) => {
      const model = gltf.scene;
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      model.scale.setScalar((Number(config.height) || 2.4) / Math.max(0.001, size.y));
      const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3());
      model.position.set(-c.x, -box.min.y, -c.z);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) { o.material.metalness = Math.min(o.material.metalness ?? 0.5, 0.5); o.material.needsUpdate = true; } } });
      config.points.forEach(([x, y], i) => {
        const w = pdfToWorld(x, y), holder = new THREE.Group();
        holder.add(i ? model.clone(true) : model);
        holder.position.set(w.x, 0, w.z);
        holder.rotation.y = (Number(config.rotationDeg) || 0) * Math.PI / 180 + i * 1.3;
        holder.userData.fountain = true;
        holder.traverse((o) => { if (o.isMesh) { o.userData.fountainPart = true; pickables.push(o); } });
        extrasGroup.add(holder);
      });
    };
    const fail = () => { fountainsLoaded = false; };
    if (/\.json$/i.test(config.file)) {
      fetch(`models/${config.file}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((data) => {
        const bin = Uint8Array.from(atob(data.glb_base64), (ch) => ch.charCodeAt(0));
        new THREE.GLTFLoader().parse(bin.buffer, 'models/', onModel, fail);
      }).catch(fail);
    } else new THREE.GLTFLoader().load(`models/${config.file}`, onModel, undefined, fail);
  }

  /* ---------- scansione 3D (nuvole di punti e modelli) ----------
     Si carica solo se esiste models/scan-3d.json, ad esempio:
     {"items":[
        {"id":"cortile","type":"cloud","file":"cortile.ply","anchor":[366,665],"up":"z","rotationDeg":0,"scale":1,"elevation":0,"pointSize":0.05,"maxPoints":1500000},
        {"id":"modello","type":"model","file":"modello.glb","anchor":[366,665],"height":3,"rotationDeg":0,"elevation":0}
     ]}
     anchor = punto in coordinate PDF della planimetria (le stesse di scan-areas.json): la nuvola viene centrata lì e appoggiata a terra.
     Nuvole: .ply (ascii o binario little-endian, con x y z e opzionali red green blue), .xyz/.txt/.csv (x y z [r g b]) o .json ({"positions":[…],"colors":[…]}).
     Modelli: .glb oppure .json con glb_base64 (come minerva-glb.json). up = "y" (predefinito) o "z" (asse verticale della scansione). */
  let scan3dLoaded = false;
  const scan3dHolders = [];
  const PLY_SIZES = { char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2, int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  function plyReader(view, type, offset) {
    switch (type) {
      case 'char': case 'int8': return view.getInt8(offset);
      case 'uchar': case 'uint8': return view.getUint8(offset);
      case 'short': case 'int16': return view.getInt16(offset, true);
      case 'ushort': case 'uint16': return view.getUint16(offset, true);
      case 'int': case 'int32': return view.getInt32(offset, true);
      case 'uint': case 'uint32': return view.getUint32(offset, true);
      case 'float': case 'float32': return view.getFloat32(offset, true);
      default: return view.getFloat64(offset, true);
    }
  }
  function parsePointCloud(buffer, file, maxPoints) {
    const ext = (file.match(/\.(\w+)$/) || [])[1]?.toLowerCase();
    let pos = [], col = [], total = 0, stride = 1;
    const push = (x, y, z, r, g, b) => { pos.push(x, y, z); if (r !== undefined) col.push(r, g, b); };
    if (ext === 'ply') {
      const bytes = new Uint8Array(buffer);
      const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 8192)));
      const endMatch = /end_header\r?\n/.exec(head);
      if (!endMatch) throw new Error('PLY senza intestazione');
      const bodyStart = endMatch.index + endMatch[0].length;
      const lines = head.slice(0, endMatch.index).split(/\r?\n/);
      const format = (lines.find((l) => l.startsWith('format ')) || '').split(/\s+/)[1];
      let count = 0, inVertex = false; const props = [];
      for (const line of lines) {
        const t = line.trim().split(/\s+/);
        if (t[0] === 'element') { inVertex = t[1] === 'vertex'; if (inVertex) count = parseInt(t[2], 10); else if (props.length) break; }
        else if (t[0] === 'property' && inVertex) { if (t[1] === 'list') throw new Error('PLY con liste nei vertici'); props.push({ type: t[1], name: t[2] }); }
      }
      total = count; stride = Math.max(1, Math.ceil(count / maxPoints));
      const idx = (n) => props.findIndex((p) => p.name === n);
      const ix = idx('x'), iy = idx('y'), iz = idx('z'), ir = idx('red') >= 0 ? idx('red') : idx('r'), ig = idx('green') >= 0 ? idx('green') : idx('g'), ib = idx('blue') >= 0 ? idx('blue') : idx('b');
      if (ix < 0 || iy < 0 || iz < 0) throw new Error('PLY senza coordinate');
      const hasColor = ir >= 0 && ig >= 0 && ib >= 0;
      const colorScale = (i) => (props[i].type === 'float' || props[i].type === 'float32' || props[i].type === 'double' || props[i].type === 'float64') ? 1 : 1 / 255;
      if (format === 'ascii') {
        const rows = new TextDecoder().decode(bytes.subarray(bodyStart)).split(/\r?\n/);
        for (let i = 0; i < count; i += stride) {
          const v = rows[i]?.trim().split(/\s+/).map(Number); if (!v || v.length < props.length) continue;
          if (hasColor) push(v[ix], v[iy], v[iz], v[ir] * colorScale(ir), v[ig] * colorScale(ig), v[ib] * colorScale(ib)); else push(v[ix], v[iy], v[iz]);
        }
      } else if (format === 'binary_little_endian') {
        const view = new DataView(buffer, bodyStart);
        const offs = []; let rec = 0; for (const p of props) { offs.push(rec); rec += PLY_SIZES[p.type] || 4; }
        for (let i = 0; i < count; i += stride) {
          const base = i * rec; if (base + rec > view.byteLength) break;
          const g = (n) => plyReader(view, props[n].type, base + offs[n]);
          if (hasColor) push(g(ix), g(iy), g(iz), g(ir) * colorScale(ir), g(ig) * colorScale(ig), g(ib) * colorScale(ib)); else push(g(ix), g(iy), g(iz));
        }
      } else throw new Error('formato PLY non supportato');
    } else if (ext === 'json') {
      const data = JSON.parse(new TextDecoder().decode(buffer));
      if (Array.isArray(data.positions)) {
        total = Math.floor(data.positions.length / 3); stride = Math.max(1, Math.ceil(total / maxPoints));
        const cs = data.colors && Math.max(...data.colors.slice(0, 3000)) > 1 ? 1 / 255 : 1;
        for (let i = 0; i < total; i += stride) push(data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2], ...(data.colors ? [data.colors[i * 3] * cs, data.colors[i * 3 + 1] * cs, data.colors[i * 3 + 2] * cs] : []));
      } else if (Array.isArray(data.points)) {
        total = data.points.length; stride = Math.max(1, Math.ceil(total / maxPoints));
        for (let i = 0; i < total; i += stride) { const p = data.points[i]; push(p[0], p[1], p[2], ...(p.length >= 6 ? [p[3] / 255, p[4] / 255, p[5] / 255] : [])); }
      } else throw new Error('JSON non riconosciuto');
    } else {
      const rows = new TextDecoder().decode(buffer).split(/\r?\n/).filter((l) => l && !/^\s*[#/]/.test(l));
      total = rows.length; stride = Math.max(1, Math.ceil(total / maxPoints));
      for (let i = 0; i < total; i += stride) {
        const v = rows[i].trim().split(/[\s,;]+/).map(Number); if (v.length < 3 || v.slice(0, 3).some((n) => !isFinite(n))) continue;
        push(v[0], v[1], v[2], ...(v.length >= 6 && v.slice(3, 6).every(isFinite) ? [v[3] / (v[3] > 1 || v[4] > 1 || v[5] > 1 ? 255 : 1), v[4] / (v[3] > 1 || v[4] > 1 || v[5] > 1 ? 255 : 1), v[5] / (v[3] > 1 || v[4] > 1 || v[5] > 1 ? 255 : 1)] : []));
      }
    }
    const n = pos.length / 3;
    return { positions: Float32Array.from(pos), colors: col.length === n * 3 && n ? Float32Array.from(col) : null, count: n, total };
  }
  function buildPointCloud(cloud, item) {
    const n = cloud.count, src = cloud.positions, out = new Float32Array(n * 3), zUp = String(item.up || 'y').toLowerCase() === 'z';
    let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = src[i * 3], y = zUp ? src[i * 3 + 2] : src[i * 3 + 1], z = zUp ? -src[i * 3 + 1] : src[i * 3 + 2];
      out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, k = Number(item.scale) || 1;
    let maxH = 0; for (let i = 0; i < n; i++) { out[i * 3] = (out[i * 3] - cx) * k; out[i * 3 + 1] = (out[i * 3 + 1] - minY) * k; out[i * 3 + 2] = (out[i * 3 + 2] - cz) * k; if (out[i * 3 + 1] > maxH) maxH = out[i * 3 + 1]; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
    let colors = cloud.colors;
    if (!colors) { colors = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const t = maxH ? out[i * 3 + 1] / maxH : 0; colors[i * 3] = 0.1 + 0.2 * t; colors[i * 3 + 1] = 0.55 + 0.35 * t; colors[i * 3 + 2] = 0.7 + 0.2 * t; } }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    const mat = new THREE.PointsMaterial({ size: Number(item.pointSize) || 0.05, sizeAttenuation: true, vertexColors: true });
    return new THREE.Points(geo, mat);
  }
  function loadGltfFile(file, done, fail) {
    loadDependency('vendor/GLTFLoader.js', () => typeof THREE.GLTFLoader === 'function').then(() => {
      if (/\.json$/i.test(file)) {
        fetch(`models/${file}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((data) => {
          const bin = Uint8Array.from(atob(data.glb_base64), (ch) => ch.charCodeAt(0));
          new THREE.GLTFLoader().parse(bin.buffer, 'models/', done, fail);
        }).catch(fail);
      } else new THREE.GLTFLoader().load(`models/${file}`, done, undefined, fail);
    }).catch(fail);
  }
  async function loadScan3d() {
    if (scan3dLoaded) { scan3dHolders.forEach((h) => (extrasGroup || scene).add(h)); return; }
    let config;
    try { const response = await fetch('models/scan-3d.json', { cache: 'no-cache' }); if (!response.ok) return; config = await response.json(); } catch (_) { return; }
    if (!Array.isArray(config?.items)) return;
    scan3dLoaded = true;
    const place = (holder, item) => {
      const a = Array.isArray(item.anchor) && item.anchor.length === 2 ? pdfToWorld(item.anchor[0], item.anchor[1]) : { x: 0, z: 0 };
      holder.position.set(a.x, Number(item.elevation) || 0, a.z);
      holder.rotation.y = (Number(item.rotationDeg) || 0) * Math.PI / 180;
      holder.userData.scan3d = item.id || true;
      scan3dHolders.push(holder);
      (extrasGroup || scene).add(holder);
    };
    for (const item of config.items) {
      if (!item || !/^[\w.-]+\.(glb|json|ply|xyz|txt|csv)$/i.test(item.file || '')) continue;
      if (item.type === 'model') {
        loadGltfFile(item.file, (gltf) => {
          const model = gltf.scene, size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
          if (Number(item.height)) model.scale.setScalar(Number(item.height) / Math.max(0.001, size.y)); else if (Number(item.scale)) model.scale.setScalar(Number(item.scale));
          const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3());
          model.position.set(-c.x, -box.min.y, -c.z);
          model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          const holder = new THREE.Group(); holder.add(model); place(holder, item);
        }, () => console.warn('scan-3d: modello non caricato', item.file));
      } else {
        fetch(`models/${item.file}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((buf) => {
          const cloud = parsePointCloud(buf, item.file, Number(item.maxPoints) || 1500000);
          if (!cloud.count) throw new Error('nessun punto');
          const holder = new THREE.Group(); holder.add(buildPointCloud(cloud, item)); place(holder, item);
          console.info(`scan-3d: ${item.id || item.file} · ${cloud.count} punti su ${cloud.total}`);
        }).catch((e) => console.warn('scan-3d: nuvola non caricata', item.file, e && e.message));
      }
    }
  }

  /* ---------- modalità della vista (comandate dalla pagina principale) ---------- */
  let viewDim = '3d';
  let viewBase = 'satellite';
  function setFlat(flat) {
    const s = flat ? 0.02 : 1;
    for (const group of [buildingGroup, planBuildingsGroup, extrasGroup]) if (group) group.scale.y = s;
  }
  function applyViewMode() {
    if (!renderer) return;
    const satellite = viewBase === 'satellite';
    setAerial(satellite);
    planVisible = !satellite;
    planOpacity = 1;
    if (planImageMaterial) planImageMaterial.opacity = 1;
    if (planImagePlane) planImagePlane.visible = planVisible;
    for (const tile of detailTiles.values()) if (tile.mesh) tile.mesh.visible = satellite;
    updatePlanSelection();
    const flat = viewDim === '2d';
    setFlat(flat);
    // vasca, scalinata, Minerva e fontanelle esistono solo nella vista 3D
    if (extrasGroup) extrasGroup.visible = !flat;
    controls.enableRotate = !flat;
    if (flat) {
      stopTour();
      controls.minPolarAngle = 0; controls.maxPolarAngle = 0.0001;
      const target = controls.target.clone();
      const height = Math.max(300, camera.position.distanceTo(target));
      camera.position.set(target.x, height, target.z + 0.001);
    } else {
      controls.minPolarAngle = 0.08; controls.maxPolarAngle = Math.PI / 2.04;
      if (camera.position.y > 0 && Math.abs(camera.position.x - controls.target.x) < 1) flyTo({ x: controls.target.x, n: -controls.target.z }, camera.position.distanceTo(controls.target) * 0.8, reducedMotion ? 0 : 700);
    }
    controls.update();
  }

  /* ---------- tasselli di dettaglio dell'ortofoto (caricati vicino alla camera) ---------- */
  const TILE_M = 64;
  const TILE_PX = smallScreen ? 384 : 512;
  const detailTiles = new Map();
  let tileManifest = null;
  let tileTimer = 0;
  let tileLoads = 0;
  async function loadTileManifest() {
    try { const response = await fetch('tiles/manifest.json', { cache: 'no-cache' }); if (response.ok) tileManifest = await response.json(); } catch (_) { tileManifest = null; }
  }
  function tileGrid() {
    const dLon = TILE_M / metersPerLon, dLat = TILE_M / metersPerLat;
    return { dLon, dLat, cols: Math.ceil((ORTHO_BOUNDS.east - ORTHO_BOUNDS.west) / dLon), rows: Math.ceil((ORTHO_BOUNDS.north - ORTHO_BOUNDS.south) / dLat) };
  }
  function tileBounds(c, r, grid) {
    const west = ORTHO_BOUNDS.west + c * grid.dLon, north = ORTHO_BOUNDS.north - r * grid.dLat;
    return { west, east: west + grid.dLon, north, south: north - grid.dLat };
  }
  function tileInsideMask(b) {
    if (!maskCanvas) return false;
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    const toPx = canvasMapper(ORTHO_BOUNDS, maskCanvas.width, maskCanvas.height);
    const [x0, y0] = toPx([b.west, b.north]), [x1, y1] = toPx([b.east, b.south]);
    const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
    const data = ctx.getImageData(Math.max(0, Math.round(x0)), Math.max(0, Math.round(y0)), w, h).data;
    for (let i = 3; i < data.length; i += 16) if (data[i] > 0) return true;
    return false;
  }
  function tileSource(c, r, b) {
    const key = `${c}_${r}`;
    if (tileManifest?.tiles?.includes(key) && typeof tileManifest.path === 'string') return tileManifest.path.replace('{c}', c).replace('{r}', r);
    return `/api/campus-ortho?bbox=${[b.west, b.south, b.east, b.north].map((v) => v.toFixed(6)).join(',')}&w=${TILE_PX}&h=${Math.round(TILE_PX * (metersPerLat * (b.north - b.south)) / (metersPerLon * (b.east - b.west)))}`;
  }
  function loadTile(c, r, b) {
    const key = `${c}_${r}`;
    const entry = { state: 'loading', mesh: null, used: performance.now() };
    detailTiles.set(key, entry);
    tileLoads += 1;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      tileLoads -= 1;
      if (!detailTiles.has(key)) return;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      // stesso confine del suolo
      const toPx = canvasMapper(ORTHO_BOUNDS, maskCanvas.width, maskCanvas.height);
      const [x0, y0] = toPx([b.west, b.north]), [x1, y1] = toPx([b.east, b.south]);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(maskCanvas, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.encoding = THREE.sRGBEncoding;
      texture.anisotropy = 8;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      const mesh = planeMesh(b, new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false }), -0.03);
      mesh.renderOrder = 2;
      mesh.visible = viewBase === 'satellite';
      scene.add(mesh);
      entry.mesh = mesh; entry.state = 'ready';
    };
    image.onerror = () => { tileLoads -= 1; entry.state = 'failed'; };
    image.src = tileSource(c, r, b);
  }
  function disposeTile(key) {
    const entry = detailTiles.get(key);
    if (entry?.mesh) { scene.remove(entry.mesh); entry.mesh.geometry.dispose(); entry.mesh.material.map?.dispose(); entry.mesh.material.dispose(); }
    detailTiles.delete(key);
  }
  function updateDetailTiles() {
    tileTimer = 0;
    if (!camera || !maskCanvas || viewBase !== 'satellite') return;
    const grid = tileGrid();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const near = [];
    for (let r = 0; r < grid.rows; r += 1) for (let c = 0; c < grid.cols; c += 1) {
      const b = tileBounds(c, r, grid);
      const sw = project([b.west, b.south]), ne = project([b.east, b.north]);
      const box = new THREE.Box3(new THREE.Vector3(sw.x, -1, -ne.n), new THREE.Vector3(ne.x, 30, -sw.n));
      if (!frustum.intersectsBox(box)) continue;
      const center = new THREE.Vector3((sw.x + ne.x) / 2, 0, -(sw.n + ne.n) / 2);
      const distance = camera.position.distanceTo(center);
      if (distance < 330) near.push({ c, r, b, distance });
    }
    near.sort((a, b) => a.distance - b.distance);
    const wanted = new Set();
    for (const tile of near.slice(0, 36)) {
      const key = `${tile.c}_${tile.r}`;
      wanted.add(key);
      const entry = detailTiles.get(key);
      if (entry) { entry.used = performance.now(); continue; }
      if (tileLoads >= 4) continue;
      if (!tileInsideMask(tile.b)) { detailTiles.set(key, { state: 'empty', mesh: null, used: performance.now() }); continue; }
      loadTile(tile.c, tile.r, tile.b);
    }
    // tieni al massimo 48 tasselli: scarta quelli lontani usati meno di recente
    if (detailTiles.size > 48) {
      const old = [...detailTiles.entries()].filter(([key]) => !wanted.has(key)).sort((a, b) => a[1].used - b[1].used);
      for (const [key] of old.slice(0, detailTiles.size - 48)) disposeTile(key);
    }
    if (near.length && tileLoads) scheduleTiles(400);
  }
  function scheduleTiles(delay = 250) {
    if (!tileTimer) tileTimer = window.setTimeout(updateDetailTiles, delay);
  }
  function makeShape(rings) {
    const outer = closeRing(rings[0]);
    if (outer.length < 4) return null;
    const first = project(outer[0]);
    const shape = new THREE.Shape();
    // Shape Y is northing; rotateX(-PI/2) maps it to right-handed world Z south.
    shape.moveTo(first.x, first.n);
    for (let i = 1; i < outer.length - 1; i += 1) {
      const p = project(outer[i]);
      shape.lineTo(p.x, p.n);
    }
    for (const ring of rings.slice(1)) {
      const hole = closeRing(ring);
      if (hole.length < 4) continue;
      const p0 = project(hole[0]);
      const path = new THREE.Path();
      path.moveTo(p0.x, p0.n);
      for (let i = 1; i < hole.length - 1; i += 1) {
        const p = project(hole[i]);
        path.lineTo(p.x, p.n);
      }
      shape.holes.push(path);
    }
    return shape;
  }
  function applyRoofUVs(geometry) {
    // I tetti campionano l'ortofoto ad alta risoluzione (stesso texel del suolo).
    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    const sw = project([ORTHO_BOUNDS.west, ORTHO_BOUNDS.south]), ne = project([ORTHO_BOUNDS.east, ORTHO_BOUNDS.north]);
    for (let i = 0; i < positions.count; i += 1) {
      uvs.setXY(i, (positions.getX(i) - sw.x) / (ne.x - sw.x), (-positions.getZ(i) - sw.n) / (ne.n - sw.n));
    }
    uvs.needsUpdate = true;
  }
  /* ---------- quartiere: tutti gli altri edifici OSM, uniti per materiale (poche chiamate di disegno) ---------- */
  const contextBuckets = new Map();
  function pushToBucket(geometry, mats, withRoof) {
    const pos = geometry.attributes.position.array, nor = geometry.attributes.normal.array, uv = geometry.attributes.uv.array;
    for (const group of geometry.groups) {
      if (group.materialIndex === 0 && !withRoof) continue;
      const mat = mats[group.materialIndex];
      let bucket = contextBuckets.get(mat);
      if (!bucket) { bucket = { pos: [], nor: [], uv: [] }; contextBuckets.set(mat, bucket); }
      for (let v = group.start; v < group.start + group.count; v += 1) {
        bucket.pos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        bucket.nor.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
        bucket.uv.push(uv[v * 2], uv[v * 2 + 1]);
      }
    }
    geometry.dispose();
  }
  function insideCampus([lon, lat]) {
    let c = false;
    for (let i = 0, j = CAMPUS_POLY.length - 1; i < CAMPUS_POLY.length; j = i, i += 1) {
      const [xi, yi] = CAMPUS_POLY[i], [xj, yj] = CAMPUS_POLY[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function addContextPolygon(shape, props) {
    const levels = Number(String(props['building:levels'] ?? '').replace(',', '.'));
    let height = heightInfo({ height: props.height, levels: props['building:levels'] }).value;
    const area = Math.abs(THREE.ShapeUtils.area(shape.getPoints()));
    if (!(levels > 0) && !props.height && area < 60) height = 4;
    const set = facadeSetFor(props.osm_id || props.name || area.toFixed(1));
    const pieces = buildingPieces(height, levels);
    pieces.forEach((piece, index) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth: piece.h, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.04 + piece.y0, 0);
      applyRoofUVs(g);
      if (piece.kind !== 'attic') applyWallUVs(g, 0.04 + piece.y0, FACADE_BAY, piece.floorH);
      g.computeVertexNormals();
      pushToBucket(g, [normalRoof, set[piece.kind]], index === pieces.length - 1);
    });
  }
  function flushContextBuckets() {
    for (const [material, bucket] of contextBuckets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.context = true;
      buildingGroup.add(mesh);
    }
    contextBuckets.clear();
  }
  let hiddenCap = null;
  function hiddenCapMaterial() {
    if (!hiddenCap) hiddenCap = new THREE.MeshBasicMaterial({ visible: false });
    return hiddenCap;
  }
  function addPolygon(feature, rings, lookup) {
    const outer = closeRing(rings[0]);
    if (outer.length < 4 || !insideMap(polygonCentroid(outer))) return;
    const props = feature.properties || {};
    const code = String(props['addr:housenumber'] || props.ref || '').trim().toUpperCase();
    const holes = (code && courtyardHoles[code]) || [];
    const solido = code === 'CU014' && cuSolidoParts(rings, holes);
    const parts = solido || shapesFor(rings, holes).map((shape) => ({ shape }));
    if (!parts.length) return;
    if (code && officialPlanCodes.has(code)) return;
    if (code === 'CU014') { cuDisegnato = true; if (solido) cuSolidoUsato = true; }
    const b = lookup.get(code), n0 = buildingGroup.children.length;
    if (code === 'CU014' && b) {
      for (const { shape, h, y0 } of parts) addCodedShape(shape, feature, props, code, b, h, y0);
      if (solido && solido.cornici) { // cornici di travertino: lastra orizzontale larga 45 cm (10 fuori dal muro), 16 cm, raccordata ad angolo
        const f = cuFrame(), mat = travPhoto(2.4), OUT = 0.1, IN = 0.35;
        const off = (e, d) => [[e.a[0] + e.nx * d, e.a[1] + e.ny * d], [e.b[0] + e.nx * d, e.b[1] + e.ny * d]];
        const meet = (p, q, r, t) => { // intersezione delle rette p-q e r-t (null se parallele)
          const d = (q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0]); if (Math.abs(d) < 1e-6) return null;
          const k = ((r[0] - p[0]) * (t[1] - r[1]) - (r[1] - p[1]) * (t[0] - r[0])) / d; return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
        };
        for (const { ed, h } of solido.cornici) {
          const n = ed.length;
          ed.forEach((e, i) => {
            if (!e || !e.on) return;
            const pts = {};
            for (const [d, key] of [[OUT, 'o'], [-IN, 'i']]) {
              const [p, q] = off(e, d); let s0 = p, s1 = q;
              const pr = ed[(i - 1 + n) % n], nx = ed[(i + 1) % n];
              const near = (x, v) => x && Math.hypot(x[0] - v[0], x[1] - v[1]) < 0.8 ? x : null; // niente punte negli angoli acuti
              if (pr && pr.on) { const [pp, pq] = off(pr, d); s0 = near(meet(pp, pq, p, q), p) || p; }
              if (nx && nx.on) { const [np, nq] = off(nx, d); s1 = near(meet(p, q, np, nq), q) || q; }
              pts[key] = [s0, s1];
            }
            const quad = [pts.o[0], pts.o[1], pts.i[1], pts.i[0]].map((q) => f.toXN(q));
            const v2 = quad.map((q) => new THREE.Vector2(q.x, q.n)); if (THREE.ShapeUtils.isClockWise(v2)) v2.reverse();
            const sh = new THREE.Shape(v2);
            const g = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, 0.04 + h - 0.02, 0);
            planarUVs(g, 2.4);
            const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; buildingGroup.add(m);
          });
        }
      }
      for (const o of buildingGroup.children.slice(n0)) o.userData.cuCorpo = true; return;
    }
    if (!b) { if (insideCampus(polygonCentroid(outer))) for (const { shape } of parts) addContextPolygon(shape, props); return; } // edifici del quartiere: volumi uniti, non selezionabili
    for (const { shape, h } of parts) addCodedShape(shape, feature, props, code, b, h);
  }
  /* vuoti di CU014 disegnati nell'editor (primitive con forma 'cavedio' in cortile/chimica-esterni.json, poligono nel lato 0):
     il solido si ricostruisce quando cambiano (anche al primo caricamento del file, che arriva dopo la scena) */
  let cavediFatti = '[]';
  const cavediCu = () => ((exteriorsCfg && exteriorsCfg.primitive) || []).filter((p) => p.forma === 'cavedio' && !p.rimosso && (!p.cornice || p.cornice === 'lato0') && Array.isArray(p.poligono) && p.poligono.length >= 3)
    .map((p) => ({ P: p.poligono.map((q) => [Number(q[0]), Number(q[1])]), coperto: Math.max(0, Number(p.coperto) || 0) }));
  function rebuildCu014() {
    if (!buildingGroup || !cuSolido) return;
    for (const o of buildingGroup.children.filter((x) => x.userData.cuCorpo)) { buildingGroup.remove(o); o.geometry?.dispose(); }
    pickables = pickables.filter((m) => !m.userData.cuCorpo);
    activeCodeMeshes.delete('CU014'); activeCodeOutlines.delete('CU014');
    const lookup = new Map(buildings.map((b) => [b.code.toUpperCase(), b]));
    for (const feature of contextFeatures) {
      const props = feature.properties || {}, geometry = feature.geometry;
      if (!geometry || String(props['addr:housenumber'] || props.ref || '').trim().toUpperCase() !== 'CU014') continue;
      if (geometry.type === 'Polygon') for (const r of carveCourtyard(geometry.coordinates)) addPolygon(feature, r, lookup);
      else if (geometry.type === 'MultiPolygon') for (const polygon of geometry.coordinates) for (const r of carveCourtyard(polygon)) addPolygon(feature, r, lookup);
    }
    updateSelectionMaterials();
  }
  /* ---------- solido di CU014 dall'STL di riferimento (cu014-solido.json): ali a quote diverse e fondo del cortile nord ---------- */
  let cuSolido = null, cuDisegnato = false, cuSolidoUsato = false; // CU014 estruso (anche senza STL) / con le ali dell'STL
  // lato 0 della sagoma OSM di CU014: u lungo il lato, v verso l'esterno (stesse coordinate dei file del cortile e dell'editor)
  function cuFrame() {
    const cu = buildings.find((x) => String(x.code).toUpperCase() === 'CU014'), ring = cu && cu.rings && cu.rings[0];
    if (!ring || ring.length < 2) return null;
    const a = project(ring[0]), c = project(ring[1]), len = Math.hypot(c.x - a.x, c.n - a.n);
    if (!(len > 0)) return null;
    const tx = (c.x - a.x) / len, tn = (c.n - a.n) / len;
    return {
      toLocal: (q) => { const w = project(q), dx = w.x - a.x, dn = w.n - a.n; return [dx * tx + dn * tn, -dx * tn + dn * tx]; },
      toLL: ([u, v]) => { const x = a.x + u * tx - v * tn, n = a.n + u * tn + v * tx; return [(x + mapWidth / 2) / metersPerLon + bounds.west, (n + mapDepth / 2) / metersPerLat + bounds.south]; },
      toXN: ([u, v]) => ({ x: a.x + u * tx - v * tn, n: a.n + u * tn + v * tx }),
      toUV: ({ x, n }) => { const dx = x - a.x, dn = n - a.n; return { u: dx * tx + dn * tn, v: -dx * tn + dn * tx }; },
    };
  }
  const rectRing = ([u0, v0, u1, v1]) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1], [u0, v0]];
  // pezzi (basamento, corpo, attico) di un'ala alta h: lo stesso interpiano per tutte le ali (cu014-solido.json → interpiano,
  // 3,425 m: il corpo principale a 19 m con 4 piani), così le file di finestre combaciano dove due ali si toccano; l'ultimo piano
  // resta solo se ne entra almeno il 75 % (finestra quasi intera), altrimenti l'avanzo va all'attico
  function cuPieces(h) {
    const BASE = 4.4, ATTIC = 0.9, F = Number(cuSolido && cuSolido.interpiano) > 0 ? Number(cuSolido.interpiano) : 3.425;
    if (h < BASE + ATTIC + 0.5) return buildingPieces(h, NaN);
    const room = h - BASE - ATTIC, whole = Math.floor(room / F + 1e-6), n = room / F - whole >= 0.75 ? whole + 1 : whole;
    const bodyH = Math.min(room, n * F), pieces = [{ y0: 0, h: BASE, kind: 'base', floorH: BASE }];
    if (bodyH > 0.01) pieces.push({ y0: BASE, h: bodyH, kind: 'body', floorH: F });
    pieces.push({ y0: BASE + bodyH, h: h - BASE - bodyH, kind: 'attic', floorH: h - BASE - bodyH });
    return pieces;
  }
  // arco di cerchio nelle coordinate del lato 0: centro [u, v], raggio r, angoli in gradi (antiorari dall'asse u, −90° = verso sud, v negativo)
  function cuArco(c, r, a0, a1) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 2));
    return Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; });
  }
  // corona circolare fra i raggi r0 e r1 e gli angoli a0 e a1, come anello chiuso
  function cuCorona(c, r0, r1, a0, a1) { const e = cuArco(c, r1, a0, a1); return [...e, ...cuArco(c, r0, a1, a0), e[0]]; }
  // sagoma (meno i cortili) divisa nelle ali di cu014-solido.json: [{ shape, h }]; null = dati o libreria mancanti, si torna alla sagoma intera
  function cuSolidoParts(rings, holes) {
    const f = cuSolido && cuFrame(), pc = window.polygonClipping;
    if (!f || !pc || typeof pc.intersection !== 'function' || !Array.isArray(cuSolido.ali)) return null;
    try {
      const loc = (r) => closeRing(r).map(f.toLocal);
      const subject = rings.map(loc).filter((r) => r.length >= 4);
      const cuts = holes.map((h) => [loc(h)]).filter((q) => q[0].length >= 4);
      let rest = cuts.length ? pc.difference(subject, ...cuts) : [subject];
      const cav = cavediCu(); cavediFatti = JSON.stringify(cav); // vuoti dell'editor (forma 'cavedio', lato 0): tagliano il solido fino a terra
      const aperti = cav.filter((c) => !(c.coperto > 0)), coperti = cav.filter((c) => c.coperto > 0), sotto = [];
      if (aperti.length) rest = pc.difference(rest, ...aperti.map((c) => [closeRing(c.P)]));
      for (const c of coperti) { // passaggio coperto: sotto la quota `coperto` vuoto, sopra l'edificio continua (con un soffitto)
        const ring = [closeRing(c.P)], inter = pc.intersection(rest, ring);
        if (inter.length) { sotto.push({ multi: inter, y0: c.coperto }); rest = pc.difference(rest, ring); }
      }
      const vent = cuSolido.ventaglio; // fronte sud a ventaglio: oltre la facciata ad arco ci sono scale e pensiline, non il corpo (addCuVentaglio)
      if (vent && Array.isArray(vent.settori) && vent.settori.length) {
        const fuori = vent.settori.map((st) => [cuCorona(vent.centro, vent.raggioFacciata, vent.raggioEsterno + 0.6, st.a0, st.a1)]);
        const Lg = vent.loggia; // primo piano arretrato lungo l'arco: la corona fra rInterno e la facciata la ricostruisce addCuVentaglio
        if (Lg && Number(Lg.rInterno) > 0) fuori.push([cuCorona(vent.centro, Number(Lg.rInterno), vent.raggioFacciata, Math.min(Lg.a0, Lg.a1), Math.max(Lg.a0, Lg.a1))]);
        rest = pc.difference(rest, ...fuori);
      }
      // il volume sopra la loggia (addCuVentaglio) conta come pieno per le cornici: niente lastra sul tetto lungo il fondo della loggia
      const sopra = cuLoggiaSopra().map((z) => [cuCorona(vent.centro, z.r0, z.r1, z.b0, z.b1)]);
      const out = [], full = sopra.length ? pc.union(rest, ...sopra) : rest, cornici = [];
      const inMulti = (m, p) => m.some((poly) => poly.length && pointInRing(p, poly[0]) && !poly.slice(1).some((hl) => pointInRing(p, hl)));
      // cornice di travertino (commento del 30/10): lastra orizzontale sopra i muri, dove il tetto confina col vuoto o con un'ala più bassa
      const cornice = (poly, h) => {
        const hh = h > 0 ? h : 0;
        for (const ring0 of poly) {
          const ring = ring0.slice(0, -1), n = ring.length, ed = []; if (n < 3) continue;
          for (let i = 0; i < n; i += 1) {
            const a = ring[i], b = ring[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (L < 1e-3) { ed.push(null); continue; }
            const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
            if (inMulti([poly], [m[0] + nx * 0.3, m[1] + ny * 0.3])) { nx = -nx; ny = -ny; } // normale verso fuori
            const o = [m[0] + nx * 0.3, m[1] + ny * 0.3];
            ed.push({ a, b, nx, ny, on: !inMulti(full, o) });
          }
          if (ed.some((e) => e && e.on)) cornici.push({ ed, h: hh });
        }
      };
      const push = (multi, h) => {
        for (const poly of multi) {
          if (!poly.length || polyArea(poly[0]) < 0.5) continue;
          const shape = makeShape(poly.map((r) => r.map(f.toLL)));
          if (shape) { out.push({ shape, h }); cornice(poly, h); }
        }
      };
      for (const { multi, h } of cuAliSplit(rest, pc)) push(multi, h);
      for (const sc of sotto) { const n0 = out.length; for (const { multi, h } of cuAliSplit(sc.multi, pc)) push(multi, h); for (const o of out.slice(n0)) o.y0 = sc.y0; }
      // cornice anche sul filo del volume sopra la loggia, così corre continua lungo tutto l'arco
      for (const z of sopra) for (const { multi, h } of cuAliSplit(z, pc)) for (const poly of multi) if (poly.length && polyArea(poly[0]) >= 0.05) cornice(poly, h);
      out.cornici = cornici;
      return out;
    } catch (_) { return null; }
  }
  // un multipoligono (coordinate del lato 0) diviso fra le ali di cu014-solido.json: [{ multi, h }]; l'ultima ala della lista vince
  // dove si sovrappongono, il resto prende altezzaBase (null = altezza OSM)
  function cuAliSplit(rest, pc) {
    const out = [];
    for (const ala of cuSolido.ali.slice().reverse()) {
      if (!Array.isArray(ala.rect) || !(Number(ala.altezza) > 0) || !rest.length) continue;
      const cut = [alaRing(ala)];
      out.push({ multi: pc.intersection(rest, cut), h: Number(ala.altezza) });
      rest = pc.difference(rest, cut);
    }
    out.push({ multi: rest, h: Number(cuSolido.altezzaBase) > 0 ? Number(cuSolido.altezzaBase) : null });
    return out;
  }
  // soletta dei cortili che hanno il pavimento in quota (il cortile nord è a circa 6 m): chiude il pozzo scavato nella sagoma
  function addCuFondi() {
    const f = cuSolido && cuFrame();
    if (!f || !buildingGroup || !cuDisegnato || officialPlanCodes.has('CU014') || !Array.isArray(cuSolido.fondi)) return;
    for (const fondo of cuSolido.fondi) {
      const quota = Number(fondo.quota);
      if (!Array.isArray(fondo.rect) || !(quota > 0.2)) continue;
      const shape = makeShape([rectRing(fondo.rect).map(f.toLL)]);
      if (!shape) continue;
      const g = new THREE.ExtrudeGeometry(shape, { depth: quota, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2); g.translate(0, 0.04, 0);
      applyRoofUVs(g); g.computeVertexNormals();
      const mats = [normalRoof, hiddenCapMaterial()]; // solo il piano superiore, con la stessa ortofoto dei tetti
      const mesh = new THREE.Mesh(g, mats);
      mesh.receiveShadow = true; mesh.userData.mats = mats; mesh.userData.cuFondo = fondo.id || true;
      mesh.userData.facadeCode = 'CU014'; mesh.userData.code = 'CU014'; // l'editor la riconosce come tetto di CU014; la planimetria la toglie con l'edificio
      buildingGroup.add(mesh);
    }
  }
  // contorno di un'ala: il poligono `poligono` ([[u, v], …]) se c'è, altrimenti il rettangolo `rect` (che resta come ingombro)
  function alaRing(ala) {
    const P = ala.poligono;
    return Array.isArray(P) && P.length >= 3 ? closeRing(P.map(([u, v]) => [Number(u), Number(v)])) : rectRing(ala.rect);
  }
  // altezza dell'ala che copre il punto (u, v) del lato 0, con la stessa regola di cuSolidoParts (l'ultima ala della lista vince)
  function cuAltezzaIn(u, v) {
    for (const ala of (cuSolido.ali || []).slice().reverse()) {
      const r = ala.rect;
      if (Array.isArray(r) && Number(ala.altezza) > 0 && u >= Math.min(r[0], r[2]) && u <= Math.max(r[0], r[2]) && v >= Math.min(r[1], r[3]) && v <= Math.max(r[1], r[3])
        && (!Array.isArray(ala.poligono) || pointInRing([u, v], alaRing(ala)))) return Number(ala.altezza);
    }
    return Number(cuSolido.altezzaBase) || 15;
  }
  // impronta del volume sopra la loggia (coordinate del lato 0): fino alla facciata ai lati, arretrato fra il primo e l'ultimo pilone.
  // La usano addCuVentaglio (volumi e soffitto) e cuSolidoParts (cornici), così le due cose combaciano.
  function cuLoggiaSopra() {
    const vent = cuSolido && cuSolido.ventaglio, B = vent && vent.balconata, Lg = vent && vent.loggia;
    if (!vent || !B || !Lg || !(Number(Lg.rInterno) > 0)) return [];
    const rf = Number(vent.raggioFacciata), ri = Number(Lg.rInterno), rc = rf - (Number(B.arretramento) || 0.4);
    const lo = Math.min(Number(Lg.a0), Number(Lg.a1)), hi = Math.max(Number(Lg.a0), Number(Lg.a1));
    const { cols, ha } = cuColonne();
    const c0 = Math.max(lo, cols[0] - ha), c1 = Math.min(hi, cols[cols.length - 1] + ha);
    return [{ r0: ri, r1: rf, b0: lo, b1: c0 }, { r0: ri, r1: rc, b0: c0, b1: c1 }, { r0: ri, r1: rf, b0: c1, b1: hi }].filter((z) => z.b1 - z.b0 > 1e-3);
  }
  // angoli dei piloni della balconata (gradi) e mezza larghezza angolare di un pilone sulla facciata
  function cuColonne() {
    const vent = cuSolido.ventaglio, B = vent.balconata, rf = Number(vent.raggioFacciata), col = B.colonne || {};
    const a0 = Math.min(Number(B.a0), Number(B.a1)), a1 = Math.max(Number(B.a0), Number(B.a1)), nc = Math.max(2, Number(col.n) || 4);
    const deg = (len) => (len / rf) * 180 / Math.PI, mg = deg(Number(col.margine) || 1.05), ha = deg((Number(col.larghezza) || 0.9) / 2), cols = [];
    for (let i = 0; i < nc; i += 1) cols.push(a0 + mg + ((a1 - a0 - 2 * mg) * i) / (nc - 1));
    return { cols, ha };
  }
  /* fronte sud a ventaglio (cu014-solido.json → ventaglio; descrizione dell'utente, foto e commenti 10 e 11 del 22/10/2026).
     Il primo piano è arretrato lungo tutto l'arco (loggia profonda 4 m fra loggia.rInterno e la facciata, fondo rivestito di
     travertino): sotto il piano terra con le sue finestre, sopra il volume dell'anfiteatro che sporge fino al filo della facciata.
     Al centro 4 piloni arancioni sul filo della facciata (salgono fino al tetto come lesene), 3 parapetti di travertino fra i piloni,
     porte a vetri sul fondo. Ai lati, per ogni scala (misure dalla scansione Scaniverse dell'utente del 23/10/2026; piloni, parapetti,
     porte e scale sono primitive dell'editor, id gin-…, generate da tools/ginestra_scale_da_scansione.py; qui la pagina costruisce
     solo la struttura e lascia i vuoti dove passano le scale):
       · prima rampa mezza dentro e mezza fuori dalla facciata, su una pedana con un gradino attorno; a fianco, verso l'edificio,
         il muro divisorio di travertino; in cima, sul lato della strada, la colonna rettangolare di travertino che regge la pensilina
         e prosegue col parapetto sotto una finestra aperta fino alla testata con la porta antipanico;
       · pensilina: fascia curva dal primo pilone della balconata alla testata, soffitto di travertino e guaina sopra;
       · pianerottolo di mezzo: svolta di 90° verso l'edificio, cancello nel varco in fondo al muro divisorio, di nuovo 90°;
       · seconda rampa sotto l'edificio, nel sottoscala aperto, che torna verso il centro e arriva alla loggia appena dopo
         il primo pilone; sopra la rampa la soletta della loggia è aperta. */
  function addCuVentaglio() {
    const f = cuSolido && cuFrame(), vent = cuSolido && cuSolido.ventaglio, B = vent && vent.balconata, Lg = vent && vent.loggia, S = vent && vent.scale;
    if (!f || !buildingGroup || !cuDisegnato || !cuSolidoUsato || officialPlanCodes.has('CU014') || !vent || !Array.isArray(vent.centro) || !B || !Lg) return;
    const C0 = vent.centro, Y0 = 0.04, rad = Math.PI / 180, deg = (len, r) => len / r / rad;
    const loc = (r, a) => [C0[0] + r * Math.cos(a * rad), C0[1] + r * Math.sin(a * rad)];
    const tag = (m) => { m.castShadow = true; m.receiveShadow = true; Object.assign(m.userData, { facadeCode: 'CU014', code: 'CU014', cuVentaglio: true }); buildingGroup.add(m); return m; };
    const coronaShape = (r0, r1, a0, a1) => makeShape([cuCorona(C0, r0, r1, Math.min(a0, a1), Math.max(a0, a1)).map(f.toLL)]);
    // settore di corona fra i raggi r0, r1 e gli angoli a0, a1, pieno dalla quota h0 alla h1 (sopra il terreno)
    const sector = (r0, r1, a0, a1, h0, h1, mat) => {
      if (!(h1 - h0 > 0.005) || !(r1 - r0 > 0.005) || Math.abs(a1 - a0) < 1e-4) return null;
      const shape = coronaShape(r0, r1, a0, a1);
      if (!shape) return null;
      const g = new THREE.ExtrudeGeometry(shape, { depth: h1 - h0, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2); g.translate(0, Y0 + h0, 0); g.computeVertexNormals(); planarUVs(g, 1);
      return tag(new THREE.Mesh(g, mat));
    };
    // intervallo angolare [lo, hi] meno i buchi: segmenti rimasti
    const minus = (lo, hi, holes) => {
      let segs = [[lo, hi]];
      for (const h of holes) {
        const a = Math.min(h[0], h[1]), b = Math.max(h[0], h[1]);
        segs = segs.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [[x, Math.max(x, a)], [Math.min(y, b), y]].filter(([p, t]) => t - p > 1e-3)));
      }
      return segs;
    };
    const trav = primitiveMaterial('travertino'), set = facadeSetFor('CU014');
    const plaster = courtOnce('cu|lesene', () => stdMat({ color: FACADE_PALETTES.cortina.wall, roughness: 0.9 }));
    const F = Number(cuSolido.interpiano) > 0 ? Number(cuSolido.interpiano) : 3.425;
    const rf = Number(vent.raggioFacciata), ri = Number(Lg.rInterno) || rf - 4, q = Number(B.quota) || 4.4;
    const a0 = Math.min(Number(B.a0), Number(B.a1)), a1 = Math.max(Number(B.a0), Number(B.a1)), lo = Math.min(Number(Lg.a0), Number(Lg.a1)), hi = Math.max(Number(Lg.a0), Number(Lg.a1));
    const { cols, ha } = cuColonne(), nc = cols.length;
    // dove passano le seconde rampe (primitive gin-…): sottoscala aperto nel piano terra e soletta della loggia aperta sopra la rampa
    const n = Math.max(4, Number(S && S.gradini) || 13), tread = Number(S && S.pedata) || 0.32;
    const [rU0, rU1] = S && Array.isArray(S.sottoscala) ? S.sottoscala.map(Number) : [rf - 1.9, rf];
    const r2m = (rU0 + rU1) / 2, G = (S && S.cancello) || {}, rg = Number(G.raggio) || rf - 0.05, gw = Number(G.larghezza) || 1.4;
    const sides = [];
    for (const lato of (S && S.lati) || []) {
      const s = Number(lato.verso) < 0 ? -1 : 1, aCol = s < 0 ? cols[0] - ha : cols[nc - 1] + ha; // bordo esterno del primo pilone
      const aP = aCol + s * deg(Number(S.arrivo) || 0.3, r2m); // arrivo della seconda rampa, appena prima del pilone
      const aF2 = aP + s * deg((n - 1) * tread, r2m); // piede della seconda rampa = inizio del cancello
      const aG1 = aF2 + s * deg(gw, rg); // fine del cancello: il sottoscala va dall'arrivo della rampa fin qui
      sides.push({ aP, aF2, aG1 });
    }
    // piano terra sotto la loggia (finestre del basamento), senza il sottoscala aperto delle scale
    const baseBand = (r0, r1, b0, b1) => {
      if (r1 - r0 < 0.05 || Math.abs(b1 - b0) < 1e-3) return; // sottoscala largo quanto la loggia: niente piano terra lì
      const shape = coronaShape(r0, r1, b0, b1);
      if (!shape) return;
      const g = new THREE.ExtrudeGeometry(shape, { depth: q - 0.15, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2); g.translate(0, Y0, 0); applyRoofUVs(g); applyWallUVs(g, Y0, FACADE_BAY, q); g.computeVertexNormals();
      const mats = [hiddenCapMaterial(), set.base], m = tag(new THREE.Mesh(g, mats));
      Object.assign(m.userData, { mats, kind: 'base', y0: Y0, floorH: q });
    };
    baseBand(ri, rU0, lo, hi);
    for (const [x, y] of minus(lo, hi, sides.map((d) => [d.aP, d.aG1]))) baseBand(rU0, rf, x, y);
    // pavimento della loggia in travertino, aperto sopra le seconde rampe
    sector(ri, rU0, lo, hi, q - 0.15, q, trav);
    for (const [x, y] of minus(lo, hi, sides.map((d) => [d.aP, d.aG1]))) sector(rU0, rf, x, y, q - 0.15, q, trav); // aperta sopra rampe e pianerottolo (sopra c'è la pensilina)
    // fondo e testate della loggia rivestiti di travertino; soffitto a quota unica, solo sotto il volume di sopra (niente lastre che sporgono)
    const sopra = cuLoggiaSopra(), eL = deg(0.05, rf);
    sector(ri, ri + 0.05, lo, hi, q, q + F, trav);
    sector(ri + 0.05, rf, lo, lo + eL, q, q + F, trav); sector(ri + 0.05, rf, hi - eL, hi, q, q + F, trav);
    for (const z of sopra) sector(ri + 0.05, z.r1, Math.max(z.b0, lo + eL), Math.min(z.b1, hi - eL), q + F - 0.06, q + F, plaster);
    // volume sopra la loggia alle quote delle ali: fino alla facciata ai lati, arretrato fra i piloni al centro
    const upper = (r0, r1, b0, b1) => {
      if (Math.abs(b1 - b0) < 1e-3) return;
      for (const { multi, h } of cuAliSplit([[cuCorona(C0, r0, r1, b0, b1)]], window.polygonClipping)) {
        if (!(h > q + F + 0.3)) continue;
        const pieces = cuPieces(h);
        for (const poly of multi) {
          if (!poly.length || polyArea(poly[0]) < 0.05) continue;
          const shape = makeShape(poly.map((r) => r.map(f.toLL)));
          if (!shape) continue;
          pieces.forEach((p, k) => {
            const lo2 = Math.max(p.y0, q + F), hi2 = p.y0 + p.h;
            if (!(hi2 - lo2 > 0.01)) return;
            const g = new THREE.ExtrudeGeometry(shape, { depth: hi2 - lo2, bevelEnabled: false, curveSegments: 1 });
            g.rotateX(-Math.PI / 2); g.translate(0, Y0 + lo2, 0); applyRoofUVs(g);
            if (p.kind !== 'attic') applyWallUVs(g, Y0 + p.y0, FACADE_BAY, p.floorH);
            g.computeVertexNormals();
            const mats = [k === pieces.length - 1 ? normalRoof : hiddenCapMaterial(), set[p.kind]], m = tag(new THREE.Mesh(g, mats));
            Object.assign(m.userData, { mats, kind: p.kind, y0: Y0 + p.y0, floorH: p.kind === 'attic' ? p.h : p.floorH });
          });
        }
      }
    };
    for (const z of sopra) upper(z.r0, z.r1, z.b0, z.b1); // il primo pilone è a filo con la facciata dei lati
    // piloni, parapetti, porte, scale, pensiline, piloni di travertino, cancelli e staccionate sono primitive dell'editor
    // (cortile/chimica-esterni.json → primitive, id gin-…): l'utente li sposta e li modifica. Qui restano i vuoti e la struttura.
  }
  // Sagoma meno i cortili/pozzi di luce: differenza booleana, così ogni cortile diventa un vuoto chiuso (pareti su tutti i lati) anche se tocca il bordo.
  function shapesFor(rings, holes) {
    const plain = () => { const s = makeShape(holes.length ? rings.concat(holes) : rings); return s ? [s] : []; };
    if (!holes.length) return plain();
    const pc = window.polygonClipping;
    if (!pc || typeof pc.difference !== 'function') return plain();
    try {
      const subject = rings.map(closeRing).filter((r) => r.length >= 4);
      const cuts = holes.map((h) => [closeRing(h)]).filter((q) => q[0].length >= 4);
      const result = pc.difference(subject, ...cuts);
      return result.map((poly) => makeShape(poly)).filter(Boolean);
    } catch (_) { return plain(); }
  }
  function addCodedShape(shape, feature, props, code, b, heightOverride, y0Sotto = 0) {
    let rawHeight = b?.height || props.height;
    let rawLevels = b?.levels || props['building:levels'];
    if (heightOverride > 0) rawHeight = heightOverride; // ala a quota propria (cu014-solido.json)
    const height = heightInfo({ height: rawHeight, levels: rawLevels }).value;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0.04, 0);
    // ExtrudeGeometry uses material 0 for caps and 1 for walls.
    const set = facadeSetFor(code);
    const levelCount = Number(String(rawLevels ?? '').replace(',', '.'));
    let pieceList = heightOverride > 0 ? cuPieces(height) : buildingPieces(height, levelCount);
    if (y0Sotto > 0) { // sopra un passaggio coperto: i pezzi partono dalla quota del soffitto, che si vede da sotto
      pieceList = pieceList.filter((p) => p.y0 + p.h > y0Sotto + 0.01).map((p) => (p.y0 < y0Sotto ? { ...p, y0: y0Sotto, h: p.y0 + p.h - y0Sotto } : p));
      const cg = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 1 });
      cg.rotateX(-Math.PI / 2); cg.translate(0, 0.04 + y0Sotto - 0.06, 0); cg.computeVertexNormals(); planarUVs(cg, 2);
      const ceil = new THREE.Mesh(cg, courtOnce('soffitto passaggio', () => stdMat({ color: '#d9d3c8', roughness: 0.9 })));
      ceil.receiveShadow = true; buildingGroup.add(ceil);
    }
    for (const [pieceIndex, piece] of pieceList.entries()) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: piece.h, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.04 + piece.y0, 0);
      applyRoofUVs(g);
      if (piece.kind !== 'attic') applyWallUVs(g, 0.04 + piece.y0, FACADE_BAY, piece.floorH);
      g.computeVertexNormals();
      // un solo tetto: i volumi intermedi (basamento, corpo) hanno solo le pareti, niente coperchi a metà altezza
      const mats = [pieceIndex === pieceList.length - 1 ? normalRoof : hiddenCapMaterial(), set[piece.kind]];
      const mesh = new THREE.Mesh(g, mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.mats = mats;
      Object.assign(mesh.userData, { facadeCode: code, kind: piece.kind, y0: 0.04 + piece.y0, floorH: piece.kind === 'attic' ? piece.h : piece.floorH });
      mesh.userData.code = b ? code : '';
      mesh.userData.osmId = props.osm_id || feature.id || '';
      buildingGroup.add(mesh);
      if (b) {
        pickables.push(mesh);
        if (!activeCodeMeshes.has(code)) activeCodeMeshes.set(code, []);
        activeCodeMeshes.get(code).push(mesh);
      }
    }
    if (b) {
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), new THREE.LineBasicMaterial({ color: 0x822433, transparent: true, opacity: 0.94 }));
      outline.visible = false;
      outline.position.y = 0.025;
      outline.userData.code = code;
      buildingGroup.add(outline);
      if (!activeCodeOutlines.has(code)) activeCodeOutlines.set(code, []);
      activeCodeOutlines.get(code).push(outline);
    }
  }
  function buildScene(context) {
    const texture = createOrthoTexture();
    photoTexture = texture;
    scene = new THREE.Scene();
    const skyCanvas = document.createElement('canvas'); skyCanvas.width = 4; skyCanvas.height = 256;
    const skyCtx = skyCanvas.getContext('2d');
    const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
    skyGrad.addColorStop(0, '#86afd6'); skyGrad.addColorStop(0.5, '#c4d8ea'); skyGrad.addColorStop(1, '#e9e4df');
    skyCtx.fillStyle = skyGrad; skyCtx.fillRect(0, 0, 4, 256);
    const skyTexture = new THREE.CanvasTexture(skyCanvas); skyTexture.encoding = THREE.sRGBEncoding;
    scene.background = skyTexture;
    scene.fog = new THREE.Fog(0xe9e4df, 1900, 4200);
    camera = new THREE.PerspectiveCamera(48, 1, 0.5, 6000);
    camera.position.set(0, 850, 1050);
    createGround(context);
    createMaterials(roofTexture);
    buildingGroup = new THREE.Group(); buildingGroup.name = 'edifici';
    scene.add(buildingGroup);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x82776c, 0.72));
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    const sun = new THREE.DirectionalLight(0xfff4e8, 0.95);
    sun.position.set(-mapWidth * 0.35, 620, mapDepth * 0.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -mapWidth * 0.8;
    sun.shadow.camera.right = mapWidth * 0.8;
    sun.shadow.camera.top = mapDepth * 0.8;
    sun.shadow.camera.bottom = -mapDepth * 0.8;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 1800;
    sun.shadow.bias = -0.0002;
    sun.shadow.radius = 4;
    scene.add(sun);
    const lookup = new Map(buildings.map((b) => [b.code.toUpperCase(), b]));
    for (const feature of context.features || []) {
      const geometry = feature.geometry;
      if (!geometry) continue;
      if (geometry.type === 'Polygon') for (const r of carveCourtyard(geometry.coordinates)) addPolygon(feature, r, lookup);
      else if (geometry.type === 'MultiPolygon') for (const polygon of geometry.coordinates) for (const r of carveCourtyard(polygon)) addPolygon(feature, r, lookup);
    }
    addCuFondi();
    addCuVentaglio();
    flushContextBuckets();
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    mapHost.replaceChildren(renderer.domElement);
    mapHost.setAttribute('aria-label', 'Scena 3D locale con ortofoto AGEA ed estrusioni indicative OpenStreetMap');
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 4;
    controls.maxDistance = 3000;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI / 2.04;
    controls.screenSpacePanning = true;
    controls.addEventListener('start', stopTour);
    controls.addEventListener('change', () => scheduleTiles());
    controls.update();
    mapHost.addEventListener('wheel', onWheelZoom, { capture: true, passive: false });
    renderer.domElement.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const r = renderer.domElement.getBoundingClientRect(); cursorNdc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); });
    renderer.domElement.addEventListener('pointerleave', () => { cursorNdc = null; });
    const typing = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    window.addEventListener('keydown', (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) { orbitKeys.clear(); return; } // ⌘ tenuto: i keyup degli altri tasti non arrivano
      if (frameHook || currentView !== '3d' || typing(event.target) || !/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(event.code)) return;
      orbitKeys.add(event.code);
      if (!/^Shift/.test(event.code)) { event.preventDefault(); stopTour(); stopCameraFlight(); }
    });
    window.addEventListener('keyup', (event) => orbitKeys.delete(event.code));
    window.addEventListener('blur', () => orbitKeys.clear());
    // tasti 1–9: velocità di zoom, rotazione, spostamento e WASD nella vista libera e nell'editor (in Cammina li usa cammina.js)
    window.addEventListener('keydown', (event) => {
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
      if (!m || frameHook || currentView !== '3d' || typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      setNavSpeed(Number(m[1])); event.preventDefault();
    });
    // trascinamento rimasto «attaccato» (rilascio fuori dalla scena, finestra persa, clic su un pulsante sopra): chiudi il gesto di OrbitControls
    const releaseDrag = (e) => { if (e && e.type === 'pointermove' && e.buttons) return; renderer.domElement.ownerDocument.dispatchEvent(new PointerEvent('pointerup', { pointerId: (e && e.pointerId) || 1, pointerType: (e && e.pointerType) || 'mouse', button: 0, bubbles: true })); };
    window.addEventListener('blur', releaseDrag);
    window.addEventListener('pointercancel', releaseDrag);
    window.addEventListener('mouseup', releaseDrag, true);
    renderer.domElement.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !e.buttons && controls && controls.enabled) releaseDrag(e); });
    setNavSpeed(navSpeed, true);
    if (pendingCamera) {
      const command = pendingCamera; pendingCamera = null;
      if (command.action === 'fit') flyTo(campusCentroid(), campusFitDistance(), 0);
      else if (command.action === 'zoom') camera.position.lerp(controls.target, 1 - (1 / Math.max(0.2, Number(command.factor) || 1)));
    }
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down = null;
    renderer.domElement.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      down = { x: event.clientX, y: event.clientY };
    });
    renderer.domElement.addEventListener('pointerup', (event) => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) { down = null; return; }
      down = null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickables, false).find((h) => !((h.object.userData.minervaPart || h.object.userData.fountainPart) && extrasGroup && !extrasGroup.visible));
      if (hit?.object.userData.minervaPart) { bounceMinerva(); return; }
      if (hit?.object.userData.fountainPart) { let h = hit.object; while (h && !h.userData.fountain) h = h.parent; const on = selectFountain(h); showGuest(false); if (embedded) notifyParent('campus-fountain', { on }); return; }
      if (fountainSel) { selectFountain(null); if (embedded) notifyParent('campus-fountain', { on: false }); }
      if (hit?.object.userData.guest) { showGuest(true); if (embedded) notifyParent('campus-guest', { name: CNR.name, note: CNR.note }); return; }
      showGuest(false);
      if (hit?.object.userData.code) selectBuilding(hit.object.userData.code);
    });
    setupFogClick();
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      fallbackToPhoto('La scena 3D è stata interrotta dal browser; continua con l’ortofoto AGEA e le impronte.');
    });
    updateSelectionMaterials();
    setBuildingVisibility(showBuildings);
    setAerial(showAerial);
    resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resizeRenderer) : null;
    if (resizeObserver) resizeObserver.observe(mapHost);
    else window.addEventListener('resize', resizeRenderer);
    document.addEventListener('visibilitychange', handleVisibility);
    handleVisibility();
    if (latestParentContext?.plan?.features) buildPlanLayer(latestParentContext.plan);
    loadHighResOrtho();
    addTrees();
    loadCourtyardModel();
    loadChemistryExteriors();
  }
  /* ---------- cortile di Chimica: modello minimale ricostruito (la scansione serve solo da riferimento) ---------- */
  function canvasTex(w, h, draw, ru = 1, rv = 1, alpha = false) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ru, rv);
    if (!alpha) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }
  function sanpietriniTex(meters) {
    // tessera di 2 × 2 m, posa a ventaglio come nelle foto del cortile
    return canvasTex(512, 512, (ctx, w) => {
      const px = w / 2;
      ctx.fillStyle = '#4f4a45'; ctx.fillRect(0, 0, w, w);
      let k = 0;
      for (let row = -1; row <= 5; row += 1) {
        const y = row * 0.5, shift = (row % 2 + 2) % 2 ? 0.5 : 0;
        for (let x = -1 + shift; x <= 3; x += 1) {
          for (let r = 0.1; r < 0.98; r += 0.105) {
            const n = Math.max(3, Math.floor((Math.PI * r) / 0.105));
            for (let i = 0; i < n; i += 1) {
              const a = Math.PI * (i + 0.5) / n, cx = (x + Math.cos(a) * r) * px, cy = (y + 1 - Math.sin(a) * r) * px;
              const v = 0.86 + 0.28 * hash01(k++, 21);
              ctx.fillStyle = `rgb(${Math.round(112 * v)},${Math.round(106 * v)},${Math.round(99 * v)})`;
              ctx.save(); ctx.translate(cx, cy); ctx.rotate(-a + Math.PI / 2);
              ctx.fillRect(-0.046 * px, -0.046 * px, 0.092 * px, 0.092 * px); ctx.restore();
            }
          }
        }
      }
    }, meters / 2, meters / 2);
  }
  function travertineTex(ru, rv, dirty = 0.25) {
    // lastre 1,2 × 0,6 m, venature orizzontali e colature (tessera 2,4 × 2,4 m)
    return canvasTex(512, 512, (ctx, w) => {
      noiseFill(ctx, w, w, '#d6cab3', '#bfb197', 3500);
      for (let i = 0; i < 90; i += 1) {
        ctx.fillStyle = `rgba(150,130,100,${0.08 + 0.12 * hash01(i, 31)})`;
        ctx.fillRect(0, hash01(i, 32) * w, w, 1 + 2 * hash01(i, 33));
      }
      ctx.fillStyle = 'rgba(90,75,60,.45)';
      for (let y = 0, r = 0; y < w; y += w / 4, r += 1) {
        ctx.fillRect(0, y, w, 1.5);
        for (let x = r % 2 ? 0 : w / 4; x < w; x += w / 2) ctx.fillRect(x, y, 1.5, w / 4);
      }
      const g = ctx.createLinearGradient(0, w * 0.55, 0, w);
      g.addColorStop(0, 'rgba(60,55,45,0)'); g.addColorStop(1, `rgba(60,55,45,${dirty})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
      stains(ctx, w, w, 77);
    }, ru, rv);
  }
  function soilTex() {
    return canvasTex(256, 256, (ctx, w) => {
      noiseFill(ctx, w, w, '#5b4838', '#3e3027', 2500);
      for (let i = 0; i < 160; i += 1) { // foglie di magnolia cadute
        ctx.save(); ctx.translate(hash01(i, 41) * w, hash01(i, 42) * w); ctx.rotate(hash01(i, 43) * Math.PI);
        const t = hash01(i, 44); ctx.fillStyle = t > 0.85 ? '#3f5a34' : t > 0.4 ? '#8b6a42' : '#a88452';
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }, 2, 2);
  }
  function wireMeshTex(color = 'rgba(50,95,62,1)') {
    return canvasTex(64, 64, (ctx, w) => {
      ctx.clearRect(0, 0, w, w); ctx.strokeStyle = color; ctx.lineWidth = 2;
      for (let p = 0; p <= w; p += 16) { ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, w); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke(); }
    }, 1, 1, true);
  }
  function lumpyGeometry(seed) {
    const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const f = 0.8 + 0.32 * hash01(Math.round(p.getX(i) * 53 + p.getY(i) * 71 + p.getZ(i) * 97) + seed, 3);
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
    }
    g.computeVertexNormals();
    return g;
  }
  let courtyardFrame = null;
  let courtyardHoles = {};
  async function loadCourtyardFrame() {
    try {
      const [g, m] = await Promise.all([fetch('scan/scan-georef.json'), fetch('cortile/modello.json')]);
      if (!g.ok || !m.ok) return null;
      const geo = await g.json(), M = await m.json();
      const o = project(geo.originLonLat), y = geo.yawDeg * Math.PI / 180, a = M.riferimento.angoloDeg * Math.PI / 180;
      const [sx, sy] = M.riferimento.origine, cy = Math.cos(y), sy_ = Math.sin(y), ca = Math.cos(a), sa = Math.sin(a);
      // locale (u, v) del cortile <-> metri della mappa (x est, n nord)
      const toLocal = ([x, n]) => { const dx = x - o.x, dn = n - o.n, X = cy * dx + sy_ * dn - sx, Y = -sy_ * dx + cy * dn - sy; return [ca * X + sa * Y, -sa * X + ca * Y]; };
      const toMap = ([u, v]) => { const X = sx + u * ca - v * sa, Y = sy + u * sa + v * ca; return [cy * X - sy_ * Y + o.x, sy_ * X + cy * Y + o.n]; };
      return { geo, M, toLocal, toMap };
    } catch (_) { return null; }
  }
  // Le sagome OSM attorno al cortile non coincidono con la scansione: aggiungi i pieni (facciate portate a filo del cortile)
  // e sottrai il vuoto del cortile (dalla strada alla fronte del portico).
  function carveCourtyard(rings) {
    const f = courtyardFrame;
    if (!f || !Array.isArray(f.M.vuoti)) return [rings];
    let local = closeRing(rings[0]).slice(0, -1).map((p) => { const w = project(p); return f.toLocal([w.x, w.n]); });
    let touched = false;
    const pc = window.polygonClipping;
    for (const [u0, v0, u1, v1] of (pc && f.M.pieni) || []) {
      const us = local.map((q) => q[0]), vs = local.map((q) => q[1]);
      if (Math.max(...us) < u0 || Math.min(...us) > u1 || Math.max(...vs) < v0 || Math.min(...vs) > v1) continue;
      try {
        // solo se il pieno tocca la sagoma: l'unione deve restare un unico poligono
        const merged = pc.union([local.concat([local[0]])], [[[u0, v0], [u1, v0], [u1, v1], [u0, v1], [u0, v0]]]);
        if (merged.length === 1) { local = merged[0][0].slice(0, -1); touched = true; }
      } catch (_) { /* sagoma invariata */ }
    }
    let pieces = [local];
    for (const [u0, v0, u1, v1] of f.M.vuoti) {
      pieces = pieces.flatMap((poly) => {
        const us = poly.map((q) => q[0]), vs = poly.map((q) => q[1]);
        if (Math.max(...us) <= u0 || Math.min(...us) >= u1 || Math.max(...vs) <= v0 || Math.min(...vs) >= v1) return [poly];
        touched = true;
        return subtractRect(poly, [u0, v0, u1, v1]).filter((piece) => polyArea(piece) > 2);
      });
    }
    if (!touched) return [rings];
    return pieces.map((piece) => {
      const ring = piece.map((q) => { const [x, n] = f.toMap(q); return [(x + mapWidth / 2) / metersPerLon + bounds.west, (n + mapDepth / 2) / metersPerLat + bounds.south]; });
      ring.push(ring[0]);
      return [ring];
    });
  }
  /* ---------- Vecchio Edificio di Chimica: terrazza, area bianca, pergolato, scale antincendio ---------- */
  let travertineTexBase = null;
  const travertineClones = [], travertineNormalClones = [];
  let travertineNormalBase = null;
  function travertineNormal(metersPerTile = 2.4) {
    if (!travertineNormalBase) {
      travertineNormalBase = new THREE.TextureLoader().load('tex/travertino_NRM_1k.jpg', (tex) => { for (const c of travertineNormalClones) { c.image = tex.image; c.needsUpdate = true; } });
      travertineNormalBase.wrapS = travertineNormalBase.wrapT = THREE.RepeatWrapping;
    }
    const t = travertineNormalBase.clone(); travertineNormalClones.push(t);
    if (travertineNormalBase.image) t.needsUpdate = true;
    t.repeat.set(1 / metersPerTile, 1 / metersPerTile);
    return t;
  }
  function travertinePhoto(metersPerTile = 2.4) {
    if (!travertineTexBase) {
      travertineTexBase = new THREE.TextureLoader().load('tex/travertino_COL_1k.jpg', (tex) => { for (const c of travertineClones) { c.image = tex.image; c.needsUpdate = true; } });
      travertineTexBase.encoding = THREE.sRGBEncoding;
      travertineTexBase.wrapS = travertineTexBase.wrapT = THREE.RepeatWrapping;
      travertineTexBase.anisotropy = 8;
    }
    const t = travertineTexBase.clone(); travertineClones.push(t);
    if (travertineTexBase.image) t.needsUpdate = true;
    t.repeat.set(1 / metersPerTile, 1 / metersPerTile);
    return t;
  }
  function sideFrame(ring, index) {
    const a = project(ring[index]), b = project(ring[index + 1]);
    const len = Math.hypot(b.x - a.x, b.n - a.n), tx = (b.x - a.x) / len, tn = (b.n - a.n) / len;
    const g = new THREE.Group();
    g.position.set(a.x, 0.03, -a.n);
    g.rotation.y = Math.atan2(tn, tx); // locale: X = u lungo il lato, Y = alto, Z = −v (v verso l'esterno)
    return g;
  }
  function planarUVs(geometry, s) {
    // UV in metri: facce orizzontali proiettate dall'alto, pareti lungo il muro
    const pos = geometry.attributes.position, nor = geometry.attributes.normal, uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i += 1) {
      const ny = Math.abs(nor.getY(i)), nx = Math.abs(nor.getX(i));
      if (ny > 0.7) uv.setXY(i, pos.getX(i) / s, pos.getZ(i) / s);
      else uv.setXY(i, (nx > 0.7 ? pos.getZ(i) : pos.getX(i)) / s, pos.getY(i) / s);
    }
    uv.needsUpdate = true;
  }
  function localSlab(points, h0, h1, material) {
    const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: h1 - h0, bevelEnabled: false, curveSegments: 24 });
    g.rotateX(-Math.PI / 2); g.translate(0, h0, 0); // (u, v) -> (X, −Z), estrusione verso l'alto
    g.computeVertexNormals(); planarUVs(g, 1);
    const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  // foglie di vite / edera: foto (ambientCG LeafSet029, CC0, vedi tex/ATTRIBUTION.md) = atlante 3 × 3 di foglie con mappa di opacità separata;
  // si ripete a tessere, ogni foglia sta dentro la sua cella 1/3 × 1/3
  function leafTexs() {
    const ld = new THREE.TextureLoader(), set = (t, col) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (col) t.encoding = THREE.sRGBEncoding; return t; };
    return { map: set(ld.load('tex/vite_LeafSet029_COL_1k.jpg'), true), alpha: set(ld.load('tex/vite_LeafSet029_OPA_1k.jpg'), false) };
  }
  // la densità del fogliame (attributo per vertice `dens`, 0..1) decide quali foglie dell'atlante restano: ogni cella ha un valore casuale fisso
  // e sparisce se supera la densità; così le foglie sono intere e nei vuoti si vede attraverso (e la luce passa anche nella mappa delle ombre)
  function leafPatch(shader) {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float dens;\nvarying float vDens;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDens = dens;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDens;\nfloat leafH(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }')
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nif (leafH(floor(vUv * 3.0)) > vDens) discard;');
  }
  // lastre irregolari di pietra grigia (opus incertum): celle di Voronoi con giunti scuri, senza giunte ai bordi della texture
  function opusTex() {
    return canvasTex(256, 256, (ctx, w) => {
      const N = 7, seeds = [];
      for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) seeds.push([(i + 0.15 + 0.7 * hash01(j * N + i, 61)) * w / N, (j + 0.15 + 0.7 * hash01(j * N + i, 62)) * w / N, 112 + 46 * hash01(j * N + i, 63)]);
      const img = ctx.createImageData(w, w);
      for (let y = 0; y < w; y += 1) for (let x = 0; x < w; x += 1) {
        let d1 = 1e9, d2 = 1e9, k = 0;
        for (let s = 0; s < seeds.length; s += 1) {
          let dx = Math.abs(x - seeds[s][0]), dy = Math.abs(y - seeds[s][1]);
          if (dx > w / 2) dx = w - dx;
          if (dy > w / 2) dy = w - dy;
          const d = Math.hypot(dx, dy);
          if (d < d1) { d2 = d1; d1 = d; k = s; } else if (d < d2) d2 = d;
        }
        const joint = d2 - d1 < 2.6, g = joint ? 70 : seeds[k][2] + 8 * Math.sin(x * 0.31 + y * 0.17) * hash01(x + y * w, 65), o = (y * w + x) * 4;
        img.data[o] = g; img.data[o + 1] = g + (joint ? 0 : 2); img.data[o + 2] = g + (joint ? 1 : 5); img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    });
  }
  function addFireStair(group, uc, floors, mat, opts = {}) {
    // scala metallica aperta (rilievo Scaniverse del 16/10/2026, facciata ovest): rampe a forbice parallele al muro,
    // pianerottoli a tutta larghezza alle due estremità con gli angoli arrotondati, ringhiere a bacchette alte 1 m,
    // montanti sull'asse. Quote misurate: mezzo piano a destra, piano a sinistra, alternati.
    const L = Number(opts.lunghezza) || 8.4, W = Number(opts.larghezza) || 4.3, gap = Number(opts.distacco) || 0.5;
    const [dl, dr] = Array.isArray(opts.pianerottoli) ? opts.pianerottoli : [2.8, 1.9];
    const rc = Math.min(1.2, W / 2 - 0.1), railH = 1.0, tread = opts.pedate || mat;
    const u0 = uc - L / 2, u1 = uc + L / 2, v0 = gap, v1 = gap + W, vc = (v0 + v1) / 2, uA = u0 + dl, uB = u1 - dr;
    let levels = Array.isArray(opts.quote) ? opts.quote.map(Number) : null;
    if (!levels) {
      levels = [];
      for (let k = 1, prev = 0; k <= floors; k += 1) { const f = 5.25 + 3.95 * (k - 1); levels.push((prev + f) / 2, f); prev = f; }
    }
    levels = [0].concat(levels);
    const top = levels[levels.length - 1];
    const bars = [], tubes = [];
    const tube = (a, b, r = 0.03) => tubes.push([a, b, r]);
    // ringhiera lungo una polilinea (u, v, h): corrimano, corrente basso e bacchette verticali ogni 12 cm
    const railing = (pts) => {
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [ua, va, ha] = pts[i], [ub, vb, hb] = pts[i + 1];
        tube([ua, va, ha + railH], [ub, vb, hb + railH]); tube([ua, va, ha + 0.1], [ub, vb, hb + 0.1], 0.02);
        const len = Math.hypot(ub - ua, vb - va), n = Math.max(1, Math.round(len / 0.12));
        for (let k = 0; k < n; k += 1) { const t = k / n; bars.push([ua + (ub - ua) * t, va + (vb - va) * t, ha + (hb - ha) * t + 0.1]); }
      }
    };
    // contorno di un'estremità: dal bordo del pianerottolo lungo il lato esterno, attorno agli angoli arrotondati, fino al lato muro
    const endOutline = (end, h) => {
      const uEnd = end < 0 ? u0 : u1, uEdge = end < 0 ? uA : uB, sweep = end < 0 ? 1 : -1, pts = [[uEdge, v1, h]];
      for (const [cv, a0] of [[v1 - rc, Math.PI / 2], [v0 + rc, end < 0 ? Math.PI : 0]]) {
        for (let i = 0; i <= 6; i += 1) { const a = a0 + sweep * (i / 6) * Math.PI / 2; pts.push([uEnd - end * rc + rc * Math.cos(a), cv + rc * Math.sin(a), h]); }
      }
      pts.push([uEdge, v0, h]);
      return pts;
    };
    levels.forEach((h, j) => {
      if (j === 0) return;
      const end = j % 2 ? 1 : -1, outline = endOutline(end, h);
      group.add(localSlab(outline.map(([u, v]) => [u, v]), h - 0.12, h, tread));
      railing(outline.slice(0, -1)); // verso il muro resta aperto (porta)
    });
    // rampe: dal livello j al j+1, alternate sui due lati dell'asse (pari verso il muro, dispari all'esterno)
    for (let j = 0; j < levels.length - 1; j += 1) {
      const h0 = levels[j], h1 = levels[j + 1], rise = h1 - h0, n = Math.max(3, Math.round(rise / 0.18));
      const dir = j % 2 ? -1 : 1, ua = j === 0 ? u0 + 0.6 : (dir > 0 ? uA : uB), ub = dir > 0 ? uB : uA;
      const [va, vb] = j % 2 ? [vc + 0.05, v1 - 0.05] : [v0 + 0.05, vc - 0.05];
      const run = (ub - ua) / n;
      for (let i = 0; i < n; i += 1) {
        const x0 = ua + run * i, x1 = x0 + run, hh = h0 + rise * (i + 1) / n;
        group.add(localSlab([[Math.min(x0, x1), va + 0.06], [Math.max(x0, x1), va + 0.06], [Math.max(x0, x1), vb - 0.06], [Math.min(x0, x1), vb - 0.06]], hh - 0.05, hh, tread));
      }
      for (const vv of [va + 0.03, vb - 0.03]) { // cosciali
        const s = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(ub - ua, rise), 0.22, 0.06), mat);
        s.position.set((ua + ub) / 2, (h0 + h1) / 2 - 0.08, -vv); s.rotation.z = Math.atan2(rise, ub - ua); s.castShadow = true; group.add(s);
      }
      railing([[ua, j % 2 ? vb : va, h0], [ub, j % 2 ? vb : va, h1]]);
      railing([[ua, j % 2 ? va : vb, h0], [ub, j % 2 ? va : vb, h1]]);
    }
    // montanti sull'asse ai bordi dei pianerottoli e alle estremità
    for (const u of [uA, uB, u0 + 0.35, u1 - 0.35]) group.add(localSlab([[u - 0.07, vc - 0.07], [u + 0.07, vc - 0.07], [u + 0.07, vc + 0.07], [u - 0.07, vc + 0.07]], 0, top + railH, mat));
    // bacchette e tubi in istanze (una sola chiamata di disegno per tipo)
    const barGeo = new THREE.BoxGeometry(0.018, railH - 0.1, 0.018); barGeo.translate(0, (railH - 0.1) / 2, 0);
    const barMesh = new THREE.InstancedMesh(barGeo, mat, bars.length), m4 = new THREE.Matrix4();
    bars.forEach(([u, v, h], i) => { m4.makeTranslation(u, h, -v); barMesh.setMatrixAt(i, m4); });
    barMesh.castShadow = true; group.add(barMesh);
    const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 6); tubeGeo.rotateZ(Math.PI / 2); tubeGeo.translate(0.5, 0, 0);
    const tubeMesh = new THREE.InstancedMesh(tubeGeo, mat, tubes.length), q = new THREE.Quaternion(), sc = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3(), xAxis = new THREE.Vector3(1, 0, 0);
    tubes.forEach(([a, b, r], i) => {
      from.set(a[0], a[2], -a[1]); to.set(b[0], b[2], -b[1]);
      const d = to.clone().sub(from), len = d.length();
      q.setFromUnitVectors(xAxis, d.normalize()); sc.set(len, r, r); m4.compose(from, q, sc); tubeMesh.setMatrixAt(i, m4);
    });
    tubeMesh.castShadow = true; group.add(tubeMesh);
  }
  const travCache = new Map(), courtMatCache = new Map();
  // libera le geometrie di un gruppo rimosso (materiali e texture sono condivisi o piccoli)
  function disposeTree(root) { root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  let exteriorsCfg = null;
  async function loadChemistryExteriors() {
    try { const r = await fetch('cortile/chimica-esterni.json', { cache: 'no-store' }); if (!r.ok) return; exteriorsCfg = await r.json(); } catch (_) { return; }
    buildChemistryExteriors();
    if (courtyardModel && (exteriorsCfg.primitive || []).some((p) => p.cornice === 'cortile')) loadCourtyardModel(); // il cortile era già pronto
  }
  // ricostruibile: l'editor sul posto cambia exteriorsCfg e chiama di nuovo questa funzione
  // materiali riusati fra una ricostruzione e l'altra: l'editor ricostruisce spesso e ogni texture nuova va ricaricata sulla GPU
  function travPhoto(s = 2.4) { if (!travCache.has(s)) travCache.set(s, new THREE.MeshStandardMaterial({ map: travertinePhoto(s), normalMap: travertineNormal(s), roughness: 0.8 })); return travCache.get(s); }
  const stdMat = (o) => { if (o.color !== undefined) o.color = new THREE.Color(o.color).convertSRGBToLinear(); return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, o)); };
  const courtOnce = (k, make) => { if (!courtMatCache.has(k)) courtMatCache.set(k, make()); return courtMatCache.get(k); };
  const plainMat = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).convertSRGBToLinear(), roughness: r, metalness: m });
  const rectPts = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  // pezzi nelle coordinate locali di un gruppo (X = u, Y = h, Z = −v)
  function partAdder(grp) {
    const add = (geom, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; grp.add(m); return m; };
    const box = (u0, u1, h0, h1, v0, v1, mat) => add(new THREE.BoxGeometry(u1 - u0, h1 - h0, v1 - v0), mat, (u0 + u1) / 2, (h0 + h1) / 2, -(v0 + v1) / 2);
    return { add, box };
  }
  // rotazione libera di un oggetto dell'editor (campo `angolo` del dato, gradi, positivo = antiorario visto dall'alto) attorno al perno (cu, cv):
  // restituisce il gruppo in cui costruire l'oggetto con le sue coordinate normali (senza angolo è il genitore stesso)
  function turned(parent, obj, cu, cv, key = 'angolo') {
    const a = Number(obj && obj[key]) || 0;
    if (!a) return parent;
    const piv = new THREE.Group(), inner = new THREE.Group();
    piv.position.set(cu, 0, -cv); piv.rotation.y = (a * Math.PI) / 180; inner.position.set(-cu, 0, cv);
    piv.add(inner); parent.add(piv);
    return inner;
  }
  // acciaio verniciato marrone ruggine delle scale antincendio, come nel rilievo (non ocra: niente pareti piene)
  let stairMats = null;
  function fireStairMats() {
    if (!stairMats) stairMats = { ocra: plainMat(0xd9a640, 0.55, 0.3), ocraScura: plainMat(0xb88a35, 0.7, 0.2) }; // giallo ocra scuro come all'inizio (31/10)
    return stairMats;
  }
  // panchine in travertino: una lastra orizzontale che sporge oltre due lastre verticali, rientrate poco prima delle estremità
  function addBench(g, p, h) {
    const L = Number(p.lunghezza) || 2.2, D = Number(p.profondita) || 0.45, T = 0.12, seatY = Number(p.altezza) || 0.42, inset = Number(p.rientro) || 0.28;
    const alongV = p.orienta === 'v', trav = travPhoto(1.2);
    const bu0 = p.u - (alongV ? D : L) / 2, bu1 = p.u + (alongV ? D : L) / 2, bv0 = p.v - (alongV ? L : D) / 2, bv1 = p.v + (alongV ? L : D) / 2;
    g.add(localSlab([[bu0, bv0], [bu1, bv0], [bu1, bv1], [bu0, bv1]], h + seatY - T, h + seatY, trav));
    if (alongV) for (const lv of [bv0 + inset, bv1 - inset - T]) g.add(localSlab([[bu0 + 0.03, lv], [bu1 - 0.03, lv], [bu1 - 0.03, lv + T], [bu0 + 0.03, lv + T]], h, h + seatY - T, trav));
    else for (const lu of [bu0 + inset, bu1 - inset - T]) g.add(localSlab([[lu, bv0 + 0.03], [lu + T, bv0 + 0.03], [lu + T, bv1 - 0.03], [lu, bv1 - 0.03]], h, h + seatY - T, trav));
  }
  // ringhiere in piatti rettangolari di metallo rosso scuro: corrimano e corrente intermedio larghi in pianta
  // (faccia larga orizzontale), montanti con la stessa sezione ma con la faccia larga in verticale
  function addRailing(g, all, h, RG) {
    const lines = all.filter((l) => Array.isArray(l) && l.length > 1);
    if (!lines.length) return;
    const H = Number(RG.altezza) || 1.0, step = Number(RG.passo) || 1.3, mid = Number(RG.intermedio) || 0.5;
    const W = Number(RG.larghezza) || 0.1, T = Number(RG.spessore) || 0.04;
    const red = plainMat(RG.colore || '#6b1d29', 0.55, 0.4);
    const posts = [], bars = [];
    for (const line of lines) for (let i = 0; i < line.length - 1; i += 1) {
      const [ua, va] = line[i], [ub, vb] = line[i + 1], n = Math.max(1, Math.round(Math.hypot(ub - ua, vb - va) / step)), ang = Math.atan2(vb - va, ub - ua);
      for (let k = i ? 1 : 0; k <= n; k += 1) posts.push([ua + (ub - ua) * k / n, va + (vb - va) * k / n, ang]);
      for (const y of [H - T / 2, mid]) bars.push([ua, va, ub, vb, y]);
    }
    const unit = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);
    const pm = new THREE.InstancedMesh(unit, red, posts.length), bm = new THREE.InstancedMesh(unit, red, bars.length);
    posts.forEach(([u, v, ang], i) => { q.setFromAxisAngle(yAxis, ang); m4.compose(new THREE.Vector3(u, h + (H - T) / 2, -v), q, new THREE.Vector3(T, H - T, W)); pm.setMatrixAt(i, m4); });
    bars.forEach(([ua, va, ub, vb, y], i) => {
      q.setFromAxisAngle(yAxis, Math.atan2(vb - va, ub - ua));
      m4.compose(new THREE.Vector3((ua + ub) / 2, h + y, -(va + vb) / 2), q, new THREE.Vector3(Math.hypot(ub - ua, vb - va) + W, T, W));
      bm.setMatrixAt(i, m4);
    });
    for (const mesh of [pm, bm]) { mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
  }
  // palo della bandiera in ghisa verde: plinto, rigonfiamento decorato, fusto rastremato e pomo in cima
  function flagPole(el) {
    const H = Number(el.altezza) || 11, pv = new THREE.Group(); pv.position.set(Number(el.u) || 0, 0, -(Number(el.v) || 0));
    const green = plainMat(el.colore || '#2f5c3e', 0.5, 0.35);
    const part = (geo, y) => { const m = new THREE.Mesh(geo, green); m.position.y = y; m.castShadow = true; pv.add(m); };
    part(new THREE.CylinderGeometry(0.2, 0.24, 0.35, 16), 0.175);
    part(new THREE.CylinderGeometry(0.1, 0.13, 0.46, 12), 0.57);
    part(new THREE.LatheGeometry([[0.11, 0], [0.2, 0.12], [0.24, 0.3], [0.2, 0.48], [0.12, 0.58], [0.15, 0.66], [0.1, 0.75]].map(([r, y]) => new THREE.Vector2(r, y)), 20), 0.8);
    part(new THREE.CylinderGeometry(0.05, 0.1, H - 1.55, 12), 1.55 + (H - 1.55) / 2);
    part(new THREE.SphereGeometry(0.09, 12, 8), H + 0.05);
    return pv;
  }
  // asta cilindrica fra due punti locali (x, y, z)
  function rodMesh(pa, pb, r, mat) {
    const a = new THREE.Vector3(...pa), b = new THREE.Vector3(...pb), d = b.clone().sub(a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true;
    return m;
  }
  // galleria a sezione "a stadio" (pareti verticali + semicerchio) lungo u: la superficie sporge di off dal profilo di raggio R,
  // con un'ondulazione lenta per farla sembrare una siepe; aperta alle estremità. Per vertice: attributo `dens` (densità del fogliame:
  // quasi nulla sotto `da` metri, poi cresce fino al massimo sul tetto, moltiplicata per `cop`); uv ruotate di `rot` e spostate di `seed`
  function tunnelGeom(u0, u1, vm, R, imp, off, wob, seed, rot, da, cop) {
    const prof = [], nW = 8, nA = 20, sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let k = 0; k <= nW; k += 1) prof.push([-R, imp * k / nW, -1, 0]);
    for (let k = 1; k < nA; k += 1) { const th = Math.PI - Math.PI * k / nA; prof.push([R * Math.cos(th), imp + R * Math.sin(th), Math.cos(th), Math.sin(th)]); }
    for (let k = nW; k >= 0; k -= 1) prof.push([R, imp * k / nW, 1, 0]);
    const nu = Math.max(2, Math.round((u1 - u0) / 0.45)), pos = [], uv = [], dn = [], idx = [], arc = [0], S = 0.6, cr = Math.cos(rot), sr = Math.sin(rot);
    for (let j = 1; j < prof.length; j += 1) arc.push(arc[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]));
    for (let i = 0; i <= nu; i += 1) {
      const u = u0 + (u1 - u0) * i / nu;
      for (let j = 0; j < prof.length; j += 1) {
        const [pv, ph, nv, nh] = prof[j], e = off + wob * (Math.sin(u * 1.9 + j * 0.7 + seed) + 0.6 * Math.sin(u * 0.8 - j * 1.3 + seed * 2));
        pos.push(u, Math.max(0.02, ph + nh * e), -(vm + pv + nv * e));
        const a = u / S, b = arc[j] / S;
        uv.push(a * cr - b * sr + seed, a * sr + b * cr + seed * 0.7);
        dn.push((0.04 + 0.96 * sm(da, da + 1.4, ph)) * cop);
      }
    }
    for (let i = 0; i < nu; i += 1) for (let j = 0; j < prof.length - 1; j += 1) {
      const a = i * prof.length + j, b = (i + 1) * prof.length + j, c = a + 1, d = b + 1;
      idx.push(a, b, c, c, b, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('dens', new THREE.Float32BufferAttribute(dn, 1)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // fusto della vite: tubo contorto dal cordolo lungo il fianco fino a perdersi nel fogliame; lat = -1/+1 lato del vialetto
  function trunkGeom(u, vm, R, imp, lat, top, seed, r) {
    const pts = [], n = 14;
    for (let k = 0; k <= n; k += 1) {
      const t = k / n, y = 0.2 + (top - 0.2) * t, q = Math.min(1, Math.max(0, (y - imp) / R)), th = Math.asin(q);
      const side = R * Math.cos(th) - 0.03 - 0.05 * Math.sin(t * 5 + seed) - 0.04 * t; // verso l'interno, con un po' di torsione
      pts.push(new THREE.Vector3(u + 0.07 * Math.sin(t * 7 + seed * 3) * (0.4 + t), y, -(vm + lat * side)));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 6, false);
  }
  // pergolato come nelle foto Street View del 2015: galleria di archi a tutto sesto in tondino di ferro scuro, uno ogni `passo`,
  // sui cordoli di travertino ai due lati di un vialetto a lastre irregolari; vite fitta su tetto e fianchi (da fuori una siepe
  // lunga e arrotondata, aperta ad arco alle estremità, l'interno resta percorribile). Solo la galleria: prato, aiuole, ringhiera
  // e lampioni stanno altrove (i lampioni sono elementi `lampione` a sé).
  // u, v: arco e vialetto (da asse a asse dei cordoli); altezza: cima dell'arco
  function addPergola(g, el) {
    const [u0, u1] = el.u, [v0, v1] = el.v, R = (v1 - v0) / 2, vm = (v0 + v1) / 2, H = Number(el.altezza) || 3.0, imp = Math.max(0.5, H - R);
    const passo = Math.max(0.8, Number(el.passo) || 1.8), trav = travPhoto(1.2);
    const iron = courtOnce('pergolato|ferro', () => plainMat(0x34383a, 0.55, 0.55));
    // vialetto e cordoli
    const stone = courtOnce('pergolato|lastre', () => { const t = opusTex(); t.repeat.set(1 / 2.4, 1 / 2.4); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }); });
    const path = localSlab(rectPts(u0 - 0.2, u1 + 0.2, v0 + 0.14, v1 - 0.14), 0, 0.04, stone); path.castShadow = false; g.add(path);
    for (const v of [v0, v1]) g.add(localSlab(rectPts(u0 - 0.2, u1 + 0.2, v - 0.14, v + 0.14), 0, 0.2, trav));
    // archi e correnti
    const n = Math.max(1, Math.round((u1 - u0) / passo));
    for (let k = 0; k <= n; k += 1) {
      const u = u0 + (u1 - u0) * k / n;
      const arch = new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 5, 28, Math.PI), iron);
      arch.rotation.y = Math.PI / 2; arch.position.set(u, imp, -vm); arch.castShadow = true; g.add(arch);
      for (const v of [v0, v1]) g.add(rodMesh([u, 0.2, -v], [u, imp, -v], 0.022, iron));
    }
    for (const a of [Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4]) g.add(rodMesh([u0, imp + R * Math.sin(a), -(vm + R * Math.cos(a))], [u1, imp + R * Math.sin(a), -(vm + R * Math.cos(a))], 0.012, iron));
    // vite: quattro gusci di foglie fotografiche (sfalsati e ruotati) con vuoti fra le foglie; densità quasi nulla sulla parte bassa dei fianchi
    // (`fogliame_da`, m), crescente salendo, massima sul tetto; `copertura` (0..1) scala la densità. Le ombre usano gli stessi vuoti.
    const cop = Number.isFinite(Number(el.copertura)) ? Math.min(1, Math.max(0, Number(el.copertura))) : 1, da = Number.isFinite(Number(el.fogliame_da)) ? Number(el.fogliame_da) : 1.0;
    const lt = courtOnce('pergolato|tex', leafTexs);
    const leaves = courtOnce('pergolato|foglie', () => { const m = new THREE.MeshStandardMaterial({ map: lt.map, alphaMap: lt.alpha, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, color: 0xb4c8a0 }); m.onBeforeCompile = leafPatch; m.customProgramCacheKey = () => 'vite'; return m; });
    const leafDepth = courtOnce('pergolato|foglie-ombra', () => { const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: lt.map, alphaMap: lt.alpha, alphaTest: 0.5 }); m.onBeforeCompile = leafPatch; m.customProgramCacheKey = () => 'vite-ombra'; return m; });
    for (const [off, wob, seed, rot] of [[0.34, 0.07, 0.31, 0], [0.25, 0.05, 0.57, 2.1], [0.16, 0.04, 0.12, 4.2], [0.08, 0.02, 0.83, 1.0]]) {
      const m = new THREE.Mesh(tunnelGeom(u0 - 0.1, u1 + 0.1, vm, R, imp, off, wob, seed, rot, da, cop), leaves); m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = leafDepth; g.add(m);
    }
    // fusti della vite: uno o due per campata (hash fisso), spesso a pochi cm dal montante dell'arco, sui cordoli ai lati del vialetto
    const bark = courtOnce('pergolato|fusto', () => plainMat(0x4a4038, 0.95, 0.0));
    for (let k = 0; k < n; k += 1) {
      const cnt = hash01(k, 71) < 0.45 ? 2 : 1;
      for (let c = 0; c < cnt; c += 1) {
        const id = k * 5 + c, lat = hash01(id, 72) < 0.5 ? -1 : 1, near = hash01(id, 73) < 0.6;
        const ua = u0 + (u1 - u0) * k / n, ub = u0 + (u1 - u0) * (k + 1) / n;
        const u = near ? (hash01(id, 74) < 0.5 ? ua + 0.07 : ub - 0.07) : ua + (ub - ua) * (0.25 + 0.5 * hash01(id, 75));
        const tm = new THREE.Mesh(trunkGeom(u, vm, R, imp, lat, 1.5 + 1.2 * hash01(id, 76), id, 0.022 + 0.017 * hash01(id, 77)), bark);
        tm.castShadow = true; tm.receiveShadow = true; g.add(tm);
      }
    }
  }
  // lampione verde (elemento `lampione`: u, v, altezza): palo, braccio verso la strada (+v) e globo
  function addLampione(g, L) {
    const green = courtOnce('lampione|verde', () => plainMat('#2f5c3e', 0.5, 0.35)), globe = courtOnce('lampione|globo', () => new THREE.MeshStandardMaterial({ color: 0xf2f0e6, roughness: 0.4, emissive: 0x2a2a24 }));
    const LH = Number(L.altezza) || 4.6, u = Number(L.u), v = Number(L.v);
    g.add(rodMesh([u, 0, -v], [u, LH, -v], 0.05, green));
    g.add(rodMesh([u, LH, -v], [u, LH + 0.1, -(v + 0.7)], 0.03, green));
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), globe); gl.position.set(u, LH, -(v + 0.75)); g.add(gl);
  }
  function buildChemistryExteriors() {
    const cfg = exteriorsCfg;
    const b = cfg && buildings.find((x) => String(x.code).toUpperCase() === cfg.edificio);
    if (!b || !scene) return;
    const old = scene.getObjectByName('chimica-esterni');
    if (old) { scene.remove(old); disposeTree(old); }
    const ring = closeRing(b.rings[0]);
    const holder = new THREE.Group(); holder.name = 'chimica-esterni';
    const trav = travPhoto, bench = (g, p, h) => addBench(turned(g, p, Number(p.u), Number(p.v)), p, h), railing = addRailing, { ocra, ocraScura } = fireStairMats();
    for (const [index, el] of (cfg.elementi || []).entries()) {
      if (!(el.lato >= 0 && el.lato < ring.length - 1)) continue;
      const g = sideFrame(ring, el.lato); g.userData.elemento = index; holder.add(g);
      if (el.rimosso) continue; // eliminato dall'editor: resta la cornice, senza contenuto
      if (el.tipo === 'terrazza') {
        const h = Number(el.altezza) || 0.8;
        g.add(localSlab(el.poligono, 0, h, trav()));
        if (el.prato) {
          const [u0, v0, u1, v1] = el.prato;
          const lawn = localSlab([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], h, h + 0.04, new THREE.MeshStandardMaterial({ color: new THREE.Color(0x5f8a3e).convertSRGBToLinear(), roughness: 1 }));
          lawn.castShadow = false; g.add(lawn);
          const kerb = (pts) => g.add(localSlab(pts, h, h + 0.18, trav()));
          kerb([[u0 - 0.25, v0 - 0.25], [u1 + 0.25, v0 - 0.25], [u1 + 0.25, v0], [u0 - 0.25, v0]]);
          kerb([[u0 - 0.25, v1], [u1 + 0.25, v1], [u1 + 0.25, v1 + 0.25], [u0 - 0.25, v1 + 0.25]]);
          kerb([[u0 - 0.25, v0], [u0, v0], [u0, v1], [u0 - 0.25, v1]]);
          kerb([[u1, v0], [u1 + 0.25, v0], [u1 + 0.25, v1], [u1, v1]]);
        }
        for (const p of (el.panchine || []).filter((x) => !x.rimosso)) bench(g, p, h);
        for (const s of el.gradini || []) {
          const n = Math.max(3, Math.round(h / (Number(s.alzata) || 0.16))), rise = h / n, run = Number(s.pedata) || 0.32;
          for (let i = 0; i < n; i += 1) {
            const top = h - rise * (i + 1) + rise, o0 = s.bordo + s.verso * run * i, o1 = o0 + s.verso * run;
            const pts = s.lungo === 'v'
              ? [[s.da, Math.min(o0, o1)], [s.a, Math.min(o0, o1)], [s.a, Math.max(o0, o1)], [s.da, Math.max(o0, o1)]]
              : [[Math.min(o0, o1), s.da], [Math.max(o0, o1), s.da], [Math.max(o0, o1), s.a], [Math.min(o0, o1), s.a]];
            g.add(localSlab(pts, 0, top - rise, trav()));
          }
        }
        railing(g, el.ringhiere || [], h, el.ringhiera || {});
      } else if (el.tipo === 'area') {
        const a = localSlab(el.poligono, 0, 0.03, trav()); a.castShadow = false; g.add(a);
      } else if (el.tipo === 'pergolato') {
        addPergola(turned(g, el, (el.u[0] + el.u[1]) / 2, (el.v[0] + el.v[1]) / 2), el);
      } else if (el.tipo === 'lampione') {
        addLampione(turned(g, el, Number(el.u), Number(el.v)), el);
      } else if (el.tipo === 'pilastro') {
        g.add(localSlab(el.poligono, 0, Number(el.altezza) || 2.5, trav()));
      } else if (el.tipo === 'ingresso') {
        buildEntrance(g, el, trav, bench, railing);
      } else if (el.tipo === 'palo') {
        g.add(flagPole(el));
      } else if (el.tipo === 'scala') {
        let gs = g;
        if (el.specchio) { gs = new THREE.Group(); gs.position.x = 2 * Number(el.u); gs.scale.x = -1; g.add(gs); } // specchiata attorno al suo centro (u)
        addFireStair(gs, Number(el.u), Math.max(1, Number(el.piani) || 2), ocra, { lunghezza: el.lunghezza, larghezza: el.larghezza, distacco: el.distacco, pianerottoli: el.pianerottoli, quote: el.quote, pedate: ocraScura });
      }
    }
    // primitive aggiunte dall'editor: nelle coordinate del lato 0, oppure in quelle di un elemento (cornice 'esterni:N');
    // quelle con cornice 'cortile' (per esempio i duplicati dei suoi oggetti) le costruisce loadCourtyardModel
    const g0 = sideFrame(ring, 0); g0.userData.elemento = 'lato0'; holder.add(g0);
    for (const pr of cfg.primitive || []) {
      if (pr.rimosso || !(pr.box || pr.poligono) || pr.cornice === 'cortile') continue;
      const m = /^esterni:(\d+)$/.exec(pr.cornice || ''), f = m ? holder.children.find((x) => x.userData.elemento === Number(m[1])) : g0;
      if (f) f.add(buildPrimitive(pr));
    }
    scene.add(holder);
    updateClipMask(holder);
    if (JSON.stringify(cavediCu()) !== cavediFatti) rebuildCu014();
  }
  /* ---------- primitive aggiunte dall'editor: forma e materiale a scelta ---------- */
  const PRIM_COLORS = { intonaco: ['#e0c9a6', 0.9, 0], cemento: ['#9a9a95', 0.95, 0], bianco: ['#f2f1ec', 0.7, 0], 'metallo rosso': ['#6b1d29', 0.55, 0.4], 'ferro verde': ['#235b42', 0.55, 0.35], acciaio: ['#b9bdc0', 0.35, 0.75], legno: ['#6b4a2f', 0.8, 0], erba: ['#5f8a3e', 1, 0], asfalto: ['#4a4d50', 0.95, 0], 'intonaco arancione': ['#c98a5c', 0.9, 0], guaina: ['#28292b', 0.95, 0] };
  const PRIM_MATERIALS = ['travertino', 'travertino a lastre', 'mattoni', 'mattoni gialli', 'intonaco', 'cemento', 'bianco', 'metallo rosso', 'ferro verde', 'acciaio', 'legno', 'vetro', 'erba', 'terra', 'sanpietrini', 'asfalto', 'intonaco arancione', 'guaina', 'pensilina', 'edificio'];
  const primMats = new Map();
  function primitiveMaterial(name) {
    if (name === 'travertino a lastre') return bedKerbMaterial(); // come cordoli e pilastri del cortile dell'azoto
    if (name === 'edificio') return facadeSetFor('CU014').body; // su un parallelepipedo: la parete a finestre (il solido a pianta libera fa anche i piani)
    if (name === 'pensilina') return primitiveMaterial('intonaco arancione'); // da solo è il bordo: sopra e sotto li mettono buildPrism e il parallelepipedo
    if (primMats.has(name)) return primMats.get(name);
    let mat;
    if (name === 'travertino') mat = new THREE.MeshStandardMaterial({ map: travertinePhoto(2.4), normalMap: travertineNormal(2.4), roughness: 0.8 });
    else if (name === 'mattoni' || name === 'mattoni gialli') { const t = windowCanvas(FACADE_PALETTES[name === 'mattoni' ? 'cortina' : 'giallo'], 1, false); t.repeat.set(0.24, 0.24); mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); }
    else if (name === 'vetro') mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#9fc3d8').convertSRGBToLinear(), roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.45 });
    else if (name === 'terra') { const t = soilTex(); t.repeat.set(0.5, 0.5); mat = new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); }
    else if (name === 'sanpietrini') mat = new THREE.MeshStandardMaterial({ map: sanpietriniTex(1), roughness: 0.95 });
    else { const [c, r, m] = PRIM_COLORS[name] || PRIM_COLORS.bianco; mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c).convertSRGBToLinear(), roughness: r, metalness: m }); }
    primMats.set(name, mat);
    return mat;
  }
  /* marciapiedi e aiuole aggiunti dall'editor: poligono nelle coordinate del lato 0 (u, v), base e altezza */
  const signedArea = (P) => { let a = 0; for (let i = 0; i < P.length; i += 1) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const ccw = (P) => (signedArea(P) < 0 ? P.slice().reverse() : P);
  // contorno spostato verso l'interno di d (spigoli a mitra, limitati per gli angoli molto acuti)
  function insetPolygon(P, d) {
    const Q = ccw(P), n = Q.length, lines = [];
    for (let i = 0; i < n; i += 1) {
      const a = Q[i], b = Q[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nu = -(b[1] - a[1]) / L, nv = (b[0] - a[0]) / L;
      lines.push([[a[0] + nu * d, a[1] + nv * d], [(b[0] - a[0]) / L, (b[1] - a[1]) / L]]);
    }
    return Q.map((q, i) => {
      const [p1, d1] = lines[(i - 1 + n) % n], [p2, d2] = lines[i], den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < 1e-6) return [p2[0], p2[1]];
      const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den, x = p1[0] + d1[0] * t, y = p1[1] + d1[1] * t;
      const dx = x - q[0], dy = y - q[1], m = Math.hypot(dx, dy), lim = 3 * d;
      return m > lim ? [q[0] + (dx / m) * lim, q[1] + (dy / m) * lim] : [x, y];
    });
  }
  const ellipsePts = (b, n = 48) => { const cu = (b.u0 + b.u1) / 2, cv = (b.v0 + b.v1) / 2, ru = (b.u1 - b.u0) / 2, rv = (b.v1 - b.v0) / 2; return Array.from({ length: n }, (_, i) => [cu + ru * Math.cos((i / n) * Math.PI * 2), cv + rv * Math.sin((i / n) * Math.PI * 2)]); };
  // raggio di ogni angolo: raggi[i] se c'è, altrimenti raggio (uguale per tutti), altrimenti def
  const cornerRadii = (pr, P, def) => P.map((_, i) => { const r = Array.isArray(pr.raggi) ? pr.raggi[i] : null; return Math.max(0, Number(r != null ? r : pr.raggio != null ? pr.raggio : def) || 0); });
  // stesso giro antiorario per vertici e raggi
  const ccwRadii = (P, R) => (signedArea(P) < 0 ? [P.slice().reverse(), R.slice().reverse()] : [P, R]);
  // contorno (antiorario) con gli angoli raccordati ad arco di cerchio; il raggio si riduce se i lati sono troppo corti
  function filletOutline(Q, R) {
    const n = Q.length, out = [];
    Q.forEach((p1, i) => {
      const p0 = Q[(i - 1 + n) % n], p2 = Q[(i + 1) % n], ax = p0[0] - p1[0], ay = p0[1] - p1[1], bx = p2[0] - p1[0], by = p2[1] - p1[1];
      const l0 = Math.hypot(ax, ay), l2 = Math.hypot(bx, by), r = R[i] || 0;
      const th = l0 && l2 ? Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (l0 * l2)))) : Math.PI; // angolo fra i due lati
      if (r < 0.01 || th > Math.PI - 0.02 || th < 0.02) { out.push([p1[0], p1[1]]); return; }
      const t = Math.min(r / Math.tan(th / 2), l0 / 2.05, l2 / 2.05), re = t * Math.tan(th / 2); // distanza dei punti di tangenza e raggio effettivo
      const mx = ax / l0 + bx / l2, my = ay / l0 + by / l2, ml = Math.hypot(mx, my) || 1, dc = re / Math.sin(th / 2);
      const cx = p1[0] + (mx / ml) * dc, cy = p1[1] + (my / ml) * dc;
      const a0 = Math.atan2(p1[1] + (ay / l0) * t - cy, p1[0] + (ax / l0) * t - cx);
      let d = Math.atan2(p1[1] + (by / l2) * t - cy, p1[0] + (bx / l2) * t - cx) - a0;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const steps = Math.max(2, Math.ceil(Math.abs(d) / (Math.PI / 18)));
      for (let k = 0; k <= steps; k += 1) { const a = a0 + (d * k) / steps; out.push([cx + re * Math.cos(a), cy + re * Math.sin(a)]); }
    });
    return out.filter((p, i) => { const q = out[(i + 1) % out.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-3; });
  }
  function shapeSlab(shape, h0, h1, material, bevel) {
    const opts = bevel ? { depth: Math.max(0.01, h1 - h0 + 0.02 - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10 } : { depth: h1 - h0, bevelEnabled: false, curveSegments: 10 };
    const g = new THREE.ExtrudeGeometry(shape, opts);
    g.rotateX(-Math.PI / 2); g.translate(0, bevel ? h0 - 0.02 + bevel : h0, 0); // il bordo arrotondato in basso resta sotto il piano stradale
    g.computeVertexNormals(); planarUVs(g, 1);
    const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  const shapeOf = (P) => new THREE.Shape(P.map(([u, v]) => new THREE.Vector2(u, v)));
  function sidewalkMaterial(side) {
    const key = side ? 'marciapiede|2' : 'marciapiede';
    if (primMats.has(key)) return primMats.get(key);
    const t = canvasTex(256, 256, (ctx, w) => { // asfalto da marciapiede: grigio chiaro granuloso, con rappezzi
      noiseFill(ctx, w, w, '#8d8c88', '#7b7a76', 7000);
      for (let i = 0; i < 900; i += 1) { ctx.fillStyle = hash01(i, 61) > 0.5 ? 'rgba(235,232,225,.35)' : 'rgba(40,40,38,.35)'; ctx.fillRect(hash01(i, 62) * w, hash01(i, 63) * w, 1.5, 1.5); }
      for (let i = 0; i < 5; i += 1) { ctx.fillStyle = 'rgba(60,60,58,.12)'; ctx.fillRect(hash01(i, 64) * w, hash01(i, 65) * w, 30 + 50 * hash01(i, 66), 20 + 40 * hash01(i, 67)); }
    }, 1 / 1.6, 1 / 1.6);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: side ? THREE.DoubleSide : THREE.FrontSide });
    primMats.set(key, m);
    return m;
  }
  // travertino bianco dei cordoli dei marciapiedi: più chiaro delle lastre delle aiuole, senza fughe disegnate (i giunti sono listelli a parte)
  function whiteTravertineMaterial() {
    return courtOnce('cordolo marciapiede', () => stdMat({ roughness: 0.85, map: canvasTex(512, 512, (ctx, w) => {
      noiseFill(ctx, w, w, '#f1ecdf', '#e3dcc9', 3500);
      for (let i = 0; i < 70; i += 1) { ctx.fillStyle = `rgba(190,172,140,${0.06 + 0.1 * hash01(i, 81)})`; ctx.fillRect(0, hash01(i, 82) * w, w, 1 + 2 * hash01(i, 83)); } // venature orizzontali
      for (let i = 0; i < 160; i += 1) { ctx.fillStyle = 'rgba(150,132,104,.35)'; ctx.fillRect(hash01(i, 84) * w, hash01(i, 85) * w, 1.5 + 2 * hash01(i, 86), 1); } // piccole cavità
      stains(ctx, w, w, 91);
    }, 1 / 2.4, 1 / 2.4) }));
  }
  function jointMaterial() { return courtOnce('giunti cordolo', () => stdMat({ color: 0x3e382f, roughness: 1 })); }
  function buildSidewalk(pr) {
    const grp = new THREE.Group(), P = pr.poligono, base = Number(pr.base) || 0, h = Number(pr.altezza) || 0.15;
    if (!Array.isArray(P) || P.length < 3) return grp;
    const k = pr.cordolo != null && pr.cordolo !== '' ? Math.max(0, Number(pr.cordolo) || 0) : 0.2; // spessore del cordolo in travertino bianco; 0 = marciapiede senza cordolo
    const [Q, R] = ccwRadii(P, cornerRadii(pr, P, 0.3)), n = Q.length, outer = filletOutline(Q, R);
    // il contorno interno segue gli archi come per le aiuole: raggio ridotto dello spessore negli angoli sporgenti, aumentato in quelli rientranti
    const convex = (i) => { const a = Q[(i - 1 + n) % n], b = Q[i], c = Q[(i + 1) % n]; return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) >= 0; };
    const inner = k >= 0.02 ? filletOutline(insetPolygon(Q, k), R.map((r, i) => (r > 0 ? (convex(i) ? Math.max(0, r - k) : r + k) : 0))) : null;
    const ring = !!inner && signedArea(inner) > 0.05 && signedArea(inner) < signedArea(outer); // cordolo possibile solo se l'interno resta un poligono sensato
    // discese verso la strada: rampa ricavata NELLO spessore del marciapiede (non sporge sulla strada). Piano e cordolo vengono ritagliati
    // con una tasca rettangolare larga `larghezza`, profonda `profondita` dal bordo esterno verso l'interno; la rampa scende dal piano
    // (all'interno della tasca) alla quota della strada, a filo del bordo esterno. Nessun gradino: il cordolo lì si interrompe.
    const flip = signedArea(P) < 0, ramps = [], cuts = [];
    const pointAt = (poly, X) => { const p = poly[X.i], q = poly[(X.i + 1) % poly.length]; return [p[0] + (q[0] - p[0]) * X.t, p[1] + (q[1] - p[1]) * X.t]; };
    const locate = (poly, pt) => { // segmento più vicino al punto: { i, t, dist }
      let best = null;
      for (let i = 0; i < poly.length; i += 1) {
        const p = poly[i], q = poly[(i + 1) % poly.length], du = q[0] - p[0], dv = q[1] - p[1], l2 = du * du + dv * dv; if (l2 < 1e-12) continue;
        const t = Math.max(0, Math.min(1, ((pt[0] - p[0]) * du + (pt[1] - p[1]) * dv) / l2)), dist = Math.hypot(p[0] + du * t - pt[0], p[1] + dv * t - pt[1]);
        if (!best || dist < best.dist) best = { i, t, dist };
      }
      return best;
    };
    for (const d of pr.discese || []) {
      const i = flip ? (n - 2 - d.lato + n) % n : d.lato; // il poligono è stato girato: stesso lato, indice diverso
      const a = Q[i], b = Q[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
      const eu = (b[0] - a[0]) / L, ev = (b[1] - a[1]) / L, W = Math.min(L - 0.2, Number(d.larghezza) || 1.4), D = Math.max((ring ? k : 0) + 0.3, Number(d.profondita) || 0.9);
      const t = flip ? 1 - Number(d.t) : Number(d.t), sc = Math.min(L - W / 2 - 0.1, Math.max(W / 2 + 0.1, t * L));
      const s0 = sc - W / 2, s1 = sc + W / 2, at = (s, x) => [a[0] + eu * s + ev * x, a[1] + ev * s - eu * x]; // x > 0 verso l'esterno (normale esterna = (ev, −eu))
      const o0 = locate(outer, at(s0, 0)), o1 = locate(outer, at(s1, 0)), i0 = ring ? locate(inner, at(s0, -k)) : null, i1 = ring ? locate(inner, at(s1, -k)) : null;
      if (o0.dist > 1e-3 || o1.dist > 1e-3 || o0.i !== o1.i || o0.t >= o1.t || (ring && (i0.dist > 1e-3 || i1.dist > 1e-3 || i0.i !== i1.i || i0.t >= i1.t))) continue; // lato troppo vicino a un raccordo: niente discesa
      cuts.push({ o0, o1, i0, i1, f0: at(s0, -D), f1: at(s1, -D) });
      const prof = new THREE.Shape([new THREE.Vector2(-D, h), new THREE.Vector2(0, 0.004), new THREE.Vector2(0, 0), new THREE.Vector2(-D, 0)]); // piano in alto all'interno, quota strada a filo del bordo esterno
      const geo = new THREE.ExtrudeGeometry(prof, { depth: W, bevelEnabled: false }); geo.computeVertexNormals(); planarUVs(geo, 1);
      const m = new THREE.Mesh(geo, sidewalkMaterial(true)); m.castShadow = true; m.receiveShadow = true;
      const o = [a[0] + eu * (sc + W / 2), a[1] + ev * (sc + W / 2)]; // asse X verso l'esterno, Z lungo il lato all'indietro: terna destrorsa
      m.matrixAutoUpdate = false;
      m.matrix.makeBasis(new THREE.Vector3(ev, 0, eu), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-eu, 0, ev)).setPosition(o[0], base, -o[1]);
      grp.add(m);
      ramps.push({ a, eu, ev, s0: s0 - 0.02, s1: s1 + 0.02 });
    }
    // contorno con le tasche delle discese inserite (per ogni cut, i punti vanno dal bordo verso l'interno e di nuovo al bordo)
    const notched = (poly, ik, start, end, floor) => {
      const out = [];
      poly.forEach((p, i) => {
        out.push(p);
        cuts.filter((c) => c[ik].i === i).sort((x, y) => x[ik].t - y[ik].t).forEach((c) => out.push(pointAt(poly, c[start]), c[floor[0]], c[floor[1]], pointAt(poly, c[end])));
      });
      return out;
    };
    if (!ring) grp.add(shapeSlab(shapeOf(notched(outer, 'o0', 'o0', 'o1', ['f0', 'f1'])), base, base + h, sidewalkMaterial(false), cuts.length ? 0 : 0.04));
    else {
      // asfalto (o il materiale del piano) solo dentro l'anello; cordolo a filo con il piano, in travertino bianco
      grp.add(shapeSlab(shapeOf(notched(inner, 'i0', 'i0', 'i1', ['f0', 'f1'])), base, base + h, sidewalkMaterial(false)));
      if (!cuts.length) {
        const kerb = shapeOf(outer);
        kerb.holes.push(new THREE.Path(inner.slice().reverse().map(([u, v]) => new THREE.Vector2(u, v))));
        grp.add(shapeSlab(kerb, base, base + h, whiteTravertineMaterial()));
      } else {
        // il cordolo è un anello interrotto dalle tasche: un pezzo per ogni tratto fra due discese (arco esterno in avanti, arco interno all'indietro)
        const key = (X, m) => X.i + X.t, arc = (poly, A, B) => {
          const m = poly.length, ka = key(A), kb = key(B) < ka ? key(B) + m : key(B), out = [pointAt(poly, A)];
          for (let j = Math.floor(ka) + 1; j < kb; j += 1) out.push(poly[j % m]);
          out.push(pointAt(poly, B));
          return out;
        };
        const ord = cuts.slice().sort((x, y) => key(x.o0) - key(y.o0));
        ord.forEach((c, j) => {
          const nx = ord[(j + 1) % ord.length];
          grp.add(shapeSlab(shapeOf(arc(outer, c.o1, nx.o0).concat(arc(inner, c.i1, nx.i0).reverse())), base, base + h, whiteTravertineMaterial()));
        });
      }
    }
    if (ring) addKerbJoints(grp, outer, k, base, h, ramps);
    return grp;
  }
  // giunti scuri fra i blocchi del cordolo, ogni ~0,9 m lungo il contorno: un listello sul piano e uno sulla faccia esterna (due InstancedMesh)
  function addKerbJoints(grp, outer, k, base, h, ramps) {
    const m = outer.length, seg = outer.map((p, i) => { const q = outer[(i + 1) % m]; return Math.hypot(q[0] - p[0], q[1] - p[1]); }), total = seg.reduce((x, y) => x + y, 0);
    const nb = Math.max(2, Math.round(total / 0.9)), pts = [];
    for (let j = 0, i = 0, acc = 0; j < nb; j += 1) {
      const s = ((j + 0.5) * total) / nb; // mezzo blocco dopo la partenza: nessun giunto sul vertice iniziale
      while (i < m - 1 && acc + seg[i] < s) { acc += seg[i]; i += 1; }
      const p = outer[i], q = outer[(i + 1) % m], l = seg[i] || 1, f = (s - acc) / l;
      pts.push({ u: p[0] + (q[0] - p[0]) * f, v: p[1] + (q[1] - p[1]) * f, tu: (q[0] - p[0]) / l, tv: (q[1] - p[1]) / l });
    }
    const joints = pts.filter((j) => !ramps.some((r) => { const du = j.u - r.a[0], dv = j.v - r.a[1], along = du * r.eu + dv * r.ev, perp = du * r.ev - dv * r.eu; return along > r.s0 && along < r.s1 && Math.abs(perp) < k + 0.1; })); // sotto gli scivoli non si vedono
    if (!joints.length) return;
    const top = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.004, k), jointMaterial(), joints.length), face = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, h, 0.004), jointMaterial(), joints.length), M = new THREE.Matrix4();
    joints.forEach((j, i) => { // asse X lungo il contorno, Z verso l'esterno (antiorario: normale esterna = (tv, −tu))
      const bx = new THREE.Vector3(j.tu, 0, -j.tv), by = new THREE.Vector3(0, 1, 0), bz = new THREE.Vector3(j.tv, 0, j.tu);
      M.makeBasis(bx, by, bz).setPosition(j.u - j.tv * (k / 2), base + h + 0.002, -(j.v + j.tu * (k / 2))); top.setMatrixAt(i, M);
      M.makeBasis(bx, by, bz).setPosition(j.u, base + h / 2, -j.v); face.setMatrixAt(i, M);
    });
    for (const x of [top, face]) { x.frustumCulled = false; x.instanceMatrix.needsUpdate = true; grp.add(x); }
  }
  function bedMaterial(terreno) {
    const key = 'aiuola|' + terreno;
    if (primMats.has(key)) return primMats.get(key);
    let m;
    if (terreno === 'prato') m = primitiveMaterial('erba');
    else if (terreno === 'foglie') m = primitiveMaterial('terra');
    else if (terreno === 'grigliato') { // masselli erbosi (grigliato salvaprato, foto dell'angolo sud-ovest di CU014): calcestruzzo chiaro a celle quadre con l'erba dentro, 8 celle al metro, giunti dei masselli ogni 50 cm
      const t = canvasTex(256, 256, (ctx, w) => {
        noiseFill(ctx, w, w, '#c9c5bb', '#b3afa5', 6000);
        for (let i = 0; i < 8; i += 1) for (let j = 0; j < 8; j += 1) {
          const x = i * 32 + 8, y = j * 32 + 7, k = hash01(i * 8 + j, 41);
          ctx.fillStyle = k > 0.85 ? '#7d7a62' : k > 0.4 ? '#4f7a2f' : '#3f6a26'; ctx.fillRect(x, y, 17, 19); // erba (qualche cella spelacchiata)
          ctx.fillStyle = 'rgba(30,45,20,.35)'; ctx.fillRect(x, y, 17, 3);
        }
        ctx.fillStyle = 'rgba(70,66,58,.45)'; for (const p of [0, 128]) { ctx.fillRect(p, 0, 2, w); ctx.fillRect(0, p, w, 2); }
      }, 1, 1);
      m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
    }
    else { const t = canvasTex(256, 256, (ctx, w) => { noiseFill(ctx, w, w, '#5e4a39', '#433428', 3000); for (let i = 0; i < 60; i += 1) { ctx.fillStyle = 'rgba(150,135,115,.5)'; ctx.beginPath(); ctx.arc(hash01(i, 71) * w, hash01(i, 72) * w, 1 + 2 * hash01(i, 73), 0, Math.PI * 2); ctx.fill(); } }, 0.5, 0.5); m = new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); }
    primMats.set(key, m);
    return m;
  }
  // cordolo delle aiuole come quello delle aiuole del cortile dell'azoto: stesse lastre di travertino, in scala vera (tessera di 2,4 m)
  function bedKerbMaterial() { return courtOnce('cordolo aiuola', () => stdMat({ map: travertineTex(1 / 2.4, 1 / 2.4) })); }
  function buildBed(pr) {
    const grp = new THREE.Group(), round = pr.tipo === 'rotonda', k = Number(pr.cordolo) || 0.16;
    let outer, inner;
    if (round) {
      if (!pr.box) return grp;
      outer = ellipsePts(pr.box); inner = insetPolygon(outer, k);
    } else {
      const P = pr.poligono;
      if (!Array.isArray(P) || P.length < 3) return grp;
      // il bordo interno del cordolo segue gli archi: raggio ridotto dello spessore negli angoli sporgenti, aumentato in quelli rientranti
      const [Q, R] = ccwRadii(P, cornerRadii(pr, P, 0)), n = Q.length;
      const convex = (i) => { const a = Q[(i - 1 + n) % n], b = Q[i], c = Q[(i + 1) % n]; return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) >= 0; };
      outer = filletOutline(Q, R);
      inner = filletOutline(insetPolygon(Q, k), R.map((r, i) => (r > 0 ? (convex(i) ? Math.max(0, r - k) : r + k) : 0)));
    }
    const base = round ? Number(pr.box.h0) || 0 : Number(pr.base) || 0, h = round ? Math.max(0.05, pr.box.h1 - pr.box.h0) : Number(pr.altezza) || 0.42;
    const kerb = shapeOf(outer);
    kerb.holes.push(new THREE.Path(inner.slice().reverse().map(([u, v]) => new THREE.Vector2(u, v))));
    grp.add(shapeSlab(kerb, base, base + h, bedKerbMaterial()));
    const fill = shapeSlab(shapeOf(inner), base, base + h - 0.06, bedMaterial(pr.terreno || 'prato')); fill.castShadow = false; grp.add(fill);
    return grp;
  }
  /* ---------- catalogo: ogni oggetto già costruito nel modello si può aggiungere dall'editor ---------- */
  // crea(pr) costruisce l'oggetto con le sue misure naturali nelle coordinate locali (X = u, Y = h, Z = −v); la scatola
  // dell'editor (pr.box) lo stira fino a riempirla e pr.ruota lo gira di 90° in 90°
  const group = (fill) => { const g = new THREE.Group(); fill(g); return g; };
  /* impianto dell'aria sul tetto del ventaglio (foto del commento 10 e STL): la geometria segue la scatola dell'editor (lunghezza lungo x,
     o lungo v con «ruota» a 90°), così allungando un pezzo per farlo combaciare con Maps giunti e piedini restano della loro misura */
  const ductDims = (pr, L0, W0, H0) => {
    const b = pr && pr.box, turned = (Number(pr && pr.ruota) || 0) % 180 !== 0;
    if (!b) return [L0, W0, H0];
    const du = b.u1 - b.u0, dv = b.v1 - b.v0;
    return [Math.max(0.3, turned ? dv : du), Math.max(0.2, turned ? du : dv), Math.max(0.2, b.h1 - b.h0)];
  };
  const zinco = () => courtOnce('condotte|zinco', () => stdMat({ color: 0xc4c8ca, roughness: 0.42, metalness: 0.65 }));
  const zincoScuro = () => courtOnce('condotte|giunti', () => stdMat({ color: 0x9da2a5, roughness: 0.5, metalness: 0.6 }));
  const staffe = () => courtOnce('condotte|staffe', () => stdMat({ color: 0x4a4c4d, roughness: 0.7, metalness: 0.3 }));
  /* kit modulare di condotte zincate dell'utente (models/ventilazione-glb.json: il GLB di Sketchfab con le texture ridotte a 1024 px):
     pezzi con sezione 0,54 × 0,39 m, letti una volta, centrati in x/z e appoggiati a y = 0. Il metallo resta a 0,35 come i tubi del
     cortile: senza mappa d'ambiente un metallo pieno viene quasi nero. */
  let ventKitPromise = null;
  function loadVentKit() {
    if (!ventKitPromise) ventKitPromise = (async () => {
      await loadDependency('vendor/GLTFLoader.js', () => typeof THREE.GLTFLoader === 'function');
      const data = await fetch('models/ventilazione-glb.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error('kit condotte'))));
      const bin = atob(data.glb_base64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const gltf = await new Promise((resolve, reject) => new THREE.GLTFLoader().parse(bytes.buffer, 'models/', resolve, reject));
      const parts = {};
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const code = o.isMesh && (/Cube\.?(\d{3})/.exec(o.name) || [])[1]; // i nomi dei nodi arrivano senza il punto (Cube014_Ventilation_0)
        if (!code || parts[code]) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld); g.computeBoundingBox();
        const bb = g.boundingBox, c = bb.getCenter(new THREE.Vector3()); g.translate(-c.x, -bb.min.y, -c.z); g.computeBoundingBox();
        const mat = o.material; if (mat && mat.metalness != null) { mat.metalness = Math.min(mat.metalness, 0.6); mat.roughness = 0.55; mat.needsUpdate = true; }
        parts[code] = { geo: g, mat, size: g.boundingBox.getSize(new THREE.Vector3()) };
      });
      return parts;
    })().catch((e) => { console.warn('Kit delle condotte non caricato', e); ventKitPromise = null; return null; });
    return ventKitPromise;
  }
  // pezzi del kit nel catalogo: [codice del nodo, nome, misura naturale x, y, z]
  const KIT_CONDOTTE = {
    kitDritto: ['014', 'Condotta zincata: tratto dritto (kit)', [1.51, 0.39, 0.54]],
    kitCurva: ['027', 'Condotta zincata: curva a 90° (kit)', [0.98, 0.39, 0.98]],
    kitSalto: ['016', 'Condotta zincata: salto a S (kit)', [1.51, 0.78, 0.54]],
    kitTi: ['020', 'Condotta zincata: raccordo a T (kit)', [1.01, 0.39, 0.78]],
    kitGomito: ['023', 'Condotta zincata: gomito in verticale (kit)', [0.72, 0.72, 0.54]],
    kitGriglia: ['017', 'Condotta zincata: griglia di ripresa (kit)', [0.54, 0.39, 0.03]],
    kitSerranda: ['033', 'Condotta zincata: serranda a lamelle (kit)', [0.54, 0.39, 0.23]],
    kitSupporto: ['041', 'Condotta zincata: supporto a portale (kit)', [0.08, 0.73, 0.62]],
  };
  const kitHidden = () => courtOnce('condotte|segnaposto', () => new THREE.MeshBasicMaterial({ visible: false }));
  /* lamiera zincata del kit (texture di colore, normali e metallo/rugosità del GLB) sui pezzi fatti a mano: UTA, raccordi, unità esterne,
     cassette. Finché il kit non arriva è lo zinco liscio; le UV vanno messe in metri con kitUV (texture ripetuta ogni 1,2 m). */
  const kitSteel = () => courtOnce('condotte|lamiera del kit', () => {
    const m = stdMat({ color: 0xc4c8ca, roughness: 0.42, metalness: 0.35 });
    loadVentKit().then((kit) => {
      const src = kit && kit['014'] && kit['014'].mat;
      if (!src || !src.map) return;
      const tile = (t) => { if (!t) return null; const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.needsUpdate = true; return c; };
      Object.assign(m, { map: tile(src.map), normalMap: tile(src.normalMap), roughnessMap: tile(src.roughnessMap), metalnessMap: tile(src.metalnessMap), roughness: 0.55, metalness: 0.6 }); // più lucida (commento del 30/10)
      m.color.set(0xffffff); m.needsUpdate = true;
    });
    return m;
  });
  const kitUV = (mesh) => { planarUVs(mesh.geometry, 1.2); return mesh; };
  // raccordo fra due sezioni rettangolari lungo x: in x0 la sezione a = [y0, y1, metà larghezza], in x1 la sezione b
  function sectionTaper(x0, x1, a, b) {
    const g = new THREE.BoxGeometry(1, 1, 1), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const sec = pos.getX(i) < 0 ? a : b;
      pos.setXYZ(i, pos.getX(i) < 0 ? x0 : x1, pos.getY(i) < 0 ? sec[0] : sec[1], Math.sign(pos.getZ(i)) * sec[2]);
    }
    g.computeVertexNormals();
    return g;
  }
  // segnaposto invisibile della misura del pezzo (scatola dell'editor e «Misure originali» subito giuste); il pezzo vero arriva col kit
  function kitPiece(code, size) {
    const g = new THREE.Group(), ph = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), kitHidden());
    ph.position.y = size[1] / 2; g.add(ph);
    loadVentKit().then((kit) => {
      const p = kit && kit[code];
      if (!p) { ph.material = zinco(); return; } // senza kit resta una scatola zincata
      const m = new THREE.Mesh(p.geo, p.mat); m.scale.set(size[0] / p.size.x, size[1] / p.size.y, size[2] / p.size.z);
      m.castShadow = true; m.receiveShadow = true; g.add(m);
    });
    return g;
  }
  // canale rettangolare lungo x (da −L/2 a L/2), largo W, alto fino ad H, su piedini alti s; flangia ogni 1,25 m circa.
  // Quando il kit è caricato il corpo diventa una fila di tratti dritti del kit, con la sezione allargata a W × (H − s)
  function ductSegment(g, L, W, H, s) {
    const { box } = partAdder(g), t = 0.03, n = Math.max(1, Math.round(L / 1.25));
    box(-L / 2, L / 2, s, H - t, -W / 2 + t, W / 2 - t, zinco()).userData.corpo = true;
    loadVentKit().then((kit) => {
      const p = kit && kit['014'];
      if (!p) return;
      const k = ((H - s) / p.size.y + W / p.size.z) / 2, m = Math.max(1, Math.round(L / (p.size.x * k))), seg = L / m; // tratti lunghi in proporzione alla sezione
      for (const c of g.children.filter((x) => x.userData.corpo)) { g.remove(c); c.geometry.dispose(); }
      for (let i = 0; i < m; i += 1) {
        const d = new THREE.Mesh(p.geo, p.mat); d.scale.set(seg / p.size.x, (H - s) / p.size.y, W / p.size.z);
        d.position.set(-L / 2 + seg * (i + 0.5), s, 0); d.castShadow = true; d.receiveShadow = true; g.add(d);
      }
      for (const x of [-L / 2, L / 2]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.02, H - s, W), kitSteel()); kitUV(c); c.position.set(x, (H + s) / 2, 0); g.add(c); } // tappi: i tratti del kit sono tubi aperti
      // piedini → supporti a portale del kit, allargati attorno al canale, uno a ogni giunto
      const q = kit['041'];
      if (!q || s <= 0.06) return;
      for (const c of g.children.filter((x) => x.userData.piede)) { g.remove(c); c.geometry.dispose(); }
      for (let i = 0; i <= m; i += 1) {
        const x = Math.min(L / 2 - 0.06, Math.max(-L / 2 + 0.06, -L / 2 + seg * i));
        const f = new THREE.Mesh(q.geo, q.mat); f.scale.set(0.08 / q.size.x, (H + 0.04) / q.size.y, (W + 0.14) / q.size.z);
        f.position.set(x, 0, 0); f.castShadow = true; f.receiveShadow = true; g.add(f);
      }
    });
    for (let k = 0; k <= n; k += 1) {
      const x = -L / 2 + (L * k) / n, x0 = Math.max(-L / 2, x - 0.025), x1 = Math.min(L / 2, x + 0.025);
      box(x0, x1, s - t, H, -W / 2, W / 2, zincoScuro()).userData.corpo = true;
      if (s > 0.06) {
        box(Math.max(-L / 2, x0 - 0.08), Math.min(L / 2, x1 + 0.08), 0, 0.05, -W / 2 + 0.03, W / 2 - 0.03, staffe()).userData.piede = true; // travetto sul tetto
        for (const z of [-W / 2 + 0.08, W / 2 - 0.08]) box(x0, x1, 0.05, s - t, z - 0.03, z + 0.03, staffe()).userData.piede = true;
      }
    }
  }
  // tronco di piramide lungo x: sezione piena (alta h, larga w) in x1, ridotta di k in x0
  function ductTaper(x0, x1, h, w, k) {
    const g = new THREE.CylinderGeometry(k * Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1).toNonIndexed();
    g.rotateY(Math.PI / 4); g.rotateZ(Math.PI / 2); g.scale(Math.abs(x1 - x0), h, w); g.translate((x0 + x1) / 2, 0, 0); g.computeVertexNormals();
    return g;
  }
  // pezzi del retro della Ginestra (aula magna di Chimica): la geometria segue la scatola, così gradini, balaustrini e sbarre restano a misura
  const metalloScale = (pr) => (pr && /^#[0-9a-f]{6}$/i.test(String(pr.colore || '')) ? courtOnce('cu|metallo ' + pr.colore.toLowerCase(), () => stdMat({ color: pr.colore, roughness: 0.5, metalness: 0.45 }))
    : courtOnce('cu|ringhiera scale', () => stdMat({ color: '#2f3633', roughness: 0.45, metalness: 0.6 })));
  // cancelli e staccionate: marrone rossiccio (segnalazione 10/11)
  const metalloCancelli = (pr) => (pr && /^#[0-9a-f]{6}$/i.test(String(pr.colore || '')) ? metalloScale(pr) : courtOnce('cu|cancelli marrone', () => stdMat({ color: '#6e3a28', roughness: 0.5, metalness: 0.45 })));
  const meshUV = (m) => { planarUVs(m.geometry, 1); return m; };
  const CATALOGO_GINESTRA = {
    // gradini lungo x, quanti ne entrano a `pedata` (32 cm se manca); alzata = altezza / gradini, ma se viene oltre 19 cm la rampa parte da un plinto con alzate di 17 cm
    rampaScala: { nome: 'Rampa di scale in travertino', crea: (pr) => group((g) => {
      const pd = Math.min(0.6, Math.max(0.2, Number(pr.pedata) || 0.32));
      const [L, W, H] = ductDims(pr, 3.84, 1.4, 2.2), m = Math.max(1, Math.round(L / pd)), r = H / m <= 0.19 ? H / m : 0.17, t = L / m, { box } = partAdder(g), mat = primitiveMaterial('travertino');
      for (let j = 1; j <= m; j += 1) meshUV(box(-L / 2 + (j - 1) * t, -L / 2 + j * t, 0, H - (m - j) * r, -W / 2, W / 2, mat));
    }) },
    // staccionata metallica: montanti ogni 1,1 m al massimo, corrimano e corrente a 1 m e 0,5 m; con la scatola più alta di 1 m sale lungo x
    staccionata: { nome: 'Staccionata metallica (in pendenza se la scatola è alta più di 1 m)', crea: (pr) => group((g) => {
      const [L, , H] = ductDims(pr, 2, 0.05, 1), rise = Math.max(0, H - 1), { box, add } = partAdder(g), mat = metalloCancelli(pr), y = (x) => (rise * (x + L / 2)) / L;
      const n = Math.max(1, Math.ceil(L / 1.1));
      for (let i = 0; i <= n; i += 1) { const x = Math.min(L / 2 - 0.025, Math.max(-L / 2 + 0.025, -L / 2 + (L * i) / n)); box(x - 0.025, x + 0.025, y(x), y(x) + 1, -0.025, 0.025, mat); }
      for (const hh of [1, 0.5]) { const len = Math.hypot(L, rise) - 0.02, bar = add(new THREE.BoxGeometry(len, 0.04, 0.04), mat, 0, rise / 2 + hh - 0.02, 0); bar.rotation.z = Math.atan2(rise, L); }
    }) },
    cancelloScala: { nome: 'Cancello metallico a sbarre', crea: (pr) => group((g) => {
      const [L, , H] = ductDims(pr, 1.4, 0.05, 1.95), { box } = partAdder(g), mat = metalloCancelli(pr), nb = Math.max(2, Math.round(L / 0.12));
      for (const x of [-L / 2, L / 2 - 0.05]) box(x, x + 0.05, 0, H, -0.025, 0.025, mat); // montanti fissi
      const leaf = new THREE.Group(), hx = -L / 2 + 0.05, lw = L - 0.1, lb = partAdder(leaf).box; // anta fra i montanti, cardine a sinistra
      leaf.position.x = hx; leaf.userData.anta = { punta: [lw, 0, 0] }; g.add(leaf);
      lb(0, lw, 0.06, 0.11, -0.02, 0.02, mat); lb(0, lw, H - 0.05, H, -0.02, 0.02, mat);
      for (let k = 1; k < nb; k += 1) { const x = (lw * k) / nb; lb(x - 0.012, x + 0.012, 0.06, H - 0.05, -0.012, 0.012, mat); }
    }) },
    // corrimano tondo attaccato a un muro: segue la pendenza lungo x (sale di altezza − 0,9 m, a 0,9 m sopra il bordo basso della scatola),
    // con le staffe ogni 1,2 m verso il muro, che sta dal lato +z della scatola (dall'altro lato: «Specchia» v)
    corrimano: { nome: 'Corrimano a muro (in pendenza se la scatola è alta più di 0,9 m)', crea: (pr) => group((g) => {
      const [L, W, H] = ductDims(pr, 3, 0.08, 0.95), rise = Math.max(0, H - 0.95), { add } = partAdder(g), mat = metalloScale(pr), z0 = -W / 2 + 0.022;
      const len = Math.hypot(L, rise), bar = add(new THREE.CylinderGeometry(0.022, 0.022, len, 10), mat, 0, rise / 2 + 0.9, z0); bar.rotation.z = Math.atan2(rise, L) - Math.PI / 2;
      const n = Math.max(2, Math.ceil(L / 1.2) + 1);
      for (let i = 0; i < n; i += 1) {
        const x = -L / 2 + 0.15 + ((L - 0.3) * i) / (n - 1), y = (rise * (x + L / 2)) / L + 0.9;
        add(new THREE.BoxGeometry(0.02, 0.02, W / 2 - 0.012 - z0), mat, x, y - 0.03, (z0 + W / 2 - 0.012) / 2);
        add(new THREE.BoxGeometry(0.05, 0.08, 0.012), mat, x, y - 0.03, W / 2 - 0.006);
      }
      add(new THREE.BoxGeometry(0.02, 0.02, 0.02), mat, -L / 2, 0, 0).visible = false; // la scatola parte da terra: l'adattamento non stira il corrimano
    }) },
    balaustra: { nome: 'Balaustra di travertino', crea: (pr) => group((g) => {
      const [L, W, H] = ductDims(pr, 1.7, 0.3, 1), { box } = partAdder(g), mat = primitiveMaterial('travertino'), nb = Math.max(2, Math.floor(L / 0.19));
      meshUV(box(-L / 2, L / 2, 0, 0.14, -W / 2, W / 2, mat)); meshUV(box(-L / 2, L / 2, H - 0.12, H, -W / 2, W / 2, mat));
      for (let k = 0; k < nb; k += 1) { const x = -L / 2 + (L * (k + 0.5)) / nb; meshUV(box(x - 0.04, x + 0.04, 0.14, H - 0.12, -0.05, 0.05, mat)); }
    }) },
    // porta a vetri: telaio scuro dietro (−z, contro il muro), vetro e montante davanti (+z)
    portaVetri: { nome: 'Porta a vetri con telaio scuro', crea: (pr) => group((g) => {
      const [L, W, H] = ductDims(pr, 1.66, 0.08, 2.78), { box } = partAdder(g);
      const fr = courtOnce('cu|porte telaio', () => stdMat({ color: '#3b2f27', roughness: 0.7 })), gl = courtOnce('cu|porte vetro', () => stdMat({ color: '#25323a', roughness: 0.12, metalness: 0.45 }));
      box(-L / 2, L / 2, 0, H, -W / 2, -W / 2 + 0.04, fr);
      box(-L / 2 + 0.08, L / 2 - 0.08, 0.04, H - 0.08, -W / 2 + 0.04, -W / 2 + 0.06, gl);
      box(-0.025, 0.025, 0, H, -W / 2 + 0.04, W / 2, fr);
    }) },
  };
  const CATALOGO = {
    ...CATALOGO_GINESTRA,
    ...Object.fromEntries(Object.entries(KIT_CONDOTTE).map(([k, [code, nome, size]]) => [k, { nome, crea: () => kitPiece(code, size) }])),
    condotta: { nome: 'Condotta dell’aria (canale zincato su piedini)', crea: (pr) => group((g) => { const [L, W, H] = ductDims(pr, 3, 1, 1.25); ductSegment(g, L, W, H, Math.min(0.45, Math.max(0.1, H * 0.22))); }) },
    /* UTA come nelle foto del tetto della Ginestra (23/10): in testa (−x) una cappa più bassa e stretta con la griglia, poi il corpo a pannelli
       su un telaio, e verso il canale (+x) un raccordo rastremato fino alla sezione del canale (campo `raccordo`: larghezza e quote da/a
       sopra la base dell'oggetto, di solito quelle della «condotta» che ci arriva). Tutto in lamiera del kit. */
    uta: { nome: 'Unità di trattamento aria (UTA) da tetto', crea: (pr) => group((g) => {
      const [L, W, H] = ductDims(pr, 8, 2.4, 2.55), { box, add } = partAdder(g), base = 0.2, R = pr.raccordo || {};
      const dw = Math.min(W, Number(R.larghezza) || 1.3), da = Math.max(0, Number(R.da) || 0.33), dh = Math.min(H, Number(R.a) || 1.5);
      const t = Math.min(1.2, L * 0.15), e = Math.min(0.8, L * 0.1), x0 = -L / 2 + e, x1 = L / 2 - t; // cappa da −L/2 a x0, corpo da x0 a x1, raccordo da x1 a L/2
      const steel = kitSteel(), dark = courtOnce('condotte|griglia', () => stdMat({ color: 0x2c2e30, roughness: 0.6, metalness: 0.4 }));
      box(x0, x1, 0, base, -W / 2 + 0.06, W / 2 - 0.06, staffe()); // telaio
      kitUV(box(x0, x1, base, H, -W / 2, W / 2, steel));
      const n = Math.max(2, Math.round((x1 - x0) / 1.1));
      for (let i = 0; i <= n; i += 1) { const x = x0 + ((x1 - x0) * i) / n; kitUV(box(Math.max(x0, x - 0.025), Math.min(x1, x + 0.025), base, H + 0.02, -W / 2 - 0.02, W / 2 + 0.02, zincoScuro())); } // giunti dei pannelli
      kitUV(box(x0 + 0.06, x1 - 0.06, H, H + 0.05, -W / 2 + 0.06, W / 2 - 0.06, steel)); // coperchio a pannelli
      for (let i = 1; i < n; i += 1) { const x = x0 + ((x1 - x0) * i) / n; box(x - 0.02, x + 0.02, H + 0.05, H + 0.08, -W / 2 + 0.06, W / 2 - 0.06, zincoScuro()); } // coprigiunti
      kitUV(add(sectionTaper(x1 - 0.06, L / 2, [base + 0.05, H - 0.05, W / 2 - 0.05], [da, dh, dw / 2]), steel, 0, 0, 0)); // parte dentro il corpo: niente facce sovrapposte (sfarfallio, commento del 30/10)
      box(x1, L / 2, 0, da, -0.05, 0.05, staffe()); // sostegno del raccordo
      // cappa di testa (foto dell'utente del 30/10): sopra piatta, fronte inclinato a 45° che scende allargandosi verso l'esterno,
      // bocca grigliata sotto il fronte
      const hh = base + (H - base) * 0.62, hw = W * 0.8, sl = hh - base, top = Math.max(0.1, e - sl * 0.25);
      const prof = new THREE.Shape(); prof.moveTo(x0, base); prof.lineTo(x0 - top - sl, base); prof.lineTo(x0 - top, hh); prof.lineTo(x0, hh); prof.lineTo(x0, base);
      const hood = new THREE.ExtrudeGeometry(prof, { depth: hw, bevelEnabled: false }); hood.translate(0, 0, -hw / 2);
      kitUV(add(hood, steel, 0, 0, 0));
      const face = add(new THREE.PlaneGeometry(sl * Math.SQRT2 * 0.8, hw * 0.85), dark, x0 - top - sl / 2 - 0.006, (base + hh) / 2 - 0.004, 0);
      face.rotation.set(0, -Math.PI / 2, 0); face.rotateX(Math.PI / 4); // griglia sul fronte inclinato
    }) },
    // unità esterna: telaio in lamiera del kit, una ventola ogni quadrato lungo il lato più lungo (nelle foto: due ventole per unità)
    ventilatore: { nome: 'Unità esterna da tetto (ventole sopra)', crea: (pr) => group((g) => {
      const [L, W, H] = ductDims(pr, 1, 1, 1.1), { box, add } = partAdder(g), alongX = L >= W, n = Math.max(1, Math.round(Math.max(L, W) / Math.min(L, W)));
      const r = Math.min(Math.min(L, W), Math.max(L, W) / n) * 0.38, dark = courtOnce('condotte|griglia', () => stdMat({ color: 0x2c2e30, roughness: 0.6, metalness: 0.4 }));
      box(-L / 2, L / 2, 0, 0.1, -W / 2, W / 2, staffe());
      kitUV(box(-L / 2, L / 2, 0.1, H - 0.08, -W / 2, W / 2, kitSteel()));
      kitUV(box(-L / 2 - 0.02, L / 2 + 0.02, H - 0.08, H - 0.02, -W / 2 - 0.02, W / 2 + 0.02, zincoScuro()));
      for (let i = 0; i < n; i += 1) {
        const c = -Math.max(L, W) / 2 + (Math.max(L, W) * (i + 0.5)) / n, x = alongX ? c : 0, z = alongX ? 0 : -c;
        add(new THREE.CylinderGeometry(r, r, 0.08, 24), dark, x, H - 0.03, z);
        add(new THREE.TorusGeometry(r, 0.03, 6, 24).rotateX(Math.PI / 2), zincoScuro(), x, H, z);
        add(new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.1, 12), zincoScuro(), x, H - 0.01, z);
      }
    }) },
    cassetta: { nome: 'Cassetta / quadro da tetto in lamiera', crea: (pr) => group((g) => {
      const [L, W, H] = ductDims(pr, 1, 1.8, 1.3), { box } = partAdder(g);
      box(-L / 2, L / 2, 0, 0.08, -W / 2, W / 2, staffe());
      kitUV(box(-L / 2, L / 2, 0.08, H, -W / 2, W / 2, kitSteel()));
      kitUV(box(-L / 2 - 0.04, L / 2 + 0.04, H, H + 0.04, -W / 2 - 0.04, W / 2 + 0.04, zincoScuro()));
      box(L / 2, L / 2 + 0.01, 0.2, H - 0.12, -0.012, 0.012, zincoScuro()); // fessura fra le due ante
    }) },
    camino: { nome: 'Camino di ventilazione a imbuto', crea: (pr) => group((g) => {
      const [L, W, H] = ductDims(pr, 0.7, 0.7, 0.75), { add } = partAdder(g), R = Math.min(L, W) / 2;
      add(new THREE.CylinderGeometry(R * 0.32, R * 0.32, H * 0.5, 16), zinco(), 0, H * 0.25, 0);
      add(new THREE.CylinderGeometry(R, R * 0.32, H * 0.5, 24), zinco(), 0, H * 0.75, 0);
    }) },
    // bocca di ripresa in cima a un montante: cappello a tramoggia rovesciata (punta in basso), come in fondo al canale nord (foto del 30/10)
    cappelloPiramide: { nome: 'Bocca a cappello piramidale su montante', crea: (pr) => group((g) => {
      const [L, W, H] = ductDims(pr, 0.8, 0.8, 1.6), { box, add } = partAdder(g), c = Math.min(L, W), hp = Math.min(c * 0.7, H * 0.4);
      kitUV(box(-c * 0.25, c * 0.25, 0, H - hp, -c * 0.25, c * 0.25, kitSteel()));
      const cone = add(new THREE.ConeGeometry(c * 0.71, hp, 4, 1), kitSteel(), 0, H - hp / 2, 0); cone.rotation.set(Math.PI, Math.PI / 4, 0);
      kitUV(box(-c / 2, c / 2, H - 0.03, H, -c / 2, c / 2, zincoScuro()));
    }) },
    curvaCondotta: { nome: 'Curva della condotta verso l’alto, con cappello', crea: (pr) => group((g) => {
      const [L, W, H] = ductDims(pr, 1.5, 1, 2.2), { box } = partAdder(g), s = Math.min(0.25, H * 0.1), d = Math.min(W, L * 0.6), hs = Math.min(0.8, H * 0.4);
      const xr = L / 2 - d; // tratto orizzontale da −L/2 a xr, montante da xr a L/2
      box(-L / 2, xr, s, s + hs, -W / 2 + 0.03, W / 2 - 0.03, zinco());
      box(xr, L / 2, s, H - 0.2, -W / 2 + 0.03, W / 2 - 0.03, zinco());
      box(xr - 0.06, L / 2, H - 0.2, H - 0.12, -W / 2, W / 2, zincoScuro()); // tesa del cappello
      box(xr + 0.05, L / 2 - 0.05, H - 0.12, H, -W / 2 + 0.05, W / 2 - 0.05, zincoScuro());
      for (const x of [-L / 2 + 0.1, xr + d / 2]) box(x - 0.03, x + 0.03, 0, s, -W / 2 + 0.05, W / 2 - 0.05, staffe());
      // col kit dell'utente: tratto dritto orizzontale, gomito verso l'alto e montante dritto (stessa sezione W × hs)
      const corpi = g.children.slice(0, 2);
      loadVentKit().then((kit) => {
        const dr = kit && kit['014'], go = kit && kit['023'];
        if (!dr || !go) return;
        for (const c of corpi) { g.remove(c); c.geometry.dispose(); }
        const add = (p, sx, sy, sz, x, y, rz) => { const m = new THREE.Mesh(p.geo, p.mat); m.scale.set(sx, sy, sz); m.position.set(x, y, 0); m.rotation.z = rz; m.castShadow = m.receiveShadow = true; g.add(m); };
        const gl = Math.min(d, hs * 1.4), xh = xr + d - gl; // gomito nell'angolo, largo gl
        if (xh > -L / 2 + 0.05) add(dr, (xh + L / 2) / dr.size.x, hs / dr.size.y, W / dr.size.z, (xh - L / 2) / 2, s, 0);
        add(go, gl / go.size.x, gl / go.size.y, W / go.size.z, xh + gl / 2, s, 0);
        const v0 = s + gl, v1 = H - 0.2; // montante: tratto dritto ruotato in verticale
        if (v1 > v0 + 0.05) add(dr, (v1 - v0) / dr.size.x, d / dr.size.y, W / dr.size.z, xr + d / 2 + d / 2, (v0 + v1) / 2, Math.PI / 2);
      });
    }) },
    panchina: { nome: 'Panchina in travertino', crea: () => group((g) => addBench(g, { u: 0, v: 0 }, 0)) },
    palma: { nome: 'Palma', crea: () => albero(palmTree({ u: 0, v: 0, altezza: 4 })) },
    magnolia: { nome: 'Magnolia', crea: () => albero(magnoliaTree({ u: 0, v: 0, altezza: 12.5, raggio: 3.8 }, 0)) },
    totem: { nome: 'Totem CU014 (lastra rossa con tre cartelli)', crea: (pr) => group((g) => addTotem(g, { u: 0, v: 0, scritta: pr.scritta != null ? pr.scritta : 'CU014', cartello: pr.cartello, logoMuseo: pr.logoMuseo })) },
    ringhiera: { nome: 'Ringhiera rossa', crea: () => group((g) => addRailing(g, [[[-1.3, 0], [1.3, 0]]], 0, { altezza: 1 })) },
    palo: { nome: 'Palo della bandiera', crea: () => flagPole({ u: 0, v: 0 }) },
    scala: { nome: 'Scala antincendio', crea: (pr) => group((g) => { const m = fireStairMats(); addFireStair(g, 0, Math.max(1, Number(pr.piani) || 4), m.ocra, { pedate: m.ocraScura }); }) },
    silos: { nome: 'Silos dell’azoto (logo Nippon Gases)', crea: () => nitrogenTank({ u: 0, v: 0, raggio: 0.8, altezza: 4.2 }) },
    gabbia: { nome: 'Gabbia verde con porticina', crea: () => buildCage({ u: [0, 3.3], v: [0, 2.95], altezza: 1.63, porta: { v: [0.8, 2.0], soglia: 0, sommita: 1.63 } }, 0) },
    cancello: { nome: 'Cancello a barre', crea: () => barGate(2.5, 2.1, false) },
    tombino: { nome: 'Tombino in ghisa', crea: () => manhole(0.6) },
    transenna: { nome: 'Transenna zincata', crea: () => crowdBarrier(2) },
    rastrelliera: { nome: 'Rastrelliera per bici', crea: () => group((g) => addBikeRack(g, { u: 0, v: 0, posti: 3 })) },
    portone: { nome: 'Portone in legno con stipiti', crea: () => group((g) => {
      const W = 2.3, Hd = 3.3, wood = courtOnce('portone|legno', () => plainMat('#3a2416', 0.8)), door = doorMaterial();
      const d = new THREE.Mesh(new THREE.BoxGeometry(W, Hd, 0.08), [wood, wood, wood, wood, door, door]); d.position.y = Hd / 2 + 0.02; d.castShadow = true; g.add(d);
      for (const [a, b] of [[-W / 2 - 0.28, -W / 2], [W / 2, W / 2 + 0.28]]) g.add(localSlab(rectPts(a, b, -0.08, 0.08), 0.02, Hd + 0.3, travPhoto(1.2))); // stipiti
      g.add(localSlab(rectPts(-W / 2 - 0.28, W / 2 + 0.28, -0.08, 0.08), Hd + 0.02, Hd + 0.3, travPhoto(1.2))); // architrave
    }) },
    // porta antincendio a due ante in lamiera marrone, senza vetri, con vasistas sopra. Davanti (+z) classica maniglia a L in plastica nera,
    // dietro (−z, contro il muro) maniglione antipanico rosso da spingere. Come il portone, l'editor la tiene poggiata a terra e attaccata a una parete.
    portaAntincendio: { nome: 'Porta antincendio doppia (metallo marrone, vasistas)', crea: () => group((g) => {
      const { add } = partAdder(g), metal = courtOnce('antincendio|anta', () => stdMat({ color: 0x6a4228, roughness: 0.5, metalness: 0.55 })), telaio = courtOnce('antincendio|telaio', () => stdMat({ color: 0x4a2f1e, roughness: 0.5, metalness: 0.55 }));
      const red = courtOnce('antincendio|maniglione', () => stdMat({ color: 0xb3151c, roughness: 0.45, metalness: 0.3 })), plastic = courtOnce('antincendio|maniglia', () => plainMat('#1d1d1d', 0.5));
      const glass = courtOnce('antincendio|vetro', () => stdMat({ color: 0x9fc3d8, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.4 }));
      const leaf = 0.9, Hd = 2.1, jamb = 0.06, top = 2.7, x0 = leaf + 0.01; // due ante da 0,9 m, vasistas fino a 2,7 m
      for (const s of [-1, 1]) {
        add(new THREE.BoxGeometry(leaf, Hd, 0.05), metal, s * (leaf / 2 + 0.01), Hd / 2 + 0.02, 0);
        add(new THREE.BoxGeometry(leaf - 0.2, Hd - 0.3, 0.012), telaio, s * (leaf / 2 + 0.01), Hd / 2 + 0.02, 0.03); // specchiatura in rilievo sul fronte
        add(new THREE.BoxGeometry(jamb, top, 0.1), telaio, s * (x0 + jamb / 2), top / 2, 0); // montante del telaio
        const bar = add(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 12), red, s * (leaf / 2 + 0.01), 1.05, -0.07); bar.rotation.z = Math.PI / 2; // maniglione rosso sul retro
        for (const dx of [-0.3, 0.3]) add(new THREE.BoxGeometry(0.04, 0.04, 0.05), red, s * (leaf / 2 + 0.01) + dx, 1.05, -0.045);
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14), plastic, s * 0.14, 1.05, 0.031).rotation.x = Math.PI / 2; // rosetta della maniglia a L
        add(new THREE.BoxGeometry(0.025, 0.025, 0.06), plastic, s * 0.14, 1.05, 0.06);                                      // gambo
        add(new THREE.BoxGeometry(0.14, 0.025, 0.025), plastic, s * (0.14 + 0.055), 1.05, 0.09);                              // leva: la «L»
      }
      add(new THREE.BoxGeometry(2 * x0 + 2 * jamb, 0.07, 0.1), telaio, 0, Hd + 0.055, 0); // traverso sopra le ante
      add(new THREE.BoxGeometry(2 * x0 + 2 * jamb, 0.06, 0.1), telaio, 0, top - 0.03, 0); // traverso alto del vasistas
      add(new THREE.BoxGeometry(2 * x0, top - Hd - 0.16, 0.012), glass, 0, (Hd + 0.09 + top - 0.06) / 2, 0, false); // vetro del vasistas
      add(new THREE.BoxGeometry(0.04, top - Hd - 0.16, 0.05), telaio, 0, (Hd + 0.09 + top - 0.06) / 2, 0); // montante centrale
    }) },
    condizionatore: { nome: 'Condizionatore', crea: () => group((g) => {
      const white = courtOnce('condizionatore', () => plainMat('#e9e9e6', 0.5)), grille = courtOnce('condizionatore|griglia', () => new THREE.MeshStandardMaterial({ roughness: 0.5, map: canvasTex(160, 110, (ctx, w, h) => {
        ctx.fillStyle = '#e9e9e6'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#8d8f90'; ctx.lineWidth = 2; for (let r = 8; r < 44; r += 6) { ctx.beginPath(); ctx.arc(w * 0.38, h / 2, r, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = '#c9cbcb'; ctx.fillRect(w * 0.78, 14, 22, h - 28);
      }) }));
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.3), [white, white, white, white, white, grille]); m.position.y = 0.275; m.castShadow = true; g.add(m);
    }) },
    fiori: { nome: 'Cespuglio fiorito', crea: () => group((g) => g.add(localSlab(rectPts(-0.75, 0.75, -0.4, 0.4), 0, 0.4, flowerMaterial()))) },
    lampione: { nome: 'Lampione verde', crea: () => group((g) => addLampione(g, { u: 0, v: 0 })) },
    pergolato: { nome: 'Pergolato con vite americana', crea: () => group((g) => addPergola(g, { u: [0, 6], v: [0, 2.6], altezza: 3.0 })) },
    transennaStrisce: { nome: 'Transenna a strisce bianche e rosse', crea: () => group((g) => { // barre inclinate di 35° in senso orario
      const metal = courtOnce('transenna strisce|telaio', () => stdMat({ color: 0xc9ccce, roughness: 0.45, metalness: 0.5 }));
      const stripes = courtOnce('transenna strisce', () => new THREE.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(512, 160, (ctx, w, h) => {
        ctx.fillStyle = '#f4f3ef'; ctx.fillRect(0, 0, w, h);
        ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate((35 * Math.PI) / 180); ctx.fillStyle = '#c3222f';
        for (let x = -w; x < w; x += 64) ctx.fillRect(x, -w, 32, 2 * w);
        ctx.restore();
      }) }));
      const L = 2, { add, box } = partAdder(g);
      box(-L / 2 + 0.03, L / 2 - 0.03, 0.4, 0.95, -0.015, 0.015, [metal, metal, metal, metal, stripes, stripes]);
      for (const x of [-L / 2, L / 2]) { add(new THREE.CylinderGeometry(0.022, 0.022, 1.1, 10), metal, x, 0.55, 0); box(x - 0.03, x + 0.03, 0, 0.03, -0.3, 0.3, metal); }
      for (const y of [0.4, 0.95, 1.1]) { const r = add(new THREE.CylinderGeometry(0.016, 0.016, L, 8), metal, 0, y, 0); r.rotation.z = Math.PI / 2; }
    }) },
    tubo: { nome: 'Tubo di scarico metallico con gomiti', crea: () => group((g) => {
      const mat = courtOnce('tubo metallico', () => stdMat({ color: 0xd3d6d8, roughness: 0.4, metalness: 0.45 })), r = 0.08, yAxis = new THREE.Vector3(0, 1, 0), { add } = partAdder(g);
      const pts = [[0, 0.68], [1.4, 0.68], [1.4, 0.1], [2.6, 0.1]].map(([u, h]) => new THREE.Vector3(u, h, 0));
      for (let i = 0; i < pts.length - 1; i += 1) { const a = pts[i], b = pts[i + 1], seg = add(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 18), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, 0); seg.quaternion.setFromUnitVectors(yAxis, b.clone().sub(a).normalize()); }
      for (const q of pts.slice(1, -1)) add(new THREE.SphereGeometry(r, 18, 12), mat, q.x, q.y, q.z); // gomiti
    }) },
    canaletta: { nome: 'Canaletta (mezzo tubo bianco)', crea: () => group((g) => {
      const half = new THREE.CylinderGeometry(0.09, 0.09, 1.6, 16, 1, true, Math.PI / 2, Math.PI); half.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(half, courtOnce('canaletta', () => stdMat({ color: 0xf0efea, roughness: 0.8, side: THREE.DoubleSide }))); m.position.y = 0.095; g.add(m);
    }) },
    fossetta: { nome: 'Fossetta di scarico scoperta', crea: () => group((g) => {
      const { box } = partAdder(g), w = 0.22, len = 3;
      box(-w / 2, w / 2, 0, 0.016, 0, len, courtOnce('fossetta', () => stdMat({ roughness: 1, map: canvasTex(64, 256, (ctx, cw, ch) => {
        ctx.fillStyle = '#3d3b30'; ctx.fillRect(0, 0, cw, ch);
        for (let i = 0; i < 260; i += 1) { const t = hash01(i, 71); ctx.fillStyle = t > 0.75 ? 'rgba(150,104,52,0.6)' : t > 0.45 ? 'rgba(88,108,56,0.55)' : 'rgba(22,20,16,0.5)'; ctx.fillRect(hash01(i, 72) * cw, hash01(i, 73) * ch, 3 + 6 * hash01(i, 74), 3 + 9 * hash01(i, 75)); }
      }, 1, len / 1.2) })));
      box(-w / 2 - 0.06, -w / 2, 0, 0.035, 0, len, courtOnce('fossetta|bordo', () => stdMat({ color: 0x6f7163, roughness: 1 })));
    }) },
    recinzione: { nome: 'Recinzione su muretto (cancellata su strada)', crea: () => group((g) => {
      const { box } = partAdder(g), L = 3, rust = courtOnce('ruggine', () => stdMat({ color: 0x7a4b30, roughness: 0.55, metalness: 0.35 }));
      box(0, L, 0, 0.9, -0.15, 0.15, courtOnce('muretto', () => stdMat({ map: travertineTex(1 / 2.4, 1 / 2.4) })));
      for (const [h0, h1] of [[0.9, 0.95], [2.0, 2.05]]) box(0, L, h0, h1, -0.025, 0.025, rust);
      for (let u = 0.06; u < L; u += 0.13) box(u - 0.014, u + 0.014, 0.95, 2.0, -0.014, 0.014, rust);
    }) },
    grata: { nome: 'Grata a barre (fondo del portico)', crea: () => group((g) => {
      const { box } = partAdder(g), L = 3, H = 2.5, rust = courtOnce('ruggine', () => stdMat({ color: 0x7a4b30, roughness: 0.55, metalness: 0.35 }));
      for (let u = 0.08; u < L - 0.04; u += 0.12) box(u - 0.0125, u + 0.0125, 0, H, -0.0125, 0.0125, rust);
      for (const hh of [0.12, 1.1, 2.3]) box(0, L, hh - 0.03, hh + 0.03, -0.03, 0.03, rust);
      box(0, L, H - 0.06, H, -0.03, 0.03, rust);
      for (const u of [0, L]) box(u - 0.04, u + 0.04, 0, H, -0.04, 0.04, rust);
    }) },
    targa: { nome: 'Targa rossa', crea: () => group((g) => {
      const red = courtOnce('targa', () => new THREE.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(64, 48, (ctx, w, hh) => { ctx.fillStyle = '#8a1f2d'; ctx.fillRect(0, 0, w, hh); ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 4; i += 1) ctx.fillRect(8, 9 + i * 8, i ? 30 + (i % 2) * 14 : 46, 3); }) }));
      const edge = courtOnce('targa|bordo', () => plainMat('#6e1824', 0.6));
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.02), [edge, edge, edge, edge, red, red]); m.position.y = 0.16; g.add(m);
    }) },
    scritta: { nome: 'Scritta (lettere scure, come ISTITUTO CHIMICO)', crea: (pr) => group((g) => {
      const text = pr.scritta != null ? String(pr.scritta) : 'ISTITUTO';
      const mat = courtOnce('scritta|' + text, () => new THREE.MeshStandardMaterial({ roughness: 0.8, transparent: true, alphaTest: 0.3, map: canvasTex(512, 96, (ctx, w, hh) => {
        ctx.clearRect(0, 0, w, hh); ctx.fillStyle = '#3f3a33'; ctx.font = 'bold 78px "Times New Roman", Times, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, hh / 2 + 4, w - 12);
      }, 1, 1, true) }));
      for (const [rot, z] of [[Math.PI, -0.002], [0, 0.002]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.49), mat); m.rotation.y = rot; m.position.set(0, 0.245, z); g.add(m); } // leggibile dai due lati
    }) },
    tattile: { nome: 'Percorso tattile a righe', crea: () => group((g) => {
      const strip = localSlab(rectPts(-0.3, 0.3, 0, 3), 0, 0.045, courtOnce('tattile', () => new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTex(64, 64, (ctx, cw) => { ctx.fillStyle = '#a3a39e'; ctx.fillRect(0, 0, cw, cw); ctx.fillStyle = '#7f7f7a'; for (let x = 4; x < cw; x += 16) ctx.fillRect(x, 0, 6, cw); }, 1 / 0.6, 1) })));
      strip.castShadow = false; g.add(strip);
    }) },
    finestra: { nome: 'Finestra con cornice', crea: () => group((g) => {
      const { box } = partAdder(g), frame = courtOnce('finestra|cornice', () => plainMat('#e2d8c5', 0.8)), glass = courtOnce('finestra|vetro', () => stdMat({ color: 0x2b2f33, roughness: 0.25, metalness: 0.3 }));
      const W = 1.2, H = 1.7;
      box(-W / 2, W / 2, 0, 0.1, -0.06, 0.06, frame); box(-W / 2, W / 2, H - 0.1, H, -0.06, 0.06, frame);
      box(-W / 2, -W / 2 + 0.1, 0, H, -0.06, 0.06, frame); box(W / 2 - 0.1, W / 2, 0, H, -0.06, 0.06, frame);
      box(-W / 2 + 0.1, W / 2 - 0.1, 0.1, H - 0.1, -0.02, 0.02, glass);
      box(-0.02, 0.02, 0.1, H - 0.1, -0.035, 0.035, frame);
    }) },
    // finestra «a nastro» rientrante (commento con foto del 31/10, facciata ovest di CU014): un'unica apertura lunga quanto tre finestre,
    // scavata nel muro (lo stencil toglie lì la facciata con le sue finestre dipinte), spalle e cielino in intonaco, davanzale e cornice
    // chiari, tre serrande avvolgibili marroni abbassate in fondo. Coordinate come nel dato: u verso l'interno del muro (il muro è a u = 0,
    // il davanzale sporge a u < 0), z = −v lungo la facciata. Le misure vengono dalla scatola, così l'oggetto non si stira.
    nicchiaSerrande: { nome: 'Finestra a nastro rientrante con tre serrande', crea: (pr) => group((g) => {
      const b = pr.box || {}, sp = 0.08, L = Math.max(1, (b.v1 - b.v0) || 9.2), H = Math.max(0.5, (b.h1 - b.h0) || 2.3), D = Math.max(0.1, ((b.u1 - b.u0) || 0.48) - sp);
      const { box } = partAdder(g), part = (u0, u1, h0, h1, v0, v1, mat) => { const m = box(u0, u1, h0, h1, v0, v1, mat); m.castShadow = false; m.receiveShadow = false; return m; };
      // partAdder: primo asse = x, terzo = −z; qui x = u (verso l'interno) e −z = v (lungo il muro)
      const intonaco = courtOnce('nicchia|intonaco', () => plainMat('#a86c48', 0.95)), cielino = courtOnce('nicchia|cielino', () => plainMat('#7a4a30', 0.95));
      const chiaro = courtOnce('nicchia|cornice', () => plainMat('#e6dcc8', 0.85)), trav = primitiveMaterial('travertino');
      const serranda = courtOnce('nicchia|serranda', () => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.15, map: canvasTex(64, 128, (ctx, w, h) => {
        ctx.fillStyle = '#6e4632'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(35,20,12,.45)'; for (let y = 2; y < h; y += 4) ctx.fillRect(0, y, w, 1);
        ctx.fillStyle = 'rgba(255,230,200,.10)'; for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
      }, 1, 6) }));
      const sill = 0.12, top = H, hv = L / 2, cf = 0.06; // davanzale alto 12 cm, cornice chiara larga 6 cm sul filo del muro
      part(0, D, sill, top, -hv, -hv + 0.01, intonaco); part(0, D, sill, top, hv - 0.01, hv, intonaco); // spalle
      part(0, D, top - 0.01, top, -hv, hv, cielino);                                                       // cielino
      part(-sp, D, 0, sill, -hv, hv, trav);                                                                // davanzale in travertino, sporgente
      for (const [v0, v1] of [[-hv - cf, -hv], [hv, hv + cf]]) part(-0.02, 0, 0, top + cf, v0, v1, chiaro); // cornice chiara ai lati
      part(-0.02, 0, top, top + cf, -hv - cf, hv + cf, chiaro);                                             // e sopra
      const w3 = L / 3;
      for (let k = 0; k < 3; k += 1) {
        const a = -hv + k * w3, m = part(D - 0.04, D, sill, top - 0.01, a + 0.04, a + w3 - 0.04, serranda); // serranda abbassata
        part(D - 0.08, D - 0.04, sill, sill + 0.05, a + 0.04, a + w3 - 0.04, cielino);                        // battuta in basso
        if (k) part(D - 0.1, D, sill, top, a - 0.05, a + 0.05, intonaco);                                    // montante fra due serrande
        m.receiveShadow = false;
      }
      // maschera: segna lo stencil sull'apertura prima che si disegnino le facciate
      const mask = new THREE.Mesh(new THREE.PlaneGeometry(L, top - sill), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
      mask.rotation.y = -Math.PI / 2; mask.position.set(-0.003, (sill + top) / 2, 0); mask.renderOrder = -10; mask.castShadow = false; mask.frustumCulled = false; g.add(mask);
    }) },
    // tubo rosso: orizzontale lungo x, oppure verticale se la scatola è più alta che lunga (montante); sfere ai capi per unirsi ai tubi vicini
    tuboRosso: { nome: 'Tubo rosso a muro', crea: (pr) => group((g) => {
      const [L, , H] = ductDims(pr, 3, 0.09, 0.09), up = H > L, n = up ? H : L, red = courtOnce('tubo rosso', () => stdMat({ color: 0xb3262e, roughness: 0.5, metalness: 0.2 }));
      const k = pr && pr.box ? n : 3, p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, k, 10), red);
      if (up) p.position.y = k / 2; else { p.rotation.z = Math.PI / 2; p.position.y = 0.045; }
      p.castShadow = true; g.add(p);
      for (const e of [-k / 2, k / 2]) { const j = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), red); if (up) j.position.set(0, k / 2 + e, 0); else j.position.set(e, 0.045, 0); g.add(j); }
    }) },
    /* arredo dell'angolo sud-ovest di CU014 (22 foto del commento sul fronte sud della Ginestra, 01/11) */
    // bocca di aerazione sul grigliato: cassone intonacato rosa, piano in travertino che sporge di 5 cm, griglia a lamelle sul lato lungo (verso +z)
    bocchetta: { nome: 'Bocca di aerazione (cassone rosa, piano in travertino, griglia)', crea: () => group((g) => {
      const { box } = partAdder(g), L = 1.9, W = 1.0, H = 0.65, t = 0.08, rosa = courtOnce('bocchetta|intonaco', () => plainMat('#d79c86', 0.95));
      const griglia = courtOnce('bocchetta|griglia', () => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.3, map: canvasTex(64, 32, (ctx, w, h) => { ctx.fillStyle = '#2c2a28'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#6b6560'; for (let y = 1; y < h; y += 4) ctx.fillRect(0, y, w, 2); }) }));
      box(-L / 2 + 0.05, L / 2 - 0.05, 0, H - t, -W / 2 + 0.05, W / 2 - 0.05, rosa);
      meshUV(box(-L / 2, L / 2, H - t, H, -W / 2, W / 2, primitiveMaterial('travertino')));
      const gr = box(-L / 2 + 0.25, L / 2 - 0.25, 0.12, H - t - 0.08, -W / 2 + 0.04, -W / 2 + 0.06, griglia); gr.castShadow = false; // −v locale = +z: lato verso chi guarda da fuori
    }) },
    // bacheca per manifesti: telaio scuro su due gambe, manifesti strappati da un lato e dall'altro, targhetta «R.S.U.» sopra
    bacheca: { nome: 'Bacheca per manifesti (R.S.U.)', crea: () => group((g) => {
      const { box } = partAdder(g), L = 2.6, scuro = courtOnce('bacheca|telaio', () => stdMat({ color: 0x2a2b2d, roughness: 0.5, metalness: 0.5 }));
      const carta = courtOnce('bacheca|manifesti', () => new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTex(256, 160, (ctx, w, h) => {
        ctx.fillStyle = '#d8d6d0'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 26; i += 1) { ctx.fillStyle = ['#6fa8d8', '#e9e6df', '#1b1b1d', '#b9c7d6', '#f2d24b', '#9fb4c9'][i % 6]; ctx.globalAlpha = 0.85; ctx.fillRect(hash01(i, 51) * w * 0.9, hash01(i, 52) * h * 0.9, 20 + 70 * hash01(i, 53), 16 + 50 * hash01(i, 54)); }
        ctx.globalAlpha = 1;
      }) }));
      for (const x of [-L / 2 + 0.08, L / 2 - 0.08]) box(x - 0.04, x + 0.04, 0, 0.6, -0.04, 0.04, scuro);
      box(-L / 2, L / 2, 0.55, 2.3, -0.06, 0.06, scuro);
      for (const [a, b] of [[0.061, 0.063], [-0.063, -0.061]]) { const p = box(-L / 2 + 0.08, L / 2 - 0.08, 0.63, 2.22, a, b, carta); p.castShadow = false; }
      box(-0.35, 0.35, 2.3, 2.5, -0.03, 0.03, scuro); // targhetta R.S.U.
    }) },
    // paracarro di travertino davanti alla bacheca
    paracarro: { nome: 'Paracarro in travertino', crea: () => group((g) => { const { box } = partAdder(g); meshUV(box(-0.14, 0.14, 0, 0.85, -0.11, 0.11, primitiveMaterial('travertino'))); }) },
    // pannello con la pianta della Città universitaria su zoccolo di travertino (lato col disegno verso +z)
    mappaCampus: { nome: 'Pannello con la pianta della Città universitaria', crea: () => group((g) => {
      const { box } = partAdder(g), scuro = courtOnce('bacheca|telaio', () => stdMat({ color: 0x2a2b2d, roughness: 0.5, metalness: 0.5 }));
      const mappa = courtOnce('mappa campus', () => new THREE.MeshStandardMaterial({ roughness: 0.7, map: canvasTex(128, 160, (ctx, w, h) => {
        ctx.fillStyle = '#efece4'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#7a1f2b'; ctx.fillRect(0, h - 10, w, 10); ctx.fillStyle = '#333'; ctx.fillRect(6, 6, 50, 6);
        for (let i = 0; i < 40; i += 1) { ctx.fillStyle = hash01(i, 57) > 0.8 ? '#a3343e' : '#8d8a85'; ctx.fillRect(8 + hash01(i, 55) * 70, 20 + hash01(i, 56) * 120, 4 + 8 * hash01(i, 58), 4 + 8 * hash01(i, 59)); }
        for (let i = 0; i < 14; i += 1) { ctx.fillStyle = '#555'; ctx.fillRect(88, 20 + i * 9, 32, 3); }
      }) }));
      meshUV(box(-0.75, 0.75, 0, 0.3, -0.25, 0.25, primitiveMaterial('travertino')));
      box(-0.6, 0.6, 0.3, 1.95, -0.05, 0.05, scuro);
      const p = box(-0.54, 0.54, 0.38, 1.87, 0.05, 0.052, mappa); p.castShadow = false;
    }) },
    // leggio informativo grigio scuro: colonna e piano inclinato
    leggio: { nome: 'Leggio informativo (grigio scuro)', crea: () => group((g) => {
      const { box } = partAdder(g), scuro = courtOnce('leggio', () => stdMat({ color: 0x3b3e42, roughness: 0.55, metalness: 0.4 }));
      box(-0.2, 0.2, 0, 0.95, -0.12, 0.12, scuro);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.55), scuro); top.position.set(0, 1.05, 0.05); top.rotation.x = 0.5; top.castShadow = true; g.add(top);
    }) },
    // palo con segnale stradale tondo: pr.segnale = 'divieto' (senso vietato, rosso) oppure 'destra' (direzione obbligatoria, blu); faccia verso +z
    segnale: { nome: 'Segnale stradale su palo (senso vietato o direzione obbligatoria)', crea: (pr) => group((g) => {
      const destra = String(pr.segnale || '') === 'destra', palo = courtOnce('segnale|palo', () => stdMat({ color: 0x8a8d90, roughness: 0.45, metalness: 0.6 }));
      const faccia = courtOnce('segnale|' + (destra ? 'destra' : 'divieto'), () => new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: true, alphaTest: 0.5, map: canvasTex(128, 128, (ctx, w) => {
        ctx.clearRect(0, 0, w, w); ctx.fillStyle = '#f4f4f2'; ctx.beginPath(); ctx.arc(64, 64, 63, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = destra ? '#1f5fae' : '#c0202a'; ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f4f4f2';
        if (destra) { ctx.fillRect(26, 56, 50, 16); ctx.beginPath(); ctx.moveTo(72, 36); ctx.lineTo(104, 64); ctx.lineTo(72, 92); ctx.fill(); } else ctx.fillRect(22, 54, 84, 20);
      }, 1, 1, true) }));
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.9, 10), palo); p.position.y = 1.45; p.castShadow = true; g.add(p);
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.3, 28), faccia); d.position.set(0, destra ? 2.0 : 2.55, 0.04); g.add(d);
      const r = new THREE.Mesh(new THREE.CircleGeometry(0.3, 28), palo); r.rotation.y = Math.PI; r.position.set(0, d.position.y, 0.035); g.add(r);
    }) },
    cartello: { nome: 'Cartello di sicurezza', crea: () => group((g) => {
      const sign = courtOnce('cartello', () => stdMat({ roughness: 0.6, map: canvasTex(180, 280, (ctx, w, h) => {
        ctx.fillStyle = '#f4f4f2'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#2b78c2'; ctx.fillRect(8, 28, w - 16, 8); ctx.fillRect(8, 112, w - 16, 8); ctx.fillRect(8, 180, w - 16, 8);
        for (let i = 0; i < 6; i += 1) { ctx.fillStyle = '#d43a3a'; ctx.beginPath(); ctx.arc(22 + i * 27, 62, 10, 0, Math.PI * 2); ctx.fill(); }
        for (let i = 0; i < 5; i += 1) { ctx.fillStyle = '#f2c84b'; ctx.beginPath(); ctx.moveTo(22 + i * 32, 158); ctx.lineTo(36 + i * 32, 132); ctx.lineTo(50 + i * 32, 158); ctx.fill(); }
        for (let i = 0; i < 6; i += 1) { ctx.fillStyle = '#2b78c2'; ctx.beginPath(); ctx.arc(22 + i * 27, 206, 10, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#d9dde2'; ctx.fillRect(10, 228, w - 20, 42);
      }) })), edge = courtOnce('cartello|bordo', () => plainMat('#d9d9d6', 0.6));
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.92, 0.01), [edge, edge, edge, edge, sign, sign]); m.position.y = 0.46; g.add(m);
    }) },
  };
  // scatola esatta (dai vertici) di un gruppo nelle sue coordinate, comprese le istanze delle InstancedMesh
  function localBounds(root) {
    const bb = new THREE.Box3(), inst = new THREE.Matrix4(), inv = new THREE.Matrix4(), M = new THREE.Matrix4(), MI = new THREE.Matrix4(), p = new THREE.Vector3();
    const addAll = (pos, mat) => { for (let i = 0; i < pos.count; i += 1) bb.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(mat)); };
    root.updateMatrixWorld(true); inv.copy(root.matrixWorld).invert();
    root.traverse((o) => {
      const pos = o.isMesh && o.geometry && o.geometry.attributes.position;
      if (!pos) return;
      M.multiplyMatrices(inv, o.matrixWorld);
      if (o.isInstancedMesh) for (let i = 0; i < o.count; i += 1) { o.getMatrixAt(i, inst); addAll(pos, MI.multiplyMatrices(M, inst)); }
      else addAll(pos, M);
    });
    return bb;
  }
  function catalogGroup(pr) {
    const fit = new THREE.Group(), rot = new THREE.Group(), def = CATALOGO[pr.modello];
    if (!def) return null;
    rot.rotation.y = ((Number(pr.ruota) || 0) * Math.PI) / 180; rot.add(def.crea(pr)); fit.add(rot);
    return fit;
  }
  const catalogSizes = new Map();
  // misure naturali (con la rotazione) per la scatola iniziale e per «Misure originali»
  function catalogSize(modello, ruota = 0) {
    const key = modello + '|' + ruota;
    if (!catalogSizes.has(key)) {
      const g = catalogGroup({ modello, ruota }); if (!g) return null;
      const s = localBounds(g).getSize(new THREE.Vector3()); disposeTree(g);
      catalogSizes.set(key, { du: Math.max(0.02, s.x), dv: Math.max(0.02, s.z), dh: Math.max(0.02, s.y) });
    }
    return Object.assign({}, catalogSizes.get(key));
  }
  function buildCatalogObject(pr) {
    const fit = (pr.box && catalogGroup(pr)) || new THREE.Group();
    fit.userData.primitiva = pr.id;
    if (!fit.children.length) return fit;
    const bb = localBounds(fit), s = bb.getSize(new THREE.Vector3()), b = pr.box;
    // un asse piatto (scritta, cartello sottile) non si stira: resta com'è, al centro della scatola
    const axis = (size, lo, hi, min) => (size < 0.005 ? [1, (lo + hi) / 2 - (min + size / 2)] : [(hi - lo) / size, lo - min * ((hi - lo) / size)]);
    const [sx, px] = axis(s.x, b.u0, b.u1, bb.min.x), [sy, py] = axis(s.y, b.h0, b.h1, bb.min.y), [sz, pz] = axis(s.z, -b.v1, -b.v0, bb.min.z);
    fit.scale.set(sx, sy, sz);
    fit.position.set(px, py, pz);
    // «Specchia» dell'editor (pr.specchio: 'u', 'v' o 'uv'): scala −1 sull'asse, riflessa rispetto al centro della scatola (le normali le corregge il renderer)
    const mi = String(pr.specchio || '');
    if (mi.includes('u')) { fit.scale.x = -fit.scale.x; fit.position.x = b.u0 + b.u1 - fit.position.x; }
    if (mi.includes('v')) { fit.scale.z = -fit.scale.z; fit.position.z = -(b.v0 + b.v1) - fit.position.z; }
    return fit;
  }
  // angolo libero (pr.angolo, gradi; positivo = antiorario visto dall'alto, come ruota) attorno al centro della scatola: un
  // gruppo-perno al centro in u/v, con dentro l'oggetto spostato di conseguenza; senza angolo l'oggetto resta com'è
  function rotatedAboutCenter(pr, obj) {
    const a = (Number(pr.angolo) || 0) % 360, b = pr.box;
    if (!a || !b) return obj;
    const cu = (b.u0 + b.u1) / 2, cv = (b.v0 + b.v1) / 2, pivot = new THREE.Group();
    pivot.position.set(cu, 0, -cv); pivot.rotation.y = (a * Math.PI) / 180; pivot.userData.primitiva = pr.id;
    obj.position.x -= cu; obj.position.z += cv; pivot.add(obj);
    return pivot;
  }
  /* strade asfaltate aggiunte dall'editor: piano senza spessore (poligono u/v, angoli arrotondati come i marciapiedi) a 2 cm sopra
     `base`. Come cartina e ortofoto non scrive la profondità e si disegna dopo gli oggetti opachi e dopo i livelli piatti del terreno
     (renderOrder ≥ 3, materiale trasparente a opacità piena): niente sfarfallio con terreno, ortofoto, lastre o asfalti alla stessa
     quota; quello che ci sta sopra (marciapiedi, cordoli, oggetti) la copre normalmente. Tra due strade sovrapposte vince la più alta,
     a pari quota l'ultima aggiunta: ordine fisso, che non cambia muovendo la camera. */
  function roadMaterial() {
    if (primMats.has('strada')) return primMats.get('strada');
    const t = canvasTex(512, 512, (ctx, w) => {
      noiseFill(ctx, w, w, '#3d3f41', '#323436', 16000);
      for (let i = 0; i < 2600; i += 1) { ctx.fillStyle = hash01(i, 71) > 0.55 ? 'rgba(200,198,190,.28)' : 'rgba(18,18,18,.35)'; ctx.fillRect(hash01(i, 72) * w, hash01(i, 73) * w, 1.4, 1.4); } // inerti
      for (let i = 0; i < 7; i += 1) { ctx.fillStyle = 'rgba(28,29,30,.18)'; ctx.fillRect(hash01(i, 74) * w, hash01(i, 75) * w, 60 + 120 * hash01(i, 76), 40 + 90 * hash01(i, 77)); } // rappezzi
    }, 1 / 4, 1 / 4);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.96, metalness: 0, transparent: true, opacity: 1, depthWrite: false });
    primMats.set('strada', m);
    return m;
  }
  function buildRoad(pr) {
    const P = pr.poligono, base = Number(pr.base) || 0;
    if (!Array.isArray(P) || P.length < 3) return new THREE.Group();
    const [Q, R] = ccwRadii(P, cornerRadii(pr, P, 0));
    const geo = new THREE.ShapeGeometry(shapeOf(filletOutline(Q, R)), 6); geo.rotateX(-Math.PI / 2); // (u, v) → (x, −z), normale in alto
    const m = new THREE.Mesh(geo, roadMaterial()), k = Math.max(0, ((exteriorsCfg && exteriorsCfg.primitive) || []).indexOf(pr));
    m.position.y = base + 0.02; m.receiveShadow = true; m.castShadow = false; clipMeshes(m, 'marciapiede'); // l'asfalto sparisce sotto marciapiedi e aiuole
    m.renderOrder = 3 + Math.min(100, Math.max(-10, base)) * 0.01 + k * 1e-5;
    m.userData.primitiva = pr.id;
    return m;
  }
  /* modelli 3D caricati dall'editor (forma 'file3d', campo modello3d { asset, formato, nome, su, misure }): il file sta negli asset
     dell'artifact come JSON { tipo: 'modello3d', formato, nome, compresso: 'gzip', dati: base64 } (gli asset non accettano binari 3D).
     Il modello, centrato e appoggiato a terra, riempie la scatola dell'oggetto; finché si carica resta una scatola grigia trasparente. */
  const MODEL_FORMATS = { glb: ['GLTFLoader'], gltf: ['GLTFLoader'], obj: ['OBJLoader'], stl: ['STLLoader'], ply: ['PLYLoader'],
    fbx: ['fflate', 'NURBSUtils', 'NURBSCurve', 'FBXLoader'], dae: ['TGALoader', 'ColladaLoader'], '3mf': ['fflate', '3MFLoader'], spz: ['fflate'] };
  const VENDOR_LIBS = { GLTFLoader: () => typeof THREE.GLTFLoader === 'function', OBJLoader: () => typeof THREE.OBJLoader === 'function', STLLoader: () => typeof THREE.STLLoader === 'function',
    PLYLoader: () => typeof THREE.PLYLoader === 'function', FBXLoader: () => typeof THREE.FBXLoader === 'function', TGALoader: () => typeof THREE.TGALoader === 'function',
    ColladaLoader: () => typeof THREE.ColladaLoader === 'function', '3MFLoader': () => typeof THREE.ThreeMFLoader === 'function', NURBSUtils: () => typeof THREE.NURBSUtils === 'object',
    NURBSCurve: () => typeof THREE.NURBSCurve === 'function', fflate: () => typeof window.fflate === 'object' && typeof window.fflate.gunzipSync === 'function' };
  async function vendorLibs(names) { for (const n of names) await loadDependency(`vendor/${n === 'fflate' ? 'fflate.min' : n}.js`, VENDOR_LIBS[n]); }
  const modelUp = (formato) => (['stl', 'ply', '3mf'].includes(formato) ? 'z' : 'y'); // STL, PLY e 3MF di solito hanno Z in alto
  async function parseModel(bytes, formato) {
    if (!MODEL_FORMATS[formato]) throw Object.assign(new Error('formato'), { code: 'formato' });
    await vendorLibs(MODEL_FORMATS[formato]);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), text = () => new TextDecoder().decode(bytes);
    if (formato === 'glb' || formato === 'gltf') return (await new Promise((res, rej) => new THREE.GLTFLoader().parse(formato === 'gltf' ? text() : buf, '', res, rej))).scene;
    if (formato === 'obj') return new THREE.OBJLoader().parse(text());
    if (formato === 'fbx') return new THREE.FBXLoader().parse(buf, '');
    if (formato === 'dae') return new THREE.ColladaLoader().parse(text(), '').scene;
    if (formato === '3mf') return new THREE.ThreeMFLoader().parse(buf);
    if (formato === 'spz') return splatModel(bytes);
    const g = formato === 'stl' ? new THREE.STLLoader().parse(buf) : new THREE.PLYLoader().parse(buf), colors = !!g.attributes.color;
    if (formato === 'ply' && !g.index) return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.02, vertexColors: colors, color: colors ? 0xffffff : 0xcfc8bd })); // nuvola di punti
    if (!g.attributes.normal) g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: colors ? 0xffffff : 0xcfc8bd, vertexColors: colors, roughness: 0.8, metalness: 0 }));
  }
  function normalizeModel(obj, su) {
    const inner = new THREE.Group(); inner.add(obj);
    if (su === 'z') inner.rotation.x = -Math.PI / 2;
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    if (box.isEmpty()) throw Object.assign(new Error('vuoto'), { code: 'vuoto' });
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), root = new THREE.Group();
    inner.position.set(-c.x, -box.min.y, -c.z); root.add(inner);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { root, size: { x: Math.max(size.x, 1e-3), y: Math.max(size.y, 1e-3), z: Math.max(size.z, 1e-3) } };
  }
  /* Gaussian splat .spz (Niantic, v2/v3; Scaniverse, Polycam…): ogni splat diventa un disco sfumato del suo colore e della sua misura,
     con test alfa invece dell'ordinamento (niente trasparenze da ordinare). Le armoniche sferiche si scartano: col caricamento il file
     si riscrive con grado 0 (circa un terzo del peso). Assi RUB come three.js: Y in alto. */
  function spzLayout(raw) {
    const b = raw[0] === 0x1f && raw[1] === 0x8b ? window.fflate.gunzipSync(raw) : raw, dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (b.length < 16 || dv.getUint32(0, true) !== 0x5053474e) throw Object.assign(new Error('spz'), { code: 'formato' });
    const ver = dv.getUint32(4, true), n = dv.getUint32(8, true), fb = b[13], oA = 16 + n * 9, oC = oA + n, oS = oC + n * 3, oR = oS + n * 3;
    const end = oR + n * (ver >= 3 ? 4 : 3);
    if (ver < 2 || ver > 3 || end > b.length) throw Object.assign(new Error('spz'), { code: 'formato' });
    return { b, n, fb, oA, oC, oS, end };
  }
  function slimSpz(raw) {
    const L = spzLayout(raw), out = L.b.slice(0, L.end);
    out[12] = 0; // grado delle armoniche sferiche: 0
    return window.fflate.gzipSync(out, { level: 6 });
  }
  let splatMat = null;
  function splatMaterial() {
    if (splatMat) return splatMat;
    splatMat = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 400 } },
      vertexShader: `#include <common>
attribute vec3 rgb; attribute float splat; attribute float alpha; uniform float uPx; varying vec3 vC; varying float vA;
#include <logdepthbuf_pars_vertex>
void main() {
  vC = rgb; vA = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float k = (length(modelMatrix[0].xyz) + length(modelMatrix[1].xyz) + length(modelMatrix[2].xyz)) / 3.0;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(splat * k * uPx * projectionMatrix[1][1] / max(0.05, -mv.z), 1.0, 28.0);
#include <logdepthbuf_vertex>
}`,
      fragmentShader: `#include <common>
varying vec3 vC; varying float vA;
#include <logdepthbuf_pars_fragment>
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0; float r = dot(d, d);
  if (r > 1.0 || vA * exp(-3.0 * r) < 0.3) discard;
#include <logdepthbuf_fragment>
  gl_FragColor = vec4(vC, 1.0);
}`
    });
    splatMat.extensions.fragDepth = true;
    return splatMat;
  }
  function splatModel(raw) {
    const L = spzLayout(raw), b = L.b, q = 1 / (1 << L.fb);
    const P = new Float32Array(L.n * 3), RGB = new Float32Array(L.n * 3), SZ = new Float32Array(L.n), AL = new Float32Array(L.n);
    let m = 0;
    for (let i = 0; i < L.n; i += 1) {
      const a = b[L.oA + i] / 255; if (a < 0.2) continue;
      const l0 = b[L.oS + i * 3], l1 = b[L.oS + i * 3 + 1], l2 = b[L.oS + i * 3 + 2];
      if (Math.exp(Math.max(l0, l1, l2) / 16 - 10) > 0.6) continue; // nuvolette enormi = rumore
      const s = Math.exp((l0 + l1 + l2) / 48 - 10); // media geometrica dei tre semiassi: i dischi non gonfiano le superfici
      for (let j = 0; j < 3; j += 1) {
        const o = 16 + i * 9 + j * 3; let v = b[o] | (b[o + 1] << 8) | (b[o + 2] << 16); if (v & 0x800000) v -= 0x1000000;
        P[m * 3 + j] = v * q;
        RGB[m * 3 + j] = Math.min(1, Math.max(0, 0.5 + 0.282095 * (b[L.oC + i * 3 + j] / 255 - 0.5) / 0.15));
      }
      SZ[m] = Math.max(0.005, Math.min(0.14, 2.4 * s)); AL[m] = a; m += 1;
    }
    if (!m) throw Object.assign(new Error('vuoto'), { code: 'vuoto' });
    // fuori dall'1–99% su ogni asse (più 1 m) restano solo splat volanti: via, così anche la scatola dell'oggetto è giusta
    const lim = [0, 1, 2].map((j) => { const t = []; for (let i = 0; i < m; i += Math.max(1, Math.floor(m / 20000))) t.push(P[i * 3 + j]); t.sort((x, y) => x - y); return [t[Math.floor(t.length * 0.01)] - 1, t[Math.floor(t.length * 0.99)] + 1]; });
    let k = 0;
    for (let i = 0; i < m; i += 1) {
      if ([0, 1, 2].some((j) => P[i * 3 + j] < lim[j][0] || P[i * 3 + j] > lim[j][1])) continue;
      for (let j = 0; j < 3; j += 1) { P[k * 3 + j] = P[i * 3 + j]; RGB[k * 3 + j] = RGB[i * 3 + j]; }
      SZ[k] = SZ[i]; AL[k] = AL[i]; k += 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P.slice(0, k * 3), 3));
    geo.setAttribute('rgb', new THREE.BufferAttribute(RGB.slice(0, k * 3), 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(SZ.slice(0, k), 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(AL.slice(0, k), 1));
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    const pts = new THREE.Points(geo, splatMaterial()); pts.userData.splat = true; pts.frustumCulled = false;
    // per selezionarlo nell'editor: un campione invisibile di splat con soglia di 15 cm (i 600 mila veri non si interrogano)
    const step = Math.max(1, Math.floor(k / 25000)), sub = [];
    for (let i = 0; i < k; i += step) sub.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(sub, 3));
    const proxy = new THREE.Points(pg, new THREE.PointsMaterial({ visible: false })); proxy.userData.splatProxy = true;
    const g = new THREE.Group(); g.add(pts, proxy);
    return g;
  }
  function splatRaycast(rc, out) { const t = rc.params.Points.threshold; rc.params.Points.threshold = 0.15; THREE.Points.prototype.raycast.call(this, rc, out); rc.params.Points.threshold = t; }
  function wireSplats(root) { root.traverse((o) => { if (o.userData.splat) o.raycast = () => {}; else if (o.userData.splatProxy) o.raycast = splatRaycast; }); }
  const userModels = new Map(); // `${asset}|${su}` → Promise<{ root, size } | null>
  function userModel(m) {
    const su = m.su || modelUp(m.formato), key = `${m.asset}|${su}`;
    if (!userModels.has(key)) userModels.set(key, (async () => {
      await vendorLibs(['fflate']);
      const pack = await fetch('/_blob/' + m.asset).then((r) => (r.ok ? r.json() : Promise.reject(new Error('asset ' + r.status))));
      const bin = atob(pack.dati || ''); let bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      if (pack.compresso === 'gzip') bytes = window.fflate.gunzipSync(bytes);
      return normalizeModel(await parseModel(bytes, pack.formato || m.formato), su);
    })().catch((e) => { console.warn('Modello 3D non caricato', m.asset, e); return null; })); // un fallimento resta in memoria: niente richieste a ogni ricostruzione
    return userModels.get(key);
  }
  // prima del caricamento negli asset: legge il file, lo prova, ne misura la scatola (unità del file indovinate: mm o cm se enorme) e lo impacchetta
  async function prepareModel(file) {
    const formato = (String(file.name).split('.').pop() || '').toLowerCase();
    if (/^usd[azc]?$/.test(formato)) throw Object.assign(new Error('usdz'), { code: 'usdz' });
    if (!MODEL_FORMATS[formato]) throw Object.assign(new Error('formato'), { code: 'formato' });
    await vendorLibs(['fflate']);
    let raw = new Uint8Array(await file.arrayBuffer());
    if (formato === 'spz') raw = slimSpz(raw); // già compresso: si toglie solo il peso delle armoniche sferiche
    const su = modelUp(formato), model = normalizeModel(await parseModel(raw, formato), su);
    const big = Math.max(model.size.x, model.size.y, model.size.z), scala = big > 500 ? 0.001 : big > 150 ? 0.01 : 1;
    const gz = formato === 'spz' ? raw : window.fflate.gzipSync(raw, { level: 6 }); let s = '';
    for (let i = 0; i < gz.length; i += 0x8000) s += String.fromCharCode.apply(null, gz.subarray(i, i + 0x8000));
    const json = JSON.stringify({ tipo: 'modello3d', formato, nome: file.name, compresso: formato === 'spz' ? 'spz' : 'gzip', byte: raw.length, dati: btoa(s) });
    const r3 = (x) => Math.round(x * scala * 1000) / 1000;
    return { blob: new Blob([json], { type: 'application/json' }), formato, nome: file.name, su, scala, misure: { x: r3(model.size.x), y: r3(model.size.y), z: r3(model.size.z) }, model };
  }
  const placeholderMaterial = () => primMats.get('file3d|attesa') || primMats.set('file3d|attesa', new THREE.MeshStandardMaterial({ color: 0xbfb8ae, transparent: true, opacity: 0.35, depthWrite: false })).get('file3d|attesa');
  const failedModelMaterial = () => primMats.get('file3d|errore') || primMats.set('file3d|errore', new THREE.MeshStandardMaterial({ color: 0x9c3a3a, transparent: true, opacity: 0.4, depthWrite: false })).get('file3d|errore');
  function buildUserModel(pr) {
    const b = pr.box, du = Math.max(0.02, b.u1 - b.u0), dv = Math.max(0.02, b.v1 - b.v0), dh = Math.max(0.02, b.h1 - b.h0), M = pr.modello3d || {};
    const g = new THREE.Group(); g.position.set((b.u0 + b.u1) / 2, b.h0, -(b.v0 + b.v1) / 2); g.userData.primitiva = pr.id;
    const ph = new THREE.Mesh(new THREE.BoxGeometry(du, dh, dv), placeholderMaterial()); ph.position.y = dh / 2; g.add(ph);
    if (!M.asset) { ph.material = failedModelMaterial(); return g; }
    userModel(M).then((res) => {
      if (!res) { ph.material = failedModelMaterial(); return; }
      const m = res.root.clone(true), sp = String(pr.specchio || ''); wireSplats(m);
      m.scale.set((sp.includes('u') ? -1 : 1) * du / res.size.x, dh / res.size.y, (sp.includes('v') ? -1 : 1) * dv / res.size.z);
      g.remove(ph); ph.geometry.dispose(); g.add(m);
    });
    return g;
  }
  /* precedenza in pianta fra aiuole, marciapiedi e strade (aiuola > marciapiede > strada): chi sta sopra elimina chi sta sotto nella sua
     impronta. Le impronte (userData.impronta, punti u/v nel gruppo) si disegnano in una maschera vista dall'alto, in coordinate di mondo:
     canale rosso = aiuole, verde = aiuole + marciapiedi. Le mesh dei marciapiedi scartano i pixel col rosso, quelle delle strade col verde,
     pareti dei cordoli comprese: niente sfarfallio dove due superfici coincidono. */
  const clipUniforms = { clipMap: { value: null }, clipBox: { value: null }, clipOn: { value: 0 } };
  const clipVariants = new Map();
  function footprintOf(pr) {
    if (pr.forma === 'aiuola' && pr.tipo === 'rotonda') return pr.box ? ellipsePts(pr.box) : null;
    const P = pr.poligono; if (!Array.isArray(P) || P.length < 3) return null;
    const [Q, R] = ccwRadii(P, cornerRadii(pr, P, pr.forma === 'marciapiede' ? 0.3 : 0));
    return filletOutline(Q, R);
  }
  function clipMaterial(mat, livello) {
    const key = mat.uuid + '|' + livello;
    if (clipVariants.has(key)) return clipVariants.get(key);
    const m = mat.clone(), ch = livello === 'aiuola' ? 'r' : 'g';
    if (!clipUniforms.clipBox.value) clipUniforms.clipBox.value = new THREE.Vector4();
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, clipUniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vClipW;').replace('#include <project_vertex>', '#include <project_vertex>\nvec4 clipP = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nclipP = instanceMatrix * clipP;\n#endif\nvClipW = (modelMatrix * clipP).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vClipW;\nuniform sampler2D clipMap;\nuniform vec4 clipBox;\nuniform float clipOn;')
        .replace('void main() {', 'void main() {\n  if (clipOn > 0.5) { vec2 cuv = (vClipW.xz - clipBox.xy) * clipBox.zw; if (cuv.x > 0.0 && cuv.x < 1.0 && cuv.y > 0.0 && cuv.y < 1.0 && texture2D(clipMap, cuv).' + ch + ' > 0.5) discard; }');
    };
    m.customProgramCacheKey = () => 'clip-' + ch;
    clipVariants.set(key, m);
    return m;
  }
  function clipMeshes(root, livello) {
    root.traverse((o) => { if (o.isMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map((x) => clipMaterial(x, livello)) : clipMaterial(o.material, livello); });
  }
  function updateClipMask(holder) {
    const polys = [];
    holder.updateMatrixWorld(true);
    holder.traverse((o) => {
      const imp = o.userData.impronta; if (!imp || !Array.isArray(imp.pts)) return;
      if (o.userData.primitiva) { const pr = ((exteriorsCfg && exteriorsCfg.primitive) || []).find((x) => x.id === o.userData.primitiva); if (pr && pr.rimosso) return; }
      const v = new THREE.Vector3();
      polys.push({ livello: imp.livello, pts: imp.pts.map(([u, w]) => { v.set(u, 0, -w).applyMatrix4(o.matrixWorld); return [v.x, v.z]; }) });
    });
    const old = clipUniforms.clipMap.value;
    if (!polys.length) { clipUniforms.clipOn.value = 0; return; }
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of polys) for (const [x, z] of p.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    x0 -= 1; z0 -= 1; x1 += 1; z1 += 1;
    const res = Math.max(0.03, Math.max(x1 - x0, z1 - z0) / 4096), W = Math.ceil((x1 - x0) / res), H = Math.ceil((z1 - z0) / res);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const fill = (p, col) => { ctx.fillStyle = col; ctx.beginPath(); p.pts.forEach(([x, z], i) => { const X = (x - x0) / res, Y = (z - z0) / res; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.closePath(); ctx.fill(); };
    for (const p of polys) if (p.livello === 'marciapiede') fill(p, '#00ff00');
    for (const p of polys) if (p.livello === 'aiuola') fill(p, '#ffff00');
    const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter;
    clipUniforms.clipMap.value = tex; clipUniforms.clipBox.value = (clipUniforms.clipBox.value || new THREE.Vector4()).set(x0, z0, 1 / (W * res), 1 / (H * res)); clipUniforms.clipOn.value = 1;
    if (old) old.dispose();
  }
  /* solido a pianta libera «edificio»: pareti con le finestre della facciata di CU014 (basamento, piani, attico come le ali del solido)
     e tetto piano scuro come le terrazze dei cavedi nelle foto */
  const terraceRoof = () => primMats.get('edificio|tetto') || primMats.set('edificio|tetto', stdMat({ color: '#55585b', roughness: 0.9 })).get('edificio|tetto');
  function buildingPrism(pr, P, base, h) {
    const g = new THREE.Group(), set = facadeSetFor('CU014'), pieces = cuPieces(h), [Q, R] = ccwRadii(P, cornerRadii(pr, P, 0)), shape = shapeOf(filletOutline(Q, R));
    pieces.forEach((piece, i) => {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: piece.h, bevelEnabled: false, curveSegments: 6 });
      geo.rotateX(-Math.PI / 2); geo.translate(0, base + piece.y0, 0);
      planarUVs(geo, 2);
      if (piece.kind !== 'attic') applyWallUVs(geo, base + piece.y0, FACADE_BAY, piece.floorH);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, [i === pieces.length - 1 ? terraceRoof() : hiddenCapMaterial(), set[piece.kind]]);
      m.castShadow = true; m.receiveShadow = true; m.userData.primitiva = pr.id; g.add(m);
    });
    g.userData.primitiva = pr.id;
    return g;
  }
  // solido a pianta libera dell'editor: poligono u/v (angoli arrotondati come i marciapiedi) estruso da base a base + altezza nel materiale scelto
  function buildPrism(pr) {
    const P = pr.poligono, base = Number(pr.base) || 0, h = Math.max(0.02, Number(pr.altezza) || 0.3);
    if (!Array.isArray(P) || P.length < 3) return new THREE.Group();
    if (pr.materiale === 'edificio') return buildingPrism(pr, P, base, h);
    if (pr.materiale === 'pensilina') {
      const [Q, R] = ccwRadii(P, cornerRadii(pr, P, 0)), out = filletOutline(Q, R), g = new THREE.Group(), t = Math.min(0.05, h / 4), k = Math.min(0.03, h / 4);
      g.add(localSlab(out, base, base + t, primitiveMaterial('travertino')), localSlab(out, base + t, base + h - k, primitiveMaterial('intonaco arancione')),
        localSlab(out, base + h - k, base + h, primitiveMaterial('guaina')));
      g.traverse((o) => { o.userData.primitiva = pr.id; });
      return g;
    }
    const [Q, R] = ccwRadii(P, cornerRadii(pr, P, 0)), m = localSlab(filletOutline(Q, R), base, base + h, primitiveMaterial(pr.materiale || 'travertino'));
    m.userData.primitiva = pr.id;
    return m;
  }
  function buildPrimitive(pr) {
    if (pr.forma === 'oggetto') return rotatedAboutCenter(pr, buildCatalogObject(pr));
    if (pr.forma === 'file3d') return rotatedAboutCenter(pr, buildUserModel(pr));
    if (pr.forma === 'strada') return buildRoad(pr);
    if (pr.forma === 'prisma') return buildPrism(pr);
    if (pr.forma === 'cavedio') { const g = new THREE.Group(); g.userData.primitiva = pr.id; return g; } // il vuoto lo taglia rebuildCu014
    if (pr.forma === 'marciapiede' || pr.forma === 'aiuola') {
      const side = pr.forma === 'marciapiede', g = side ? buildSidewalk(pr) : buildBed(pr), imp = footprintOf(pr);
      g.userData.primitiva = pr.id;
      if (imp) g.userData.impronta = { livello: side ? 'marciapiede' : 'aiuola', pts: imp };
      if (side) clipMeshes(g, 'aiuola'); // il marciapiede sparisce dove c'è un'aiuola
      return g;
    }
    const b = pr.box, du = Math.max(0.02, b.u1 - b.u0), dv = Math.max(0.02, b.v1 - b.v0), dh = Math.max(0.02, b.h1 - b.h0);
    let geo;
    if (pr.forma === 'cilindro') { geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); geo.scale(du, dh, dv); }
    else if (pr.forma === 'sfera') { geo = new THREE.SphereGeometry(0.5, 32, 16); geo.scale(du, dh, dv); }
    else geo = new THREE.BoxGeometry(du, dh, dv);
    planarUVs(geo, 1);
    const side = primitiveMaterial(pr.materiale || 'travertino'); // pensilina su un parallelepipedo: facce ±x, ±y (sopra guaina, sotto travertino), ±z
    const m = new THREE.Mesh(geo, pr.materiale === 'pensilina' && pr.forma === 'box' ? [side, side, primitiveMaterial('guaina'), primitiveMaterial('travertino'), side, side] : side);
    m.position.set((b.u0 + b.u1) / 2, (b.h0 + b.h1) / 2, -(b.v0 + b.v1) / 2);
    m.castShadow = true; m.receiveShadow = true; m.userData.primitiva = pr.id;
    return rotatedAboutCenter(pr, m);
  }
  /* ---------- ingresso principale dell'Istituto Chimico (foto dell'utente del 21/10/2026) ---------- */
  // rivestimento chiaro attorno al portone in legno, scritta ISTITUTO CHIMICO, targhe rosse, percorso tattile fino alla strada,
  // aiuole con cordolo e ringhiere rosse basse, panchine in travertino, palme, totem bianchi e rossi, rastrelliera
  function palmTree(p) {
    const H = Number(p.altezza) || 4, th = Math.max(0.5, H - 1.1), grp = new THREE.Group();
    grp.position.set(Number(p.u), 0, -Number(p.v));
    const bark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6e5a44').convertSRGBToLinear(), roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3f6a2c').convertSRGBToLinear(), roughness: 0.7, side: THREE.DoubleSide });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, th, 10), bark); trunk.position.y = th / 2; trunk.castShadow = true; grp.add(trunk);
    const fan = new THREE.CircleGeometry(0.75, 12, -1.1, 2.2); fan.rotateX(-Math.PI / 2); fan.translate(0.45, 0, 0); // foglia a ventaglio
    const stem = new THREE.CylinderGeometry(0.015, 0.02, 0.5, 5); stem.rotateZ(Math.PI / 2); stem.translate(0.25, 0, 0);
    const n = Number(p.foglie) || 16;
    for (let i = 0; i < n; i += 1) {
      const piv = new THREE.Group(); piv.position.y = th; piv.rotation.y = (i / n) * Math.PI * 2 + hash01(i, 91) * 0.3;
      const tilt = new THREE.Group(); tilt.rotation.z = 0.9 - 1.4 * hash01(i, 92); // alcune foglie dritte, altre pendenti
      const f = new THREE.Mesh(fan, leaf); f.castShadow = true;
      tilt.add(f, new THREE.Mesh(stem, bark)); piv.add(tilt); grp.add(piv);
    }
    return grp;
  }
  function buildEntrance(g, el, trav, bench, railing) {
    const uc = Number(el.u), P = el.porta || {}, W = Number(P.larghezza) || 2.3, Hd = Number(P.altezza) || 3.3;
    const R = el.rivestimento || {}, [ra, rb] = R.u || [uc - 6, uc + 6], H = Number(R.altezza) || 4.6;
    const std = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).convertSRGBToLinear(), roughness: r, metalness: m });
    const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const facePlane = (w, hh, u, y, v, mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat); m.rotation.y = Math.PI; m.position.set(u, y, -v); g.add(m); return m; }; // rivolto verso l'esterno
    if (!R.rimosso) {
      // stesso travertino (e stessa scala di lastre) del piano terra dell'edificio, senza finestre
      const rivMat = courtOnce('ingresso|rivestimento', () => {
        const t = baseCanvas2(FACADE_PALETTES[facadeNameFor('CU014')] || FACADE_PALETTES.cortina, 1, false);
        t.repeat.set(1 / (2 * FACADE_BAY), 1 / (2 * FACADE_BAY)); // la tessera copre 2 × 2 lastre, come sulle pareti
        return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, metalness: 0 });
      });
      g.add(localSlab(rect(ra, rb, -0.02, 0.06), 0.02, H, rivMat));
      g.add(localSlab(rect(ra - 0.05, rb + 0.05, -0.02, 0.14), H, H + 0.16, trav())); // cornice
      const word = (text, u) => facePlane(2.6, 0.49, u, H - 0.42, 0.065, new THREE.MeshStandardMaterial({ roughness: 0.8, transparent: true, alphaTest: 0.3, map: canvasTex(512, 96, (ctx, w, hh) => {
        ctx.clearRect(0, 0, w, hh); ctx.fillStyle = '#3f3a33'; ctx.font = 'bold 78px "Times New Roman", Times, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, hh / 2 + 4);
      }, 1, 1, true) }));
      const [w1, w2] = el.scritta || ['ISTITUTO', 'CHIMICO'];
      word(w1, uc + W / 2 + 1.75); word(w2, uc - W / 2 - 1.75); // a sinistra e a destra del portone, viste da fuori
      const plaque = canvasTex(64, 48, (ctx, w, hh) => { ctx.fillStyle = '#8a1f2d'; ctx.fillRect(0, 0, w, hh); ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 4; i += 1) ctx.fillRect(8, 9 + i * 8, i ? 30 + (i % 2) * 14 : 46, 3); });
      for (const y of [1.75, 2.3]) facePlane(0.42, 0.32, uc - W / 2 - 0.75, y, 0.075, new THREE.MeshStandardMaterial({ map: plaque, roughness: 0.6 }));
    }
    if (!P.rimosso) {
      facePlane(W, Hd, uc, Hd / 2 + 0.02, 0.066, doorMaterial());
      for (const [a, b] of [[uc - W / 2 - 0.28, uc - W / 2], [uc + W / 2, uc + W / 2 + 0.28]]) g.add(localSlab(rect(a, b, 0, 0.16), 0.02, Hd + 0.3, trav(1.2))); // stipiti
      g.add(localSlab(rect(uc - W / 2 - 0.28, uc + W / 2 + 0.28, 0, 0.16), Hd + 0.02, Hd + 0.3, trav(1.2))); // architrave
    }
    const TT = el.tattile;
    if (TT && !TT.rimosso) { // percorso tattile a righe dal portone alla strada
      const w = Number(TT.larghezza) || 0.6, tu = TT.u != null ? Number(TT.u) : uc;
      const tex = canvasTex(64, 64, (ctx, cw) => { ctx.fillStyle = '#a3a39e'; ctx.fillRect(0, 0, cw, cw); ctx.fillStyle = '#7f7f7a'; for (let x = 4; x < cw; x += 16) ctx.fillRect(x, 0, 6, cw); }, 1 / w, 1);
      const strip = localSlab(rect(tu - w / 2, tu + w / 2, TT.v[0], TT.v[1]), 0, 0.045, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      strip.castShadow = false; g.add(strip);
    }
    for (const a of (el.aiuole || []).filter((x) => !x.rimosso)) { // prato rialzato con cordolo in travertino
      const [u0, u1] = a.u, [v0, v1] = a.v, k = 0.2, hk = Number(a.cordolo) || 0.18;
      const ga = turned(g, a, (u0 + u1) / 2, (v0 + v1) / 2), imp = new THREE.Object3D();
      imp.userData.impronta = { livello: 'aiuola', pts: rect(u0, u1, v0, v1) }; ga.add(imp);
      const lawn = localSlab(rect(u0, u1, v0, v1), 0, hk - 0.04, std('#5f8a3e', 1)); lawn.castShadow = false; ga.add(lawn);
      for (const pts of [rect(u0, u1, v0, v0 + k), rect(u0, u1, v1 - k, v1), rect(u0, u0 + k, v0, v1), rect(u1 - k, u1, v0, v1)]) ga.add(localSlab(pts, 0, hk, bedKerbMaterial()));
    }
    const F = el.fiori;
    if (F && !F.rimosso) turned(g, F, (F.u[0] + F.u[1]) / 2, (F.v[0] + F.v[1]) / 2).add(localSlab(rect(F.u[0], F.u[1], F.v[0], F.v[1]), 0.1, Number(F.altezza) || 0.4, flowerMaterial()));
    for (const p of (el.panchine || []).filter((x) => !x.rimosso)) bench(g, p, 0);
    railing(g, el.ringhiere || [], 0, el.ringhiera || { altezza: 0.9 });
    for (const p of (el.palme || []).filter((x) => !x.rimosso)) turned(g, p, Number(p.u), Number(p.v)).add(albero(palmTree(p)));
    for (const t of (el.totem || []).filter((x) => !x.rimosso)) addTotem(turned(g, t, Number(t.u), Number(t.v)), t);
    const RS = el.rastrelliera;
    if (RS && !RS.rimosso) addBikeRack(turned(g, RS, Number(RS.u), Number(RS.v)), RS);
  }
  // portone in legno a due ante con specchiature vetrate e sopraluce (texture in cache: l'editor ricostruisce spesso)
  function doorMaterial() {
    return courtOnce('portone', () => new THREE.MeshStandardMaterial({ roughness: 0.7, map: canvasTex(256, 384, (ctx, w, hh) => {
      ctx.fillStyle = '#3a2416'; ctx.fillRect(0, 0, w, hh);
      const glass = (x, y, ww, h2) => { const gr = ctx.createLinearGradient(0, y, 0, y + h2); gr.addColorStop(0, '#8b9aa6'); gr.addColorStop(1, '#2a3036'); ctx.fillStyle = gr; ctx.fillRect(x, y, ww, h2); };
      const t = hh * 0.2;
      for (let i = 0; i < 4; i += 1) glass(10 + i * 60, 10, 54, t - 16); // sopraluce a riquadri
      for (const x0 of [8, w / 2 + 4]) { // due ante in legno con specchiature vetrate e zoccolo
        ctx.fillStyle = '#6b4128'; ctx.fillRect(x0, t, w / 2 - 12, hh - t - 6);
        const ph = (hh - t - 90) / 3;
        for (let r = 0; r < 3; r += 1) glass(x0 + 14, t + 14 + r * ph, w / 2 - 40, ph - 12);
        ctx.fillStyle = '#5a3520'; ctx.fillRect(x0 + 10, hh - 70, w / 2 - 32, 56);
        ctx.fillStyle = '#c9b48a'; ctx.fillRect(x0 < w / 2 ? x0 + w / 2 - 26 : x0 + 6, hh * 0.55, 6, 34);
      }
    }) }));
  }
  function flowerMaterial() {
    return courtOnce('fiori', () => new THREE.MeshStandardMaterial({ roughness: 1, map: canvasTex(128, 128, (ctx, w) => {
      ctx.fillStyle = '#3f6b32'; ctx.fillRect(0, 0, w, w);
      for (let i = 0; i < 420; i += 1) { const t = hash01(i, 81); ctx.fillStyle = t > 0.35 ? (t > 0.7 ? '#e86aa0' : '#d24f86') : '#5d8a45'; ctx.beginPath(); ctx.arc(hash01(i, 82) * w, hash01(i, 83) * w, 2 + 3 * hash01(i, 84), 0, Math.PI * 2); ctx.fill(); }
    }, 1.5, 1.5) }));
  }
  // totem dell'edificio (foto dell'utente del 21/10/2026): pedana rossa, base cubica di travertino, lastra spessa rossa in
  // lamiera forata con tre cartelli bianchi sulle due facce: codice (CU in grassetto), notizie sull'edificio, mappa della
  // città universitaria con l'edificio evidenziato. orienta 'v': lato lungo parallelo al vialetto.
  // larghezza: lato lungo della lastra; spessore: profondità della base; altezza: cima della lastra
  const SAPIENZA_RED = '#822433', SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  function signTexture(key, w, h, draw) { return courtOnce('totem|' + key, () => new THREE.MeshStandardMaterial({ roughness: 0.55, map: canvasTex(w, h, (ctx) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); draw(ctx, w, h); }) })); }
  // testo a capo entro maxW; ritorna la y dopo l'ultima riga
  function wrapText(ctx, text, x, y, maxW, lineH) {
    let line = '';
    for (const word of String(text).split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > maxW) { ctx.fillText(line, x, y); y += lineH; line = word; } else line = next;
    }
    if (line) { ctx.fillText(line, x, y); y += lineH; }
    return y;
  }
  function codeSign(text) { // «CU» in grassetto, il resto normale, grigio scuro
    return signTexture('codice|' + text, 512, 192, (ctx, w, h) => {
      const m = /^([A-Za-z]+)(.*)$/.exec(text) || [text, text, ''], bold = `bold 118px ${SANS}`, reg = `118px ${SANS}`;
      ctx.font = bold; const w1 = ctx.measureText(m[1]).width; ctx.font = reg; const w2 = ctx.measureText(m[2]).width;
      const k = Math.min(1, (w - 40) / (w1 + w2)), x0 = (w - (w1 + w2) * k) / 2;
      ctx.save(); ctx.translate(x0, h / 2); ctx.scale(k, k); ctx.fillStyle = '#2f2c2b'; ctx.textBaseline = 'middle';
      ctx.font = bold; ctx.fillText(m[1], 0, 6); ctx.font = reg; ctx.fillText(m[2], w1, 6); ctx.restore();
    });
  }
  // testi del cartello delle notizie (foto del 21/10/2026); ogni voce ha la sua formattazione fissa, Invio va a capo
  const TOTEM_CARTELLO = { nome: 'Edificio di Chimica\nStanislao\nCannizzaro', facolta: 'Facoltà di Scienze matematiche, fisiche e naturali',
    dipartimento: 'Dipartimento di Chimica', aula: 'Aula Aldo La Ginestra', polo: 'Polo museale Sapienza', museo: 'Museo di Chimica\nPrimo Levi' };
  function infoSign(cartello, conLogo) {
    const c = Object.assign({}, TOTEM_CARTELLO, cartello || {}), key = JSON.stringify([c, !!conLogo]);
    return courtOnce('totem|notizie+logo|' + key, () => {
      let polo = -1;
      const mat = signTexture('notizie|' + key, 512, 700, (ctx, w) => {
        const x = 30, maxW = w - 60; let y = 70;
        const lines = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#1f1d1c'; ctx.font = `bold 50px ${SANS}`;
        for (const line of lines(c.nome)) y = wrapText(ctx, line, x, y, maxW, 56);
        y += 22;
        const small = (t, yy, mw = maxW - 10) => { ctx.fillStyle = SAPIENZA_RED; ctx.font = `bold 21px ${SANS}`; for (const l of lines(t)) yy = wrapText(ctx, l, x, yy, mw, 25); return yy; };
        const body = (t, yy, mw = maxW) => { ctx.fillStyle = '#1f1d1c'; ctx.font = `25px ${SANS}`; for (const l of lines(t)) yy = wrapText(ctx, l, x, yy, mw, 30); return yy; };
        if (lines(c.facolta).length) y = small(c.facolta, y) + 6;
        y = body(c.dipartimento, y);
        if (lines(c.aula).length) { // segnaposto rosso e aula più sottile, in rosso
          ctx.fillStyle = SAPIENZA_RED; ctx.beginPath(); ctx.arc(x + 7, y - 15, 6.5, Math.PI, 0); ctx.lineTo(x + 7, y + 1); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + 7, y - 15, 2.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = SAPIENZA_RED; ctx.font = `300 25px ${SANS}`; ctx.fillText(lines(c.aula).join(' '), x + 22, y, maxW - 22); y += 30;
        }
        y += 34;
        polo = y;
        const mw = conLogo ? maxW - 120 : maxW; // accanto al logo il testo va a capo prima
        if (lines(c.polo).length) y = small(c.polo, y, mw) + 6;
        body(c.museo, y, mw);
      });
      if (!conLogo) return mat;
      // logo «m» del museo (tex/museo-m-logo.jpg, immagine fornita usata così com'è) a lato di «Polo museale Sapienza»
      const logo = new Image();
      logo.onload = () => {
        const cv = mat.map.image, ctx = cv.getContext('2d'), hh = 100, ww = hh * logo.width / logo.height;
        ctx.drawImage(logo, cv.width - 30 - ww, Math.min(polo - 20, cv.height - hh - 10), ww, hh); mat.map.needsUpdate = true;
      };
      logo.src = 'tex/museo-m-logo.jpg';
      return mat;
    });
  }
  function mapSign() { // mappa della città universitaria: sagome degli edifici, quello del totem evidenziato
    return signTexture('mappa', 384, 360, (ctx, w, h) => {
      ctx.fillStyle = '#1f1d1c'; ctx.beginPath(); ctx.arc(24, 24, 6, 0, Math.PI * 2); ctx.fill();
      ctx.font = `bold 18px ${SANS}`; ctx.textBaseline = 'middle'; ctx.fillText('Sei qui', 38, 25);
      const rings = buildings.filter((b) => Array.isArray(b.rings) && b.rings[0]).map((b) => ({ code: String(b.code).toUpperCase(), pts: b.rings[0].map((p) => project(p)) }));
      if (!rings.length) return;
      const xs = rings.flatMap((r) => r.pts.map((p) => p.x)), ns = rings.flatMap((r) => r.pts.map((p) => p.n));
      const x0 = Math.min(...xs), x1 = Math.max(...xs), n0 = Math.min(...ns), n1 = Math.max(...ns);
      const k = Math.min((w - 36) / (x1 - x0 || 1), (h - 70) / (n1 - n0 || 1)), ox = (w - (x1 - x0) * k) / 2, oy = 52 + (h - 70 - (n1 - n0) * k) / 2;
      for (const r of rings.sort((a, b) => (a.code === 'CU014') - (b.code === 'CU014'))) {
        ctx.beginPath(); r.pts.forEach((p, i) => { const X = ox + (p.x - x0) * k, Y = oy + (n1 - p.n) * k; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.closePath();
        ctx.fillStyle = r.code === 'CU014' ? SAPIENZA_RED : '#e7c4c9'; ctx.fill();
        ctx.strokeStyle = r.code === 'CU014' ? '#4d0f19' : '#b56a75'; ctx.lineWidth = r.code === 'CU014' ? 2 : 1; ctx.stroke();
      }
    });
  }
  function addTotem(g, t) {
    const H = Number(t.altezza) || 2.75, W = Number(t.larghezza) || 0.8, D = Math.max(0.2, Number(t.spessore) || 0.5), T = 0.12;
    const tot = new THREE.Group(); tot.name = 'totem'; tot.position.set(Number(t.u) || 0, 0, -(Number(t.v) || 0)); if (t.orienta === 'v') tot.rotation.y = Math.PI / 2; g.add(tot);
    const { box } = partAdder(tot), red = courtOnce('totem|rosso', () => plainMat('#8a1f2d', 0.5, 0.25)), trav = courtOnce('totem|travertino', () => stdMat({ map: travertineTex(1 / 2.4, 1 / 2.4) }));
    const sheetH = H - 0.04 - 0.74, sheetW = W - 0.12;
    const perforated = courtOnce(`totem|lamiera|${sheetW.toFixed(2)}|${sheetH.toFixed(2)}`, () => new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.25, map: canvasTex(64, 64, (ctx, cw) => {
      ctx.fillStyle = '#8a1f2d'; ctx.fillRect(0, 0, cw, cw); ctx.fillStyle = '#5c1320';
      for (let yy = 4; yy < cw; yy += 8) for (let xx = (yy / 8) % 2 ? 8 : 4; xx < cw; xx += 8) { ctx.beginPath(); ctx.arc(xx, yy, 1.7, 0, Math.PI * 2); ctx.fill(); }
    }, sheetW / 0.08, sheetH / 0.08) }));
    // in X la larghezza, in Z la profondità (faccia anteriore verso +Z); coordinate: box(x0, x1, y0, y1, -z1, -z0)
    box(-W / 2 - 0.05, W / 2 + 0.05, 0, 0.03, -D / 2, D / 2, red); // pedana
    const c = Math.min(0.46, W * 0.6), cd = Math.min(D, 0.46);
    box(-c / 2, c / 2, 0.03, 0.49, -cd / 2, cd / 2, trav); // base cubica di travertino
    for (const sgn of [1, -1]) box(-0.05, 0.05, 0.2, 0.3, sgn > 0 ? -cd / 2 - 0.002 : cd / 2 - 0.004, sgn > 0 ? -cd / 2 + 0.004 : cd / 2 + 0.002, red); // riquadro rosso sul cubo
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) box(x - 0.03, x + 0.03, 0.03, H, -T / 2, T / 2, red); // montanti
    box(-W / 2, W / 2, 0.62, 0.74, -T / 2, T / 2, red); box(-W / 2, W / 2, H - 0.04, H, -T / 2, T / 2, red); // traversi
    box(-sheetW / 2, sheetW / 2, 0.74, H - 0.04, -T / 2 + 0.01, T / 2 - 0.01, [red, red, red, red, perforated, perforated]); // lamiera forata
    // cartelli bianchi sulle due facce
    const s1 = [W - 0.1, 0.28], s2 = [W * 0.78, W * 1.06], s3 = [W * 0.5, W * 0.47];
    const y1 = H - 0.12 - s1[1] / 2, y2 = H - 0.12 - s1[1] - 0.08 - s2[1] / 2, y3 = y2 - s2[1] / 2 - 0.1 - s3[1] / 2;
    const plate = courtOnce('totem|cartello', () => plainMat('#f3f2ee', 0.6));
    const sign = (sz, x, y, mat) => { for (const front of [1, -1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(sz[0], sz[1], 0.012), [plate, plate, plate, plate, front > 0 ? mat : plate, front > 0 ? plate : mat]); m.position.set(x, y, front * (T / 2 + 0.006)); m.castShadow = true; tot.add(m); } };
    sign(s1, 0, y1, codeSign(t.scritta != null ? String(t.scritta) : 'CU014'));
    sign(s2, -W / 2 + 0.06 + s2[0] / 2 - 0.02, y2, infoSign(t.cartello, t.logoMuseo !== false));
    sign(s3, W / 2 - 0.06 - s3[0] / 2, y3, mapSign());
  }
  // rastrelliera per bici ad archetti
  function addBikeRack(g, RS) {
    const dark = courtOnce('rastrelliera', () => plainMat('#3a3d40', 0.5, 0.6));
    for (let i = 0; i < (Number(RS.posti) || 3); i += 1) {
      const uu = Number(RS.u) + i * 0.6, vv = Number(RS.v);
      for (const dv of [-0.35, 0.35]) g.add(localSlab(rectPts(uu - 0.02, uu + 0.02, vv + dv - 0.02, vv + dv + 0.02), 0, 0.8, dark));
      g.add(localSlab(rectPts(uu - 0.02, uu + 0.02, vv - 0.37, vv + 0.37), 0.76, 0.8, dark));
    }
  }
  /* magnolie con chiome ampie (modello 3DExport fornito dall'utente, le stesse dell'artifact della scansione 3D):
     models/magnolia.json + models/magnolia_<a|b>_<chioma|tronco>.wasm (geometrie grezze, origine al piede del tronco, vedi la
     nota nel JSON). Chioma con la texture foglie della stagione (tex/magnolia-foglie-<stagione>.png, bordi con alphaTest),
     tronco con la corteccia. Finché i file non sono caricati, o se non si caricano, resta l'albero procedurale. */
  const STAGIONI = ['primavera', 'estate', 'autunno', 'inverno'];
  let magnoliaAsset = null, magnoliaStato = 0; // 0 da caricare, 1 in corso, 2 pronto, -1 non disponibile
  // stagione: ?stagione=autunno (tutte) > magnolie[k].stagione > "stagione" del cortile nel JSON > data di oggi (ora di Roma)
  function stagioneMagnolia(t) {
    let forzata = null;
    try { forzata = new URLSearchParams(location.search).get('stagione'); } catch (_) { /* nessun URL */ }
    for (const s of [forzata, t && t.stagione, courtyardFrame && courtyardFrame.M && courtyardFrame.M.stagione]) {
      const k = String(s || '').toLowerCase().trim();
      if (STAGIONI.includes(k)) return k;
    }
    // le foglie restano verdi fin verso metà novembre: primavera mar–mag, estate (verde) giu–15 nov, autunno (marrone) 16 nov–31 dic, inverno gen–feb
    let mese, giorno;
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', month: 'numeric', day: 'numeric' }).formatToParts(new Date()).map((x) => [x.type, Number(x.value)]));
      mese = p.month; giorno = p.day;
    } catch (_) { const d = new Date(); mese = d.getMonth() + 1; giorno = d.getDate(); }
    return mese >= 3 && mese <= 5 ? 'primavera' : mese >= 6 && mese <= 10 || (mese === 11 && giorno <= 15) ? 'estate' : mese >= 11 ? 'autunno' : 'inverno';
  }
  // file .wasm (geometria grezza, non WebAssembly: estensione servita dagli artifact): nv posizioni float32 (X = u, Y = h, Z = -v), nv uv float32, nf triangoli uint32 (3 indici ciascuno)
  function magnoliaGeometria(buf, nv, nf) {
    if (buf.byteLength !== nv * 20 + nf * 12) throw new Error('geometria magnolia di dimensione inattesa');
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf.slice(0, nv * 12)), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf.slice(nv * 12, nv * 20)), 2));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf.slice(nv * 20)), 1));
    g.computeVertexNormals();
    return g;
  }
  async function loadMagnoliaAsset() {
    if (magnoliaStato !== 0) return;
    magnoliaStato = 1;
    try {
      const rc = await fetch('models/magnolia.json', { cache: 'no-cache' });
      if (!rc.ok) throw new Error('magnolia.json assente');
      const cfg = await rc.json();
      const get = (f) => fetch(`models/${f}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${f} assente`))));
      const alberi = await Promise.all((cfg.alberi || []).map(async (a) => {
        const [bc, bt] = await Promise.all([get(a.chioma), get(a.tronco)]);
        return { ...a, gChioma: magnoliaGeometria(bc, a.nvChioma, a.nfChioma), gTronco: magnoliaGeometria(bt, a.nvTronco, a.nfTronco) };
      }));
      if (!alberi.length) throw new Error('nessun albero');
      magnoliaAsset = { alberi, suolo: Number(cfg.suolo) || 0.36 };
      magnoliaStato = 2;
      if (courtyardModel) loadCourtyardModel(); // il cortile era già pronto: ricostruiscilo con gli alberi veri
    } catch (_) { magnoliaStato = -1; }
  }
  function magnoliaTree(t, n) {
    if (magnoliaStato === 0) loadMagnoliaAsset();
    if (magnoliaStato !== 2) return magnoliaProcedurale(t, n);
    const A = magnoliaAsset.alberi, a = A.find((x) => x.id === t.id) || A[n % A.length];
    const grp = new THREE.Group(); grp.position.set(Number(t.u) || 0, 0, -(Number(t.v) || 0));
    // le uv escono dall'intervallo 0..1: texture ripetute
    const texLoad = (url) => { const tx = new THREE.TextureLoader().load(url); tx.encoding = THREE.sRGBEncoding; tx.anisotropy = 4; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; return tx; };
    const corteccia = courtOnce('magnolia|corteccia-tex', () => stdMat({ map: texLoad('tex/magnolia-corteccia.jpg'), roughness: 0.95, side: THREE.DoubleSide }));
    const stagione = stagioneMagnolia(t);
    const foglie = courtOnce(`magnolia|foglie|${stagione}`, () => stdMat({ map: texLoad(`tex/magnolia-foglie-${stagione}.png`), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }));
    // altezza → scala Y, raggio → scala orizzontale, rispetto ai valori di riferimento: invariati = albero come nell'artifact
    const model = new THREE.Group();
    model.scale.set((Number(t.raggio) || a.raggioRif) / a.raggioRif, (Number(t.altezza) || a.altezzaRif) / a.altezzaRif, (Number(t.raggio) || a.raggioRif) / a.raggioRif);
    // chiomaOffset: la chioma dell'albero B nell'artifact sta ~4,5 m a lato del suo tronco (finiva sopra l'albero A: B sembrava senza chioma)
    const parti = [[a.gTronco, corteccia, null], [a.gChioma, foglie, a.chiomaOffset]];
    for (const [g, m, off] of parti) {
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true;
      if (Array.isArray(off)) mesh.position.set(Number(off[0]) || 0, Number(off[1]) || 0, Number(off[2]) || 0);
      model.add(mesh);
    }
    // il tronco originale parte a ~0,7-1 m (sotto c'era la base scansionata): ceppo dal terreno all'anello inferiore
    const suolo = magnoliaAsset.suolo, hp = a.piede.h - suolo + 0.05;
    if (hp > 0.05) {
      const ceppo = new THREE.Mesh(new THREE.CylinderGeometry(a.piede.r, a.piede.r * 1.3, hp, 14), corteccia);
      ceppo.position.y = suolo + hp / 2; ceppo.castShadow = true; ceppo.receiveShadow = true; model.add(ceppo);
    }
    grp.add(model);
    return grp;
  }
  // magnolia procedurale (Magnolia grandiflora): doppio tronco e chioma scura e lucida, alta e ovale; ripiego del modello vero
  function magnoliaProcedurale(t, n) {
    const grp = new THREE.Group(), { add } = partAdder(grp); grp.position.set(Number(t.u) || 0, 0, -(Number(t.v) || 0));
    const bark = courtOnce('magnolia|corteccia', () => stdMat({ color: 0x4a3e36, roughness: 0.95 }));
    const leaf = courtOnce('magnolia|foglie', () => stdMat({ color: 0x2c4327, roughness: 0.5, metalness: 0.05, flatShading: true }));
    const base = 0.36;
    for (const [dx, tilt, r] of [[-0.18, -0.12, 0.2], [0.2, 0.1, 0.17]]) {
      const tr = add(new THREE.CylinderGeometry(r * 0.75, r, 5.2, 10), bark, dx, base + 2.5, 0, true);
      tr.rotation.z = tilt;
    }
    const H = t.altezza, R = t.raggio, c0 = 2.6, mid = (c0 + H) / 2;
    for (let i = 0; i < 9; i += 1) {
      const a = hash01(n * 31 + i, 5) * Math.PI * 2, rr = R * 0.45 * hash01(n * 31 + i, 6);
      const y = c0 + 1.6 + (H - c0 - 3.2) * hash01(n * 31 + i, 7);
      const taper = 1 - 0.35 * Math.abs((y - mid) / ((H - c0) / 2));
      const lump = add(lumpyGeometry(n * 13 + i), leaf, Math.cos(a) * rr, y, Math.sin(a) * rr);
      const s = R * (0.55 + 0.2 * hash01(n * 31 + i, 8)) * taper;
      lump.scale.set(s, s * 1.15, s);
    }
    return grp;
  }
  // serbatoio dell'azoto liquido (commento 4 del 27/10/2026: 42 foto, schema «Evaporatore criogenico per O2-N2-Ar» e indicazioni
  // dell'utente): fasciame e calotte bombate bianchi con muffa in basso, tre piedi in lamiera triangolare piegata a L con la piega
  // tonda verso l'esterno e l'orecchia forata, quadro valvole dello schema (PSV1 in cima al tubo della fase gas, cassetta inox del
  // livello LI1 e del manometro PI1, PCV1 e PCV2 a calotta grigia, valvole a volantino, erogazione V2 avvolta nel ghiaccio), cartelli
  // provvisori ritagliati dalle foto, asta dei manometri con la centralina. Coordinate locali: X verso il quadro, Y in alto, Z a sinistra
  // di chi guarda il quadro; `fronte` = azimut del quadro (gradi da +u verso +v). Il serpentino HE1 (3 tubi alettati del modello
  // dell'utente) si aggiunge quando il modello è caricato, nel gruppo userData.serpentino.
  function nitrogenTank(S) {
    const outer = new THREE.Group(); outer.position.set(Number(S.u) || 0, 0, -(Number(S.v) || 0));
    const grp = new THREE.Group(); grp.rotation.y = ((Number(S.fronte) || 0) * Math.PI) / 180; outer.add(grp);
    const { add } = partAdder(grp), once = courtOnce, Yv = new THREE.Vector3(0, 1, 0);
    const R = Number(S.raggio) || 0.8, H = Number(S.altezza) || 4, yb = Number(S.fondo) || 1;
    const k = Math.min(Number(S.calotta) || 0.28, R * 0.6), yt = H - k, PD = S.piedi || {}, g0 = Number(PD.base) || 0.3, soil = Number(S.suolo) || 0.36;
    const headY = (r) => yb - k * Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
    const sx = (z) => Math.sqrt(Math.max(0, R * R - z * z));
    const shell = once('azoto|fasciame', () => stdMat({ map: canvasTex(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#ebe8df'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i += 1) { // colature dall'alto
        const x = hash01(i, 61) * w, l = h * (0.05 + 0.4 * hash01(i, 62) ** 2);
        ctx.fillStyle = `rgba(70,78,66,${0.05 + 0.18 * hash01(i, 63)})`; ctx.fillRect(x, 0, 1 + 2 * hash01(i, 64), l);
      }
      const g = ctx.createLinearGradient(0, h * 0.8, 0, h); g.addColorStop(0, 'rgba(40,48,36,0)'); g.addColorStop(1, 'rgba(40,48,36,.8)');
      ctx.fillStyle = g; ctx.fillRect(0, h * 0.8, w, h * 0.2);
      for (let i = 0; i < 90; i += 1) { ctx.fillStyle = `rgba(35,42,32,${0.3 + 0.4 * hash01(i, 65)})`; ctx.fillRect(hash01(i, 66) * w, h * (0.86 + 0.14 * hash01(i, 67)) - 30 * hash01(i, 68), 2 + 3 * hash01(i, 69), 10 + 40 * hash01(i, 70)); }
    }), roughness: 0.55, metalness: 0.08 }));
    const heads = once('azoto|calotte', () => stdMat({ map: canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#e8e5dc'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i += 1) { ctx.fillStyle = `rgba(70,78,66,${0.08 + 0.2 * hash01(i, 71)})`; ctx.fillRect(hash01(i, 72) * w, h * 0.5 - 40 * hash01(i, 73), 2, 40 * hash01(i, 73)); }
      ctx.fillStyle = 'rgba(38,46,34,.75)'; ctx.fillRect(0, h * 0.5, w, h * 0.5); // fondo inferiore pieno di muffa
      for (let i = 0; i < 200; i += 1) { ctx.fillStyle = `rgba(${hash01(i, 74) > 0.5 ? '200,198,188' : '20,26,18'},.35)`; ctx.fillRect(hash01(i, 75) * w, h * (0.5 + 0.5 * hash01(i, 76)), 3, 3); }
    }), roughness: 0.6, metalness: 0.05 }));
    const legMat = once('azoto|piedi', () => stdMat({ color: 0xe4e1d8, roughness: 0.65, side: THREE.DoubleSide }));
    const inox = once('azoto|inox', () => stdMat({ color: 0xc8ccd0, roughness: 0.3, metalness: 0.8 }));
    const nero = once('azoto|nero', () => stdMat({ color: 0x1b1d1f, roughness: 0.5, metalness: 0.25 }));
    const grigio = once('azoto|pcv', () => stdMat({ color: 0x585f66, roughness: 0.42, metalness: 0.5 }));
    const blu = once('azoto|blu', () => stdMat({ color: 0x2b64bd, roughness: 0.4, metalness: 0.3 }));
    const ghiaccio = once('azoto|ghiaccio', () => stdMat({ color: 0xf4f8fb, roughness: 0.8, emissive: 0x2e3438 }));
    const zinco = once('zinco', () => stdMat({ color: 0xa9adb0, roughness: 0.4, metalness: 0.6 }));
    // fasciame e calotte
    add(new THREE.CylinderGeometry(R, R, yt - yb, 64, 1, true), shell, 0, (yb + yt) / 2, 0);
    add(new THREE.SphereGeometry(R, 64, 12, 0, Math.PI * 2, 0, Math.PI / 2), heads, 0, yt, 0).scale.y = k / R;
    add(new THREE.SphereGeometry(R, 64, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), heads, 0, yb, 0).scale.y = k / R;
    // tre piedi: profilo a L con la piega tonda (raggio rb) verso l'esterno sul raggio rp, ali da wb (a terra) a wt (in alto);
    // il bordo alto segue il fondo bombato; orecchia forata in cima alla piega (foto della gamba mandata dall'utente)
    const rp = Number(PD.raggio) || 0.62, rb = 0.06, wb = 0.05, wt = 0.2, nP = Number(PD.n) || 3, ph = ((PD.sfasamento != null ? Number(PD.sfasamento) : 60) * Math.PI) / 180;
    const legGeo = once('azoto|geo piede|' + [rp, R, yb, k, g0].join(), () => {
      const c = rp - rb, s = Math.SQRT1_2, prof = [{ a: c + rb * s, b: rb * s, d: [-s, s] }];
      for (let i = 0; i <= 8; i += 1) { const f = Math.PI / 4 - (i * Math.PI) / 16; prof.push({ a: c + rb * Math.cos(f), b: rb * Math.sin(f) }); }
      prof.push({ a: c + rb * s, b: -rb * s, d: [-s, -s] });
      const pos = [], uv = [], idx = [];
      prof.forEach((p, j) => {
        for (const [top, w] of [[false, wb], [true, wt]]) {
          const a = p.d ? p.a + p.d[0] * w : p.a, b = p.d ? p.b + p.d[1] * w : p.b;
          pos.push(a, top ? headY(Math.hypot(a, b)) + 0.03 : g0, b); uv.push(j / (prof.length - 1), top ? 1 : 0);
        }
      });
      for (let j = 0; j < prof.length - 1; j += 1) { const q = 2 * j; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
    });
    const lugGeo = once('azoto|geo orecchia', () => {
      const sh = new THREE.Shape(); sh.moveTo(0, -0.07); sh.lineTo(0.04, -0.07); sh.absarc(0.04, 0, 0.07, -Math.PI / 2, Math.PI / 2, false); sh.lineTo(0, 0.07); sh.lineTo(0, -0.07);
      const hole = new THREE.Path(); hole.absarc(0.045, 0, 0.022, 0, Math.PI * 2, true); sh.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false }); g.translate(0, 0, -0.004); return g;
    });
    for (let i = 0; i < nP; i += 1) {
      const al = ph + (i * Math.PI * 2) / nP, leg = add(legGeo, legMat, 0, 0, 0); leg.rotation.y = -al;
      const lug = new THREE.Mesh(lugGeo, legMat); lug.position.set(rp - 0.005, headY(rp) - 0.06, 0); lug.castShadow = true; leg.add(lug);
    }
    // tubi: segmenti diritti con gomiti sferici, nelle coordinate locali
    const pipe = (pts, r, mat) => {
      const P = pts.map((p) => new THREE.Vector3(...p));
      for (let i = 0; i < P.length - 1; i += 1) {
        const a = P[i], b = P[i + 1], len = a.distanceTo(b); if (len < 1e-4) continue;
        add(new THREE.CylinderGeometry(r, r, len, 10), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2).quaternion.setFromUnitVectors(Yv, b.clone().sub(a).normalize());
      }
      for (const q of P.slice(1, -1)) add(new THREE.SphereGeometry(r, 10, 8), mat, q.x, q.y, q.z);
    };
    // valvola a volantino: corpo inox, stelo verso dir, volantino nero (o ottone), cartellino tondo nero
    const valve = (x, y, z, dir, wr = 0.05, wheelMat = nero, tag = false) => {
      const g = new THREE.Group(); g.position.set(x, y, z); g.quaternion.setFromUnitVectors(Yv, new THREE.Vector3(...dir).normalize()); grp.add(g);
      const m = (geo, mat, py) => { const o = new THREE.Mesh(geo, mat); o.position.y = py; o.castShadow = true; g.add(o); return o; };
      m(new THREE.BoxGeometry(0.06, 0.06, 0.06), inox, 0); m(new THREE.CylinderGeometry(0.014, 0.02, 0.14, 8), inox, 0.1);
      m(new THREE.TorusGeometry(wr, 0.008, 6, 18), wheelMat, 0.18).rotation.x = Math.PI / 2;
      m(new THREE.BoxGeometry(wr * 2, 0.008, 0.012), wheelMat, 0.18); m(new THREE.BoxGeometry(0.012, 0.008, wr * 2), wheelMat, 0.18);
      if (tag) { const t = m(new THREE.CylinderGeometry(0.025, 0.025, 0.004, 14), nero, 0.11); t.rotation.z = Math.PI / 2; t.position.x = 0.05; }
    };
    // regolatore a calotta grigia (PCV) con l'asse verso dir
    const pcv = (x, y, z, dir) => {
      const g = new THREE.Group(); g.position.set(x, y, z); g.quaternion.setFromUnitVectors(Yv, new THREE.Vector3(...dir).normalize()); grp.add(g);
      const m = (geo, mat, py) => { const o = new THREE.Mesh(geo, mat); o.position.y = py; o.castShadow = true; g.add(o); return o; };
      m(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 12), inox, 0); m(new THREE.CylinderGeometry(0.078, 0.078, 0.025, 20), grigio, 0.06);
      m(new THREE.SphereGeometry(0.076, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), grigio, 0.072).scale.y = 0.55; m(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 8), inox, 0.13);
    };
    // quadro: tubo della fase gas con PSV1 in cima, cassetta del livello, valvole come nello schema
    const xp = sx(0.04) + 0.075;
    pipe([[sx(0.04) - 0.05, 0.86, 0.04], [xp, 0.92, 0.04], [xp, 2.84, 0.04]], 0.019, inox);
    add(new THREE.CylinderGeometry(0.034, 0.034, 0.2, 12), nero, xp, 2.94, 0.04); add(new THREE.CylinderGeometry(0.024, 0.024, 0.06, 10), nero, xp, 3.07, 0.04); // PSV1
    pipe([[xp, 2.98, 0.04], [xp, 2.98, 0.17]], 0.014, inox);
    add(new THREE.CylinderGeometry(0.045, 0.016, 0.1, 12, 1, true), inox, xp, 3.02, 0.2).rotation.x = -0.7; // scarico svasato
    pipe([[xp, 2.62, 0.04], [xp, 2.62, -0.08], [xp, 2.7, -0.08]], 0.012, inox); add(new THREE.CylinderGeometry(0.026, 0.026, 0.15, 10), nero, xp, 2.77, -0.08); // PSE1 su V11
    const bx = sx(-0.3) + 0.03; // cassetta inox LI1 / PI1
    add(new THREE.BoxGeometry(0.25, 0.26, 0.5), inox, bx + 0.125, 2.42, -0.3);
    for (const z of [-0.12, -0.48]) add(new THREE.BoxGeometry(0.05, 0.03, 0.03), inox, bx - 0.02, 2.42, z);
    add(new THREE.CircleGeometry(0.068, 24), nero, bx + 0.252, 2.42, -0.2).rotation.y = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.066, 0.066, 0.03, 24), inox, bx + 0.265, 2.42, -0.41).rotation.z = Math.PI / 2;
    add(new THREE.CircleGeometry(0.056, 24), once('azoto|quadrante', () => stdMat({ map: gaugeDialTex(), roughness: 0.3 })), bx + 0.282, 2.42, -0.41).rotation.y = Math.PI / 2;
    pipe([[bx + 0.1, 2.29, -0.25], [bx + 0.1, 1.05, -0.25]], 0.005, inox); pipe([[bx + 0.15, 2.29, -0.35], [bx + 0.15, 1.1, -0.35]], 0.005, inox);
    valve(xp + 0.05, 2.22, 0.04, [1, 0.2, 0], 0.06, nero, true); // V10
    pipe([[xp, 1.82, 0.04], [xp, 1.82, 0.24]], 0.014, inox); valve(xp, 1.82, 0.26, [0, 1, 0], 0.045, nero, true); // V9
    pipe([[xp, 1.42, 0.04], [xp, 1.42, 0.24]], 0.014, inox); pcv(xp + 0.02, 1.42, 0.26, [1, 0, 0]); // PCV2
    valve(xp, 1.4, -0.08, [0, 1, 0], 0.045, nero, true); valve(xp, 1.38, -0.2, [0, 1, 0], 0.045, nero, true); // V4, V3
    pipe([[xp, 1.18, 0.04], [xp + 0.14, 1.18, 0.04]], 0.016, inox); add(new THREE.CylinderGeometry(0.032, 0.032, 0.07, 14), inox, xp + 0.18, 1.18, 0.04).rotation.z = Math.PI / 2; // CARICO
    pcv(xp, 0.82, 0.18, [1, 0, 0]); valve(xp, 0.72, 0.36, [0, 1, 0], 0.045); // PCV1, V1
    add(new THREE.CylinderGeometry(0.038, 0.038, 0.045, 18), blu, xp + 0.03, 1.02, 0.46).rotation.z = Math.PI / 2; // trasmettitore di pressione
    // erogazione del liquido V2 / V2 BIS sopra la palla di ghiaccio (bianca: è ghiaccio, indicazione dell'utente)
    valve(sx(-0.44) + 0.12, 1.24, -0.44, [0, 1, 0], 0.05, nero, true); grp.children[grp.children.length - 1].traverse((o) => { o.userData.sfiato = true; }); // V2: easter egg dello sfiato
    valve(sx(-0.56) + 0.12, 1.22, -0.56, [0, 1, 0], 0.05, once('azoto|ottone', () => stdMat({ color: 0x8a6a3a, roughness: 0.4, metalness: 0.7 })), true);
    const ice = add(lumpyGeometry(7), ghiaccio, sx(-0.5) + 0.12, 1.05, -0.5); ice.scale.set(0.15, 0.12, 0.17);
    const uscita = new THREE.Object3D(); uscita.position.set(sx(-0.5) + 0.12, 1.0, -0.5); grp.add(uscita); outer.userData.uscita = uscita;
    // cartelli e scritte (ritagli provvisori dalle foto in tex/azoto/, curvati sul fasciame); psi = gradi a destra del quadro
    const arcSign = (file, w, h, y, psi, opts = {}) => {
      const r = R + 0.004, dt = w / r, th = Math.PI / 2 + (psi * Math.PI) / 180;
      const mat = once('azoto|cartello|' + file, () => stdMat(Object.assign({ map: new THREE.TextureLoader().load(file, (t) => { t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; }), roughness: 0.6 }, opts)));
      add(new THREE.CylinderGeometry(r, r, h, Math.max(4, Math.round(dt * 30)), 1, true, th - dt / 2, dt), mat, 0, y, 0, false);
    };
    arcSign('tex/nippon-gases-logo.jpg', 0.7, 0.22, 3.42, 0);
    arcSign('tex/azoto/servizio-alert.jpg', 0.42, 0.3, 2.1, 60);
    arcSign('tex/azoto/schema-impianto.jpg', 0.34, 0.5, 1.45, 52);
    arcSign('tex/azoto/scheda-azoto.jpg', 0.3, 0.57, 1.45, 78);
    arcSign('tex/azoto/avvertenze-travaso.jpg', 0.17, 0.45, 1.5, 98);
    const letters = once('azoto|scritta', () => stdMat({ map: canvasTex(1024, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#1e3c8c'; ctx.font = 'bold 104px "Times New Roman", Times, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('AZOTO  LIQUIDO', w / 2, h / 2 + 6);
    }), transparent: true, alphaTest: 0.35, roughness: 0.5 }));
    { const r = R + 0.004, w = 1.25, dt = w / r, th = Math.PI / 2 + (25 * Math.PI) / 180; add(new THREE.CylinderGeometry(r, r, 0.16, 40, 1, true, th - dt / 2, dt), letters, 0, 2.66, 0, false); }
    // asta dei manometri: palo zincato con fazzoletti triangolari, due manometri, pressostato nero e centralina LEGIOBOX
    const gx = R + 0.32, gz = 0.6;
    add(new THREE.CylinderGeometry(0.025, 0.025, 1.95, 10), zinco, gx, soil + 0.975, gz); add(new THREE.BoxGeometry(0.22, 0.01, 0.22), zinco, gx, soil + 0.005, gz);
    const tri = once('azoto|geo fazzoletto', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.16, 0); s.lineTo(0, 0.28); s.lineTo(0, 0); const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false }); g.translate(0.02, 0, -0.003); return g; });
    for (let i = 0; i < 4; i += 1) add(tri, zinco, gx, soil + 0.01, gz).rotation.y = (i * Math.PI) / 2;
    add(new THREE.BoxGeometry(0.02, 0.42, 0.14), zinco, gx + 0.04, soil + 1.6, gz);
    const dial = once('azoto|quadrante', () => stdMat({ map: gaugeDialTex(), roughness: 0.3 }));
    for (const [y, r] of [[soil + 1.66, 0.08], [soil + 1.44, 0.055]]) {
      add(new THREE.CylinderGeometry(r + 0.006, r + 0.006, 0.05, 24), inox, gx + 0.08, y, gz).rotation.z = Math.PI / 2;
      add(new THREE.CircleGeometry(r, 24), dial, gx + 0.106, y, gz).rotation.y = Math.PI / 2;
    }
    add(new THREE.BoxGeometry(0.05, 0.08, 0.06), nero, gx + 0.08, soil + 1.66, gz + 0.13);
    add(new THREE.BoxGeometry(0.09, 0.13, 0.24), once('azoto|legiobox', () => stdMat({ color: 0xeef0f2, roughness: 0.5 })), gx + 0.06, soil + 1.86, gz);
    add(new THREE.BoxGeometry(0.005, 0.03, 0.22), blu, gx + 0.107, soil + 1.89, gz);
    pipe([[gx + 0.05, soil + 1.55, gz], [xp + 0.05, soil + 1.55, 0.3], [xp, soil + 1.55, 0.06]], 0.005, inox);
    pipe([[gx + 0.05, soil + 1.5, gz - 0.02], [xp + 0.03, soil + 1.5, 0.28], [xp, soil + 1.5, 0.06]], 0.005, inox);
    // serpentino HE1: gruppo riempito con 3 tubi alettati del modello dell'utente (loadCourtyardModel)
    const coil = new THREE.Group(); coil.position.set(-0.3, Number(S.serpentino) || 0.55, 0); grp.add(coil); outer.userData.serpentino = coil;
    return outer;
  }
  // quadrante di manometro: fondo bianco, tacche, numeri e lancetta
  function gaugeDialTex() {
    return canvasTex(128, 128, (ctx, w) => {
      ctx.fillStyle = '#f7f7f4'; ctx.fillRect(0, 0, w, w); ctx.translate(w / 2, w / 2); ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
      for (let i = 0; i <= 20; i += 1) { const a = Math.PI * 0.75 + (i / 20) * Math.PI * 1.5, r0 = i % 5 ? 50 : 44; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * 56, Math.sin(a) * 56); ctx.stroke(); }
      ctx.strokeStyle = '#c22'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 53, Math.PI * 1.85, Math.PI * 2.1); ctx.stroke();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(Math.PI * 1.6) * 44, Math.sin(Math.PI * 1.6) * 44); ctx.stroke();
    });
  }
  // gabbia verde: montanti, rete e porticina; cartello di sicurezza sul lato verso l'albero (g0: quota del cordolo su cui poggia)
  function buildCage(G, g0) {
    const grp = new THREE.Group(), { add, box } = partAdder(grp), std = stdMat, once = courtOnce;
    const meshMat = once('rete', () => new THREE.MeshStandardMaterial({ map: wireMeshTex(), alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 }));
    const gh = G.altezza, PD = G.porta && typeof G.porta === 'object' ? G.porta : null;
    // montanti tondi verde acqua agli angoli e a metà dei lati; nessun montante dentro il vano della porticina
    const postMat = std({ color: 0x5f9f88, roughness: 0.5, metalness: 0.3 });
    const um = (G.u[0] + G.u[1]) / 2, vm = (G.v[0] + G.v[1]) / 2;
    for (const [u, v] of [[G.u[0], G.v[0]], [um, G.v[0]], [G.u[1], G.v[0]], [G.u[1], vm], [G.u[1], G.v[1]], [um, G.v[1]], [G.u[0], G.v[1]], [G.u[0], vm]]) {
      if (PD && u === G.u[0] && v > PD.v[0] - 0.05 && v < PD.v[1] + 0.05) continue;
      add(new THREE.CylinderGeometry(0.024, 0.024, gh, 10), postMat, u, g0 + gh / 2, -v);
    }
    const panel = (w, h, x, z, rotY) => { const p = add(new THREE.PlaneGeometry(w, h), meshMat, x, g0 + h / 2, z, false); p.rotation.y = rotY; p.material.map.repeat.set(w / 0.4, h / 0.4); return p; };
    const wu = G.u[1] - G.u[0], wv = G.v[1] - G.v[0];
    panel(wu, gh, (G.u[0] + G.u[1]) / 2, -G.v[0], 0); panel(wu, gh, (G.u[0] + G.u[1]) / 2, -G.v[1], 0);
    panel(wv, gh, G.u[1], -(G.v[0] + G.v[1]) / 2, Math.PI / 2);
    // lato u−: la rete c'è solo fuori dal vano della porticina (commento del 30/10: non va sovrapposta alla porta)
    if (PD) { for (const [a, b] of [[G.v[0], PD.v[0]], [PD.v[1], G.v[1]]]) if (b - a > 0.02) panel(b - a, gh, G.u[0], -(a + b) / 2, Math.PI / 2); }
    else panel(wv, gh, G.u[0], -(G.v[0] + G.v[1]) / 2, Math.PI / 2);
    // porticina sul lato u− (foto del 19/10/2026): telaio fisso verde scuro dalla soglia nel cordolo alla sommità della gabbia;
    // anta con griglia di piatti (maglie fitte sotto il traverso largo, solo montanti e due correnti sopra)
    const pv0 = PD ? PD.v[0] : vm - 0.6, pv1 = PD ? PD.v[1] : vm + 0.6, pb = PD ? Number(PD.soglia) || 0.12 : g0, pt = PD ? Number(PD.sommita) || g0 + gh : g0 + gh;
    const doorMat = std({ color: 0x235b42, roughness: 0.55, metalness: 0.35 }), du0 = G.u[0] - 0.07, du1 = G.u[0] - 0.01;
    box(du0, du1, pb, pt, pv0, pv0 + 0.06, doorMat); box(du0, du1, pb, pt, pv1 - 0.06, pv1, doorMat); box(du0, du1, pt - 0.06, pt, pv0, pv1, doorMat);
    const a0 = pv0 + 0.08, a1 = pv1 - 0.08, b0 = pb + 0.04, b1 = pt - 0.08, mid = b0 + (b1 - b0) * 0.48, f0 = du0 + 0.01, f1 = du0 + 0.04;
    { // anta: gruppo col cardine sul lato a1 (nella passeggiata si apre col tasto F); le coordinate restano quelle della gabbia
      const hingeU = (du0 + du1) / 2, leaf = new THREE.Group(); leaf.position.set(hingeU, 0, -a1); grp.add(leaf);
      leaf.userData.anta = { punta: [0, 0, a1 - a0] }; cageLeaf = leaf;
      const lb = partAdder(leaf).box, box = (u0, u1, h0, h1, v0, v1, m) => lb(u0 - hingeU, u1 - hingeU, h0, h1, v0 - a1, v1 - a1, m);
    box(du0, du1, b0, b0 + 0.05, a0, a1, doorMat); box(du0, du1, b1 - 0.05, b1, a0, a1, doorMat);
    box(du0, du1, b0, b1, a0, a0 + 0.05, doorMat); box(du0, du1, b0, b1, a1 - 0.05, a1, doorMat);
    box(du0, du1, mid - 0.05, mid + 0.05, a0, a1, doorMat); // traverso largo
    const nV = Math.max(2, Math.round((a1 - a0) / 0.18)), nL = Math.max(2, Math.round((mid - b0) / 0.15)), nU = 3;
    for (let i = 1; i < nV; i += 1) { const v = a0 + ((a1 - a0) * i) / nV; box(f0, f1, b0, b1, v - 0.012, v + 0.012, doorMat); }
    for (let i = 1; i < nL; i += 1) { const hh = b0 + ((mid - b0) * i) / nL; box(f0, f1, hh - 0.012, hh + 0.012, a0, a1, doorMat); }
    for (let i = 1; i < nU; i += 1) { const hh = mid + ((b1 - mid) * i) / nU; box(f0, f1, hh - 0.012, hh + 0.012, a0, a1, doorMat); }
    box(du0 - 0.04, du0, mid - 0.2, mid - 0.06, a0 + 0.06, a0 + 0.12, doorMat); // serratura
    }
    // cartello in alto sulla rete, come nelle foto: sotto passa il tubo di scarico
    const sign = add(new THREE.PlaneGeometry(0.62, 0.92), once('gabbia|cartello', () => std({ map: canvasTex(180, 280, (ctx, w, h) => {
      ctx.fillStyle = '#f4f4f2'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2b78c2'; ctx.fillRect(8, 28, w - 16, 8); ctx.fillRect(8, 112, w - 16, 8); ctx.fillRect(8, 180, w - 16, 8);
      for (let i = 0; i < 6; i += 1) { ctx.fillStyle = '#d43a3a'; ctx.beginPath(); ctx.arc(22 + i * 27, 62, 10, 0, Math.PI * 2); ctx.fill(); }
      for (let i = 0; i < 5; i += 1) { ctx.fillStyle = '#f2c84b'; ctx.beginPath(); ctx.moveTo(22 + i * 32, 158); ctx.lineTo(36 + i * 32, 132); ctx.lineTo(50 + i * 32, 158); ctx.fill(); }
      for (let i = 0; i < 6; i += 1) { ctx.fillStyle = '#2b78c2'; ctx.beginPath(); ctx.arc(22 + i * 27, 206, 10, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#d9dde2'; ctx.fillRect(10, 228, w - 20, 42);
    }), roughness: 0.6 })), G.u[0] + 0.5, g0 + gh - 0.52, -G.v[0] + 0.02, false);
    return grp;
  }
  // anta di cancello a barre verticali lunga L lungo X: telaio, barre ogni 13 cm, rete fitta a richiesta
  function barGate(L, h, mesh) {
    const g = new THREE.Group(), gate = courtOnce('cancello', () => stdMat({ color: 0x6e3a28, roughness: 0.6, metalness: 0.35 })), barGeo = new THREE.BoxGeometry(0.028, 1, 0.028);
    for (const hh of [0.06, h]) { const r = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.04), gate); r.position.set(L / 2, hh, 0); r.castShadow = true; g.add(r); }
    for (const xx of [0, L]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), gate); r.position.set(xx, h / 2, 0); g.add(r); }
    for (let x = 0.12; x < L - 0.05; x += 0.13) { const b = new THREE.Mesh(barGeo, gate); b.scale.y = h; b.position.set(x, h / 2 + 0.03, 0); b.castShadow = true; g.add(b); }
    // anta apribile nella passeggiata (cammina.js, tasto F): cardine nell'origine del gruppo, estremo libero in `punta`; `apertura` (radianti,
    // in più sulla rotazione di partenza) fissa il verso, altrimenti l'anta si apre spingendola lontano da chi cammina
    g.userData.anta = { punta: [L, 0, 0] };
    if (mesh) { const m = new THREE.Mesh(new THREE.PlaneGeometry(L, h - 0.1), new THREE.MeshStandardMaterial({ map: wireMeshTex('rgba(120,92,60,1)'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 })); m.material.map.repeat.set(L / 0.05, (h - 0.1) / 0.05); m.position.set(L / 2, h / 2, 0.03); g.add(m); }
    return g;
  }
  // tombino quadrato in ghisa con telaio, a filo del pavimento (lato L)
  function manhole(L) {
    const grp = new THREE.Group(), { box } = partAdder(grp), f = 0.05;
    const iron = courtOnce('ghisa', () => stdMat({ color: 0x3b3a38, roughness: 0.7, metalness: 0.45 })), ironFrame = courtOnce('ghisa|telaio', () => stdMat({ color: 0x55524d, roughness: 0.6, metalness: 0.4 }));
    box(-L / 2 - f, L / 2 + f, 0, 0.03, -L / 2 - f, L / 2 + f, ironFrame);
    box(-L / 2, L / 2, 0, 0.034, -L / 2, L / 2, iron);
    for (let i = 1; i < 6; i += 1) box(-L / 2 + 0.03, L / 2 - 0.03, 0.034, 0.04, -L / 2 + (L * i) / 6 - 0.01, -L / 2 + (L * i) / 6 + 0.01, ironFrame);
    return grp;
  }
  // transenna zincata lunga L lungo X
  function crowdBarrier(L) {
    const g = new THREE.Group(), zinc = courtOnce('zinco', () => stdMat({ color: 0xa9adb0, roughness: 0.4, metalness: 0.6 }));
    for (const hh of [0.15, 1.05]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, L, 8), zinc); r.rotation.z = Math.PI / 2; r.position.set(L / 2, hh, 0); g.add(r); }
    for (let x = 0; x <= L + 0.01; x += 0.16) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 6), zinc); b.position.set(x, 0.6, 0); g.add(b); }
    return g;
  }
  /* easter egg (commento del 30/10): con la porticina della gabbia aperta, un clic sulla valvola V2 del serbatoio sfiata l'azoto: nebbia
     bianca bassa (all'altezza dei pantaloni) che esce dalla valvola e si allarga fino a farsi fitta, poi si dirada */
  let cageLeaf = null, fog = null;
  function startFog(pos) {
    if (fog) { scene.remove(fog.group); fog = null; }
    const tex = courtOnce('azoto|nebbia', () => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); });
    const group = new THREE.Group(), parts = [];
    for (let i = 0; i < 70; i += 1) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      const a = Math.random() * Math.PI * 2; m.position.copy(pos); group.add(m);
      parts.push({ m, a, v: 0.5 + Math.random() * 1.2, d: Math.random() * 1.5, y: 0.15 + Math.random() * 0.55 });
    }
    scene.add(group); fog = { group, parts, t: 0, pos: pos.clone() };
  }
  function updateFog(dt) {
    if (!fog) return;
    fog.t += dt; const t = fog.t, life = 40;
    for (const p of fog.parts) {
      const tt = Math.max(0, t - p.d), r = Math.min(6, p.v * Math.sqrt(tt) * 1.6), fade = Math.min(1, tt * 2) * Math.max(0, 1 - Math.max(0, t - life * 0.6) / (life * 0.4));
      p.m.position.set(fog.pos.x + Math.cos(p.a) * r, (fog.groundY || 0) + p.y + Math.max(0, 1.1 - tt * 1.5), fog.pos.z + Math.sin(p.a) * r); // esce dalla valvola e scende a terra
      const sz = 0.6 + r * 0.8; p.m.scale.set(sz, sz * 0.45, 1); p.m.material.opacity = 0.55 * fade;
    }
    if (t > life) { scene.remove(fog.group); fog = null; }
  }
  function setupFogClick() {
    const rc = new THREE.Raycaster(), ndc = new THREE.Vector2(); let d0 = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { d0 = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (!d0 || Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) > 6 || !courtyardModel) return;
      if (!(cageLeaf && cageLeaf.userData.anta && cageLeaf.userData.anta.aperta)) return; // prima si apre la porticina
      const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(ndc, camera);
      const hit = rc.intersectObject(courtyardModel, true).find((h) => h.object.userData.sfiato);
      if (!hit) return;
      startFog(hit.point); fog.groundY = hit.point.y - 1.2; // il serbatoio ha la valvola a circa 1,2 m da terra
    });
  }
  async function loadCourtyardModel() {
    if (!courtyardFrame) return;
    const { geo, M } = courtyardFrame;
    if (!scene || !Array.isArray(geo.originLonLat)) return;
    // ricostruibile: togli il modello precedente e il corpo sopra il portico
    if (courtyardModel) { scene.remove(courtyardModel); disposeTree(courtyardModel); courtyardModel = null; }
    if (buildingGroup) for (const m of buildingGroup.children.filter((c) => c.userData.porticoCorpo)) { buildingGroup.remove(m); m.geometry.dispose(); }
    const origin = project(geo.originLonLat);
    const holder = new THREE.Group();
    holder.name = 'cortile-modello';
    holder.position.set(origin.x, -(Number(geo.scanFloorZ) || 0) + 0.03, -origin.n);
    holder.rotation.y = (Number(geo.yawDeg) || 0) * Math.PI / 180;
    const court = new THREE.Group(); // coordinate locali: X = u, Y = h, Z = −v
    court.position.set(M.riferimento.origine[0], Number(geo.scanFloorZ) || 0, -M.riferimento.origine[1]);
    court.rotation.y = M.riferimento.angoloDeg * Math.PI / 180;
    holder.add(court);
    const { add, box } = partAdder(court), std = stdMat, once = courtOnce; // materiali riusati alle ricostruzioni dell'editor
    const travMat = (ru, rv) => once(`trav|${ru}|${rv}`, () => std({ map: travertineTex(ru, rv) }));

    // pavimento: sanpietrini con fasce di travertino
    const P = M.pavimento, du = P.u[1] - P.u[0], dv = P.v[1] - P.v[0];
    const floor = add(new THREE.PlaneGeometry(du, dv), once('sanpietrini', () => std({ map: sanpietriniTex(1), roughness: 0.95 })), (P.u[0] + P.u[1]) / 2, 0.012, -(P.v[0] + P.v[1]) / 2, false);
    floor.rotation.x = -Math.PI / 2; floor.material.map.repeat.set(du / 2, dv / 2);
    for (const [v0, v1] of P.fasceTravertino) { const s = add(new THREE.PlaneGeometry(du, v1 - v0), travMat(du / 2.4, 0.25), (P.u[0] + P.u[1]) / 2, 0.02, -(v0 + v1) / 2, false); s.rotation.x = -Math.PI / 2; }

    // aiuole: cordolo in travertino e terra con foglie
    const curb = travMat(1, 0.2), soil = once('terra', () => std({ map: soilTex(), roughness: 1 }));
    const live = (arr) => (arr || []).filter((x) => !x.rimosso); // gli elementi eliminati dall'editor restano nel file con rimosso: true
    for (const a of live(M.aiuole)) {
      const { add, box } = partAdder(turned(court, a, (a.u[0] + a.u[1]) / 2, (a.v[0] + a.v[1]) / 2)); // l'aiuola gira attorno al suo centro (angolo)
      const t = 0.16, h = a.altezza, cut = a.varco || null; // varco: tratto di cordolo abbassato (soglia della porticina)
      const side = (lato, u0, u1, v0, v1) => {
        if (!cut || cut.lato !== lato) { box(u0, u1, 0, h, v0, v1, curb); return; }
        const alongU = lato[0] === 'v', [s0, s1] = alongU ? [u0, u1] : [v0, v1], q = Number(cut.quota) || 0.12;
        for (const [p0, p1, top] of [[s0, cut.da, h], [cut.da, cut.a, q], [cut.a, s1, h]]) if (p1 > p0 + 0.01) { if (alongU) box(p0, p1, 0, top, v0, v1, curb); else box(u0, u1, 0, top, p0, p1, curb); }
      };
      side('v-', a.u[0], a.u[1], a.v[0], a.v[0] + t); side('v+', a.u[0], a.u[1], a.v[1] - t, a.v[1]);
      side('u-', a.u[0], a.u[0] + t, a.v[0], a.v[1]); side('u+', a.u[1] - t, a.u[1], a.v[0], a.v[1]);
      const s = add(new THREE.PlaneGeometry(a.u[1] - a.u[0] - 2 * t, a.v[1] - a.v[0] - 2 * t), soil, (a.u[0] + a.u[1]) / 2, h - 0.06, -(a.v[0] + a.v[1]) / 2, false);
      s.rotation.x = -Math.PI / 2;
    }

    live(M.magnolie).forEach((t, n) => turned(court, t, Number(t.u), Number(t.v)).add(albero(magnoliaTree(t, n))));

    const tank = nitrogenTank(M.serbatoio); turned(court, M.serbatoio, Number(M.serbatoio.u), Number(M.serbatoio.v)).add(tank);

    // tubo di scarico del serbatoio (foto del 19/10/2026): metallico, esce sotto il serbatoio, corre orizzontale
    // verso il lato della porticina, scavalca il cordolo, scende a terra con un gomito e poggia su una canaletta bianca
    const TS = M.tuboScarico && !M.tuboScarico.rimosso ? M.tuboScarico : null;
    if (TS && Array.isArray(TS.percorso) && TS.percorso.length > 1) {
      const pipeMat = std({ color: 0xd3d6d8, roughness: 0.4, metalness: 0.45 }), pr = Number(TS.raggio) || 0.08, yAxis = new THREE.Vector3(0, 1, 0);
      const pts = TS.percorso.map(([u, v, h]) => new THREE.Vector3(u, h, -v));
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i], b = pts[i + 1], seg = add(new THREE.CylinderGeometry(pr, pr, a.distanceTo(b), 18), pipeMat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        seg.quaternion.setFromUnitVectors(yAxis, b.clone().sub(a).normalize());
      }
      for (const q of pts.slice(1, -1)) add(new THREE.SphereGeometry(pr, 18, 12), pipeMat, q.x, q.y, q.z); // gomiti
      // il tubo scarica in una fossetta scoperta lungo la base del cordolo, che prosegue fino alla cancellata su strada
      const FS = TS.fossetta;
      if (FS) {
        const w = Number(FS.larghezza) || 0.2, len = FS.v[1] - FS.v[0];
        box(FS.u - w / 2, FS.u + w / 2, 0, 0.016, FS.v[0], FS.v[1], std({ map: canvasTex(64, 256, (ctx, cw, ch) => {
          ctx.fillStyle = '#3d3b30'; ctx.fillRect(0, 0, cw, ch); // fondo bagnato con muschio e foglie
          for (let i = 0; i < 260; i += 1) { const t = hash01(i, 71); ctx.fillStyle = t > 0.75 ? 'rgba(150,104,52,0.6)' : t > 0.45 ? 'rgba(88,108,56,0.55)' : 'rgba(22,20,16,0.5)'; ctx.fillRect(hash01(i, 72) * cw, hash01(i, 73) * ch, 3 + 6 * hash01(i, 74), 3 + 9 * hash01(i, 75)); }
        }, 1, len / 1.2), roughness: 1 }));
        box(FS.u - w / 2 - 0.06, FS.u - w / 2, 0, 0.035, FS.v[0], FS.v[1], std({ color: 0x6f7163, roughness: 1 })); // bordo verso il cortile
      }
      // mezzo tubo bianco adagiato nella fossetta, dove finisce lo scarico
      const CT = TS.canaletta;
      if (CT) {
        const r = (Number(CT.larghezza) || 0.16) / 2, half = new THREE.CylinderGeometry(r, r, CT.v[1] - CT.v[0], 16, 1, true, Math.PI / 2, Math.PI);
        half.rotateX(-Math.PI / 2); // asse lungo v, metà aperta verso l'alto
        const m = add(half, std({ color: 0xf0efea, roughness: 0.8, side: THREE.DoubleSide }), CT.u, r + 0.005, -(CT.v[0] + CT.v[1]) / 2);
        m.castShadow = false;
      }
    }

    turned(court, M.gabbia, (M.gabbia.u[0] + M.gabbia.u[1]) / 2, (M.gabbia.v[0] + M.gabbia.v[1]) / 2).add(buildCage(M.gabbia, 0.42));

    // cancellata su strada: muretto, ringhiera a barre e due ante aperte verso l'interno
    const C = M.cancellata, rust = std({ color: 0x7a4b30, roughness: 0.55, metalness: 0.35 }), wallMat = travMat(2, 0.4);
    const bars = [];
    // le barre mantengono il passo 0.13 con la fase del bordo del pavimento anche nel tratto che sporge oltre i muri
    const ph0 = M.pavimento.u[0] + 0.06, ext = Number(C.sporgenza) || 0;
    const rail = (u0, u1, h0, h1) => { for (let u = ph0 + Math.floor((u0 + 0.04 - ph0) / 0.13) * 0.13; u < u1; u += 0.13) if (u > u0) bars.push([u, h0, h1, C.v]); box(u0, u1, h1 - 0.05, h1, C.v - 0.025, C.v + 0.025, rust); box(u0, u1, h0, h0 + 0.05, C.v - 0.025, C.v + 0.025, rust); };
    for (const [u0, u1] of [[M.pavimento.u[0] - ext, C.varco[0]], [C.varco[1], M.pavimento.u[1] + ext]]) {
      box(u0, u1, 0, C.muretto, C.v - 0.15, C.v + 0.15, wallMat);
      rail(u0, u1, C.muretto, C.muretto + C.ringhiera);
    }
    // cassetta antincendio («bocciolone», vetro scuro in cornice di alluminio) addossata alla faccia su strada del muretto (commento con foto, 22/10):
    // dati in cancellata.cassetta; dietro, nella foto, la ringhiera è a barre color crema (non ruggine) e un tubo rosso corre lungo il muro
    const CS = C.cassetta;
    if (CS) {
      const cw = Number(CS.larghezza) || 1, ch = Number(CS.altezza) || 0.5, cd = Number(CS.profondita) || 0.23, c0 = Number(CS.h0) || 0.42, cu0 = CS.u - cw / 2, cu1 = CS.u + cw / 2, vf = C.v - 0.15;
      const alu = once('cassetta-alu', () => std({ color: 0xb9bcc0, roughness: 0.4, metalness: 0.6 })), vetro = once('cassetta-vetro', () => std({ color: 0x1b2029, roughness: 0.12, metalness: 0.3 }));
      box(cu0, cu1, c0, c0 + ch, vf - cd, vf, alu);                                        // corpo in alluminio
      box(cu0 + 0.07, cu1 - 0.07, c0 + 0.07, c0 + ch - 0.07, vf - cd - 0.012, vf - cd + 0.004, vetro); // vetro scuro, leggermente sporgente dalla cornice
      box(cu0 - 0.015, cu1 + 0.015, c0 + ch, c0 + ch + 0.025, vf - cd - 0.03, vf, once('cassetta-tetto', () => std({ color: 0x8d9298, roughness: 0.45, metalness: 0.6 }))); // copertina grigia sporgente
      box(CS.u - 0.11, CS.u + 0.11, c0 + 0.1, c0 + 0.17, vf - cd - 0.016, vf - cd - 0.012, once('cassetta-adesivo', () => std({ color: 0xf2f2f0, roughness: 0.6 }))); // adesivo del costruttore
      if (CS.tuboRosso) { const t = add(new THREE.CylinderGeometry(0.045, 0.045, 1, 10), once('tubo-rosso-cass', () => std({ color: 0xb3262e, roughness: 0.5, metalness: 0.2 })), cu0 - 0.5, Number(CS.tuboRosso), -(vf - 0.05)); t.rotation.z = Math.PI / 2; } // tubo rosso lungo 1 m che esce a sinistra dalla cassetta
    }
    const crema = once('ringhiera-crema', () => std({ color: 0xd8c690, roughness: 0.6, metalness: 0.15 })); // barre della ringhiera: giallo crema come nella foto
    const barGeo = new THREE.BoxGeometry(0.028, 1, 0.028);
    const barMesh = new THREE.InstancedMesh(barGeo, crema, bars.length + 80);
    const mtx = new THREE.Matrix4(); let bi = 0;
    for (const [u, h0, h1, v] of bars) { mtx.makeScale(1, h1 - h0, 1).setPosition(u, (h0 + h1) / 2, -v); barMesh.setMatrixAt(bi++, mtx); }
    const gateH = Number(C.altezzaCancello) || 2.1, back = Number(C.rientro) || 0.9;
    const frameBars = (x0, z0, x1, z1, h, mesh, apertura) => { // anta a barre verticali fra due punti a terra, cardine nel primo
      const g = barGate(Math.hypot(x1 - x0, z1 - z0), h, mesh); g.position.set(x0, 0, z0); g.rotation.y = -Math.atan2(z1 - z0, x1 - x0); court.add(g);
      if (apertura != null) g.userData.anta.apertura = apertura;
    };
    const [gA, gB] = C.varco;
    frameBars(gA, -C.v, gA, -(C.v + back), gateH, false);          // cancelletto pedonale sinistro, perpendicolare
    frameBars(gB, -C.v, gB, -(C.v + back), gateH, true);           // cancelletto pedonale destro (con rete fitta)
    // ante principali, arretrate: cardini agli estremi del varco, nella passeggiata si aprono verso la strada (v minore, +z)
    frameBars(gA, -(C.v + back), (gA + gB) / 2, -(C.v + back), gateH, false, -Math.PI / 2);
    frameBars(gB, -(C.v + back), (gA + gB) / 2, -(C.v + back), gateH, false, Math.PI / 2);
    barMesh.count = bi; barMesh.castShadow = true; barMesh.instanceMatrix.needsUpdate = true; court.add(barMesh);

    // muri del cortile: lastre di travertino, tubo rosso, condizionatori, finestre
    const red = std({ color: 0xb3262e, roughness: 0.5, metalness: 0.2 }), acMat = std({ color: 0xeceae6, roughness: 0.5 }), dark = std({ color: 0x2b2f33, roughness: 0.4, metalness: 0.2 });
    for (const w of M.muri) {
      const s = w.id === 'sinistro' ? 1 : -1, len = w.v[1] - w.v[0];
      const wall = add(new THREE.PlaneGeometry(len, w.altezza), travMat(len / 2.4, w.altezza / 2.4), w.u + s * 0.02, w.altezza / 2, -(w.v[0] + w.v[1]) / 2, false);
      wall.rotation.y = s * Math.PI / 2;
      if (w.tuboRosso) { const p = add(new THREE.CylinderGeometry(0.045, 0.045, len, 10), red, w.u + s * 0.1, w.tuboRosso, -(w.v[0] + w.v[1]) / 2); p.rotation.x = Math.PI / 2; }
      for (const v of w.condizionatori || []) { box(w.u + s * 0.05 - (s < 0 ? 0.32 : 0), w.u + s * 0.05 + (s > 0 ? 0.32 : 0), 2.6, 3.15, v - 0.42, v + 0.42, acMat); }
      for (const v of w.finestre || []) { box(w.u + s * 0.02 - (s < 0 ? 0.05 : 0), w.u + s * 0.02 + (s > 0 ? 0.05 : 0), 2.4, 3.6, v - 0.55, v + 0.55, dark); }
    }

    // portico: pilastri in travertino e soffitto scuro
    for (const p of live(M.pilastri)) partAdder(turned(court, p, (p.u[0] + p.u[1]) / 2, (p.v[0] + p.v[1]) / 2)).box(p.u[0], p.u[1], 0, p.altezza, p.v[0], p.v[1], travMat(0.6, 1.8));
    const PO = M.portico;
    // il ponte (soffitto, fondo, corpo sopra) occupa tutta la larghezza fra le due ali, come il vuoto dei cortili (u 0.2 -> 16.6)
    const [pu0, pu1] = PO.corpoU || PO.u;
    box(pu0, pu1, PO.soffitto, PO.soffitto + 0.35, PO.v[0], PO.v[1], std({ color: 0x6a4535, roughness: 0.9 }));
    // fondo del portico (rilievo 132517 e commenti sul posto): parete piena in travertino fino al soffitto, con il cancello a barre
    // solo nel varco [u0, u1] (alto fin sotto il soffitto); dietro il cancello il cortile interno illuminato si vede attraverso le grate
    const FD = M.fondo || {}, fv = Number(FD.v) || PO.v[1] - 0.12, gH = PO.soffitto - 0.02, wt = Number(FD.spessore) || 0.24;
    const [vA, vB] = Array.isArray(FD.varco) && FD.varco.length === 2 ? [Math.max(pu0, Math.min(...FD.varco)), Math.min(pu1, Math.max(...FD.varco))] : [pu0, pu1], fw = vB - vA;
    for (const [w0, w1] of [[pu0, vA], [vB, pu1]]) if (w1 > w0 + 0.01) box(w0, w1, 0, PO.soffitto, fv - wt / 2, fv + wt / 2, travMat((w1 - w0) / 2.4, PO.soffitto / 2.4)); // pareti ai lati del varco
    // niente fondale dipinto dietro il cancello: il cortile interno vero si vede attraverso la griglia (commento 22/10).
    // Due ante (commento 2): cardini ai lati del varco, nella passeggiata si aprono verso il cortile esterno (v minore, +z);
    // griglia di barre vere spesse 3,5 cm ogni 15 cm al posto della rete dipinta, che da lontano spariva
    const half = fw / 2, barW = 0.035, pitch = 0.15, unit = new THREE.BoxGeometry(1, 1, 1);
    for (const [hinge, sgn] of [[vA, 1], [vB, -1]]) {
      const leaf = new THREE.Group(); leaf.position.set(hinge, 0, -fv); court.add(leaf);
      leaf.userData.anta = { punta: [sgn * half, 0, 0], apertura: -sgn * Math.PI / 2 };
      const lb = partAdder(leaf).box, x0 = sgn > 0 ? 0 : -half, x1 = sgn > 0 ? half : 0;
      lb(x0, x1, 0.03, 0.09, -0.04, 0.04, rust); lb(x0, x1, gH - 0.06, gH, -0.04, 0.04, rust); // traversi
      lb(x0, x0 + 0.06, 0, gH, -0.04, 0.04, rust); lb(x1 - 0.06, x1, 0, gH, -0.04, 0.04, rust); // montanti
      for (const hh of FD.correnti || [1.1, 2.3]) lb(x0, x1, hh - 0.03, hh + 0.03, -0.04, 0.04, rust);
      const w = x1 - x0 - 0.12, hgt = gH - 0.15, nv = Math.max(1, Math.floor(w / pitch)), nh = Math.max(1, Math.floor(hgt / pitch));
      const grid = new THREE.InstancedMesh(unit, rust, nv + nh), m4 = new THREE.Matrix4(); let k = 0;
      for (let i = 1; i <= nv; i += 1) { m4.makeScale(barW, hgt, barW).setPosition(x0 + 0.06 + (w * i) / (nv + 1), 0.09 + hgt / 2, 0); grid.setMatrixAt(k++, m4); }
      for (let j = 1; j <= nh; j += 1) { m4.makeScale(w, barW, barW).setPosition((x0 + x1) / 2, 0.09 + (hgt * j) / (nh + 1), 0); grid.setMatrixAt(k++, m4); }
      grid.count = k; grid.castShadow = true; grid.instanceMatrix.needsUpdate = true; leaf.add(grid);
    }
    // ponte sopra il portico/cancello (le sagome sono svuotate fino al cielo: i due cortili sono un unico vuoto u 0.2 -> 16.6):
    // un solo volume, stessa fascia del corpo dell'edificio con le stesse quote delle texture, così piani e finestre continuano senza giunte.
    // Alto solo PO.piani piani (1 = il primo piano) sopra il piano terra, chiuso da un unico tetto piano liscio (niente attico né cornice).
    const cu = buildings.find((x) => String(x.code).toUpperCase() === 'CU014') || {};
    // stessa altezza e piani dei muri a cui si appoggia: con le ali dell'STL è il corpo principale (altezzaBase, interpiano unico)
    const hAla = cuSolidoUsato && Number(cuSolido.altezzaBase) > 0 ? Number(cuSolido.altezzaBase) : null;
    const topH = hAla || heightInfo({ height: cu.height, levels: cu.levels }).value, baseH = PO.soffitto + 0.35;
    const [cu0, cu1] = PO.corpoU || PO.u; // il corpo si stende su tutta la larghezza fra le due ali (come il cortile), anche sopra i pilastri
    const ringLL = [[cu0, PO.v[0]], [cu1, PO.v[0]], [cu1, PO.v[1]], [cu0, PO.v[1]], [cu0, PO.v[0]]].map((q) => {
      const [x, n] = courtyardFrame.toMap(q);
      return [(x + mapWidth / 2) / metersPerLon + bounds.west, (n + mapDepth / 2) / metersPerLat + bounds.south];
    });
    const shp = makeShape([ringLL]);
    if (shp && topH > baseH + 1 && buildingGroup && !officialPlanCodes.has('CU014')) { // con la planimetria ufficiale CU014 non c'è
      const set = facadeSetFor('CU014'), full = hAla ? cuPieces(hAla) : buildingPieces(topH, Number(cu.levels));
      const bodyP = full.find((q) => q.kind === 'body'), atticP = full.find((q) => q.kind === 'attic');
      const nFloors = Math.max(1, Math.round(Number(PO.piani) || 1));
      const bodyTop = Math.min(topH - (atticP ? atticP.h : 0), bodyP.y0 + nFloors * bodyP.floorH); // quota del tetto del ponte
      const pieces = [{ ...bodyP, h: bodyTop - bodyP.y0 }]; // un solo pezzo: un solo tetto a una sola quota
      pieces.forEach((piece, k) => {
        const y0 = Math.max(piece.y0, baseH), y1 = piece.y0 + piece.h;
        if (y1 <= y0 + 0.01) return;
        const g = new THREE.ExtrudeGeometry(shp, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
        g.rotateX(-Math.PI / 2); g.translate(0, 0.04 + y0, 0);
        applyRoofUVs(g);
        if (piece.kind !== 'attic') applyWallUVs(g, 0.04 + piece.y0, FACADE_BAY, piece.floorH);
        g.computeVertexNormals();
        const mats = [k === pieces.length - 1 ? normalRoof : hiddenCapMaterial(), set[piece.kind]];
        const mesh = new THREE.Mesh(g, mats); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.mats = mats; mesh.userData.porticoCorpo = true;
        Object.assign(mesh.userData, { facadeCode: 'CU014', code: 'CU014', kind: piece.kind, y0: 0.04 + piece.y0, floorH: piece.kind === 'attic' ? piece.h : piece.floorH });
        buildingGroup.add(mesh);
      });
    }

    // tombini quadrati in ghisa con telaio, a filo del pavimento
    for (const t of live(M.tombini)) { const m = manhole(Number(t.lato) || 0.6); m.position.set(t.u, Number(t.quota) || 0, -t.v); m.rotation.y = ((Number(t.angolo) || 0) * Math.PI) / 180; court.add(m); } // quota: superficie su cui poggia (a filo del pavimento)

    // transenne zincate accanto all'aiuola
    for (const t of live(M.transenne)) { const g = crowdBarrier(t.lunghezza); g.position.set(t.u, 0, -t.v); g.rotation.y = t.angoloDeg * Math.PI / 180; court.add(g); }

    // primitive aggiunte dall'editor nelle coordinate del cortile (duplicati dei suoi oggetti)
    for (const pr of (exteriorsCfg && exteriorsCfg.primitive) || []) if (pr.cornice === 'cortile' && !pr.rimosso && (pr.box || pr.poligono)) court.add(buildPrimitive(pr));

    // evaporatori alettati dietro il silos (models/tubi-glb.json, modello dell'utente DVAP3: 6 tubi 3 × 2 con le valvole):
    // `tubi` = il modello intero, `tubi4` = dall'altro lato dei 6, gruppo da 4 (2 × 2) dello stesso modello; il serpentino HE1 sotto
    // il serbatoio usa una fila da 3 coricata. `colonne` e `file` scelgono quanti tubi tenere (colonne lungo la fila da 3, file da 2)
    const banks = {};
    for (const key of ['tubi', 'tubi4']) {
      const TB = M[key]; if (!TB || TB.rimosso) continue;
      const slot = new THREE.Group(); slot.name = key;
      slot.position.set(Number(TB.u) || 0, Number(TB.base) || 0, -(Number(TB.v) || 0));
      slot.rotation.y = (Number(TB.ruota) || 0) * Math.PI / 180;
      slot.scale.setScalar(Number(TB.scala) || 1);
      if (Number(TB.altezza) > 0) slot.scale.y *= Number(TB.altezza) / 1.67; // matrici più alte del modello (commento del 30/10)
      court.add(slot); banks[key] = slot;
      loadTubiSubset(Number(TB.colonne) || 3, Number(TB.file) || 2).then((m) => {
        if (!m || courtyardModel !== holder) return; // modello non disponibile o cortile già ricostruito
        slot.add(m.clone(true));
      });
    }
    if (tank.userData.serpentino) loadTubiSubset(3, 1).then((m) => {
      if (!m || courtyardModel !== holder) return;
      const c = m.clone(true), k = 0.55; c.scale.setScalar(k); c.rotation.x = Math.PI / 2; c.position.set(0.3, 0.12, -0.85 * k); // coricata: i 3 tubi paralleli al terreno, affiancati alla stessa quota (commento del 31/10)
      tank.userData.serpentino.add(c);
    });
    // linea continua come nello schema: erogazione V2 (palla di ghiaccio) → tubo a terra coperto di ghiaccio → evaporatore da 6 →
    // evaporatore da 4 → uscita del gas verso il portico
    {
      holder.updateMatrixWorld(true);
      const P = (o, x = 0, y = 0, z = 0) => court.worldToLocal(o.localToWorld(new THREE.Vector3(x, y, z)));
      const ice = courtOnce('azoto|ghiaccio', () => stdMat({ color: 0xf4f8fb, roughness: 0.8, emissive: 0x2e3438 })), inox = courtOnce('azoto|inox', () => stdMat({ color: 0xc8ccd0, roughness: 0.3, metalness: 0.8 }));
      const line = (pts, r, mat) => { for (let i = 0; i < pts.length - 1; i += 1) { const a = pts[i], b = pts[i + 1], l = a.distanceTo(b); if (l < 1e-3) continue; const m = add(new THREE.CylinderGeometry(r, r, l, 10), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); } for (const q of pts.slice(1, -1)) add(new THREE.SphereGeometry(r, 10, 8), mat, q.x, q.y, q.z); };
      const out = tank.userData.uscita && P(tank.userData.uscita), b6 = banks.tubi, b4 = banks.tubi4, y = (Number(M.serbatoio.suolo) || 0.36) + 0.08;
      if (out && b6) {
        const in6 = P(b6, 0.33, 0, 0), end6 = P(b6, -0.33, 0, 0); in6.y = end6.y = y;
        const via = new THREE.Vector3(out.x, y, out.z), sud = new THREE.Vector3(out.x, y, Math.max(out.z, in6.z)), est = new THREE.Vector3(in6.x, y, sud.z);
        line([out, via, sud, est, in6], 0.045, ice);
        if (b4) { const in4 = P(b4, 0.22, 0, 0); in4.y = y; line([end6, new THREE.Vector3(end6.x, y, in4.z), in4], 0.02, inox);
          const e4 = P(b4, -0.22, 0, 0); e4.y = y; line([e4, new THREE.Vector3(e4.x, y, e4.z - 0.25), new THREE.Vector3(e4.x, 4.45, e4.z - 0.25)], 0.02, inox); }
      }
    }

    scene.add(holder);
    courtyardModel = holder;
  }
  // GLB dei tubi: letto una volta sola, centrato sulla fila e appoggiato a terra (unità del file = metri, nessuna scala)
  let tubiPromise = null;
  function loadTubiModel() {
    if (!tubiPromise) tubiPromise = (async () => {
      await loadDependency('vendor/GLTFLoader.js', () => typeof THREE.GLTFLoader === 'function');
      const data = await fetch('models/tubi-glb.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error('tubi'))));
      const bin = Uint8Array.from(atob(data.glb_base64), (ch) => ch.charCodeAt(0));
      const gltf = await new Promise((resolve, reject) => new THREE.GLTFLoader().parse(bin.buffer, 'models/', resolve, reject));
      const model = gltf.scene, box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3());
      model.position.set(-c.x, -box.min.y, -c.z);
      model.traverse((o) => { if (o.isMesh && o.material) { o.material.metalness = Math.min(o.material.metalness ?? 0.35, 0.35); o.material.needsUpdate = true; } });
      const root = new THREE.Group(); root.add(model);
      return root;
    })().catch(() => { tubiPromise = null; return null; });
    return tubiPromise;
  }
  // parte del modello: tiene i tubi delle prime `nc` colonne (fila da 3 lungo X, passo 0,22 m) e delle prime `nf` file
  // (lungo Z, passo 0,178 m), valvole comprese; ricentrata e appoggiata a terra
  const tubiSubsets = new Map();
  function loadTubiSubset(nc, nf) {
    const key = nc + 'x' + nf;
    if (!tubiSubsets.has(key)) tubiSubsets.set(key, loadTubiModel().then((root) => {
      if (!root) { tubiSubsets.delete(key); return null; }
      if (nc >= 3 && nf >= 2) return root;
      root.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(root), out = new THREE.Group();
      root.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
        const p = g.attributes.position, keep = [];
        for (let t = 0; t < p.count; t += 3) {
          const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3, cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
          if (Math.floor((cx - bb.min.x) / 0.22) < nc && Math.floor((bb.max.z - cz) / 0.24) < nf) keep.push(t);
        }
        const sub = new THREE.BufferGeometry();
        for (const name of Object.keys(g.attributes)) {
          const a = g.attributes[name], n = a.itemSize, arr = new Float32Array(keep.length * 3 * n);
          keep.forEach((t, i) => { for (let v = 0; v < 3; v += 1) for (let c = 0; c < n; c += 1) arr[(i * 3 + v) * n + c] = a.array[(t + v) * n + c]; });
          sub.setAttribute(name, new THREE.BufferAttribute(arr, n));
        }
        const m = new THREE.Mesh(sub, o.material); m.castShadow = m.receiveShadow = true; out.add(m);
      });
      const b2 = new THREE.Box3().setFromObject(out), c = b2.getCenter(new THREE.Vector3());
      out.children.forEach((m) => m.geometry.translate(-c.x, -b2.min.y, -c.z));
      return out;
    }));
    return tubiSubsets.get(key);
  }
  /* ---------- alberi da OpenStreetMap (natural=tree, tree_row), in istanze ---------- */
  function rnd(i, k) { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); }
  let treeData = null;
  async function addTrees() {
    let data = null;
    try { const response = await fetch('trees.json'); if (response.ok) data = await response.json(); } catch (_) { data = null; }
    // id stabile dalla posizione nel file: le modifiche fatte sul posto vi si riferiscono
    treeData = (data?.trees || []).filter((t) => Array.isArray(t.p)).map((t) => Object.assign({ id: t.id || `t${Math.round(t.p[0] * 1e6)}_${Math.round(t.p[1] * 1e6)}` }, t));
    buildTrees();
  }
  const isPineTree = (t) => t.g === 'needleleaved' || /pinus|pino/i.test(t.g || '');
  function treeSize(t) { const pine = isPineTree(t), R = Number(t.r) > 0 ? Number(t.r) : (pine ? 5 : 3.5); return { R, h: Math.min(22, Math.max(5, pine ? R * 2.6 + 3 : R * 2.1 + 2.5)), pine }; }
  function buildTrees() {
    if (!scene || !treeData) return;
    if (treeGroup) { scene.remove(treeGroup); disposeTree(treeGroup); treeGroup = null; }
    const list = treeData.filter((t) => !t.rimosso && insideMap(t.p));
    if (!list.length) return;
    const isPine = isPineTree;
    const pines = list.filter(isPine), broad = list.filter((t) => !isPine(t)), all = broad.concat(pines);
    const LUMPS = 3;
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.26, 1, 6); trunkGeo.translate(0, 0.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 1); // 80 triangoli: 3 000 alberi restano leggeri sul telefono
    const cp = crownGeo.attributes.position;
    for (let i = 0; i < cp.count; i += 1) {
      const f = 0.8 + 0.32 * rnd(Math.round(cp.getX(i) * 50 + cp.getY(i) * 70 + cp.getZ(i) * 90), 3);
      cp.setXYZ(i, cp.getX(i) * f, cp.getY(i) * f, cp.getZ(i) * f);
    }
    crownGeo.computeVertexNormals();
    const trunkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4d4037).convertSRGBToLinear(), roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, all.length);
    const crowns = new THREE.InstancedMesh(crownGeo, leafMat, all.length * LUMPS);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    all.forEach((t, i) => {
      const w = project(t.p);
      const pine = i >= broad.length;
      // raggio della chioma misurato sull'ortofoto; altezza stimata dal raggio
      const R = Number(t.r) > 0 ? Number(t.r) : (pine ? 4.5 : 3) + 1.5 * rnd(i, 1);
      const h = Math.min(22, Math.max(5, pine ? R * 2.6 + 3 : R * 2.1 + 2.5));
      q.setFromAxisAngle(up, rnd(i, 2) * Math.PI * 2);
      const trunkH = pine ? h * 0.72 : h * 0.4;
      const lumps = Array.from({ length: LUMPS }, (_, k) => {
        const a = rnd(i * 7 + k, 4) * Math.PI * 2, off = k === 0 ? 0 : R * 0.38;
        const r = R * (k === 0 ? 0.82 : 0.62 + 0.12 * rnd(i * 7 + k, 5));
        const ry = pine ? r * 0.36 : r * (0.8 + 0.25 * rnd(i * 7 + k, 6));
        const yc = pine ? trunkH + ry * 0.5 + (k ? 0.3 : 0) : trunkH + (h - trunkH) * (k === 0 ? 0.52 : 0.4 + 0.25 * rnd(i * 7 + k, 7));
        return { a, off, r, ry, yc };
      });
      // latifoglie: il tronco sale fino al centro della chioma principale (prima finiva sotto la chioma e restava staccato)
      p.set(w.x, 0, -w.n); s.set(pine ? 1.6 : 1.2, pine ? trunkH : lumps[0].yc, pine ? 1.6 : 1.2);
      m.compose(p, q, s); trunks.setMatrixAt(i, m);
      for (let k = 0; k < LUMPS; k += 1) {
        const { a, off, r, ry, yc } = lumps[k];
        p.set(w.x + Math.cos(a) * off, yc, -w.n + Math.sin(a) * off); s.set(r, ry, r);
        m.compose(p, q, s); crowns.setMatrixAt(i * LUMPS + k, m);
        if (pine) c.setHSL(0.27 + 0.03 * rnd(i, 7), 0.3, 0.15 + 0.05 * rnd(i * 7 + k, 8));
        else c.setHSL(0.22 + 0.07 * rnd(i, 7), 0.32 + 0.12 * rnd(i, 9), 0.17 + 0.08 * rnd(i * 7 + k, 8));
        crowns.setColorAt(i * LUMPS + k, c.convertSRGBToLinear());
      }
    });
    for (const mesh of [trunks, crowns]) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true; }
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    trunks.userData.treeIds = crowns.userData.treeIds = all.map((t) => t.id); crowns.userData.lumps = LUMPS;
    treeGroup = new THREE.Group();
    treeGroup.name = 'alberi';
    albero(treeGroup);
    treeGroup.add(trunks, crowns);
    scene.add(treeGroup);
  }
  function updateSelectionMaterials() {
    for (const [code, meshes] of activeCodeMeshes) {
      const selected = code === selectedCode;
      // l'edificio scelto non cambia colore: lo indica il cerchio luminoso giallo a terra (updateSelectionMarker)
      for (const mesh of meshes) mesh.material = mesh.userData.mats || [normalRoof, normalSide];
    }
    for (const outlines of activeCodeOutlines.values()) for (const outline of outlines) outline.visible = false;
    updatePlanSelection();
    updateSelectionMarker();
  }
  /* Segnale dell'edificio scelto: cerchio giallo luminoso a terra con un alone che sale e pulsa, al posto dei muri rossi */
  let selectionMarker = null;
  function selectionGlowTexture() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const g = c.getContext('2d'), grad = g.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, 'rgba(255,214,10,0.95)'); grad.addColorStop(0.25, 'rgba(255,214,10,0.42)'); grad.addColorStop(1, 'rgba(255,214,10,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
    const t = new THREE.CanvasTexture(c); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function updateSelectionMarker() {
    if (!scene) return;
    if (!selectionMarker) {
      const group = new THREE.Group(); group.name = 'segnale-selezione'; group.renderOrder = 20;
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true),
        new THREE.MeshBasicMaterial({ map: selectionGlowTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      glow.position.y = 0.5;
      const ringMat = () => new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.955, 1, 96), ringMat());
      const wave = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 96), ringMat());
      ring.rotation.x = wave.rotation.x = -Math.PI / 2;
      group.add(glow, ring, wave);
      selectionMarker = { group, glow, ring, wave, radius: 1, height: 1 };
      scene.add(group);
    }
    const m = selectionMarker;
    const planMesh = planMeshesByCode.get(selectedCode);
    const meshes = [...(activeCodeMeshes.get(selectedCode) || []), ...(planMesh ? [planMesh] : [])].filter((x) => x && x.visible !== false && x.parent && x.parent.visible !== false);
    if (!selectedCode || !meshes.length) { m.group.visible = false; return; }
    const box = new THREE.Box3(); for (const mesh of meshes) box.expandByObject(mesh);
    if (box.isEmpty()) { m.group.visible = false; return; }
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    m.radius = Math.hypot(size.x, size.z) / 2 + 4;
    m.height = Math.min(Math.max(size.y * 0.45, 6), 14);
    m.group.position.set(center.x, box.min.y + 0.35, center.z);
    m.glow.scale.set(m.radius, m.height, m.radius);
    m.ring.scale.setScalar(m.radius); m.wave.scale.setScalar(m.radius);
    m.group.visible = true;
  }
  function animateSelectionMarker(now) {
    const m = selectionMarker;
    if (!m || !m.group.visible) return;
    if (reducedMotion) { m.wave.visible = false; return; }
    const t = (now % 1800) / 1800, pulse = 0.5 + 0.5 * Math.sin(now / 420);
    m.glow.material.opacity = 0.7 + 0.3 * pulse;
    m.glow.scale.y = m.height * (0.85 + 0.15 * pulse);
    m.wave.scale.setScalar(m.radius * (1 + 0.12 * t)); m.wave.material.opacity = 0.9 * (1 - t);
  }
  /* Minerva: un clic la fa crescere con un rimbalzo elastico, un altro clic la riporta com'era */
  const MINERVA_BIG = 1.8;
  let minervaAnim = null;
  function bounceMinerva() {
    if (!MINERVA.holder) return;
    const to = MINERVA.scale > 1.01 ? 1 : MINERVA_BIG;
    if (reducedMotion) { MINERVA.scale = to; MINERVA.holder.scale.setScalar(to); return; }
    minervaAnim = { start: performance.now(), from: MINERVA.scale, to, grow: to > MINERVA.scale };
  }
  function updateMinerva(now) {
    if (!minervaAnim || !MINERVA.holder) return;
    const duration = 1400;
    const t = Math.min(1, (now - minervaAnim.start) / duration);
    // elastico in uscita: supera la misura finale e ci torna oscillando
    const elastic = t === 1 ? 1 : 1 - Math.pow(2, -9 * t) * Math.cos(t * Math.PI * 4.5);
    const s = minervaAnim.from + (minervaAnim.to - minervaAnim.from) * elastic;
    // schiacciamento e allungamento, come un cartone animato
    const wobble = Math.sin(t * Math.PI * 7) * Math.exp(-4.5 * t) * 0.22;
    MINERVA.holder.scale.set(s * (1 + wobble * 0.6), s * (1 - wobble), s * (1 + wobble * 0.6));
    // saltello: due rimbalzi sempre più bassi, solo mentre cresce
    const hop = minervaAnim.grow ? Math.abs(Math.sin(t * Math.PI * 2.5)) * Math.exp(-3 * t) * 2.5 : 0;
    MINERVA.holder.position.y = MINERVA.baseY + hop;
    if (t === 1) { MINERVA.scale = minervaAnim.to; MINERVA.holder.scale.setScalar(MINERVA.scale); MINERVA.holder.position.y = MINERVA.baseY; minervaAnim = null; }
  }
  /* fontanelle: stessa animazione della Minerva; quella selezionata resta grande, le altre tornano normali */
  const FOUNTAIN_BIG = 1.8;
  let fountainSel = null;
  const fountainAnims = new Map();
  function bounceHolder(holder, to) {
    const from = holder.userData.s || 1;
    if (reducedMotion) { holder.userData.s = to; holder.scale.setScalar(to); return; }
    fountainAnims.set(holder, { start: performance.now(), from, to, grow: to > from });
  }
  function selectFountain(holder) {
    const again = holder && holder === fountainSel;
    if (fountainSel) bounceHolder(fountainSel, 1);
    fountainSel = again ? null : holder;
    if (fountainSel) bounceHolder(fountainSel, FOUNTAIN_BIG);
    return !!fountainSel;
  }
  function updateFountains(now) {
    for (const [holder, a] of fountainAnims) {
      const t = Math.min(1, (now - a.start) / 1400);
      const elastic = t === 1 ? 1 : 1 - Math.pow(2, -9 * t) * Math.cos(t * Math.PI * 4.5);
      const sc = a.from + (a.to - a.from) * elastic;
      const wobble = Math.sin(t * Math.PI * 7) * Math.exp(-4.5 * t) * 0.22;
      holder.scale.set(sc * (1 + wobble * 0.6), sc * (1 - wobble), sc * (1 + wobble * 0.6));
      holder.position.y = a.grow ? Math.abs(Math.sin(t * Math.PI * 2.5)) * Math.exp(-3 * t) * 0.8 : 0;
      if (t === 1) { holder.userData.s = a.to; holder.scale.setScalar(a.to); holder.position.y = 0; fountainAnims.delete(holder); }
    }
  }
  let frameHook = null; // passeggiata in prima persona (cammina.js): muove la camera al posto di OrbitControls
  /* vista libera (fuori dalla passeggiata). Rotellina e pizzico: il passo è proporzionale alla distanza e da vicino rallenta (zoomPace);
     la distanza scivola verso zoomGoal in pochi fotogrammi. Tasti: W / ↑ avanti dove guardi (in piano, camera e punto guardato insieme),
     S / ↓ indietro, A / ← e D / → girano attorno al punto guardato con velocità angolare che dipende dal raggio; Maiusc ×3. */
  const orbitKeys = new Set();
  let zoomGoal = null, keysAt = 0;
  // velocità di navigazione 1–9 (5 = normale), ricordata nel browser
  const NAV_K = [0.25, 0.4, 0.6, 0.8, 1, 1.4, 2, 3, 4];
  let navSpeed = 5; try { navSpeed = Math.max(1, Math.min(9, Number(localStorage.getItem('vista-velocita')) || 5)); } catch (_) { /* senza memoria */ }
  const navK = () => NAV_K[navSpeed - 1];
  function setNavSpeed(n, quiet) {
    navSpeed = Math.max(1, Math.min(9, n));
    try { localStorage.setItem('vista-velocita', String(navSpeed)); } catch (_) { /* senza memoria */ }
    if (controls) { controls.rotateSpeed = navK(); controls.panSpeed = navK(); }
    if (quiet) return;
    let el = document.getElementById('vistaVelocita');
    if (!el) { el = document.createElement('div'); el.id = 'vistaVelocita'; el.style.cssText = 'position:fixed;left:50%;top:38%;transform:translateX(-50%);padding:10px 18px;border-radius:12px;background:#211d1dd9;color:#fff;font:700 20px/1.2 Arial,Helvetica,sans-serif;pointer-events:none;z-index:50;transition:opacity .25s'; document.body.appendChild(el); }
    el.textContent = `Velocità ${navSpeed}`; el.style.opacity = '1'; clearTimeout(setNavSpeed.t); setNavSpeed.t = setTimeout(() => { el.style.opacity = '0'; }, 1400);
  }
  const zoomPace = (d) => Math.min(1, Math.max(0.2, Math.sqrt(d / 150)));
  function onWheelZoom(event) {
    if (!controls || !controls.enabled || !controls.enableZoom || frameHook) return;
    event.preventDefault(); event.stopPropagation(); // al posto della rotellina di OrbitControls (5% a scatto, anche da vicino)
    stopTour(); stopCameraFlight();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
    const dy = Math.max(-120, Math.min(120, event.deltaY * unit)) * (event.ctrlKey ? 10 : 1); // ctrlKey: pizzico del trackpad, scatti piccoli
    const from = zoomGoal ?? camera.position.distanceTo(controls.target);
    zoomGoal = Math.min(controls.maxDistance, Math.max(controls.minDistance, from * Math.exp(dy * 0.0006 * zoomPace(from) * navK())));
  }
  // ultimo punto del mouse sulla scena (coordinate normalizzate), per WASD nella vista libera
  let cursorNdc = null;
  let cursorRay = null, cursorPlane = null; // creati al primo uso: three.js si carica dopo questo script
  function cursorPoint() {
    if (!cursorNdc) return null;
    if (!cursorRay) { cursorRay = new THREE.Raycaster(); cursorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); }
    cursorRay.setFromCamera(cursorNdc, camera); cursorPlane.constant = -controls.target.y;
    const p = new THREE.Vector3();
    return cursorRay.ray.intersectPlane(cursorPlane, p) && p.distanceTo(camera.position) < 5000 ? p : null;
  }
  function freeView() {
    const now = performance.now(), dt = keysAt ? Math.min(0.1, (now - keysAt) / 1000) : 0; keysAt = now;
    if (!controls.enabled) { zoomGoal = null; return; }
    const off = camera.position.clone().sub(controls.target);
    let d = off.length();
    controls.zoomSpeed = Math.max(0.4, zoomPace(d)) * navK(); // pizzico con due dita sul touch
    if (zoomGoal != null) {
      const next = d + (zoomGoal - d) * 0.25;
      d = Math.abs(zoomGoal - next) < zoomGoal * 0.002 ? zoomGoal : next;
      if (d === zoomGoal) zoomGoal = null;
      off.setLength(d); camera.position.copy(controls.target).add(off);
    }
    if (!orbitKeys.size || !dt) return;
    const k = (c) => orbitKeys.has(c), fast = (k('ShiftLeft') || k('ShiftRight') ? 3 : 1) * navK();
    const fwd = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    const side = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    // direzione del cursore: W va verso il punto del terreno (alla quota del punto guardato) sotto il mouse, non verso il centro della vista
    const aim = cursorPoint();
    if (fwd) {
      const dir = aim ? new THREE.Vector3(aim.x - camera.position.x, 0, aim.z - camera.position.z) : new THREE.Vector3(-off.x, 0, -off.z);
      if (dir.lengthSq() > 1e-8) {
        dir.setLength(fwd * fast * Math.min(400, Math.max(3, d * 0.5)) * dt); // m/s: metà della distanza dal punto guardato
        camera.position.add(dir); controls.target.add(dir);
      }
    }
    if (side) { // D: la camera gira verso la sua destra attorno al punto guardato; 6 m/s + un quarto del raggio, al massimo 1 rad/s
      const w = Math.min(1, (6 + 0.25 * d) / Math.max(d, 1)) * fast;
      off.copy(camera.position).sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), side * w * dt);
      camera.position.copy(controls.target).add(off);
    }
  }
  function renderFrame() {
    if (!renderer || !scene || !camera || document.hidden || !parentActive || currentView !== '3d') return;
    updateMinerva(performance.now());
    animateSelectionMarker(performance.now());
    updateWater(performance.now());
    updateFountains(performance.now());
    { const now = performance.now(); updateFog(Math.min(0.1, (now - (renderFrame.last || now)) / 1000)); renderFrame.last = now; }
    if (frameHook) frameHook(); else { freeView(); controls.update(); }
    if (splatMat) splatMat.uniforms.uPx.value = renderer.domElement.height / 2;
    renderer.render(scene, camera);
  }
  function resizeRenderer() {
    if (!renderer || !camera) return;
    const width = Math.max(1, mapHost.clientWidth);
    const height = Math.max(1, mapHost.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    if (embedded && (occlusion.right || occlusion.bottom)) {
      camera.setViewOffset(width, height, Math.min(occlusion.right, Math.max(0, width - 160)) / 2, Math.min(occlusion.bottom, Math.max(0, height - 140)) / 2, width, height);
    } else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  function handleVisibility() {
    if (!renderer) return;
    if (document.hidden || !parentActive) {
      stopTour();
      stopCameraFlight();
      renderer.setAnimationLoop(null);
    } else renderer.setAnimationLoop(renderFrame);
  }
  function fallbackToPhoto(message) {
    stopTour();
    if (renderer) renderer.setAnimationLoop(null);
    currentView = 'ortho';
    photoStage.hidden = false;
    planStage.hidden = true;
    mapHost.classList.remove('active');
    modeButton.disabled = true;
    modeButton.textContent = 'Vista 3D non disponibile';
    tourButton.disabled = true;
    setStatus(`<b>Vista 3D non disponibile.</b> ${esc(message)}`, true);
    if (!parentUnavailableSent) { parentUnavailableSent = true; notifyParent('campus-unavailable', { message: String(message || '') }); }
  }
  function bindUI() {
    window.addEventListener('message', handleParentMessage);
    $('chemistryFilter').addEventListener('click', () => {
      chemistryOnly = !chemistryOnly;
      $('chemistryFilter').setAttribute('aria-pressed', String(chemistryOnly));
      renderList();
    });
    $('clearFilter').addEventListener('click', () => {
      chemistryOnly = false;
      $('chemistryFilter').setAttribute('aria-pressed', 'false');
      $('search').value = '';
      renderList();
    });
    $('search').addEventListener('input', renderList);
    $('planButton').addEventListener('click', returnToPlan);
    document.querySelectorAll('#officialPlanLink,#detailCode,#detailTitle a').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); returnToPlan(); }));
    $('tourButton').addEventListener('click', () => tourButton.getAttribute('aria-pressed') === 'true' ? stopTour() : startTour());
    modeButton.addEventListener('click', () => setView(currentView === '3d' ? 'ortho' : '3d'));
    $('aerialToggle').addEventListener('click', () => setAerial(!showAerial));
    $('buildingsToggle').addEventListener('click', () => setBuildingVisibility(!showBuildings));
    document.querySelector('.drawer-close').addEventListener('click', closeDetails);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeDetails(); showGuest(false); } });
    $('guestClose')?.addEventListener('click', () => showGuest(false));
    $('planLayerToggle')?.addEventListener('click', () => {
      planVisible = !planVisible;
      if (planImagePlane) planImagePlane.visible = planVisible;
      updatePlanSelection();
      $('planLayerToggle').setAttribute('aria-pressed', String(planVisible));
      if (embedded && currentView !== '3d') setView('ortho');
    });
    $('planOpacity')?.addEventListener('input', (event) => {
      planOpacity = Number(event.target.value) / 100;
      if (planImageMaterial) planImageMaterial.opacity = planOpacity;
    });
  }
  async function loadDependency(path, ready) {
    if (ready()) return;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `${path}?v=128&attempt=${attempt}`;
          script.async = false;
          script.onload = () => ready() ? resolve() : reject(new Error('Libreria 3D non inizializzata.'));
          script.onerror = () => { script.remove(); reject(new Error('Impossibile caricare la libreria 3D locale.')); };
          document.head.append(script);
        });
        return;
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
  }
  async function init() {
    loadTileManifest();
    bindUI();
    if (reducedMotion) {
      tourButton.disabled = true;
      tourButton.title = 'Tour disattivato dalle preferenze di movimento ridotto.';
    }
    try {
      const [buildingResponse, contextResponse] = await Promise.all([fetch(SOURCE), fetch(CONTEXT_SOURCE)]);
      if (!buildingResponse.ok || !contextResponse.ok) throw new Error('I dati locali del campus non sono disponibili.');
      const [data, context, alignmentData] = await Promise.all([buildingResponse.json(), contextResponse.json(), fetch('vector-alignment.json').then((response) => {
        if (!response.ok) throw new Error('I parametri locali di allineamento non sono disponibili.');
        return response.json();
      })]);
      alignment = alignmentData;
      buildings = Array.isArray(data.features) ? data.features : [];
      baseBuildings = buildings.map((building) => ({ ...building }));
      contextFeatures = Array.isArray(context.features) ? context.features : [];
      renderList();
      drawFootprints();
      if (!buildings.length || !Array.isArray(context.features)) throw new Error('Il dataset non contiene geometrie valide.');
      $('count').textContent = `${buildings.length} / ${buildings.length}`;
      await loadDependency('vendor/three.min.js', () => typeof window.THREE?.WebGLRenderer === 'function');
      await loadDependency('vendor/OrbitControls.js', () => typeof window.THREE?.OrbitControls === 'function');
      try { await loadDependency('vendor/polygon-clipping.umd.min.js', () => typeof window.polygonClipping?.difference === 'function'); } catch (_) { /* senza la libreria i cortili tornano buchi semplici */ }
      const queryCode = new URLSearchParams(location.hash.split('?')[1] || '').get('code') || new URLSearchParams(location.search).get('code');
      if (queryCode) selectBuilding(queryCode, { animate: false, notify: false });
      if (latestParentContext?.plan?.features) officialPlanCodes = new Set(latestParentContext.plan.features.map((feature) => String(feature.code || '').toUpperCase()));
      courtyardFrame = await loadCourtyardFrame();
      try { const r = await fetch('courtyards.json', { cache: 'no-cache' }); if (r.ok) courtyardHoles = (await r.json()).courtyards || {}; } catch (_) { courtyardHoles = {}; }
      try { const r = await fetch('cu014-solido.json', { cache: 'no-cache' }); if (r.ok) cuSolido = await r.json(); } catch (_) { cuSolido = null; } // senza il file CU014 resta la sagoma OSM intera
      buildScene(context);
      if (!extrasGroup) buildMinervaArea(); // Minerva e vasca anche senza la planimetria del sito principale
      setView('3d');
      tourButton.disabled = reducedMotion;
      if (selectedCode) {
        const selected = buildings.find((b) => b.code === selectedCode);
        if (selected) flyTo(planPointsByCode.get(selectedCode) || (selected.centroid ? project([selected.centroid.lon, selected.centroid.lat]) : null), 500, 0);
      }
      notifyParent('campus-ready');
    } catch (error) {
      if (renderer) renderer.setAnimationLoop(null);
      mapHost.classList.remove('active');
      setStatus(`<b>Non riesco a preparare la mappa 3D.</b> ${esc(error.message || 'Puoi continuare con la planimetria.')}`, true);
      modeButton.disabled = true;
      tourButton.disabled = true;
      photoStage.hidden = false;
      planStage.hidden = true;
      if (!parentUnavailableSent) { parentUnavailableSent = true; notifyParent('campus-unavailable', { message: String(error.message || '') }); }
    }
  }
  // accesso per verifiche automatiche e diagnosi (sola lettura della camera)
  window.campus3d = { get camera() { return camera; }, get controls() { return controls; }, get scene() { return scene; }, get renderer() { return renderer; }, bounceMinerva: () => bounceMinerva(), pdfToWorld: (x, y) => pdfToWorld(x, y),
    toLonLat: (w) => worldToLonLat(w),
    // editor sul posto (editor.js): configurazioni vive e ricostruzione dei gruppi
    // file 3D: prepara(file) li legge, misura e impacchetta; registra(p, asset) tiene in memoria il modello già letto per quell'asset
    modelli3d: { formati: Object.keys(MODEL_FORMATS), prepara: (file) => prepareModel(file), registra: (p, asset) => { userModels.set(`${asset}|${p.su}`, Promise.resolve(p.model)); } },
    esterni: { get cfg() { return exteriorsCfg; }, rebuild: () => buildChemistryExteriors(), materiali: PRIM_MATERIALS,
      catalogo: Object.entries(CATALOGO).map(([k, d]) => [k, d.nome]), totemCartello: TOTEM_CARTELLO, misura: (modello, ruota) => catalogSize(modello, ruota) },
    project: (lonLat) => { const p = project(lonLat); return new THREE.Vector3(p.x, 0, -p.n); },
    alberiVisibili: (on) => { if (on === undefined) return alberiOn; alberiOn = !!on; if (scene) scene.traverse((o) => { if (o.userData.albero) o.visible = alberiOn; }); return alberiOn; },
    alberi: { get list() { return treeData; }, rebuild: () => buildTrees(), misure: (t) => treeSize(t) },
    facciate: { nomi: Object.keys(FACADE_PALETTES), nomeDi: (code) => facadeNameFor(code), set: (code, name) => setFacade(code, name), materiale: (name, kind, tipo) => facadePatchMaterial(name, kind, tipo), campata: FACADE_BAY },
    cortile: { get M() { return courtyardFrame ? courtyardFrame.M : null; }, rebuild: () => loadCourtyardModel() },
    // passeggiata in prima persona (cammina.js): fn viene chiamata a ogni fotogramma al posto di OrbitControls; null la chiude
    primaPersona: (fn) => { frameHook = typeof fn === 'function' ? fn : null; orbitKeys.clear(); zoomGoal = null; if (frameHook) { stopTour(); stopCameraFlight(); } if (controls) controls.enabled = !frameHook; },
    tasselli: () => scheduleTiles() };
  init();
})();

(() => {
  'use strict';
  const SOURCE = 'campus-buildings.json';
  const CONTEXT_SOURCE = 'campus-context.geojson';
  const CHEMISTRY = new Set(['CU014', 'CU032', 'CU035']);
  // Scena: Città Universitaria al centro, dintorni come cartina 2D muta.
  const bounds = { west: 12.5035, south: 41.8965, east: 12.5235, north: 41.9075 };
  // Ritaglio AGEA locale (ripiego e vista ortofoto 2D).
  const PHOTO_BOUNDS = { west: 12.505, south: 41.898, east: 12.519, north: 41.906 };
  // Confine della CU in 3D fotografico: lato esterno delle strade che la circondano
  // (strade incluse), più piazzale Aldo Moro con il CNR e piazzale del Verano.
  const CAMPUS_POLY = [[12.520515, 41.901737], [12.515571, 41.905544], [12.510446, 41.904041], [12.512053, 41.901077], [12.512066, 41.900238], [12.512032, 41.900211], [12.512301, 41.899673], [12.518137, 41.901863], [12.519517, 41.90102]];
  // Area dell'ortofoto ad alta risoluzione: contiene il confine con un piccolo margine.
  const ORTHO_BOUNDS = { west: 12.5098, south: 41.8992, east: 12.5214, north: 41.9062 };
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
    if (Number.isFinite(levels) && levels > 0) return { value: levels * 3, label: `levels OSM: ${levels} × 3 m` };
    return { value: 9, label: 'stima predefinita: height/levels assenti o non validi, 9 m' };
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
    $('detailGrid').innerHTML = items.map(([label, value]) => `<div><span class="detail-label">${esc(label)}</span><span class="detail-value">${esc(value)}</span></div>`).join('');
    $('osmLinks').innerHTML = (b.osm_elements || [{ id: b.osm_id, type: b.osm_type || 'way' }]).map((entry) => {
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
    if (controls) controls.autoRotate = false;
    tourButton.textContent = 'Tour manuale';
    tourButton.setAttribute('aria-pressed', 'false');
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
    if (!controls || reducedMotion || !buildings.length || currentView !== '3d') return;
    stopTour();
    flyTo(campusCenter(), 1450, 1100);
    tourButton.textContent = 'Ferma tour';
    tourButton.setAttribute('aria-pressed', 'true');
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.75;
    tourTimer = window.setTimeout(stopTour, 12000);
  }
  function setAerial(visible) {
    showAerial = visible;
    $('aerialImage').hidden = !visible;
    if (photoTexture) {
      normalRoof.map = visible ? photoTexture : null;
      selectedRoof.map = visible ? photoTexture : null;
      normalRoof.needsUpdate = true;
      selectedRoof.needsUpdate = true;
    }
    if (orthoMesh) orthoMesh.visible = visible;
    if (cnrMesh) { cnrMesh.material[0].map = visible ? photoTexture : null; cnrMesh.material[0].needsUpdate = true; }
    for (const mesh of planMeshesByCode.values()) {
      mesh.material[0].map = visible ? photoTexture : null;
      mesh.material[0].needsUpdate = true;
    }
    $('aerialToggle').setAttribute('aria-pressed', String(visible));
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
    planLayerGroup = new THREE.Group();
    planBuildingsGroup = new THREE.Group();
    planLayerGroup.add(planBuildingsGroup);
    scene.add(planLayerGroup);
    planMeshesByCode.clear(); planOutlinesByCode.clear(); planPointsByCode.clear();
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
      const roof = new THREE.MeshBasicMaterial({ color: feature.lesson ? planColors.lesson : 0xffffff, map: showAerial ? photoTexture : null, toneMapped: false });
      const walls = new THREE.MeshStandardMaterial({ color: feature.lesson ? planColors.lesson : 0xb6a99e, roughness: 0.94, metalness: 0 });
      const mesh = new THREE.Mesh(geometry, [roof, walls]);
      mesh.userData.code = code;
      mesh.userData.planFeature = feature;
      mesh.userData.height = height;
      mesh.castShadow = true; mesh.receiveShadow = true;
      planBuildingsGroup.add(mesh); pickables.push(mesh);
      planMeshesByCode.set(code, mesh);
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
      planTexture = new THREE.TextureLoader().load(plan.image, (texture) => {
        texture.encoding = THREE.sRGBEncoding; texture.needsUpdate = true;
        if (officialPlan === plan) notifyParent('campus-overlay-ready');
      }, undefined, () => { if (officialPlan === plan) fallbackToPhoto('La planimetria non può essere caricata.'); });
      planTexture.encoding = THREE.sRGBEncoding;
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
      else if (message.action === 'fit') flyTo(campusCenter(), 1300, 700);
      else if (message.action === 'zoom') camera.position.lerp(controls.target, 1 - (1 / Math.max(0.2, Number(message.factor) || 1)));
    } else if (message.type === 'campus-viewport') {
      occlusion = { right: Math.max(0, Number(message.right) || 0), bottom: Math.max(0, Number(message.bottom) || 0) };
      resizeRenderer();
    } else if (message.type === 'campus-active') { parentActive = Boolean(message.active); handleVisibility(); }
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
  const BASE_COLORS = { bg: '#eeeae5', green: '#dfe5d4', water: '#cfdde6', casing: '#d8d0c7', road: '#fbfaf8', minor: '#f6f3ef', building: '#dcd5cd', buildingLine: '#cec5bb', rail: '#c4bbb1' };
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
  function createOrthoTexture() {
    const { width, height } = orthoSize();
    orthoCanvas = document.createElement('canvas');
    orthoCanvas.width = width; orthoCanvas.height = height;
    orthoSource = document.createElement('canvas');
    orthoSource.width = width; orthoSource.height = height;
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
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.beginPath(); tracePath(ctx, CAMPUS_POLY, toPx); ctx.fill();
    const px = metersToPx(ORTHO_BOUNDS, width);
    for (const ring of extraMask) {
      ctx.beginPath(); tracePath(ctx, ring, toPx); ctx.fill();
      ctx.lineJoin = 'round'; ctx.lineWidth = 24 * px; ctx.strokeStyle = '#000'; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(orthoSource, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (photoTexture) photoTexture.needsUpdate = true;
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
    // filo del confine sotto il bordo dell'ortofoto
    ctx.beginPath(); tracePath(ctx, CAMPUS_POLY, toPx);
    ctx.strokeStyle = 'rgba(130,36,51,.55)'; ctx.lineWidth = Math.max(2, 2.5 * px); ctx.stroke();
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
    ground = planeMesh(bounds, new THREE.MeshBasicMaterial({ map: baseTexture, color: 0xffffff, side: THREE.DoubleSide, toneMapped: false }), -0.12);
    scene.add(ground);
    orthoMesh = planeMesh(ORTHO_BOUNDS, new THREE.MeshBasicMaterial({ map: photoTexture, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }), -0.06);
    orthoMesh.renderOrder = 1;
    scene.add(orthoMesh);
  }
  function createMaterials(texture) {
    // Tetti non illuminati: stessa luminosità dell'ortofoto al suolo, nessuna sovraesposizione.
    normalSide = new THREE.MeshStandardMaterial({ color: 0xd8d0c7, roughness: 0.88, metalness: 0 });
    normalRoof = new THREE.MeshBasicMaterial({ color: 0xffffff, map: texture, toneMapped: false });
    selectedSide = new THREE.MeshStandardMaterial({ color: 0x822433, roughness: 0.78, metalness: 0 });
    selectedRoof = new THREE.MeshBasicMaterial({ color: 0xf2d4d9, map: texture, toneMapped: false });
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
    cnrMesh = new THREE.Mesh(geometry, [new THREE.MeshBasicMaterial({ color: 0xffffff, map: showAerial ? photoTexture : null, toneMapped: false }), new THREE.MeshStandardMaterial({ color: 0xcfc8bf, roughness: 0.9, metalness: 0 })]);
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
    if (cnrRing) {
      const levels = Number(String((map.named.find((n) => n.rings?.includes(cnrRing)) || {}).levels || '').replace(',', '.'));
      addGuestBuilding(cnrRing, Number.isFinite(levels) && levels > 0 ? levels * 3.6 : CNR.height);
      CNR.osm = true;
    }
    compositeOrtho();
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
  function addPolygon(feature, rings, lookup) {
    const outer = closeRing(rings[0]);
    if (outer.length < 4 || !insideMap(polygonCentroid(outer))) return;
    const shape = makeShape(rings);
    if (!shape) return;
    const props = feature.properties || {};
    const code = String(props['addr:housenumber'] || props.ref || '').trim().toUpperCase();
    if (code && officialPlanCodes.has(code)) return;
    const b = lookup.get(code);
    if (!b) return; // Only the CU buildings already included in the campus plan.
    const rawHeight = b?.height || props.height;
    const rawLevels = b?.levels || props['building:levels'];
    const height = heightInfo({ height: rawHeight, levels: rawLevels }).value;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0.04, 0);
    applyRoofUVs(geometry);
    geometry.computeVertexNormals();
    // ExtrudeGeometry uses material 0 for caps and 1 for walls.
    const mesh = new THREE.Mesh(geometry, [normalRoof, normalSide]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.code = b ? code : '';
    mesh.userData.osmId = props.osm_id || feature.id || '';
    buildingGroup.add(mesh);
    if (b) {
      pickables.push(mesh);
      if (!activeCodeMeshes.has(code)) activeCodeMeshes.set(code, []);
      activeCodeMeshes.get(code).push(mesh);
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
    scene.background = new THREE.Color(0xe9e4df);
    camera = new THREE.PerspectiveCamera(48, 1, 1, 8000);
    camera.position.set(0, 850, 1050);
    createGround(context);
    createMaterials(texture);
    buildingGroup = new THREE.Group();
    scene.add(buildingGroup);
    addGuestBuilding(CNR.ring, CNR.height);
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
      if (geometry.type === 'Polygon') addPolygon(feature, geometry.coordinates, lookup);
      else if (geometry.type === 'MultiPolygon') for (const polygon of geometry.coordinates) addPolygon(feature, polygon, lookup);
    }
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
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
    controls.minDistance = 95;
    controls.maxDistance = 3000;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI / 2.04;
    controls.screenSpacePanning = true;
    controls.addEventListener('start', stopTour);
    controls.update();
    if (pendingCamera) {
      const command = pendingCamera; pendingCamera = null;
      if (command.action === 'fit') flyTo(campusCenter(), 1300, 0);
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
      const hit = raycaster.intersectObjects(pickables, false)[0];
      if (hit?.object.userData.guest) { showGuest(true); return; }
      showGuest(false);
      if (hit?.object.userData.code) selectBuilding(hit.object.userData.code);
    });
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
    loadSurroundings();
  }
  function updateSelectionMaterials() {
    for (const [code, meshes] of activeCodeMeshes) {
      const selected = code === selectedCode;
      for (const mesh of meshes) mesh.material = selected ? [selectedRoof, selectedSide] : [normalRoof, normalSide];
    }
    for (const [code, outlines] of activeCodeOutlines) for (const outline of outlines) outline.visible = code === selectedCode;
    updatePlanSelection();
  }
  function renderFrame() {
    if (!renderer || !scene || !camera || document.hidden || !parentActive || currentView !== '3d') return;
    controls.update();
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
      const queryCode = new URLSearchParams(location.hash.split('?')[1] || '').get('code') || new URLSearchParams(location.search).get('code');
      if (queryCode) selectBuilding(queryCode, { animate: false, notify: false });
      if (latestParentContext?.plan?.features) officialPlanCodes = new Set(latestParentContext.plan.features.map((feature) => String(feature.code || '').toUpperCase()));
      buildScene(context);
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
  init();
})();

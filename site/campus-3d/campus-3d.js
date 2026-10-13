(() => {
  'use strict';
  const SOURCE = 'campus-buildings.json';
  const CONTEXT_SOURCE = 'campus-context.geojson';
  const CHEMISTRY = new Set(['CU014', 'CU032', 'CU035']);
  const bounds = { west: 12.505, south: 41.898, east: 12.519, north: 41.906 };
  const $ = (id) => document.getElementById(id);
  const listNode = $('buildingList');
  const statusNode = $('status');
  const photoStage = $('photoStage');
  const mapHost = $('map3dHost');
  const drawer = $('detailDrawer');
  const tourButton = $('tourButton');
  const modeButton = $('modeButton');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const metersPerLon = 111320 * Math.cos(((bounds.south + bounds.north) / 2) * Math.PI / 180);
  const metersPerLat = 111132;
  const mapWidth = (bounds.east - bounds.west) * metersPerLon;
  const mapDepth = (bounds.north - bounds.south) * metersPerLat;
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
    return [((lon - bounds.west) / (bounds.east - bounds.west)) * 1200, ((bounds.north - lat) / (bounds.north - bounds.south)) * 923];
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
    const target = new THREE.Vector3(point.x, 0, point.n);
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
    stopTour();
    selectedCode = code;
    renderList();
    drawFootprints();
    updateSelectionMaterials();
    openDetails(b);
    if (renderer && options.animate !== false) flyTo(project([b.centroid.lon, b.centroid.lat]), 500, 850);
    else if (renderer && options.animate === false) flyTo(project([b.centroid.lon, b.centroid.lat]), 500, 0);
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
    photoStage.hidden = is3d;
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
    flyTo({ x: 0, n: 0 }, 1450, 1100);
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
    if (ground) ground.material.map = visible ? photoTexture : null;
    if (ground) ground.material.needsUpdate = true;
    $('aerialToggle').setAttribute('aria-pressed', String(visible));
  }
  function setBuildingVisibility(visible) {
    showBuildings = visible;
    if (buildingGroup) buildingGroup.visible = visible;
    $('buildingsToggle').setAttribute('aria-pressed', String(visible));
    $('footprints').hidden = !visible;
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
  function createGround(texture) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -mapWidth / 2, -0.08, -mapDepth / 2,
      mapWidth / 2, -0.08, -mapDepth / 2,
      mapWidth / 2, -0.08, mapDepth / 2,
      -mapWidth / 2, -0.08, mapDepth / 2
    ], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.setIndex([0, 2, 1, 0, 3, 2]);
    geometry.computeVertexNormals();
    ground = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff, side: THREE.DoubleSide }));
    ground.receiveShadow = true;
    scene.add(ground);
  }
  function createMaterials(texture) {
    normalSide = new THREE.MeshStandardMaterial({ color: 0xd8d0c7, roughness: 0.88, metalness: 0 });
    normalRoof = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture, roughness: 0.96, metalness: 0 });
    selectedSide = new THREE.MeshStandardMaterial({ color: 0x822433, roughness: 0.78, metalness: 0 });
    selectedRoof = new THREE.MeshStandardMaterial({ color: 0xffeeee, map: texture, emissive: 0x641b27, emissiveIntensity: 0.26, roughness: 0.9, metalness: 0 });
  }
  function makeShape(rings) {
    const outer = closeRing(rings[0]);
    if (outer.length < 4) return null;
    const first = project(outer[0]);
    const shape = new THREE.Shape();
    shape.moveTo(first.x, -first.n);
    for (let i = 1; i < outer.length - 1; i += 1) {
      const p = project(outer[i]);
      shape.lineTo(p.x, -p.n);
    }
    for (const ring of rings.slice(1)) {
      const hole = closeRing(ring);
      if (hole.length < 4) continue;
      const p0 = project(hole[0]);
      const path = new THREE.Path();
      path.moveTo(p0.x, -p0.n);
      for (let i = 1; i < hole.length - 1; i += 1) {
        const p = project(hole[i]);
        path.lineTo(p.x, -p.n);
      }
      shape.holes.push(path);
    }
    return shape;
  }
  function applyRoofUVs(geometry) {
    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i += 1) {
      uvs.setXY(i, positions.getX(i) / mapWidth + 0.5, positions.getZ(i) / mapDepth + 0.5);
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
    const b = lookup.get(code);
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
  function buildScene(context, texture) {
    photoTexture = texture;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe9e4df);
    camera = new THREE.PerspectiveCamera(48, 1, 1, 8000);
    camera.position.set(0, 850, 1050);
    createGround(texture);
    createMaterials(texture);
    buildingGroup = new THREE.Group();
    scene.add(buildingGroup);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x82776c, 1.65));
    scene.add(new THREE.AmbientLight(0xffffff, 0.48));
    const sun = new THREE.DirectionalLight(0xfff4e8, 2.15);
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
  }
  function updateSelectionMaterials() {
    for (const [code, meshes] of activeCodeMeshes) {
      const selected = code === selectedCode;
      for (const mesh of meshes) mesh.material = selected ? [selectedRoof, selectedSide] : [normalRoof, normalSide];
    }
    for (const [code, outlines] of activeCodeOutlines) for (const outline of outlines) outline.visible = code === selectedCode;
  }
  function renderFrame() {
    if (!renderer || !scene || !camera || document.hidden || currentView !== '3d') return;
    controls.update();
    renderer.render(scene, camera);
  }
  function resizeRenderer() {
    if (!renderer || !camera) return;
    const width = Math.max(1, mapHost.clientWidth);
    const height = Math.max(1, mapHost.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function handleVisibility() {
    if (!renderer) return;
    if (document.hidden) {
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
    mapHost.classList.remove('active');
    modeButton.disabled = true;
    modeButton.textContent = 'Vista 3D non disponibile';
    tourButton.disabled = true;
    setStatus(`<b>Vista 3D non disponibile.</b> ${esc(message)}`, true);
  }
  function bindUI() {
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
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDetails(); });
    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      const message = event.data;
      if (message?.type === 'campus-select' && typeof message.code === 'string') selectBuilding(message.code, { notify: false });
    });
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
      const [data, context] = await Promise.all([buildingResponse.json(), contextResponse.json()]);
      buildings = Array.isArray(data.features) ? data.features : [];
      renderList();
      drawFootprints();
      if (!buildings.length || !Array.isArray(context.features)) throw new Error('Il dataset non contiene geometrie valide.');
      $('count').textContent = `${buildings.length} / ${buildings.length}`;
      const queryCode = new URLSearchParams(location.hash.split('?')[1] || '').get('code') || new URLSearchParams(location.search).get('code');
      if (queryCode) selectBuilding(queryCode, { animate: false, notify: false });
      const photo = new THREE.TextureLoader().load('campus-agea-2020.png', () => {}, undefined, () => fallbackToPhoto('L’ortofoto AGEA non è disponibile; le impronte cliccabili restano attive.'));
      photo.encoding = THREE.sRGBEncoding;
      photo.wrapS = THREE.ClampToEdgeWrapping;
      photo.wrapT = THREE.ClampToEdgeWrapping;
      buildScene(context, photo);
      setView('3d');
      tourButton.disabled = reducedMotion;
      if (selectedCode) {
        const selected = buildings.find((b) => b.code === selectedCode);
        if (selected) flyTo(project([selected.centroid.lon, selected.centroid.lat]), 500, 0);
      }
    } catch (error) {
      setStatus(`<b>Non riesco a preparare la mappa 3D.</b> ${esc(error.message || 'Puoi continuare con la planimetria.')}`, true);
      modeButton.disabled = true;
      tourButton.disabled = true;
      photoStage.hidden = false;
    }
  }
  init();
})();

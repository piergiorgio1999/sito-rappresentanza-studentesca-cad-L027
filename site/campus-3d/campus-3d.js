(() => {
  'use strict';
  const SOURCE = 'campus-buildings.json';
  const CHEMISTRY = new Set(['CU014', 'CU032', 'CU035']);
  const photoBounds = { west: 12.505, south: 41.898, east: 12.519, north: 41.906 };
  const $ = (id) => document.getElementById(id);
  const listNode = $('buildingList');
  const statusNode = $('status');
  const photoStage = $('photoStage');
  const mapHost = $('map3dHost');
  const drawer = $('detailDrawer');
  const tourButton = $('tourButton');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let buildings = [];
  let selectedCode = '';
  let chemistryOnly = false;
  let map3d = null;
  let googleReady = false;
  let tourTimer = 0;
  let loadTimer = 0;
  let mapFailed = false;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const setStatus = (html, error = false) => {
    statusNode.innerHTML = html;
    statusNode.classList.toggle('error', error);
  };
  const getName = (b) => b.name || 'Edificio senza nome in OSM';
  const getType = (b) => b.building && b.building !== 'yes' ? b.building : 'edificio';

  function project([lon, lat]) {
    return [((lon - photoBounds.west) / (photoBounds.east - photoBounds.west)) * 1200, ((photoBounds.north - lat) / (photoBounds.north - photoBounds.south)) * 923];
  }
  function drawFootprints() {
    const svg = $('footprints');
    svg.replaceChildren();
    for (const b of buildings) {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const d = b.rings.map((ring) => ring.map((pt, i) => {
        const [x, y] = project(pt);
        return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
      }).join(' ') + ' Z').join(' ');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
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
      group.append(path);
      svg.append(group);
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
  function estimatedHeight(b) {
    const taggedHeight = Number.parseFloat(String(b.height ?? '').replace(',', '.'));
    if (Number.isFinite(taggedHeight) && taggedHeight > 0) return { value: taggedHeight, source: 'height OSM' };
    const levels = Number.parseFloat(String(b.levels ?? '').replace(',', '.'));
    if (Number.isFinite(levels) && levels > 0) return { value: levels * 3, source: `levels OSM (${levels} × 3 m)` };
    return { value: 9, source: 'stima convenzionale (9 m; altezza assente in OSM)' };
  }
  function openDetails(b) {
    const official = officialPlanUrl(b.code);
    $('detailCode').textContent = b.code;
    $('detailCode').href = official;
    const titleLink = $('detailTitle').querySelector('a');
    titleLink.textContent = getName(b);
    titleLink.href = official;
    $('officialPlanLink').href = official;
    const h = estimatedHeight(b);
    const items = [
      ['Categoria', b.building || 'non specificata'],
      ['Altezza tag OSM', b.height ? `${b.height}` : 'non indicata'],
      ['Piani tag OSM', b.levels || 'non indicati'],
      ['Stima volumetrica', `${h.value} m · ${h.source}`],
      ['Centroide', `${b.centroid.lat.toFixed(6)}, ${b.centroid.lon.toFixed(6)}`],
      ['Fonte', 'OpenStreetMap contributors']
    ];
    $('detailGrid').innerHTML = items.map(([label, value]) => `<div><span class="detail-label">${esc(label)}</span><span class="detail-value">${esc(value)}</span></div>`).join('');
    $('osmLinks').innerHTML = (b.osm_elements || [{id:b.osm_id,type:b.osm_type || 'way'}]).map((entry) => `<a href="https://www.openstreetmap.org/${encodeURIComponent(entry.type || 'way')}/${encodeURIComponent(entry.id)}" target="_blank" rel="noopener">OSM ${esc(entry.id)} ↗</a>`).join('');
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
    if (map3d && typeof map3d.stopCameraAnimation === 'function') map3d.stopCameraAnimation();
    tourButton.textContent = 'Tour manuale';
    tourButton.setAttribute('aria-pressed', 'false');
  }
  function selectBuilding(code, options = {}) {
    const b = buildings.find((feature) => feature.code === code);
    if (!b) return;
    stopTour();
    selectedCode = code;
    renderList();
    drawFootprints();
    openDetails(b);
    if (googleReady) focusBuilding(b, options);
    if (options.notify !== false && window.parent && window.parent !== window) {
      try { window.parent.postMessage({ type: 'campus-select', code: b.code }, location.origin); } catch (_) { /* stesso-origin solo */ }
    }
  }
  function focusBuilding(b, options = {}) {
    if (!map3d || !googleReady) return;
    const center = { lat: b.centroid.lat, lng: b.centroid.lon, altitude: 0 };
    if (options.animate !== false && !reducedMotion && typeof map3d.flyCameraTo === 'function') {
      map3d.flyCameraTo({ endCamera: { center, range: 470, tilt: 62, heading: 0 }, durationMillis: 900 });
    } else {
      if (typeof map3d.stopCameraAnimation === 'function') map3d.stopCameraAnimation();
      map3d.center = center;
      map3d.range = 470;
      map3d.tilt = 62;
      map3d.heading = 0;
    }
  }
  function officialPlanUrl(code) {
    const base = 'https://orari-chimica.pi-er-gi.chatgpt.site/#mappa/';
    return `${base}${encodeURIComponent(code || '')}`;
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
  function showGoogle() {
    if (!googleReady) return;
    photoStage.hidden = true;
    mapHost.classList.remove('preparing');
    mapHost.classList.add('active');
    setStatus('<b>Vista 3D pronta.</b> Seleziona un edificio per aprire aule e lezioni.');
  }
  function startTour() {
    if (!map3d || !googleReady || reducedMotion || !buildings.length) return;
    stopTour();
    tourButton.textContent = 'Ferma tour';
    tourButton.setAttribute('aria-pressed', 'true');
    const center = { lat: 41.902, lng: 12.512, altitude: 0 };
    if (typeof map3d.flyCameraTo === 'function') {
      map3d.flyCameraTo({ endCamera: { center, range: 1250, tilt: 62, heading: 18 }, durationMillis: 1600 });
      tourTimer = window.setTimeout(() => {
        if (!map3d || typeof map3d.flyCameraAround !== 'function') { stopTour(); return; }
        map3d.flyCameraAround({ camera: { center, range: 1250, tilt: 62, heading: 18 }, durationMillis: 10000, repeatCount: 1 });
        tourTimer = window.setTimeout(stopTour, 10500);
      }, 1750);
    } else stopTour();
  }
  function failMap(message) {
    mapFailed = true;
    window.clearTimeout(loadTimer);
    googleReady = false;
    mapHost.classList.remove('active', 'preparing');
    photoStage.hidden = false;
    tourButton.disabled = true;
    setStatus('<b>Vista 3D non disponibile.</b> Puoi continuare a esplorare l’ortofoto AGEA 2020.', true);
  }
  async function initGoogle() {
    if (mapFailed) return;
    try {
      const { Map3DElement, MapMode, Marker3DInteractiveElement } = await google.maps.importLibrary('maps3d');
      if (mapFailed) return;
      if (!Map3DElement || !Marker3DInteractiveElement) throw new Error('La libreria maps3d non espone gli elementi richiesti.');
      map3d = new Map3DElement({
        center: { lat: 41.902, lng: 12.512, altitude: 0 },
        range: 1500, tilt: 58, heading: 8, mode: MapMode?.SATELLITE || 'SATELLITE'
      });
      map3d.setAttribute('aria-label', 'Vista fotorealistica 3D della Città Universitaria');
      setStatus('<b>Caricamento vista 3D…</b> Sto preparando la scena satellitare.');
      map3d.addEventListener('gmp-error', () => failMap('La vista 3D non è pronta in questo momento.'));
      map3d.addEventListener('gmp-steadychange', (event) => {
        if (!event.isSteady || mapFailed || googleReady) return;
        googleReady = true;
        window.clearTimeout(loadTimer);
        tourButton.disabled = reducedMotion;
        if (reducedMotion) tourButton.title = 'Tour disattivato dalle preferenze di movimento ridotto.';
        showGoogle();
        if (selectedCode) { const selected = buildings.find((item) => item.code === selectedCode); if (selected) focusBuilding(selected, { animate: !reducedMotion }); }
      });
      mapHost.replaceChildren(map3d);
      mapHost.classList.add('active', 'preparing');
      for (const b of buildings) {
        const marker = new Marker3DInteractiveElement({
          position: { lat: b.centroid.lat, lng: b.centroid.lon, altitude: 0 },
          altitudeMode: 'RELATIVE_TO_MESH',
          label: b.code,
          drawsWhenOccluded: true
        });
        marker.setAttribute('title', getName(b));
        marker.addEventListener('gmp-click', () => selectBuilding(b.code));
        map3d.append(marker);
      }
    } catch (error) {
      failMap('Non siamo riusciti a preparare la vista 3D.');
    }
  }
  function loadGoogle(key) {
    if (!key) {
      setStatus('<b>Vista 3D in preparazione.</b> Puoi già esplorare l’ortofoto AGEA 2020.');
      return;
    }
    loadTimer = window.setTimeout(() => failMap('Il caricamento della vista 3D richiede troppo tempo.'), 15000);
    window.initCampusGoogleMap = initGoogle;
    window.gm_authFailure = () => failMap('Google Maps non ha autorizzato la vista 3D.');
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=3.66&loading=async&callback=initCampusGoogleMap`;
    script.async = true;
    script.onerror = () => failMap('Non riusciamo a raggiungere la vista 3D in questo momento.');
    document.head.append(script);
  }

  async function init() {
    try {
      const response = await fetch(SOURCE);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      buildings = Array.isArray(data.features) ? data.features : [];
      renderList();
      drawFootprints();
      if (!buildings.length) throw new Error('Il dataset non contiene edifici.');
      $('count').textContent = `${buildings.length} / ${buildings.length}`;
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
      document.querySelectorAll('#officialPlanLink,#detailCode,#detailTitle a').forEach(link => link.addEventListener('click', event => { event.preventDefault(); returnToPlan(); }));
      $('tourButton').addEventListener('click', () => tourButton.getAttribute('aria-pressed') === 'true' ? stopTour() : startTour());
      document.querySelector('.drawer-close').addEventListener('click', closeDetails);
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDetails(); });
      const queryCode = new URLSearchParams(location.hash.split('?')[1] || '').get('code') || new URLSearchParams(location.search).get('code');
      if (queryCode) selectBuilding(queryCode, { animate: false, notify: false });
      window.addEventListener('message', (event) => {
        if (event.origin !== location.origin || event.source !== window.parent) return;
        const message = event.data;
        if (message?.type === 'campus-select' && typeof message.code === 'string') selectBuilding(message.code, { notify: false });
      });
      const config = window.MAPS_CONFIG || {};
      loadGoogle(typeof config.apiKey === 'string' ? config.apiKey.trim() : '');
    } catch (error) {
      setStatus('<b>Non riesco a caricare la mappa.</b> Riprova tra poco.', true);
    }
  }
  init();
})();

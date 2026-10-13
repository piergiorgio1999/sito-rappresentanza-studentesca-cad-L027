/* /api/campus-osm — estratto OpenStreetMap compatto per la mappa del campus (© OpenStreetMap contributors, ODbL 1.0)
   GET /api/campus-osm
   Restituisce strade, edifici, verde, binari dei dintorni (cartina 2D muta), i servizi
   dentro la Città Universitaria e le sagome con nome usate dalla scena 3D
   (CNR, Piazzale del Verano, mensa De Lollis). Risposta in cache all'edge per 7 giorni. */
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const MAP = '41.8965,12.5035,41.9075,12.5235';
const CU = '41.8990,12.5095,41.9065,12.5215';
const TTL = 60 * 60 * 24 * 7;
const VERSION = 'v1';
const QUERY = `[out:json][timeout:90];
(
  way["highway"](${MAP});
  way["building"](${MAP});
  relation["building"](${MAP});
  way["landuse"~"^(grass|cemetery|forest|meadow|village_green|recreation_ground)$"](${MAP});
  way["leisure"~"^(park|garden|pitch|playground)$"](${MAP});
  relation["leisure"~"^(park|garden)$"](${MAP});
  relation["landuse"~"^(cemetery|grass)$"](${MAP});
  way["natural"~"^(wood|scrub|grassland|water)$"](${MAP});
  way["railway"~"^(rail|tram|light_rail)$"](${MAP});
  nwr["amenity"~"^(drinking_water|cafe|bar|toilets|atm|bank|library|post_office|post_box|pharmacy|canteen|restaurant|fast_food|bicycle_parking|vending_machine|printing|place_of_worship|police|kindergarten|first_aid|clinic|doctors)$"](${CU});
  nwr["emergency"="defibrillator"](${CU});
  nwr["shop"~"^(copyshop|books|stationery)$"](${CU});
  nwr["name"~"Consiglio Nazionale delle Ricerche|CNR|Verano|De Lollis|Mensa",i](${MAP});
);
out geom tags qt;`;

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const line = (geometry) => (geometry || []).filter(Boolean).map((p) => [r6(p.lon), r6(p.lat)]);
function rings(element) {
  if (element.type === 'way') return element.geometry ? [line(element.geometry)] : [];
  if (element.type !== 'relation') return [];
  const outer = [], inner = [];
  for (const member of element.members || []) {
    if (member.type !== 'way' || !member.geometry) continue;
    (member.role === 'inner' ? inner : outer).push(line(member.geometry));
  }
  return [...joinRings(outer), ...joinRings(inner).map((ring) => ({ hole: ring }))];
}
/* unisce i tratti di un multipoligono OSM in anelli chiusi */
function joinRings(parts) {
  const out = [];
  const pool = parts.filter((p) => p.length > 1).map((p) => p.slice());
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  while (pool.length) {
    let ring = pool.shift();
    let guard = 0;
    while (!same(ring[0], ring[ring.length - 1]) && guard++ < 500) {
      const end = ring[ring.length - 1];
      const i = pool.findIndex((p) => same(p[0], end) || same(p[p.length - 1], end));
      if (i < 0) break;
      const next = pool.splice(i, 1)[0];
      ring = ring.concat((same(next[0], end) ? next : next.reverse()).slice(1));
    }
    if (ring.length > 3) out.push(ring);
  }
  return out;
}
function center(element) {
  if (element.type === 'node') return [r6(element.lon), r6(element.lat)];
  if (element.center) return [r6(element.center.lon), r6(element.center.lat)];
  const b = element.bounds;
  return b ? [r6((b.minlon + b.maxlon) / 2), r6((b.minlat + b.maxlat) / 2)] : null;
}
const ROAD_WIDTH = { motorway: 18, trunk: 18, primary: 16, secondary: 14, tertiary: 11, unclassified: 8, residential: 8, living_street: 6, service: 5, pedestrian: 6, footway: 2.5, path: 2, cycleway: 2.5, steps: 2.5, track: 3 };
const POI_TYPES = new Set(['drinking_water', 'cafe', 'bar', 'toilets', 'atm', 'bank', 'library', 'post_office', 'post_box', 'pharmacy', 'canteen', 'restaurant', 'fast_food', 'bicycle_parking', 'vending_machine', 'printing', 'place_of_worship', 'police', 'kindergarten', 'first_aid', 'clinic', 'doctors']);

function compact(data) {
  const out = { attribution: '© OpenStreetMap contributors, ODbL 1.0', roads: [], buildings: [], green: [], water: [], rail: [], pois: [], named: [] };
  for (const el of data.elements || []) {
    const t = el.tags || {};
    if (el.type === 'way' && t.highway && el.geometry) {
      if (t.area === 'yes' || ['platform', 'bus_stop', 'elevator'].includes(t.highway)) continue;
      const w = Number(String(t.width || '').replace(',', '.'));
      out.roads.push([t.highway, Number.isFinite(w) && w > 0 && w < 60 ? w : (ROAD_WIDTH[t.highway] || 5), line(el.geometry), t.tunnel === 'yes' ? 1 : 0]);
      continue;
    }
    if (el.type === 'way' && /^(rail|tram|light_rail)$/.test(t.railway || '') && el.geometry) { out.rail.push(line(el.geometry)); continue; }
    const amenity = POI_TYPES.has(t.amenity) ? t.amenity : (t.emergency === 'defibrillator' ? 'defibrillator' : (/^(copyshop|books|stationery)$/.test(t.shop || '') ? 'shop_' + t.shop : ''));
    if (amenity) {
      const c = center(el);
      if (c) out.pois.push({ type: amenity, name: t.name || '', operator: t.operator || '', lon: c[0], lat: c[1], id: `${el.type}/${el.id}` });
    }
    const named = /Consiglio Nazionale delle Ricerche|\bCNR\b|Verano|De Lollis|Mensa/i.test(`${t.name || ''} ${t.operator || ''}`);
    const shape = rings(el);
    if (named && shape.length && !t.highway) out.named.push({ name: t.name || '', operator: t.operator || '', building: t.building || '', amenity: t.amenity || '', place: t.place || '', levels: t['building:levels'] || '', height: t.height || '', rings: shape, id: `${el.type}/${el.id}` });
    if (named && t.highway && el.geometry) out.named.push({ name: t.name || '', highway: t.highway, area: t.area || '', rings: [line(el.geometry)], id: `${el.type}/${el.id}` });
    if (t.building && shape.length) { out.buildings.push(shape.filter((r) => Array.isArray(r))); continue; }
    if (/^(water)$/.test(t.natural || '') && shape.length) { out.water.push(shape.filter((r) => Array.isArray(r))); continue; }
    if ((t.landuse || t.leisure || t.natural) && shape.length) out.green.push([t.landuse || t.leisure || t.natural, shape.filter((r) => Array.isArray(r))]);
  }
  return out;
}

export async function onRequestGet({ request, waitUntil }) {
  const key = new Request(`${new URL(request.url).origin}/api/campus-osm?${VERSION}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  let data = null;
  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(mirror, { method: 'POST', body: 'data=' + encodeURIComponent(QUERY), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'orari-chimica.pages.dev campus map' } });
      if (res.ok) { data = await res.json(); break; }
    } catch (_) { /* prova il mirror successivo */ }
  }
  if (!data) return new Response(JSON.stringify({ error: 'OpenStreetMap non raggiungibile' }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  const response = new Response(JSON.stringify(compact(data)), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${TTL}` }
  });
  waitUntil(cache.put(key, response.clone()));
  return response;
}

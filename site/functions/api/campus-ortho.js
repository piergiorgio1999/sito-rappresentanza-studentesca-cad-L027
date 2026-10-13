/* /api/campus-ortho — ritaglio ad alta risoluzione dell'ortofoto AGEA 2020 (Regione Lazio, CC BY 4.0)
   GET /api/campus-ortho?bbox=W,S,E,N&w=2048&h=1600
   Proxy same-origin del WMS regionale: evita i limiti CORS del geoportale e mette in cache
   all'edge ogni ritaglio. Accetta solo bbox dentro l'area della Città Universitaria. */
const WMS = 'https://geoportale.regione.lazio.it/geoserver/ows';
const LAYER = 'geonode:2020_AGEA_25833_COG';
const AREA = { west: 12.500, south: 41.894, east: 12.528, north: 41.911 };
const MAX_PX = 2048;
const TTL = 60 * 60 * 24 * 30;

export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url);
  const bbox = (url.searchParams.get('bbox') || '').split(',').map(Number);
  const w = Math.round(Number(url.searchParams.get('w')));
  const h = Math.round(Number(url.searchParams.get('h')));
  const [west, south, east, north] = bbox;
  const valid = bbox.length === 4 && bbox.every(Number.isFinite) && west < east && south < north
    && west >= AREA.west && east <= AREA.east && south >= AREA.south && north <= AREA.north
    && w >= 16 && h >= 16 && w <= MAX_PX && h <= MAX_PX;
  if (!valid) return new Response('Parametri non validi.', { status: 400 });

  const key = new Request(`${url.origin}/api/campus-ortho?bbox=${bbox.map((v) => v.toFixed(6)).join(',')}&w=${w}&h=${h}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;

  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: LAYER, STYLES: '',
    CRS: 'CRS:84', BBOX: `${west},${south},${east},${north}`, WIDTH: String(w), HEIGHT: String(h),
    FORMAT: 'image/jpeg', TRANSPARENT: 'FALSE'
  });
  let upstream;
  try {
    upstream = await fetch(`${WMS}?${params}`, { cf: { cacheTtl: TTL, cacheEverything: true } });
  } catch (_) {
    return new Response('Ortofoto non raggiungibile.', { status: 502 });
  }
  const type = upstream.headers.get('content-type') || '';
  if (!upstream.ok || !type.startsWith('image/')) return new Response('Ortofoto non disponibile.', { status: 502 });
  const response = new Response(upstream.body, {
    headers: {
      'content-type': type,
      'cache-control': `public, max-age=${TTL}, immutable`,
      'x-source': 'Regione Lazio, Geoportale, Ortofoto AGEA v. 2020 (CC BY 4.0)'
    }
  });
  waitUntil(cache.put(key, response.clone()));
  return response;
}

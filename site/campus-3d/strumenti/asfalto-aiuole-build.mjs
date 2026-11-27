/* Strumento offline (non caricato dal sito): trasforma la mappa colorata a mano
   (asfalto-aiuole-pdf.json, estratto dall'SVG: giallo #ffd952 = asfalto, verde #51b84f = aiuole)
   in pochi poligoni puliti, in coordinate della pagina PDF della planimetria ufficiale.
   Uso: node site/campus-3d/strumenti/asfalto-aiuole-build.mjs <asfalto-aiuole-pdf.json> [uscita]
   - le migliaia di strisce della pittura vengono unite (union);
   - verde con regola nonzero: i subpath con verso opposto sovrapposti si annullano (xor fra le due unioni);
   - il verde viene tolto dal giallo, così i due strati non si sovrappongono;
   - bordi semplificati (Douglas-Peucker) e frammenti minuscoli scartati. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pc = createRequire(import.meta.url)(join(here, '..', 'vendor', 'polygon-clipping.umd.min.js'));
const [src, out = join(here, '..', 'asfalto-aiuole.json')] = process.argv.slice(2);
if (!src) { console.error('manca il file asfalto-aiuole-pdf.json'); process.exit(1); }
const data = JSON.parse(readFileSync(src, 'utf8'));
const TOL = 0.3, MIN_AREA = 0.5, HOLE_MIN = 4, CHUNK = 400; // punti PDF (1 pt ≈ 2 m)

function rings(d) { // M/L/C/Z → anelli chiusi, curve approssimate con 6 segmenti
  const t = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const res = []; let r = null, cmd = '', i = 0, p = [0, 0];
  while (i < t.length) {
    if (/^[MLCZ]$/i.test(t[i])) cmd = t[i++].toUpperCase();
    if (cmd === 'Z') { if (r && r.length >= 3) res.push(r); r = null; cmd = ''; continue; }
    if (cmd === 'M') { if (r && r.length >= 3) res.push(r); p = [+t[i++], +t[i++]]; r = [p]; cmd = 'L'; continue; }
    if (cmd === 'L') { p = [+t[i++], +t[i++]]; r.push(p); continue; }
    if (cmd === 'C') {
      const c1 = [+t[i++], +t[i++]], c2 = [+t[i++], +t[i++]], e = [+t[i++], +t[i++]], s = p;
      for (let k = 1; k <= 6; k++) { const u = k / 6, v = 1 - u;
        r.push([v*v*v*s[0] + 3*v*v*u*c1[0] + 3*v*u*u*c2[0] + u*u*u*e[0], v*v*v*s[1] + 3*v*v*u*c1[1] + 3*v*u*u*c2[1] + u*u*u*e[1]]); }
      p = e; continue;
    }
    i++;
  }
  if (r && r.length >= 3) res.push(r);
  return res;
}
const signed = (r) => r.reduce((a, q, k) => { const n = r[(k + 1) % r.length]; return a + q[0] * n[1] - n[0] * q[1]; }, 0) / 2;
function unionAll(polys) { // a blocchi, poi blocchi fra loro
  let parts = [];
  for (let k = 0; k < polys.length; k += CHUNK) parts.push(pc.union(...polys.slice(k, k + CHUNK)));
  while (parts.length > 1) { const n = []; for (let k = 0; k < parts.length; k += 8) n.push(pc.union(...parts.slice(k, k + 8))); parts = n; }
  return parts[0] || [];
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]]; let idx = 0, max = 0;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
  for (let k = 1; k < pts.length - 1; k++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - pts[k][1]) - (a[0] - pts[k][0]) * (b[1] - a[1])) / L;
    if (d > max) { max = d; idx = k; }
  }
  if (max <= tol) return [a, b];
  return dp(pts.slice(0, idx + 1), tol).slice(0, -1).concat(dp(pts.slice(idx), tol));
}
function clean(multi) {
  const res = [];
  for (const poly of multi) {
    const out = [];
    for (const [j, ring] of poly.entries()) {
      const open = ring.slice(0, -1);
      // spezza l'anello in due metà per Douglas-Peucker
      const h = Math.floor(open.length / 2);
      const s = dp(open.slice(0, h + 1), TOL).slice(0, -1).concat(dp(open.slice(h).concat([open[0]]), TOL).slice(0, -1));
      // fori sotto HOLE_MIN (lettere delle scritte, sbavature) chiusi; quelli grandi sono edifici e cortili
      if (s.length < 3 || Math.abs(signed(s)) < (j === 0 ? MIN_AREA : HOLE_MIN)) { if (j === 0) break; continue; }
      out.push(s.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]));
    }
    if (out.length) res.push(out);
  }
  return res;
}
const group = (label) => data.groups.find((g) => g.label === label);
/* Regola nonzero applicata path per path (il verso conta solo fra subpath dello stesso tracciato):
   i subpath dello stesso verso si sommano (union); dove un anello orario e uno antiorario si
   sovrappongono il winding torna a 0 (foro), altrove resta pieno anche un anello isolato col verso
   opposto. Quindi per ogni path: xor(unione dei positivi, unione dei negativi); poi union fra path.
   Vale finché nello stesso path non si sovrappongono due anelli dello stesso verso dentro uno opposto
   (winding 2-1): non succede nei dati estratti, dove i subpath sono strisce affiancate. */
function nonzero(path) {
  const rs = rings(path.d_pdf).map((r) => [...r, r[0]]);
  const pos = rs.filter((r) => signed(r) > 0).map((r) => [r]), neg = rs.filter((r) => signed(r) < 0).map((r) => [r]);
  if (!neg.length) return pos.length ? unionAll(pos) : [];
  if (!pos.length) return unionAll(neg);
  return pc.xor(unionAll(pos), unionAll(neg));
}
const fill = (g) => unionAll(g.paths.map(nonzero).filter((m) => m.length));
const verdeU = fill(group('verde'));
const gialloU = pc.difference(fill(group('giallo')), verdeU);
const result = {
  nota: 'Generato da strumenti/asfalto-aiuole-build.mjs dalla mappa colorata (issue #98). Coordinate: pagina PDF della planimetria ufficiale (x a destra, y in basso), da convertire con campus3d.pdfToWorld.',
  asfalto: clean(gialloU), aiuole: clean(verdeU),
};
writeFileSync(out, JSON.stringify(result));
const count = (m) => m.reduce((a, p) => a + p.reduce((b, r) => b + r.length, 0), 0);
console.log(`asfalto: ${result.asfalto.length} poligoni, ${count(result.asfalto)} vertici; aiuole: ${result.aiuole.length} poligoni, ${count(result.aiuole)} vertici; ${out}`);

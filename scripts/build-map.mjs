// @ts-check
// Genera data/map.json: las 47 provincias de la España peninsular proyectadas, con su adyacencia,
// las fronteras compartidas de cada par de vecinas y la costa/exterior de cada una.
// Solo para desarrollo: npm run build:map. En la app no hay librerías de geometría.
//
// Fuentes (descargadas del registro de npm y comprobadas con su hash):
// - es-atlas 0.6.0: límites del Instituto Geográfico Nacional (CC BY 4.0) en TopoJSON.
// - world-atlas 2.0.2: Natural Earth (dominio público), solo para el contorno de los países vecinos.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {geoConicConformal, geoPath} from 'd3-geo';
import * as topo from 'topojson-client';
import {presimplify, simplify, quantile} from 'topojson-simplify';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'scripts/.cache');
const OUT = path.join(ROOT, 'data/map.json');

const SOURCES = {
  es: {pkg:'es-atlas', version:'0.6.0', file:'package/es/municipalities.json',
    integrity:'sha512-+sl1xwndSaM1E1EnjBAFBOldyXATld4GbDIJvvSzbgPKgK6lDJ0vVZ1rOdEtucysWLdxChKWhtCZ2SdkzbF/fg=='},
  world: {pkg:'world-atlas', version:'2.0.2', file:'package/countries-10m.json',
    integrity:'sha512-IXfV0qwlKXpckz1FhwXVwKRjiIhOnWttOskm5CtxMsjgE/MXAYRHWJqgXOpM8IkcPBoXnyTU5lFHcYa5ChG0LQ=='},
};

/** Fuera del juego: Baleares, Las Palmas, Santa Cruz de Tenerife, Ceuta, Melilla y Gibraltar. */
const EXCLUDED = new Set(['07', '35', '38', '51', '52', '54']);
/** Tierra neutra dibujada alrededor (no juega): Gibraltar, Ceuta y Melilla salen del IGN para que encajen. */
const NEUTRAL_ES = new Set(['51', '52', '54']);
/** Países vecinos (ISO 3166-1 numérico): Portugal, Francia, Andorra, Marruecos y Argelia. */
const NEIGHBOURS = new Set(['620', '250', '020', '504', '012']);

/** Nombre para mostrar y matrícula provincial (sirve de monograma en el escudo). */
const NAMES = {
  '01':['Álava', 'VI'], '02':['Albacete', 'AB'], '03':['Alicante', 'A'], '04':['Almería', 'AL'], '05':['Ávila', 'AV'],
  '06':['Badajoz', 'BA'], '08':['Barcelona', 'B'], '09':['Burgos', 'BU'], '10':['Cáceres', 'CC'], '11':['Cádiz', 'CA'],
  '12':['Castellón', 'CS'], '13':['Ciudad Real', 'CR'], '14':['Córdoba', 'CO'], '15':['A Coruña', 'C'], '16':['Cuenca', 'CU'],
  '17':['Girona', 'GI'], '18':['Granada', 'GR'], '19':['Guadalajara', 'GU'], '20':['Gipuzkoa', 'SS'], '21':['Huelva', 'H'],
  '22':['Huesca', 'HU'], '23':['Jaén', 'J'], '24':['León', 'LE'], '25':['Lleida', 'L'], '26':['La Rioja', 'LO'],
  '27':['Lugo', 'LU'], '28':['Madrid', 'M'], '29':['Málaga', 'MA'], '30':['Murcia', 'MU'], '31':['Navarra', 'NA'],
  '32':['Ourense', 'OU'], '33':['Asturias', 'O'], '34':['Palencia', 'P'], '36':['Pontevedra', 'PO'], '37':['Salamanca', 'SA'],
  '39':['Cantabria', 'S'], '40':['Segovia', 'SG'], '41':['Sevilla', 'SE'], '42':['Soria', 'SO'], '43':['Tarragona', 'T'],
  '44':['Teruel', 'TE'], '45':['Toledo', 'TO'], '46':['Valencia', 'V'], '47':['Valladolid', 'VA'], '48':['Bizkaia', 'BI'],
  '49':['Zamora', 'ZA'], '50':['Zaragoza', 'Z'],
};

const W = 1000, PAD = 14;
/** Una frontera más corta que esto (km) es un contacto en un punto, no una frontera. */
const MIN_BORDER_KM = 1;
/** Fracción de vértices que se conservan al simplificar. */
const KEEP = 0.16;

/* ---------- Descarga con caché y comprobación de integridad ---------- */
async function tarball({pkg, version, integrity}) {
  fs.mkdirSync(CACHE, {recursive:true});
  const file = path.join(CACHE, `${pkg}-${version}.tgz`);
  if (!fs.existsSync(file)) {
    const url = `https://registry.npmjs.org/${pkg}/-/${pkg}-${version}.tgz`;
    console.log('Descargando', url);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const buf = fs.readFileSync(file);
  const [algo, want] = integrity.split('-');
  const got = crypto.createHash(algo).update(buf).digest('base64');
  if (got !== want) throw new Error(`${pkg}: el hash no coincide`);
  return zlib.gunzipSync(buf);
}
/** Lee un fichero de un tar sin dependencias (cabeceras de 512 bytes). */
function untar(tar, name) {
  for (let off = 0; off + 512 <= tar.length;) {
    const h = tar.subarray(off, off + 512);
    const fname = h.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    if (!fname) break;
    const size = parseInt(h.subarray(124, 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8);
    if (fname === name) return tar.subarray(off + 512, off + 512 + size).toString('utf8');
    off += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('No está en el paquete: ' + name);
}
async function load(src) { return JSON.parse(untar(await tarball(src), src.file)); }

/* ---------- Geometría plana para etiquetas ---------- */
/** @param {string} d @returns {number[][][]} anillos de un path SVG de d3 (M…L…Z) */
function rings(d) {
  return d.split('M').filter(Boolean).map(s => s.replace(/Z/g, '').split('L').map(p => p.split(',').map(Number)));
}
function inside(x, y, rs) {
  let c = false;
  for (const r of rs) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function edgeDist(x, y, rs) {
  let m = Infinity;
  for (const r of rs) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, ay] = r[j], [bx, by] = r[i], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
    m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return m;
}
/** Polo de inaccesibilidad aproximado: el punto interior más alejado del borde (para la etiqueta). */
function poleOf(rs, b) {
  let best = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], bestD = -1, [x0, y0, x1, y1] = b;
  for (let pass = 0; pass < 4; pass++) {
    const n = 24, sx = (x1 - x0) / n, sy = (y1 - y0) / n;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = x0 + i * sx, y = y0 + j * sy;
      if (!inside(x, y, rs)) continue;
      const dd = edgeDist(x, y, rs);
      if (dd > bestD) { bestD = dd; best = [x, y]; }
    }
    [x0, y0, x1, y1] = [best[0] - sx * 2, best[1] - sy * 2, best[0] + sx * 2, best[1] + sy * 2];
  }
  return {p:best, r:bestD};
}
const r1 = v => Math.round(v * 10) / 10;

/* ---------- Construcción ---------- */
async function main() {
  const es = await load(SOURCES.es);
  const world = await load(SOURCES.world);

  // Simplificación topológica: las fronteras compartidas siguen encajando entre vecinas.
  const pre = presimplify(es);
  const t = simplify(pre, quantile(pre, 1 - KEEP));

  const all = /** @type {any} */ (t.objects.provinces).geometries;
  const kept = all.filter(g => !EXCLUDED.has(g.id)).sort((a, b) => a.id.localeCompare(b.id));
  if (kept.length !== 47) throw new Error(`Se esperaban 47 provincias y hay ${kept.length}`);
  const obj = {type:'GeometryCollection', geometries:kept};

  const fc = /** @type {any} */ (topo.feature(t, /** @type {any} */ (obj)));
  const proj = geoConicConformal().parallels([37, 43]).rotate([3.6, 0]).center([0, 40.2]);
  proj.fitWidth(W - PAD * 2, fc);
  const pathAt = geoPath(proj).digits(1);
  const [[bx0, by0], [bx1, by1]] = pathAt.bounds(fc);
  proj.translate([proj.translate()[0] + PAD - bx0, proj.translate()[1] + PAD - by0]);
  const H = Math.ceil(by1 - by0 + PAD * 2);
  const gp = geoPath(proj).digits(1);
  const kmPerUnit = (() => { // escala aproximada en el centro del mapa
    const a = proj.invert?.([W / 2, H / 2]), b = proj.invert?.([W / 2 + 100, H / 2]);
    if (!a || !b) return 1;
    const R = 6371, rad = Math.PI / 180, dl = (b[0] - a[0]) * rad, m = (a[1] + b[1]) / 2 * rad;
    return Math.hypot(dl * Math.cos(m), (b[1] - a[1]) * rad) * R / 100;
  })();

  const idx = new Map(kept.map((g, i) => [g.id, i]));
  const provinces = fc.features.map((f, i) => {
    const id = kept[i].id, [name, plate] = NAMES[id];
    const d = gp(f) || '';
    // La etiqueta va en el polígono más grande (A Coruña con sus islas, Burgos con Treviño…)
    const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    const main = polys.map(c => ({type:'Feature', properties:{}, geometry:{type:'Polygon', coordinates:c}}))
      .sort((a, b) => gp.area(/** @type {any} */ (b)) - gp.area(/** @type {any} */ (a)))[0];
    const md = gp(/** @type {any} */ (main)) || '';
    const [[x0, y0], [x1, y1]] = gp.bounds(f);
    const mb = gp.bounds(/** @type {any} */ (main));
    const pole = poleOf(rings(md), [mb[0][0], mb[0][1], mb[1][0], mb[1][1]]);
    const c = gp.centroid(f);
    return {i, ine:id, name, plate, d, c:[r1(c[0]), r1(c[1])], label:[r1(pole.p[0]), r1(pole.p[1])], room:r1(pole.r),
      bbox:[r1(x0), r1(y0), r1(x1), r1(y1)], area:Math.round(gp.area(f)), parts:polys.length, adj:/** @type {number[]} */ ([])};
  });

  // Adyacencia: arcos compartidos de verdad y con longitud suficiente (no un punto de contacto).
  const nb = topo.neighbors(/** @type {any} */ (kept));
  /** @type {Record<string, string>} */
  const borders = {};
  const lengths = [];
  for (let a = 0; a < kept.length; a++) for (const b of nb[a]) {
    if (b <= a) continue;
    const A = kept[a], B = kept[b];
    const m = topo.mesh(t, /** @type {any} */ (obj), (x, y) => (x === A && y === B) || (x === B && y === A));
    const km = gp.measure(/** @type {any} */ (m)) * kmPerUnit;
    if (km < MIN_BORDER_KM) { console.log(`Descarto contacto ${NAMES[A.id][0]}–${NAMES[B.id][0]} (${km.toFixed(2)} km)`); continue; }
    borders[`${a}-${b}`] = gp(/** @type {any} */ (m)) || '';
    provinces[a].adj.push(b); provinces[b].adj.push(a);
    lengths.push([NAMES[A.id][0], NAMES[B.id][0], Math.round(km)]);
  }
  provinces.forEach(p => p.adj.sort((x, y) => x - y));

  // Costa y fronteras exteriores (Portugal, Francia, Andorra, Gibraltar) de cada provincia
  /** @type {string[]} */
  const outer = kept.map(A => gp(/** @type {any} */ (topo.mesh(t, /** @type {any} */ (obj), (x, y) => x === y && x === A))) || '');
  const land = gp(/** @type {any} */ (topo.merge(t, /** @type {any} */ (kept)))) || '';

  // Tierra neutra alrededor, recortada al encuadre del mapa
  const clip = geoConicConformal().parallels([37, 43]).rotate([3.6, 0]).center([0, 40.2])
    .scale(proj.scale()).translate(proj.translate()).clipExtent([[-420, -420], [W + 420, H + 420]]);
  const gc = geoPath(clip).digits(1);
  const wpre = presimplify(world);
  const wt = simplify(wpre, quantile(wpre, .5));
  const countries = /** @type {any} */ (wt.objects.countries).geometries.filter(g => NEIGHBOURS.has(g.id));
  const neutralEs = all.filter(g => NEUTRAL_ES.has(g.id));
  const neutral = [
    ...countries.map(g => gc(/** @type {any} */ (topo.feature(wt, g)))),
    ...neutralEs.map(g => gc(/** @type {any} */ (topo.feature(t, g)))),
  ].filter(Boolean).join('');

  // Portugal para el escenario de la península: Natural Earth con la frontera del IGN (así encaja sin huecos)
  const ptGeom = countries.find(g => g.id === '620');
  const neutralNoPt = [
    ...countries.filter(g => g.id !== '620').map(g => gc(/** @type {any} */ (topo.feature(wt, g)))),
    ...neutralEs.map(g => gc(/** @type {any} */ (topo.feature(t, g)))),
  ].filter(Boolean).join('');
  const pt = portugal(gc(/** @type {any} */ (topo.feature(wt, ptGeom))) || '', outer, land, provinces.length, 4 / kmPerUnit);
  pt.neutral = neutralNoPt;
  const rv = rivers(p => proj(p), provinces, Object.keys(borders));
  pt.cross = rivers(p => proj(p), [...provinces, pt.province], Object.keys(pt.borders)).cross;
  console.log('Ríos que separan provincias:', Object.entries({...rv.cross, ...pt.cross}).map(([k, n]) => `${k} ${n}`).join(', '));

  const data = {
    v:1,
    w:W, h:H, kmPerUnit:r1(kmPerUnit * 100) / 100,
    credits:'Límites provinciales: © Instituto Geográfico Nacional de España (CC BY 4.0), vía es-atlas. Países vecinos: Natural Earth (dominio público), vía world-atlas.',
    provinces, borders, outer, land, neutral, pt, rivers:rv,
  };
  validate(data);
  fs.mkdirSync(path.dirname(OUT), {recursive:true});
  fs.writeFileSync(OUT, JSON.stringify(data));
  const rel = relief(proj, W, H, kmPerUnit);
  fs.writeFileSync(path.join(ROOT, 'data/relief.png'), rel);
  console.log(`data/relief.png: ${(rel.length / 1024).toFixed(0)} KB`);
  const size = fs.statSync(OUT).size;
  console.log(`data/map.json: ${provinces.length} provincias, ${Object.keys(borders).length} fronteras, ${W}×${H}, ${(size / 1024).toFixed(0)} KB`);
  console.log('Fronteras más cortas:', lengths.sort((a, b) => a[2] - b[2]).slice(0, 6).map(([a, b, k]) => `${a}–${b} ${k} km`).join(', '));
  const trev = provinces.find(p => p.ine === '09');
  console.log(`Burgos: ${trev?.parts} polígonos (incluye el Condado de Treviño)`);
}

/* ---------- Ríos ---------- */
/** Cursos principales (lon, lat), simplificados. Cruzarlos al atacar da defensa al que se defiende. */
const RIVERS = [
  ['Ebro', [[-4.15, 43.03], [-3.95, 42.98], [-3.75, 42.86], [-3.4, 42.78], [-3.1, 42.72], [-2.95, 42.65], [-2.7, 42.55], [-2.45, 42.47], [-2.15, 42.35], [-1.85, 42.2], [-1.6, 42.06], [-1.3, 41.85], [-0.88, 41.66], [-0.55, 41.45], [-0.25, 41.28], [0.1, 41.3], [0.4, 41.32], [0.55, 41.15], [0.52, 40.82], [0.72, 40.72], [0.87, 40.7]]],
  ['Duero', [[-2.86, 41.98], [-2.55, 41.85], [-2.47, 41.76], [-2.55, 41.5], [-2.85, 41.55], [-3.2, 41.6], [-3.69, 41.66], [-4.2, 41.6], [-4.7, 41.58], [-5.0, 41.52], [-5.4, 41.5], [-5.75, 41.5], [-6.1, 41.55], [-6.3, 41.45], [-6.6, 41.25], [-6.92, 41.03], [-7.3, 41.12], [-7.8, 41.15], [-8.3, 41.1], [-8.65, 41.14]]],
  ['Tajo', [[-1.7, 40.33], [-1.95, 40.6], [-2.35, 40.68], [-2.75, 40.55], [-3.1, 40.25], [-3.6, 40.03], [-4.02, 39.86], [-4.5, 39.9], [-4.83, 39.96], [-5.3, 39.88], [-5.75, 39.8], [-6.35, 39.72], [-6.9, 39.68], [-7.35, 39.6], [-7.9, 39.47], [-8.25, 39.45], [-8.6, 39.2], [-8.95, 38.95], [-9.1, 38.75]]],
  ['Guadiana', [[-3.75, 39.13], [-3.95, 39.05], [-4.3, 39.05], [-4.75, 39.1], [-5.3, 38.98], [-5.85, 38.95], [-6.35, 38.92], [-6.97, 38.88], [-7.2, 38.75], [-7.3, 38.45], [-7.45, 38.2], [-7.6, 37.85], [-7.65, 37.6], [-7.5, 37.4], [-7.42, 37.2]]],
  ['Guadalquivir', [[-2.95, 37.9], [-3.3, 37.95], [-3.75, 38.0], [-4.05, 38.04], [-4.4, 37.98], [-4.78, 37.88], [-5.2, 37.75], [-5.55, 37.62], [-5.85, 37.5], [-6.0, 37.38], [-6.1, 37.15], [-6.25, 36.93], [-6.37, 36.78]]],
  ['Miño', [[-7.6, 43.15], [-7.55, 42.95], [-7.65, 42.62], [-7.86, 42.34], [-8.1, 42.2], [-8.35, 42.08], [-8.64, 41.95], [-8.87, 41.87]]],
  ['Júcar', [[-1.88, 40.38], [-2.13, 40.08], [-2.1, 39.75], [-2.05, 39.5], [-1.75, 39.3], [-1.35, 39.2], [-0.95, 39.18], [-0.6, 39.15], [-0.43, 39.15], [-0.23, 39.17]]],
  ['Segura', [[-2.6, 38.1], [-2.15, 38.2], [-1.7, 38.23], [-1.4, 38.13], [-1.13, 37.98], [-0.85, 38.05], [-0.65, 38.1]]],
];
/** ¿Se cortan los segmentos ab y cd? */
function cross2(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
/**
 * Ríos proyectados y, para cada par de vecinas, el río que corta la línea entre sus etiquetas.
 * @param {(p:[number, number]) => [number, number]|null} proj @param {{i:number, label:number[]}[]} provinces @param {string[]} keys
 */
function rivers(proj, provinces, keys) {
  const lines = RIVERS.map(([n, pts]) => ({n, pts:pts.map(p => proj(p))}));
  /** @type {Record<string, string>} */ const cross = {};
  for (const k of keys) {
    const [a, b] = k.split('-').map(Number), A = provinces[a].label, B = provinces[b].label;
    for (const L of lines) for (let i = 0; i < L.pts.length - 1; i++) if (cross2(A, B, L.pts[i], L.pts[i + 1])) { cross[k] = L.n; break; }
  }
  return {lines:lines.map(L => ({n:L.n, d:'M' + L.pts.map(p => `${r1(p[0])},${r1(p[1])}`).join('L')})), cross};
}

/* ---------- Portugal ---------- */
/** @param {string} d path de d3 @returns {{pts:number[][], closed:boolean}[]} */
function parsePath(d) {
  return d.split('M').filter(Boolean).map(s => ({closed:/Z\s*$/.test(s), pts:s.replace(/Z/g, '').split('L').map(p => p.split(',').map(Number))}));
}
const pathOf = (/** @type {number[][][]} */ lines, closed = false) => lines.filter(l => l.length > 1).map(l => 'M' + l.map(p => `${r1(p[0])},${r1(p[1])}`).join('L') + (closed ? 'Z' : '')).join('');
/** Distancia de un punto a una polilínea (o anillo). @param {number[]} p @param {number[][]} line */
function lineDist(p, line, closed = false) {
  let m = Infinity;
  const n = line.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [ax, ay] = line[i], [bx, by] = line[(i + 1) % n], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l)) : 0;
    m = Math.min(m, Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy));
  }
  return m;
}
const ringArea = (/** @type {number[][]} */ r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; };
const len = (/** @type {number[][]} */ l) => { let s = 0; for (let i = 1; i < l.length; i++) s += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]); return s; };
/** Tramos contiguos de puntos marcados (rellenando huecos cortos). @param {boolean[]} f */
function runs(f, gap = 3) {
  const g = [...f];
  for (let i = 0; i < g.length;) { // huecos de pocos puntos entre dos tramos marcados
    if (g[i]) { i++; continue; }
    let j = i; while (j < g.length && !g[j]) j++;
    if (i > 0 && j < g.length && j - i <= gap) for (let k = i; k < j; k++) g[k] = true;
    i = j;
  }
  /** @type {[number, number][]} */ const out = [];
  for (let i = 0; i < g.length;) { if (!g[i]) { i++; continue; } let j = i; while (j < g.length && g[j]) j++; out.push([i, j - 1]); i = j; }
  return {g, out};
}
/** Tramo cíclico más largo de puntos marcados en un anillo. @param {boolean[]} f @returns {[number, number]} inicio y fin (incluidos) */
function cyclicRun(f) {
  const n = f.length, start = f.findIndex(v => !v);
  if (start < 0) throw new Error('Todo el anillo es frontera');
  let best = [-1, -1], bl = 0;
  for (let k = 0; k < n;) {
    const i = (start + k) % n;
    if (!f[i]) { k++; continue; }
    let L = 0; while (L < n && f[(start + k + L) % n]) L++;
    if (L > bl) { bl = L; best = [i, (i + L - 1) % n]; }
    k += L;
  }
  if (bl === 0) throw new Error('No hay frontera en el anillo');
  return /** @type {[number, number]} */ (best);
}
/** Puntos de un anillo de i a j (cíclico, incluidos). @param {number[][]} r @param {number} i @param {number} j */
const arc = (r, i, j) => { const o = []; for (let k = i; ; k = (k + 1) % r.length) { o.push(r[k]); if (k === j) break; } return o; };
const near = (/** @type {number[]} */ a, /** @type {number[]} */ b, e = 1.2) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= e;
/**
 * Portugal como provincia extra: su frontera con cada provincia española sale del contorno exterior del IGN
 * y su costa de Natural Earth. Devuelve también la costa unida de la península.
 * @param {string} ptD @param {string[]} outer @param {string} land @param {number} idx @param {number} T tolerancia (unidades)
 */
function portugal(ptD, outer, land, idx, T) {
  const ring = parsePath(ptD).map(r => r.pts).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
  /** @type {Record<string, string>} */ const borders = {};
  /** @type {Record<number, string>} */ const outer2 = {};
  /** @type {number[][][]} */ const pieces = [];
  const adj = [];
  outer.forEach((d, i) => {
    const lines = parsePath(d).map(l => l.pts), bl = [], rest = [];
    for (const l of lines) {
      const {g, out} = runs(l.map(p => lineDist(p, ring, true) < T));
      const keep = out.filter(([a, b]) => len(l.slice(a, b + 1)) > 3);
      if (!keep.length) { rest.push(l); continue; }
      for (const [a, b] of keep) bl.push(l.slice(a, b + 1));
      // lo que no es frontera con Portugal sigue siendo costa o frontera exterior
      let s = 0;
      for (const [a, b] of keep) { if (a > s) rest.push(l.slice(s, a + 1)); s = b; }
      if (s < l.length - 1) rest.push(l.slice(s));
      void g;
    }
    if (!bl.length) return;
    adj.push(i); pieces.push(...bl);
    borders[`${i}-${idx}`] = pathOf(bl);
    outer2[i] = pathOf(rest);
  });
  // la frontera entera, de punta a punta
  const left = pieces.map(p => p.slice());
  const ends = (/** @type {number[][]} */ p) => [p[0], p[p.length - 1]];
  const isEnd = (/** @type {number[]} */ pt, /** @type {number} */ self) => left.some((q, k) => k !== self && ends(q).some(e => near(e, pt)));
  let k0 = left.findIndex((p, k) => !isEnd(p[0], k) || !isEnd(p[p.length - 1], k));
  if (k0 < 0) k0 = 0;
  let line = left.splice(k0, 1)[0];
  if (isEnd(line[0], -1)) line.reverse();
  while (left.length) {
    const e = line[line.length - 1];
    const k = left.findIndex(p => near(p[0], e) || near(p[p.length - 1], e));
    if (k < 0) throw new Error(`Frontera con Portugal discontinua (${left.length} tramos sueltos)`);
    const q = left.splice(k, 1)[0];
    if (!near(q[0], e)) q.reverse();
    line = line.concat(q.slice(1));
  }
  // Portugal: costa de Natural Earth + frontera del IGN
  const [a, b] = cyclicRun(ring.map(p => lineDist(p, line) < T));
  const coast = arc(ring, (b + 1) % ring.length, (a - 1 + ring.length) % ring.length);
  const last = coast[coast.length - 1], first = coast[0];
  const bd = Math.hypot(line[0][0] - last[0], line[0][1] - last[1]) <= Math.hypot(line[line.length - 1][0] - last[0], line[line.length - 1][1] - last[1]) ? line : [...line].reverse();
  const pr = coast.concat(bd);
  void first;
  // costa de la península entera: la frontera desaparece
  const lr = parsePath(land).map(r => r.pts), mi = lr.reduce((m, r, i) => Math.abs(ringArea(r)) > Math.abs(ringArea(lr[m])) ? i : m, 0), sr = lr[mi];
  const [sa, sb] = cyclicRun(sr.map(p => lineDist(p, line) < .3));
  const spain = arc(sr, (sb + 1) % sr.length, (sa - 1 + sr.length) % sr.length), se = spain[spain.length - 1];
  const c2 = Math.hypot(coast[0][0] - se[0], coast[0][1] - se[1]) <= Math.hypot(last[0] - se[0], last[1] - se[1]) ? coast : [...coast].reverse();
  const land2 = lr.map((r, i) => i === mi ? spain.concat(c2) : r);
  // datos de la provincia
  const d = pathOf([pr], true), rs = rings(d);
  const xs = pr.map(p => p[0]), ys = pr.map(p => p[1]), bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const A = ringArea(pr);
  let cx = 0, cy = 0;
  for (let i = 0, j = pr.length - 1; i < pr.length; j = i++) { const f = pr[j][0] * pr[i][1] - pr[i][0] * pr[j][1]; cx += (pr[j][0] + pr[i][0]) * f; cy += (pr[j][1] + pr[i][1]) * f; }
  cx /= 6 * A; cy /= 6 * A;
  const pole = poleOf(rs, bbox);
  outer2[idx] = pathOf([coast]);
  console.log(`Portugal: frontera de ${Math.round(len(line))} unidades con ${adj.length} provincias, costa de ${coast.length} puntos`);
  return {
    province:{i:idx, ine:'PT', name:'Portugal', plate:'PT', d, c:[r1(cx), r1(cy)], label:[r1(pole.p[0]), r1(pole.p[1])], room:r1(pole.r),
      bbox:bbox.map(r1), area:Math.round(Math.abs(A)), parts:1, adj},
    borders, outer:outer2, land:pathOf(land2, true), neutral:'',
  };
}

/* ---------- Relieve sombreado ---------- */
// No hay datos de elevación accesibles: se modela la altura a partir de las cordilleras principales
// (líneas de cumbres aproximadas en lon/lat, altura relativa y anchura en km) más ruido fractal,
// y se calcula el sombreado con luz del noroeste. Sale data/relief.png (gris = luz, alfa = cuánto relieve).
const RANGES = [
  {h:1, w:34, line:[[-1.75, 43.05], [-1.0, 42.95], [-0.4, 42.8], [0.3, 42.68], [0.9, 42.62], [1.5, 42.5], [2.2, 42.42], [3.1, 42.45]]}, // Pirineos
  {h:.85, w:28, line:[[-7.1, 42.85], [-6.4, 42.95], [-5.7, 43.0], [-4.9, 43.13], [-4.2, 43.05], [-3.6, 43.05], [-3.0, 43.05]]}, // Cantábrica
  {h:.9, w:12, line:[[-4.85, 43.19]]}, // Picos de Europa
  {h:.5, w:24, line:[[-3.0, 43.05], [-2.3, 43.0], [-1.8, 43.0]]}, // Montes Vascos
  {h:.6, w:30, line:[[-8.0, 42.4], [-7.4, 42.3], [-6.8, 42.35], [-6.3, 42.45]]}, // Macizo Galaico y Montes de León
  {h:.7, w:38, line:[[-3.3, 42.15], [-2.6, 41.95], [-2.0, 41.6], [-1.6, 41.0], [-1.2, 40.5], [-0.7, 40.2], [-0.3, 40.0]]}, // Sistema Ibérico
  {h:.6, w:14, line:[[-1.84, 41.79]]}, // Moncayo
  {h:.85, w:26, line:[[-7.0, 40.2], [-6.2, 40.25], [-5.5, 40.3], [-5.0, 40.3], [-4.4, 40.55], [-3.9, 40.8], [-3.4, 41.05], [-3.0, 41.2]]}, // Sistema Central
  {h:.9, w:14, line:[[-5.2, 40.25]]}, // Gredos
  {h:.4, w:24, line:[[-5.2, 39.45], [-4.5, 39.5], [-3.9, 39.45]]}, // Montes de Toledo
  {h:.45, w:28, line:[[-7.2, 37.95], [-6.3, 38.05], [-5.5, 38.15], [-4.6, 38.3], [-3.7, 38.35], [-2.8, 38.45]]}, // Sierra Morena
  {h:.8, w:32, line:[[-5.6, 36.75], [-4.8, 36.95], [-4.1, 37.0], [-3.4, 37.05], [-2.7, 37.2], [-2.2, 37.55], [-1.6, 38.0], [-0.9, 38.45]]}, // Béticos
  {h:1, w:14, line:[[-3.3, 37.06]]}, // Sierra Nevada
  {h:.6, w:18, line:[[-2.9, 37.9]]}, // Cazorla
  {h:.5, w:28, line:[[-1.95, 40.25]]}, // Serranía de Cuenca
  {h:.5, w:24, line:[[-0.3, 40.55]]}, // Maestrazgo
  {h:.35, w:20, line:[[0.9, 41.3], [1.6, 41.6], [2.3, 41.85], [2.7, 42.1]]}, // Cordilleras costeras catalanas
  {h:.8, w:20, line:[[-7.95, 40.2], [-7.6, 40.33], [-7.3, 40.45]]}, // Serra da Estrela
  {h:.55, w:16, line:[[-8.35, 41.85], [-8.0, 41.78]]}, // Peneda-Gerês
  {h:.45, w:16, line:[[-7.95, 41.15], [-7.8, 41.35]]}, // Serra do Marão
  {h:.3, w:14, line:[[-8.6, 37.32], [-8.1, 37.25], [-7.7, 37.3]]}, // Monchique y Caldeirão
];
/** PNG en escala de grises con alfa (tipo 4), sin dependencias. @param {number} w @param {number} h @param {Uint8Array} ga */
function png(w, h, ga) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (/** @type {Buffer} */ b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 4;
  const raw = Buffer.alloc(h * (1 + w * 2));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 2)] = 0; Buffer.from(ga.buffer, y * w * 2, w * 2).copy(raw, y * (1 + w * 2) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level:9})), chunk('IEND', Buffer.alloc(0))]);
}
/** @param {import('d3-geo').GeoProjection} proj @param {number} W @param {number} H @param {number} kmPerUnit */
function relief(proj, W, H, kmPerUnit) {
  const sc = 2, w = Math.round(W / sc), h = Math.round(H / sc);
  const lines = RANGES.map(r => ({h:r.h, w:r.w / kmPerUnit, pts:r.line.map(p => /** @type {[number, number]} */ (proj(/** @type {[number, number]} */ (p))))}));
  // ruido de valores con varias octavas (determinista)
  const hash = (/** @type {number} */ x, /** @type {number} */ y) => { let n = x * 374761393 + y * 668265263; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (/** @type {number} */ x, /** @type {number} */ y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const fbm = (/** @type {number} */ x, /** @type {number} */ y) => { let v = 0, amp = .5, f = 1; for (let o = 0; o < 4; o++) { v += amp * vnoise(x * f, y * f); amp *= .45; f *= 2.05; } return v; };
  const dem = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = i * sc, y = j * sc;
    let z = 0;
    for (const L of lines) {
      let d = Infinity;
      for (let k = 0; k < L.pts.length; k++) {
        const [ax, ay] = L.pts[k], [bx, by] = L.pts[Math.min(k + 1, L.pts.length - 1)];
        const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
        d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
      }
      z += L.h * Math.exp(-((d / L.w) ** 2));
    }
    const n = fbm(x / 16, y / 16);
    dem[j * w + i] = z * (.6 + .8 * n) + .05 * fbm(x / 40 + 7, y / 40);
  }
  const out = new Uint8Array(w * h * 2), az = 315 * Math.PI / 180, alt = 45 * Math.PI / 180, zf = 11;
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const k = j * w + i;
    const gx = (dem[k + 1] - dem[k - 1]) * zf / 2, gy = (dem[k + w] - dem[k - w]) * zf / 2;
    const slope = Math.atan(Math.hypot(gx, gy)), aspect = Math.atan2(gy, -gx);
    const shade = Math.cos(alt) * Math.cos(slope) + Math.sin(alt) * Math.sin(slope) * Math.cos(az - aspect);
    const flat = Math.cos(alt);
    out[k * 2] = Math.max(0, Math.min(255, Math.round(128 + (shade - flat) * 190)));
    out[k * 2 + 1] = Math.max(0, Math.min(255, Math.round(Math.min(1, dem[k] * 1.4) ** .8 * 255)));
  }
  return png(w, h, out);
}

/** Simetría, conexión y Treviño. También lo comprueban las pruebas. */
function validate(m) {
  const n = m.provinces.length;
  for (const p of m.provinces) for (const q of p.adj) {
    if (!m.provinces[q].adj.includes(p.i)) throw new Error(`Adyacencia asimétrica ${p.name}–${m.provinces[q].name}`);
    if (!m.borders[`${Math.min(p.i, q)}-${Math.max(p.i, q)}`]) throw new Error(`Falta la frontera ${p.name}–${m.provinces[q].name}`);
  }
  const seen = new Set([0]), st = [0];
  while (st.length) { const v = /** @type {number} */ (st.pop()); for (const q of m.provinces[v].adj) if (!seen.has(q)) { seen.add(q); st.push(q); } }
  if (seen.size !== n) throw new Error('El grafo de provincias no es conexo');
  const bu = m.provinces.find(p => p.ine === '09'), al = m.provinces.find(p => p.ine === '01');
  if (!bu || !al || !bu.adj.includes(al.i) || bu.parts < 2) throw new Error('Falta el enclave de Treviño');
}

main().catch(e => { console.error(e); process.exit(1); });

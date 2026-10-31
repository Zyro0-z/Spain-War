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

  const data = {
    v:1,
    w:W, h:H, kmPerUnit:r1(kmPerUnit * 100) / 100,
    credits:'Límites provinciales: © Instituto Geográfico Nacional de España (CC BY 4.0), vía es-atlas. Países vecinos: Natural Earth (dominio público), vía world-atlas.',
    provinces, borders, outer, land, neutral,
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

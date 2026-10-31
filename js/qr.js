// @ts-check
// Código QR sin librerías: modo byte, corrección de errores M, versiones 1 a 10 (hasta 213 bytes).
// Sigue la norma ISO/IEC 18004: Reed-Solomon en GF(256), patrones, máscara con menor penalización.

/** Bloques por versión con nivel M: [codewords de corrección por bloque, [bloques, datos por bloque]...] */
const EC_M = [null,
  [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
  [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

/** @param {number} x @param {number} y */
function gmul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
  return z;
}
/** @param {number} degree */
function rsDivisor(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gmul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = gmul(root, 2);
  }
  return r;
}
/** @param {number[]} data @param {number[]} div */
function rsRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) {
    const f = b ^ /** @type {number} */ (r.shift()); r.push(0);
    div.forEach((c, i) => { r[i] ^= gmul(c, f); });
  }
  return r;
}

/**
 * Matriz del QR (true = módulo oscuro).
 * @param {string} text
 * @returns {boolean[][]}
 */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  const capacity = (/** @type {number} */ v) => { const e = /** @type {any[]} */ (EC_M[v]); return e.slice(1).reduce((s, [n, d]) => s + n * d, 0); };
  while (ver <= 10 && 4 + (ver < 10 ? 8 : 16) + bytes.length * 8 > capacity(ver) * 8) ver++;
  if (ver > 10) throw new Error('Texto demasiado largo para el QR');
  const dataCap = capacity(ver);
  // Bits: modo byte, longitud, datos, terminador y relleno
  /** @type {number[]} */
  const bits = [];
  const put = (/** @type {number} */ v, /** @type {number} */ n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, dataCap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a << 1 | b, 0));
  for (let pad = 0xEC; data.length < dataCap; pad ^= 0xEC ^ 0x11) data.push(pad);
  // Bloques y corrección, intercalados
  const [ecLen, ...groups] = /** @type {any[]} */ (EC_M[ver]);
  const div = rsDivisor(ecLen);
  /** @type {number[][]} */ const blocks = [], ecs = [];
  let k = 0;
  for (const [n, d] of groups) for (let i = 0; i < n; i++) { const b = data.slice(k, k + d); k += d; blocks.push(b); ecs.push(rsRemainder(b, div)); }
  const all = [];
  const maxD = Math.max(...blocks.map(b => b.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.length) all.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const e of ecs) all.push(e[i]);

  const size = 17 + ver * 4;
  /** @type {boolean[][]} */ const m = Array.from({length:size}, () => new Array(size).fill(false));
  /** @type {boolean[][]} */ const fn = Array.from({length:size}, () => new Array(size).fill(false));
  const set = (/** @type {number} */ x, /** @type {number} */ y, /** @type {boolean} */ dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (/** @type {number} */ cx, /** @type {number} */ cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = /** @type {number[]} */ (ALIGN[ver]), na = al.length;
  for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const format = (/** @type {number} */ mask) => {
    const d = (0 << 3) | mask; // nivel M = 00
    let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, bit = (/** @type {number} */ i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0); // reserva las zonas de formato
  if (ver >= 7) {
    let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
    const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const dark = ((b >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, dark); set(c, a, dark); }
  }
  // Datos en zigzag
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && i < all.length * 8) { m[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  // Máscara con menor penalización
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
  const apply = (/** @type {number} */ k) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x]; };
  let best = 0, bestP = Infinity;
  for (let k = 0; k < 8; k++) {
    apply(k); format(k);
    const p = penalty(m);
    if (p < bestP) { bestP = p; best = k; }
    apply(k);
  }
  apply(best); format(best);
  return m;
}

/** Penalización de la norma (rachas, bloques 2×2, falsos buscadores y equilibrio). @param {boolean[][]} m */
function penalty(m) {
  const n = m.length; let p = 0, dark = 0;
  const lines = [];
  for (let y = 0; y < n; y++) { lines.push(m[y]); lines.push(m.map(r => r[y])); }
  for (const l of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && l[i] === l[i - 1]) run++;
      else { if (run >= 5) p += 3 + run - 5; run = 1; }
    }
    const s = l.map(v => v ? '1' : '0').join('');
    for (const pat of ['10111010000', '00001011101']) { let k = s.indexOf(pat); while (k >= 0) { p += 40; k = s.indexOf(pat, k + 1); } }
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
  for (const r of m) for (const v of r) if (v) dark++;
  return p + Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
}

/** QR como SVG (módulos redondeados, margen de 4). @param {string} text @param {{dark?:string, light?:string}} [o] */
export function qrSVG(text, o = {}) {
  const m = qrMatrix(text), n = m.length, q = 4;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + q},${y + q}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + q * 2} ${n + q * 2}" class="qr" role="img" aria-label="Código QR del enlace" shape-rendering="crispEdges"><rect width="100%" height="100%" rx="2" fill="${o.light || '#fff'}"/><path d="${d}" fill="${o.dark || '#0B1220'}"/></svg>`;
}

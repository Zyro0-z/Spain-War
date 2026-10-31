// @ts-check
// Color de los bandos y arte en SVG con luz, sombra y textura: escudos heráldicos, corona, espadas, dados.
// Todo se dibuja aquí, sin imágenes externas, para que funcione sin conexión.

/* ---------- Color ---------- */
/** @param {string} hex @returns {[number, number, number]} */
export function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  const v = m ? parseInt(m[1], 16) : 0x808080;
  return [v >> 16, v >> 8 & 255, v & 255];
}
/** @param {number[]} a */
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** @param {string} a @param {string} b @param {number} t */
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
/** @param {string} c @param {number} t */
export const lighten = (c, t) => mix(c, '#ffffff', t);
/** @param {string} c @param {number} t */
export const darken = (c, t) => mix(c, '#000000', t);
/** @param {string} c @param {number} a */
export const alpha = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };
/** HSL (grados, %, %) a hex. @param {number} h @param {number} s @param {number} l */
export function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (/** @type {number} */ n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (/** @type {number} */ n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}
/** Desatura hacia gris con la misma luminosidad. @param {string} c @param {number} t */
export function desaturate(c, t) {
  const [r, g, b] = rgb(c), y = r * .299 + g * .587 + b * .114;
  return toHex([r + (y - r) * t, g + (y - g) * t, b + (y - b) * t]);
}
/** Luminancia relativa (WCAG). @param {string} c */
export function luminance(c) {
  const f = (/** @type {number} */ v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb(c); return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
}
/** Color de texto legible encima. @param {string} c */
export const inkOn = c => luminance(c) > .36 ? '#0B1220' : '#FFFFFF';

/* ---------- Paleta de los bandos ---------- */
// 47 tonos repartidos por el círculo cromático y ajustados a ojo en HSL: los amarillos y verdes se oscurecen
// (parecen más claros de lo que son) y los azules y violetas se aclaran. Tres escalones de luz y saturación
// alternos para que dos tonos vecinos del círculo no se confundan.
/** Corrección de luminosidad por tono (grados → puntos de L). @param {number} h */
function lightFix(h) {
  const pts = [[0, 52], [25, 54], [45, 52], [58, 48], [75, 44], [110, 40], [150, 40], [175, 42], [195, 46], [215, 56], [240, 62], [265, 62], [290, 58], [320, 54], [345, 54], [360, 52]];
  for (let i = 1; i < pts.length; i++) if (h <= pts[i][0]) { const [h0, l0] = pts[i - 1], [h1, l1] = pts[i]; return l0 + (l1 - l0) * (h - h0) / (h1 - h0); }
  return 52;
}
/** @param {number} n */
export function factionPalette(n = 47) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = (i * 360 / n + 8) % 360, tier = i % 3;
    const l = lightFix(h) + [-6, 1, 7][tier] - 3, s = [60, 52, 46][tier] + (h > 70 && h < 170 ? -6 : 0) + (h > 200 && h < 280 ? 4 : 0);
    out.push(hsl(h, s, l));
  }
  return out;
}
/** Distancia perceptiva aproximada (OKLab). @param {string} a @param {string} b */
function dist(a, b) {
  const lab = (/** @type {string} */ c) => {
    const [r, g, bl] = rgb(c).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * bl), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * bl), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * bl);
    return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
  };
  const x = lab(a), y = lab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
/**
 * Asigna un color a cada provincia para que las vecinas (y las vecinas de sus vecinas) contrasten.
 * Determinista: el mismo mapa da siempre los mismos colores.
 * @param {number[][]} adj
 */
export function assignColors(adj) {
  const n = adj.length, pal = factionPalette(n), free = pal.map((_, i) => i), col = new Array(n).fill(-1);
  const order = [...adj.keys()].sort((a, b) => adj[b].length - adj[a].length || a - b);
  for (const p of order) {
    const near = new Map();
    for (const q of adj[p]) { near.set(q, 1); for (const r of adj[q]) if (r !== p && !near.has(r)) near.set(r, .45); }
    let best = free[0], bestScore = -1;
    for (const c of free) {
      let s = Infinity;
      for (const [q, w] of near) if (col[q] >= 0) s = Math.min(s, dist(pal[c], pal[col[q]]) / w);
      if (s === Infinity) s = 9;
      if (s > bestScore) { bestScore = s; best = c; }
    }
    col[p] = best; free.splice(free.indexOf(best), 1);
  }
  // Mejora local: intercambia colores entre dos provincias si sube el contraste de la peor de las dos
  const score = (/** @type {number} */ p) => {
    let s = Infinity;
    for (const q of adj[p]) { s = Math.min(s, dist(pal[col[p]], pal[col[q]])); for (const r of adj[q]) if (r !== p) s = Math.min(s, dist(pal[col[p]], pal[col[r]]) * 2.2); }
    return s;
  };
  for (let pass = 0; pass < 30; pass++) {
    let changed = false;
    const worst = [...adj.keys()].sort((a, b) => score(a) - score(b)).slice(0, 12);
    for (const p of worst) for (let q = 0; q < n; q++) {
      if (q === p) continue;
      const before = Math.min(score(p), score(q));
      [col[p], col[q]] = [col[q], col[p]];
      if (Math.min(score(p), score(q)) > before + 1e-9) { changed = true; break; }
      [col[p], col[q]] = [col[q], col[p]];
    }
    if (!changed) break;
  }
  return col.map(i => pal[i]);
}

/* ---------- Escudos heráldicos ---------- */
const SHIELD = 'M6 15H58V47C58 63.5 46.5 75 32 78 17.5 75 6 63.5 6 47Z';
const FIELD = 'M10 19H54V47C54 61 44.3 70.6 32 73.6 19.7 70.6 10 61 10 47Z';
const GOLD = ['#FFF1B8', '#F2C94C', '#C8901E', '#7A4E0B'];
const SILVER = ['#FFFFFF', '#E3E8EF', '#A9B4C2', '#5F6B7A'];
/** Divisiones heráldicas posibles para el campo (en coordenadas del escudo). */
const DIVISIONS = [
  'plain',
  'pale',      // partido
  'fess',      // cortado
  'quarterly', // cuartelado
  'bend',      // banda
  'chief',     // jefe
  'chevron',   // cabrio
  'saltire',   // aspa (de San Andrés)
  'bordure',   // bordura componada
];
/**
 * Escudo procedural con monograma: campo del color del bando, división heráldica, bordura de oro, corona y letras.
 * Devuelve el <symbol> y sus degradados para el sprite global (así no se repiten ids en la página).
 * @param {{color:string, plate:string, idx:number}} o
 * @returns {{defs:string, symbol:string}}
 */
export function shieldSymbol(o) {
  const id = 'sh' + o.idx, c = o.color;
  const metal = o.idx % 4 === 1 ? SILVER : GOLD;
  const div = DIVISIONS[(o.idx * 7 + 3) % DIVISIONS.length];
  const c1 = lighten(c, .2), c2 = darken(c, .3), alt = darken(c, .45);
  const M = `url(#${id}m)`, A = `url(#${id}a)`;
  let parts = '';
  switch (div) {
    case 'pale': parts = `<path d="M32 19H54V47C54 61 44.3 70.6 32 73.6Z" fill="${A}"/>`; break;
    case 'fess': parts = `<path d="M10 44H54V47C54 61 44.3 70.6 32 73.6 19.7 70.6 10 61 10 47Z" fill="${A}"/>`; break;
    case 'quarterly': parts = `<path d="M32 19H54V44H32Z" fill="${M}" opacity=".92"/><path d="M10 44H32V73.6C19.7 70.6 10 61 10 47Z" fill="${M}" opacity=".92"/>`; break;
    case 'bend': parts = `<path d="M10 22.5 13.5 19 54 59.5 51 66Z" fill="${M}"/>`; break;
    case 'chief': parts = `<path d="M10 19H54V31H10Z" fill="${M}"/>${[18, 46].map(x => `<circle cx="${x}" cy="25" r="2.6" fill="${alt}"/><circle cx="${x - .7}" cy="24.3" r=".9" fill="#fff" opacity=".35"/>`).join('')}`; break;
    case 'chevron': parts = `<path d="M10 62 32 40 54 62V69L32 47 10 69Z" fill="${M}"/>`; break;
    case 'saltire': parts = `<path d="M10 22 14 19 32 38 50 19 54 22 36 42 53 62 49.5 66.5 32 46 14.5 66.5 11 62 28 42Z" fill="${M}"/>`; break;
    case 'bordure': parts = `<path d="${FIELD}" fill="none" stroke="${M}" stroke-width="8" stroke-dasharray="6.4 6.4"/>`; break;
  }
  const big = o.plate.length > 1, fs = big ? 16 : 18, ty = big ? 52.6 : 53.2;
  const txt = (/** @type {string} */ fill, extra = '') => `<text x="32" y="${ty}" text-anchor="middle" font-family="'Barlow Condensed','Arial Narrow',sans-serif" font-weight="800" font-size="${fs}" letter-spacing="-.3" fill="${fill}"${extra}>${o.plate}</text>`;
  const defs = `
    <linearGradient id="${id}f" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <linearGradient id="${id}a" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="${darken(c, .16)}"/><stop offset="1" stop-color="${darken(c, .5)}"/></linearGradient>
    <linearGradient id="${id}m" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="${metal[0]}"/><stop offset=".35" stop-color="${metal[1]}"/><stop offset=".75" stop-color="${metal[2]}"/><stop offset="1" stop-color="${metal[3]}"/></linearGradient>`;
  const symbol = `<symbol id="shf${o.idx}" viewBox="0 0 64 82">
  <path d="${SHIELD}" transform="translate(0 2.4)" fill="#000" opacity=".38"/>
  <path d="${SHIELD}" fill="url(#shB)"/>
  <path d="${SHIELD}" fill="none" stroke="#3D2604" stroke-opacity=".75" stroke-width=".8"/>
  <g clip-path="url(#shC)">
    <path d="${FIELD}" fill="url(#${id}f)"/>
    ${parts}
    <path d="${FIELD}" fill="url(#shH)"/>
    <ellipse cx="32" cy="47" rx="${big ? 13 : 11}" ry="12.4" fill="${alt}" opacity=".6"/>
    <ellipse cx="32" cy="47" rx="${big ? 13 : 11}" ry="12.4" fill="none" stroke="${M}" stroke-width="1.6"/>
    ${txt('#000', ' opacity=".5" transform="translate(.5 .9)"')}${txt(M)}
    <path d="${FIELD}" fill="url(#shS)"/>
    <path d="${FIELD}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="2.2"/>
  </g>
  <path d="M8.2 17.2H55.8" stroke="#fff" stroke-opacity=".7" stroke-width=".8" stroke-linecap="round"/>
  <use href="#shCrown"/>
</symbol>`;
  return {defs, symbol};
}
/** Degradados y piezas comunes de todos los escudos (van una sola vez en el sprite). */
export function shieldCommon() {
  return `
    <linearGradient id="shG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GOLD[0]}"/><stop offset=".4" stop-color="${GOLD[1]}"/><stop offset="1" stop-color="${GOLD[2]}"/></linearGradient>
    <linearGradient id="shB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GOLD[0]}"/><stop offset=".3" stop-color="${GOLD[1]}"/><stop offset=".62" stop-color="${GOLD[2]}"/><stop offset=".8" stop-color="${GOLD[1]}"/><stop offset="1" stop-color="${GOLD[3]}"/></linearGradient>
    <linearGradient id="shS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".42" stop-color="#fff" stop-opacity=".06"/><stop offset=".43" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
    <pattern id="shH" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v3" stroke="#000" stroke-opacity=".09" stroke-width="1"/></pattern>
    <clipPath id="shC"><path d="${FIELD}"/></clipPath>
    <g id="shCrown">
      <path d="M14 15.5 12.2 6.6 20 10.4 25.6 3.6 32 9 38.4 3.6 44 10.4 51.8 6.6 50 15.5Z" fill="url(#shG)" stroke="#5A3606" stroke-opacity=".55" stroke-width=".7" stroke-linejoin="round"/>
      <rect x="13" y="13.2" width="38" height="4.2" rx="1.6" fill="url(#shG)" stroke="#5A3606" stroke-opacity=".5" stroke-width=".6"/>
      <circle cx="22" cy="15.3" r="1.25" fill="#C0263A"/><circle cx="32" cy="15.3" r="1.35" fill="#1F7A4D"/><circle cx="42" cy="15.3" r="1.25" fill="#C0263A"/>
      ${[[12.2, 6.6], [25.6, 3.6], [38.4, 3.6], [51.8, 6.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.55" fill="#FFF8E6" stroke="#B8902E" stroke-width=".4"/>`).join('')}
      <circle cx="32" cy="7.2" r="2.1" fill="url(#shG)" stroke="#5A3606" stroke-opacity=".5" stroke-width=".5"/><path d="M32 3.2v2M31 4.2h2" stroke="#7A4E0B" stroke-width=".7" stroke-linecap="round"/>
      <path d="M15 14.2h34" stroke="#fff" stroke-opacity=".55" stroke-width=".6" stroke-linecap="round"/>
    </g>`;
}
/** Escudo de un bando (usa el sprite). @param {number} idx @param {{cls?:string, title?:string}} [o] */
export const shield = (idx, o = {}) => `<svg viewBox="0 0 64 82" class="shield ${o.cls || ''}" ${o.title ? `role="img" aria-label="${o.title}"` : 'aria-hidden="true"'}><use href="#shf${idx}"/></svg>`;

/* ---------- Ilustraciones ---------- */
// Cada ilustración lleva ids propios para que varias copias en la página no se pisen los degradados.
let uid = 0;
/** Dos espadas cruzadas de acero con guarda de oro. @param {string} [cls] */
export function swords(cls = '') {
  const u = ++uid;
  const blade = (/** @type {number} */ r) => `<g transform="rotate(${r} 50 50)">
    <path d="M47.6 10 50 4 52.4 10 52.4 64H47.6Z" fill="url(#swB${u})"/>
    <path d="M50 6 50 64" stroke="#fff" stroke-opacity=".75" stroke-width=".8"/>
    <path d="M47.6 10 50 4 52.4 10 52.4 64H47.6Z" fill="none" stroke="#2A3340" stroke-opacity=".6" stroke-width=".6"/>
    <rect x="38" y="63" width="24" height="5" rx="2.5" fill="url(#swG${u})" stroke="#5A3606" stroke-opacity=".6" stroke-width=".6"/>
    <rect x="47.8" y="68" width="4.4" height="14" rx="1.6" fill="#5B2F1A"/><path d="M48.4 70h3.2M48.4 73h3.2M48.4 76h3.2M48.4 79h3.2" stroke="#2D160B" stroke-width=".7"/>
    <circle cx="50" cy="85" r="3.6" fill="url(#swG${u})" stroke="#5A3606" stroke-opacity=".6" stroke-width=".6"/><circle cx="48.8" cy="83.8" r="1.1" fill="#fff" opacity=".7"/>
  </g>`;
  return `<svg viewBox="0 0 100 100" class="${cls}" aria-hidden="true"><defs>
    <linearGradient id="swB${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8A97A8"/><stop offset=".45" stop-color="#F4F7FB"/><stop offset=".55" stop-color="#C3CCD8"/><stop offset="1" stop-color="#5D6878"/></linearGradient>
    <linearGradient id="swG${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GOLD[0]}"/><stop offset=".45" stop-color="${GOLD[1]}"/><stop offset="1" stop-color="${GOLD[3]}"/></linearGradient>
  </defs><ellipse cx="50" cy="92" rx="26" ry="4" fill="#000" opacity=".3"/>${blade(-38)}${blade(38)}</svg>`;
}

/** Dado ilustrado en perspectiva (para la tarjeta del modo normal). @param {string} [cls] */
export function diceArt(cls = '') {
  const u = ++uid;
  const pip = (/** @type {number} */ x, /** @type {number} */ y, r = 3.4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#1B1F2A"/><circle cx="${x - .8}" cy="${y - .9}" r="${r * .35}" fill="#fff" opacity=".18"/>`;
  return `<svg viewBox="0 0 120 100" class="${cls}" aria-hidden="true"><defs>
    <linearGradient id="dT${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4E1DA"/></linearGradient>
    <linearGradient id="dL${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EDEAE3"/><stop offset="1" stop-color="#C9C4BA"/></linearGradient>
    <linearGradient id="dR${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D4CFC5"/><stop offset="1" stop-color="#A39D92"/></linearGradient>
    <linearGradient id="dT2${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A7A"/><stop offset="1" stop-color="#D93A3A"/></linearGradient>
    <linearGradient id="dL2${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E5483F"/><stop offset="1" stop-color="#A9252B"/></linearGradient>
    <linearGradient id="dR2${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B92D30"/><stop offset="1" stop-color="#7C1820"/></linearGradient>
  </defs>
  <ellipse cx="44" cy="88" rx="30" ry="6" fill="#000" opacity=".35"/><ellipse cx="86" cy="80" rx="22" ry="5" fill="#000" opacity=".3"/>
  <g transform="translate(14 22)">
    <path d="M30 0 58 12 30 24 2 12Z" fill="url(#dT${u})"/><path d="M2 12 30 24V58L2 46Z" fill="url(#dL${u})"/><path d="M58 12 30 24V58L58 46Z" fill="url(#dR${u})"/>
    <path d="M30 0 58 12 30 24 2 12Z" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width=".8"/>
    ${pip(30, 12)}${pip(16, 22, 3)}${pip(16, 40, 3)}${pip(44, 22, 3)}${pip(44, 40, 3)}${pip(30, 41, 3)}
  </g>
  <g transform="translate(64 30) rotate(14 22 22)">
    <path d="M22 0 42 9 22 18 2 9Z" fill="url(#dT2${u})"/><path d="M2 9 22 18V42L2 33Z" fill="url(#dL2${u})"/><path d="M42 9 22 18V42L42 33Z" fill="url(#dR2${u})"/>
    <path d="M22 0 42 9 22 18 2 9Z" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".7"/>
    <circle cx="22" cy="9" r="2.6" fill="#fff"/><circle cx="9" cy="22" r="2.2" fill="#fff" opacity=".9"/><circle cx="15" cy="30" r="2.2" fill="#fff" opacity=".9"/><circle cx="32" cy="25" r="2.2" fill="#fff" opacity=".85"/>
  </g></svg>`;
}

/** Mariscal: bastón de mando cruzado con un catalejo sobre un escudo (modo un jugador). @param {string} [cls] */
export function marshalArt(cls = '') {
  const u = ++uid;
  return `<svg viewBox="0 0 120 100" class="${cls}" aria-hidden="true"><defs>
    <linearGradient id="mB${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1E3F8F"/><stop offset=".5" stop-color="#4A78E0"/><stop offset="1" stop-color="#173173"/></linearGradient>
    <linearGradient id="mG${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GOLD[0]}"/><stop offset=".45" stop-color="${GOLD[1]}"/><stop offset="1" stop-color="${GOLD[3]}"/></linearGradient>
  </defs>
  <ellipse cx="60" cy="90" rx="34" ry="5" fill="#000" opacity=".32"/>
  <g transform="rotate(-32 60 50)"><rect x="20" y="45" width="80" height="10" rx="5" fill="url(#mB${u})"/>
    ${[34, 48, 62, 76].map(x => `<path d="M${x} 47.5l1.4 2.5 2.7.3-2 1.8.6 2.7-2.7-1.4-2.6 1.4.6-2.7-2-1.8 2.7-.3z" fill="${GOLD[1]}"/>`).join('')}
    <rect x="14" y="44" width="9" height="12" rx="3" fill="url(#mG${u})"/><rect x="97" y="44" width="9" height="12" rx="3" fill="url(#mG${u})"/>
    <path d="M24 46.5h72" stroke="#fff" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/></g>
  <g transform="rotate(30 60 50)"><rect x="26" y="45.5" width="34" height="9" rx="2" fill="url(#mG${u})"/><rect x="58" y="44" width="26" height="12" rx="2" fill="#2B2F3A"/><rect x="82" y="42.5" width="14" height="15" rx="2.4" fill="url(#mG${u})"/>
    <path d="M28 47.5h30M60 46.5h22" stroke="#fff" stroke-opacity=".4" stroke-width="1.2" stroke-linecap="round"/></g>
  </svg>`;
}

/** Varios escudos con ondas de señal (modo multijugador). @param {string[]} cols @param {string} [cls] */
export function onlineArt(cols, cls = '') {
  const u = ++uid;
  const sh = (/** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ c, /** @type {number} */ s, /** @type {number} */ i) => `<g transform="translate(${x} ${y}) scale(${s})">
    <defs><linearGradient id="oa${i}_${u}" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="${lighten(c, .2)}"/><stop offset="1" stop-color="${darken(c, .3)}"/></linearGradient></defs>
    <path d="M0 0H30V18C30 28 23 34 15 36 7 34 0 28 0 18Z" fill="url(#mG2${u})"/><path d="M2.5 2.5H27.5V18C27.5 26.5 21.5 31.6 15 33.4 8.5 31.6 2.5 26.5 2.5 18Z" fill="url(#oa${i}_${u})"/>
    <path d="M2.5 2.5H27.5V12H2.5Z" fill="#fff" opacity=".16"/></g>`;
  return `<svg viewBox="0 0 120 100" class="${cls}" aria-hidden="true"><defs><linearGradient id="mG2${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GOLD[0]}"/><stop offset=".5" stop-color="${GOLD[1]}"/><stop offset="1" stop-color="${GOLD[3]}"/></linearGradient></defs>
    <ellipse cx="60" cy="90" rx="40" ry="5" fill="#000" opacity=".3"/>
    <g fill="none" stroke="#7FD8E8" stroke-linecap="round"><path d="M44 22a22 22 0 0 1 32 0" stroke-width="3" opacity=".9"/><path d="M36 14a34 34 0 0 1 48 0" stroke-width="3" opacity=".5"/><path d="M52 30a10 10 0 0 1 16 0" stroke-width="3"/></g>
    ${sh(14, 44, cols[0] || '#E5484D', 1, 0)}${sh(86, 44, cols[2] || '#46A758', 1, 2)}${sh(43, 38, cols[1] || '#3E63DD', 1.15, 1)}
  </svg>`;
}

/** Contorno de la península para fondos (recibe el path de la tierra de data/map.json). */
export const GOLD_STOPS = GOLD;

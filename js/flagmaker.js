// @ts-check
// Editor de banderas: diseño (franjas, cruces, aspa…), hasta 3 colores y un símbolo. Genera SVG 3:2 con tela.

/** Colores de tela heráldicos y modernos. */
export const FLAG_COLORS = ['#C8102E', '#AA151B', '#F1BF00', '#FFFFFF', '#0A1F44', '#0055A4', '#2E7D32', '#1B1B1B', '#6A1B9A', '#E87722', '#7FB3D5', '#8D6E63'];
export const LAYOUTS = {
  liso:'Liso', h2:'Dos franjas', v2:'Partida', h3:'Tres franjas', v3:'Tres palos', cruz:'Cruz nórdica',
  aspa:'Aspa', triangulo:'Triángulo', cuarteles:'Cuartelada', banda:'Banda',
};
/** Símbolos dibujados en una caja de 20×20 centrada en 0,0. */
export const SYMBOLS = {
  ninguno:{name:'Ninguno', d:''},
  estrella:{name:'Estrella', d:'M0-9 2.6-2.8 9.4-2.8 3.9 1.5 6 8.2 0 4.2-6 8.2-3.9 1.5-9.4-2.8-2.6-2.8Z'},
  corona:{name:'Corona', d:'M-9 5-10-6-4.5-1.5 0-8 4.5-1.5 10-6 9 5Z M-9 6.5H9V9H-9Z'},
  castillo:{name:'Castillo', d:'M-9 9V-3h3v-3h3v3h2v-6h2v6h2v-3h3v3h3V9H3V3a3 3 0 0 0-6 0v6Z'},
  torre:{name:'Torre', d:'M-5 9V-4h-2v-5h3v2h2v-2h4v2h2v-2h3v5H5V9H2V4H-2V9Z'},
  sol:{name:'Sol', d:'M0-4a4 4 0 1 1 0 8a4 4 0 1 1 0-8Z M0-10 1.2-6-1.2-6Z M0 10 1.2 6-1.2 6Z M-10 0-6-1.2-6 1.2Z M10 0 6-1.2 6 1.2Z M-7-7-4.2-5.2-5.2-4.2Z M7 7 4.2 5.2 5.2 4.2Z M7-7 5.2-4.2 4.2-5.2Z M-7 7-5.2 4.2-4.2 5.2Z'},
  luna:{name:'Luna', d:'M4.2-7.96A9 9 0 1 0 4.2 7.96A8 8 0 0 1 4.2-7.96Z'},
  ancla:{name:'Ancla', d:'M-1-9h2v2.2a2.5 2.5 0 1 1-2 0Z M-1-3h2v10.5a6 6 0 0 0 5.5-5l-2 .2 3.5-3.5 1 4.8-1.4-1A8 8 0 0 1 0 9.5 8 8 0 0 1-6.6 3l-1.4 1 1-4.8 3.5 3.5-2-.2A6 6 0 0 0-1 7.5Z M-4-4h8v1.6h-8Z'},
  espadas:{name:'Espadas', d:'M-8-9-6-9 4 1 2.6 2.4ZM8-9 6-9-4 1-2.6 2.4Z M-4 0-7 3-5.5 4.5-2.5 1.5ZM4 0 7 3 5.5 4.5 2.5 1.5Z M-7 3.5-9 7.5-8 8.5-5 5Z M7 3.5 9 7.5 8 8.5 5 5Z'},
  cruz:{name:'Cruz', d:'M-3.5-9H3.5L1.5-1.5 9-3.5V3.5L1.5 1.5 3.5 9H-3.5L-1.5 1.5-9 3.5V-3.5L-1.5-1.5Z'},
  flor:{name:'Flor de lis', d:'M0-10C3-7 3-3 1 0h4c2 0 3-3 5-1-1 3-4 4-6 3l-2 1v6h-4V3l-2-1c-2 1-5 0-6-3 2-2 3 1 5 1h4C-3-3-3-7 0-10Z'},
  arbol:{name:'Árbol', d:'M0-9.5c4.2 0 7.3 3 7.3 6.6 0 3.3-2.7 5.6-6 5.6H1.4V7h3v2.3h-8.8V7h3V2.7H-1.3c-3.3 0-6-2.3-6-5.6 0-3.6 3.1-6.6 7.3-6.6Z'},
};
/** @typedef {{layout:string, c:string[], sym:string, sc:string}} FlagDesign */
export const DEFAULT_FLAG = /** @type {FlagDesign} */ ({layout:'h3', c:['#AA151B', '#F1BF00', '#AA151B'], sym:'castillo', sc:'#AA151B'});

/** SVG de la bandera (viewBox 30×20). @param {FlagDesign} f */
export function flagSVG(f) {
  const [a, b, c] = [f.c[0] || '#AA151B', f.c[1] || '#F1BF00', f.c[2] || f.c[0] || '#AA151B'];
  const L = {
    liso:`<rect width="30" height="20" fill="${a}"/>`,
    h2:`<rect width="30" height="10" fill="${a}"/><rect y="10" width="30" height="10" fill="${b}"/>`,
    v2:`<rect width="15" height="20" fill="${a}"/><rect x="15" width="15" height="20" fill="${b}"/>`,
    h3:`<rect width="30" height="20" fill="${a}"/><rect y="5" width="30" height="10" fill="${b}"/><rect y="15" width="30" height="5" fill="${c}"/>`,
    v3:`<rect width="10" height="20" fill="${a}"/><rect x="10" width="10" height="20" fill="${b}"/><rect x="20" width="10" height="20" fill="${c}"/>`,
    cruz:`<rect width="30" height="20" fill="${a}"/><rect x="8" width="4" height="20" fill="${b}"/><rect y="8" width="30" height="4" fill="${b}"/>`,
    aspa:`<rect width="30" height="20" fill="${a}"/><path d="M0 0L30 20M30 0L0 20" stroke="${b}" stroke-width="3.6"/>`,
    triangulo:`<rect width="30" height="20" fill="${b}"/><rect y="10" width="30" height="10" fill="${c}"/><path d="M0 0 13 10 0 20Z" fill="${a}"/>`,
    cuarteles:`<rect width="15" height="10" fill="${a}"/><rect x="15" width="15" height="10" fill="${b}"/><rect y="10" width="15" height="10" fill="${b}"/><rect x="15" y="10" width="15" height="10" fill="${a}"/>`,
    banda:`<rect width="30" height="20" fill="${a}"/><path d="M0 20 30 0V6L6 20Z" fill="${b}"/>`,
    portugal:`<rect width="30" height="20" fill="${b}"/><rect width="12" height="20" fill="${a}"/><circle cx="12" cy="10" r="4.4" fill="none" stroke="${c}" stroke-width="1.1"/><path d="M7.8 10h8.4M12 5.8v8.4M8.6 7.6q3.4 1.4 6.8 0M8.6 12.4q3.4-1.4 6.8 0" fill="none" stroke="${c}" stroke-width=".45"/><path d="M10.2 7.6h3.6v3a1.8 1.8 0 0 1-3.6 0Z" fill="#DA291C" stroke="#fff" stroke-width=".5"/><path d="M11.3 8.7h1.4v1.9a.7.7 0 0 1-1.4 0Z" fill="#fff"/>`,
  }[/** @type {'liso'} */ (f.layout)] || `<rect width="30" height="20" fill="${a}"/>`;
  const sym = SYMBOLS[/** @type {'estrella'} */ (f.sym)];
  const sx = f.layout === 'cruz' ? 10 : f.layout === 'triangulo' ? 5 : 15;
  const s = sym && sym.d ? `<g transform="translate(${sx} 10) scale(.6)"><path d="${sym.d}" fill="${f.sc || '#FFFFFF'}" fill-rule="evenodd" stroke="rgba(0,0,0,.35)" stroke-width=".6"/></g>` : '';
  return `<svg viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">${L}${s}</svg>`;
}
/** Bandera dibujada con el mismo envoltorio que las de provincia. @param {FlagDesign} f @param {{cls?:string, title?:string}} [o] */
export function bannerFlag(f, o = {}) {
  return `<span class="flag ${o.cls || ''}" ${o.title ? `role="img" aria-label="${o.title}"` : 'aria-hidden="true"'}>${flagSVG(f)}</span>`;
}
/** Color de mapa para un bando propio: el primer color de la bandera que no sea casi blanco ni casi negro. @param {FlagDesign} f */
export function bannerColor(f) {
  const lum = (/** @type {string} */ h) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };
  return f.c.find(c => lum(c) > .12 && lum(c) < .88) || '#AA151B';
}
/** Comprueba un diseño guardado. @param {any} f @returns {FlagDesign} */
export function cleanFlag(f) {
  const ok = (/** @type {unknown} */ c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  if (!f || typeof f !== 'object') return DEFAULT_FLAG;
  return {layout:f.layout in LAYOUTS ? f.layout : 'h3', c:[0, 1, 2].map(i => ok(f.c?.[i]) ? f.c[i] : DEFAULT_FLAG.c[i]), sym:f.sym in SYMBOLS ? f.sym : 'ninguno', sc:ok(f.sc) ? f.sc : '#FFFFFF'};
}

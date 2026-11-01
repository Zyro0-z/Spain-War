// @ts-check
// Ilustraciones de los edificios (caja de 64×64 centrada, luz desde arriba a la izquierda). Se usan en las hojas,
// en los huecos de la ficha y, en pequeño, alrededor de la ciudad de cada provincia.

const O = '#2B1A0C';
/** Trazo de contorno. @param {number} [w] */
const ink = (w = 1.1) => `stroke="${O}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
/** @param {string} d @param {string} fill @param {number} [w] */
const P = (d, fill, w) => `<path d="${d}" fill="${fill}" ${ink(w)}/>`;
/** Sin contorno. @param {string} d @param {string} fill @param {string} [extra] */
const F = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
/** Línea. @param {string} d @param {string} col @param {number} [w] */
const L = (d, col, w = 1) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** Suelo con sombra. @param {string} col @param {number} [rx] */
const ground = (col, rx = 29) => `<ellipse cx="1" cy="20" rx="${rx}" ry="8.5" fill="rgba(0,0,0,.28)"/><ellipse cx="0" cy="17" rx="${rx}" ry="9" fill="${col}" ${ink(1)}/>`;
/** Almenas sobre una línea horizontal. @param {number} x0 @param {number} x1 @param {number} y @param {number} [w] */
const merlons = (x0, x1, y, w = 3) => { let d = ''; for (let x = x0; x + w <= x1 + .01; x += w * 2) d += `M${x} ${y}v-${w}h${w}v${w}`; return d; };
/** Bandera. @param {number} x @param {number} y @param {string} col */
const flag = (x, y, col) => L(`M${x} ${y}v-12`, O, 1.2) + P(`M${x} ${y - 12}h8l-2 2.6 2 2.6h-8Z`, col, .8);

const STONE = '#E3D2AC', STONE2 = '#C4AC80', STONE3 = '#9C8560', ROOF = '#C65A31', ROOF2 = '#8F3A1D', WOOD = '#9A6532', WOOD2 = '#6B4220';
const GRASS = '#86B556', DIRT = '#C9AE82', WATER = '#4F9AD8', WATER2 = '#2F6FAE', WHITE = '#F4EEDF';

/** @type {Record<string, () => string>} */
const ART = {
  granja:() => ground(GRASS)
    + P('M-28 15 -9 7 5 14 -15 24Z', '#E2B84A') + L('M-24 16 -6 9M-20 18-2 11M-16 20 2 12.5M-12 22 4 14', '#B98A24', 1.2)
    + P('M-9 -14h8v26h-8Z', '#D8D0BE') + P('M-9 -14a4 3 0 0 1 8 0Z', '#9DA4AE') + L('M-9 -6h8M-9 2h8', '#A79E8C', .8)
    + P('M3 -2 6-12 13-17 20-12 23-2Z', '#7A2A1C') + P('M3 -2h20v16H3Z', '#B8402C') + F('M3 -2h4v16H3Z', 'rgba(0,0,0,.18)')
    + P('M9 14V5h8v9', WHITE, 1) + L('M9 5l8 9M17 5l-8 9', WHITE, 1.1) + P('M11 -9h4v4h-4Z', WHITE, .8)
    + P('M-1 9a4 3.4 0 1 0 8 0a4 3.4 0 1 0-8 0Z', '#E7C25A', .9) + L('M1 9h4', '#B98A24', .8),
  mercado:() => ground('#D3C09A')
    + P('M-25 -2v14M-3 -2v14M3 -2v14M25 -2v14', WOOD2, 1)
    + P('M-26 1h24v8h-24Z', WOOD) + P('M2 1h24v8H2Z', WOOD)
    + P('M-28 -4-24 -12H-2L2 -4Z', '#C23B32') + F('M-23 -12h4.4l-1.6 8h-4.4ZM-14.2 -12h4.4l-.6 8h-4.4ZM-5.4 -12H-2l.4 8h-3.4Z', WHITE)
    + P('M-2 -4 2 -12H24l4 8Z', '#2F63B4') + F('M6.4 -12h4.4l.6 8H7ZM15.2 -12h4.4l1.6 8h-4.4Z', WHITE)
    + P('M-22 1a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0ZM-16 1a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0Z', '#F08A2C', .8)
    + P('M-10 1a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0Z', '#7CB342', .8) + P('M6 1a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0ZM12 1a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0Z', '#D84A6A', .8)
    + P('M-8 14h8v6h-8Z', '#B07A3E') + P('M2 15h6v5H2Z', '#C68E4E') + L('M-8 17h8', WOOD2, .7),
  cuartel:() => ground(DIRT)
    + P('M-26 -6-20 -14H16L22 -6Z', ROOF) + F('M-20 -14h36l-2 3h-32Z', 'rgba(255,255,255,.18)')
    + P('M-25 -6h46v20h-46Z', STONE) + F('M-25 -6h5v20h-5Z', 'rgba(0,0,0,.14)')
    + P('M-6 14V5a4 4 0 0 1 8 0v9Z', WOOD2) + P('M-19 0h4v5h-4ZM-12 0h3v5h-3ZM6 0h3v5H6ZM12 0h4v5h-4Z', '#3A2A1A', .7)
    + flag(25, 12, '#C23B32')
    + L('M-28 22-24 4M-25 22-21 4M-22 22-18 4', WOOD2, 1.2) + P('M-25 4-24 1-23 4ZM-22 4-21 1-20 4ZM-19 4-18 1-17 4Z', '#C9D3DC', .7),
  fortaleza:() => ground('#9DAA6A')
    + P(`M-24 16V-4h12v20Z`, STONE2) + P(merlons(-24, -12, -4), STONE2, .9)
    + P(`M12 16V-4h12v20Z`, STONE2) + P(merlons(12, 24, -4), STONE2, .9)
    + P('M-12 16V-20h24v36Z', STONE) + P(merlons(-12, 12, -20, 4), STONE, .9) + F('M-12 -20h5v36h-5Z', 'rgba(0,0,0,.12)')
    + P('M-5 16V7a5 5 0 0 1 10 0v9Z', '#3A2A1A') + L('M-3 16V8M0 16V5.5M3 16V8M-5 11h10', '#7A6A55', .8)
    + P('M-3 -11h2v5h-2ZM2 -11h2v5H2ZM-20 2h2v5h-2ZM18 2h2v5h-2Z', '#3A2A1A', .6)
    + L('M-12 -2h24M-12 6h7M5 6h7', STONE3, .6) + flag(0, -24, '#C23B32'),
  muralla:() => ground('#9DAA6A')
    + P('M-28 16V0h56v16Z', STONE2) + P(merlons(-28, 28, 0, 3.2), STONE2, .9)
    + L('M-28 5h56M-28 10h56M-22 0v5M-14 0v5M14 0v5M22 0v5M-18 5v5M18 5v5M-24 10v6M-10 10v6M10 10v6M24 10v6', STONE3, .6)
    + P('M-26 16V-10h12v26Z', STONE) + P(merlons(-26, -14, -10), STONE, .9)
    + P('M14 16V-10h12v26Z', STONE) + P(merlons(14, 26, -10), STONE, .9)
    + P('M-7 16V6a7 7 0 0 1 14 0v10Z', '#3A2A1A') + L('M-4 16V5M0 16V3M4 16V5M-7 9h14M-7 13h14', '#8A7A60', .8)
    + P('M-21 -3h2v5h-2ZM19 -3h2v5h-2Z', '#3A2A1A', .6),
  puerto:() => `<ellipse cx="1" cy="20" rx="30" ry="9" fill="rgba(0,0,0,.25)"/>` + P('M-30 17a30 10 0 1 0 60 0a30 10 0 1 0-60 0Z', WATER, 1)
    + L('M-22 20h6M-8 24h8M10 22h7M-26 14h4', '#A8D4F5', 1)
    + P('M-28 6h26v6h-26Z', WOOD) + L('M-24 6v6M-19 6v6M-14 6v6M-9 6v6', WOOD2, .7) + P('M-26 12v6M-6 12v6', WOOD2, 1.4)
    + P('M-24 -1h7v7h-7ZM-16 1h5v5h-5Z', '#B07A3E', .8) + L('M-24 2.5h7', WOOD2, .6)
    + L('M-4 6V-16M-4 -16 6 -12', WOOD2, 1.6) + L('M6 -12V-4', O, .8)
    + P('M2 10h26l-4 8H6Z', WOOD2) + F('M4 12h22', '', `stroke="${WOOD}" stroke-width="1"`)
    + L('M15 10V-18', O, 1.3) + P('M15 -17c7 2 9 8 8 14H15Z', WHITE, .9) + L('M18 -12v7M15 -8h7', '#C23B32', 1.3),
  mina:() => ground('#9C8A66')
    + P('M-30 16-15 -14-5 -5 5 -19 30 16Z', '#8C7A5B') + F('M5 -19 30 16H14L4 -4Z', 'rgba(0,0,0,.2)') + F('M-15 -14-30 16h8l-6-8Z', 'rgba(255,255,255,.14)')
    + L('M-12 -2-6 2M10 -6 16 0M-20 8l4 2', '#6D5D42', .9)
    + P('M-9 16V0h18v16Z', WOOD) + P('M-6 16V3h12v13Z', '#140C06') + P('M-11 -1h22v3h-22Z', WOOD2)
    + L('M-4 16-11 26M4 16 11 26M-6 19h12M-8 22h16M-10 25h20', '#5A4A38', 1)
    + P('M10 18h11l-1.6 5h-7.8Z', '#6B6B70') + P('M11 18a2 2 0 0 1 4 0ZM15 18a2 2 0 0 1 4 0Z', '#F2C94C', .7)
    + P('M12.5 24a1.4 1.4 0 1 0 .1 0ZM18.5 24a1.4 1.4 0 1 0 .1 0Z', '#3A3A3A', .6),
  catedral:() => ground('#B9C08A')
    + P('M-13 16V-4h26v20Z', STONE) + P('M-15 -4 0 -16 15 -4Z', '#5D6B7A') + F('M0 -16 15 -4H8Z', 'rgba(0,0,0,.18)')
    + P('M-24 16V-14h10v30Z', STONE2) + P('M14 16V-14h10v30Z', STONE2)
    + P('M-25 -14-19 -29-13 -14Z', '#5D6B7A') + P('M13 -14 19 -29 25 -14Z', '#5D6B7A')
    + L('M-19 -29v-4M-20.6 -31.4h3.2M19 -29v-4M17.4 -31.4h3.2', '#F2C94C', 1)
    + P('M-4 16V8a4 4 0 0 1 8 0v8Z', '#3A2A1A') + P('M-3.4 -1a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0-6.8 0Z', '#5FA0E0', .9) + L('M0 -4.4v6.8M-3.4-1h6.8', O, .5)
    + P('M-21 -6v6h4v-6a2 2 0 0 0-4 0ZM17 -6v6h4v-6a2 2 0 0 0-4 0Z', '#4A7FC0', .7) + P('M-21 6v6h4v-6a2 2 0 0 0-4 0ZM17 6v6h4v-6a2 2 0 0 0-4 0Z', '#3A2A1A', .7),
  torre:() => ground(GRASS, 20)
    + P('M-7 18V-14h14v32Z', STONE) + F('M-7 -14h4v32h-4Z', 'rgba(0,0,0,.14)') + L('M-7 -4h14M-7 6h14', STONE3, .7)
    + P('M-10 -14v-5h20v5Z', STONE2) + P(merlons(-10, 10, -19, 2.5), STONE2, .8)
    + P('M-1.6 2h3.2v6h-3.2ZM-1.6 -10h3.2v4h-3.2Z', '#3A2A1A', .6)
    + P('M-4 -21h8l-1.5 3h-5Z', '#5A4A38', .8) + F('M-3 -21c-2-4 1-6 1-10 2 2 0 4 2 5 1-3 3-4 3-7 2 4 1 8-1 12Z', '#FF8A2A') + F('M-1 -21c-1-2 0-3 1-6 1 2 2 3 1 6Z', '#FFE07A'),
  caminos:() => ground(GRASS)
    + P('M-8 25C-4 12-2 0 1 -12L5 -12C4 0 6 12 10 25Z', '#D8BE8A', .9) + L('M1 22 1.5 16M1.8 11l.4-5M2.4 1 2.8 -4M3 -8l.2-3', WHITE, 1.1)
    + P('M-14 -10h12l-2 2h-8Z', '#9A9A9A', .8) + P('M-12 -8h8v14h-8Z', '#BDBDBD', .9) + L('M-10 -4h4M-10 -1h4', '#7A7A7A', .7)
    + P('M12 4h12v6H12Z', WOOD) + P('M14 10a3 3 0 1 0 .1 0Z', WOOD2, .9) + P('M22 10a3 3 0 1 0 .1 0Z', WOOD2, .9) + P('M13 2h10l-1 2h-8Z', '#E2B84A', .7)
    + P('M-24 10a3 2 0 1 0 6 0a3 2 0 1 0-6 0Z', '#5C8A36', .8),
  universidad:() => ground('#C9C2A6')
    + P('M-10 -10a10 9 0 0 1 20 0Z', '#4F7FB8') + L('M0 -19v-4', O, 1) + P('M-1.6 -25h3.2v2h-3.2Z', '#F2C94C', .6)
    + P('M-26 -2 0 -12 26 -2Z', STONE) + P('M-24 -2h48v3h-48Z', STONE2, .9)
    + P('M-24 1h48v13h-48Z', STONE) + L('M-19 1v13M-11 1v13M-3 1v13M3 1v13M11 1v13M19 1v13', STONE3, 1.6)
    + P('M-27 14h54v3h-54ZM-29 17h58v3h-58Z', STONE2, .9)
    + P('M-2 -6a2 2 0 1 0 4 0a2 2 0 1 0-4 0Z', '#F2C94C', .7),
  astillero:() => `<ellipse cx="1" cy="20" rx="30" ry="9" fill="rgba(0,0,0,.25)"/>` + P('M-30 17a30 10 0 1 0 60 0a30 10 0 1 0-60 0Z', WATER2, 1)
    + P('M-30 12 22 4 26 12-24 22Z', WOOD, 1) + L('M-22 15 20 8M-26 18 24 10', WOOD2, .7)
    + P('M-18 6C-12 14 8 12 16 2L14 -2C6 6-10 8-16 2Z', '#B07A3E') + L('M-12 9-10 -1M-6 10-5 0M0 10V0M6 8 5 -1M11 6 9 -2', WOOD2, 1)
    + L('M-22 12V-16M20 4V-20M-22 -16 20 -20', WOOD2, 1.3) + L('M-4 -18v8', O, .8) + P('M-6 -10h4v3h-4Z', '#8A8A8A', .6),
  almacen:() => ground(DIRT)
    + P('M-24 -4 0 -16 24 -4Z', ROOF) + F('M0 -16 24 -4H14Z', 'rgba(0,0,0,.18)')
    + P('M-22 -4h44v18h-44Z', '#D9B98A') + L('M-22 2h44M-22 8h44', '#B89466', .6)
    + P('M-8 14V0h16v14Z', WOOD2) + L('M0 0v14M-8 0l8 7M8 0 0 7', WOOD, .9)
    + P('M-26 22a4 2 0 0 0 8 0v-7a4 2 0 0 0-8 0Z', WOOD) + L('M-26 18a4 2 0 0 0 8 0', WOOD2, .7)
    + P('M14 14c0-4 8-4 8 0v7h-8Z', '#E7D8B4') + P('M20 16c0-3 7-3 7 0v6h-7Z', '#E0CFA4'),
  hospital:() => ground('#A9C48A')
    + P('M-24 -4 0 -14 24 -4Z', '#7A8A96') + P('M-22 -4h44v18h-44Z', WHITE) + F('M-22 -4h6v18h-6Z', 'rgba(0,0,0,.08)')
    + P('M-17 2v6h5v-6a2.5 2.5 0 0 0-5 0ZM12 2v6h5v-6a2.5 2.5 0 0 0-5 0Z', '#5FA0E0', .7) + L('M-18 8h7M11 8h7', '#3E8E4E', 1.4)
    + P('M-5 14V5a5 5 0 0 1 10 0v9Z', '#3E8E4E') + P('M-3 -11h6v4h4v6h-4v4h-6v-4h-4v-6h4Z', '#D63A3A', .9)
    + P('M20 22a3 2 0 1 0 6 0a3 2 0 1 0-6 0ZM-26 21a3 2 0 1 0 6 0a3 2 0 1 0-6 0Z', '#5C8A36', .8),
  maravilla:() => ground('#D7C48C')
    + P('M-18 -4a18 16 0 0 1 36 0Z', '#F2C94C') + F('M0 -20a18 16 0 0 1 18 16H8Z', 'rgba(0,0,0,.14)') + L('M0 -20v-6', O, 1.1) + P('M-2 -28h4v2h-4Z', '#F2C94C', .7)
    + P('M-26 -4h52v4h-52Z', STONE2, .9) + P('M-24 0h48v14h-48Z', STONE) + L('M-18 0v14M-10 0v14M10 0v14M18 0v14', STONE3, 1.6)
    + P('M-5 14V6a5 5 0 0 1 10 0v8Z', '#3A2A1A') + P('M-28 14h56v4h-56Z', STONE2, .9)
    + L('M-30 -10-26 -14M30 -10l-4-4M-28 -4h-2M30 -4h-2', '#FFE58A', 1.2),
};

/** Ilustración de un edificio (o 'maravilla'). @param {string} k @param {string} [cls] @param {number} [lvl] */
export function buildArt(k, cls = '', lvl = 0) {
  const draw = ART[k] || ART.almacen;
  // al nivel 3, sello dorado
  return `<svg class="bart ${cls}" viewBox="-32 -32 64 64" aria-hidden="true">${draw()}${lvl >= 3 ? '<g transform="translate(22 -22)"><circle r="6.5" fill="#F2C94C" stroke="#2B1A0C" stroke-width="1"/><path d="M-3 1.5h6l.8-4-2 1.6L0-3.6-1.8-.9-3.8-2.5Z" fill="#2B1A0C"/></g>' : ''}</svg>`;
}
/** El dibujo sin envoltorio (para el mapa). @param {string} k */
export const buildArtRaw = k => (ART[k] || ART.almacen)();
export const ART_KEYS = Object.keys(ART);

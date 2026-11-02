// @ts-check
// Capa SVG sobre el mapa: fichas de ejército con su número, castillos en las capitales, resaltes de la provincia
// elegida y de sus objetivos, y flechas de ataque curvas y animadas. Se recoloca en cada fotograma de la cámara
// (fichas y flechas en píxeles de pantalla: siempre nítidas y del mismo tamaño).
import {lighten, darken} from '../art.js';
import {UNIT_ICON, WONDER_ICON} from './glyphs.js';
import {buildArtRaw} from './buildart.js';
import {squad} from './figures.js';

const NS = 'http://www.w3.org/2000/svg';
/** @param {string} tag @param {Record<string, string|number>} [attrs] */
function el(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); return e; }
/** Tela de banderín (sin bandera descargada). */
const SWALLOW = 'M0.6-12.5h9.6l-2.2 3.1 2.2 3.1H0.6Z';
const CASTLE = 'M-7 3V-5h2.4v2h1.8v-2h2.8v2h1.8v-2H7V3Z M-2 3V0a2 2 0 0 1 4 0v3Z';
/** Pictogramas de los edificios (trazo, caja de 12×12 centrada). */
export const BUILDING_ICON = {
  fortaleza:'M-4.5 4.5V-2h-1v-3h2v1.2h1.4V-5h4.2v1.2h1.4V-5h2v3h-1v6.5Z M-1.3 4.5V2a1.3 1.3 0 0 1 2.6 0v2.5',
  cuartel:'M-4.5-4.5 3.5 3.5M4.5-4.5-3.5 3.5M-5.2 2.2l3 3M5.2 2.2l-3 3',
  puerto:'M0-3.2V4.8M-2.8-1.6h5.6M-4.6 1.4a4.6 4.6 0 0 0 9.2 0M0-5.6a1.2 1.2 0 1 1 0 2.4a1.2 1.2 0 1 1 0-2.4',
  mercado:'M0-5V4.6M-4.8-3.4h9.6M-4.8-3.4-6.6 1h3.6ZM4.8-3.4 3 1h3.6Z M-2.6 4.6h5.2',
  granja:'M-5.5 6V-.5L0-5l5.5 4.5V6Z M-2 6V2h4v4 M-2 2 2 6 M2 2-2 6 M-1-1.6h2',
  muralla:'M-6.5 5.5V-3.5h2.6v1.8h2.6v-1.8h2.6v1.8h2.6v-1.8h2.6v9Z M-6.5 1.5h13 M-2.6 1.5v4 M2.6 1.5v4 M0-1.7v3.2',
  mina:'M-5.5 6 1.5-1 M-2.5-5.5c4-.5 7.5 3 7 7-1.5-2.5-4-5-7-7Z',
  catedral:'M0-7v3 M-1.4-5.6h2.8 M-3-1 0-4 3-1 M-3-1v7h6v-7 M-6.5 6V1H-3 M6.5 6V1H3 M-1.2 6V3.4a1.2 1.2 0 0 1 2.4 0V6',
  torre:'M-2.6 6.5 -2-3 M2.6 6.5 2-3 M-4-3h8l-1.6-3.2h-4.8Z M-2.3 1.6h4.6 M-2.4 1.6 2.4 6.5 M2.4 1.6-2.4 6.5',
  caminos:'M-1.8-6.5-5.8 6.5 M1.8-6.5 5.8 6.5 M0-5.5v2 M0-1.5v2.4 M0 3v3',
  universidad:'M-7-2 0-5.5 7-2 0 1.5Z M-4-.5v3.6c2.4 1.8 5.6 1.8 8 0V-.5 M6-1.5v4.5',
  astillero:'M-6.5 2h13l-2.6 4h-7.8Z M0 2v-8.5 M.6-6 5-.4H.6 M-.6-5-4.4-.4h3.8',
  almacen:'M-6 6V-1.5L0-5.5l6 4V6Z M-3.6 6V.6h7.2V6 M-3.6 3.3h7.2',
  hospital:'M-1.8-5.6h3.6v3.8h3.8v3.6H1.8v3.8h-3.6V1.8h-3.8v-3.6h3.8Z',
  audiencia:'M-6 6h12 M-5 6V-1h10v7 M-6.5-1 0-5.5 6.5-1Z M-2.5 6V1.5h5V6 M-3.4 0v6M3.4 0v6',
};

/** Colores de la insignia de cada tropa: fondo, borde y trazo. */
const UNIT_COL = [['#14243F', '#8FC0FF', '#DCEBFF'], ['#3A2510', '#E8A35A', '#FFE0B8'], ['#2B2B2B', '#BDBDBD', '#F2F2F2'], ['#1E3320', '#7FD08A', '#D8F5DC']];
/** Huecos de las casas de una ciudad (x, base, ancho, alto), del centro hacia fuera. */
const HOUSES = [[0, -4, 7, 6], [-6, 0, 7, 5], [6, 0, 6, 6], [-11, -3.5, 6, 5], [11, -3.5, 6, 5], [-1, 4, 7, 5], [-14, 1.5, 6, 4.5], [13, 1.5, 6, 5], [-8, 5, 6, 4.5], [8, 5.5, 6, 4.5]];
const ROOFS = ['#B4532F', '#A2462A', '#C0653A', '#93412A'];
/**
 * Ciudad dibujada: casas según su tamaño, catedral, murallas, torre, puerto y maravilla.
 * @param {{lvl:number, walls:boolean, church:boolean, tower:boolean, port:boolean, wonder:boolean, seed:number, extra?:string[], lv?:number[], works?:boolean, siege?:boolean, mill?:boolean, smoke?:boolean}} c
 */
function cityMarkup(c) {
  const n = [3, 4, 6, 8, 10][Math.max(0, Math.min(4, c.lvl - 1))];
  const ink = 'stroke="#3B2410" stroke-width=".6" stroke-linejoin="round"';
  const house = (/** @type {number[]} */ [x, y, w, h], /** @type {number} */ i) => {
    const r = ROOFS[(i + c.seed) % ROOFS.length], wall = i % 3 === 1 ? '#E2CFA9' : '#EEDFC2';
    return `<rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" fill="${wall}" ${ink}/><path d="M${x - w / 2 - .8} ${y - h}L${x} ${y - h - w * .55}L${x + w / 2 + .8} ${y - h}Z" fill="${r}" ${ink}/><rect x="${x - .8}" y="${y - 2.2}" width="1.6" height="2.2" fill="#4A2E14"/>`;
  };
  let out = `<ellipse cx="0" cy="4" rx="${12 + n * 1.3}" ry="5.5" fill="rgba(0,0,0,.28)"/>`;
  const order = HOUSES.slice(0, n).map((h, i) => /** @type {[number[], number]} */ ([h, i])).sort((a, b) => a[0][1] - b[0][1]);
  if (c.church) out += `<rect x="-4.5" y="-14" width="9" height="9" fill="#DCCAA2" ${ink}/><path d="M-5.3-14 0-18 5.3-14Z" fill="#6C4A2E" ${ink}/><rect x="2" y="-21" width="3.4" height="11" fill="#E8D8B6" ${ink}/><path d="M1.6-21 3.7-26.5 5.8-21Z" fill="#6C4A2E" ${ink}/><path d="M3.7-26.5v-2.6M2.7-28.1h2" stroke="#FFE9A8" stroke-width=".7"/><circle cx="0" cy="-10" r="1.5" fill="#F2C94C" ${ink}/>`;
  for (const [h, i] of order) out += house(h, i);
  if (c.tower) out += `<rect x="${-20}" y="-12" width="4" height="13" fill="#CDB991" ${ink}/><path d="M-20.8-12 -18-16.5 -15.2-12Z" fill="#7A3B22" ${ink}/><rect x="-18.8" y="-9.5" width="1.6" height="2" fill="#3B2410"/>`;
  if (c.walls) out += `<path d="M-22 9V4.5h2.4v1.4h2.2V4.5h2.4v1.4h2.2V4.5H-10v1.4h2.2V4.5h2.4v1.4h2.2V4.5H-1v1.4h2.2V4.5h2.4v1.4h2.2V4.5H8v1.4h2.2V4.5h2.4v1.4h2.2V4.5H17v1.4h2.2V4.5H22V9Z" fill="#C7AE7E" ${ink}/><rect x="-24" y="1" width="5" height="8" fill="#B89C6A" ${ink}/><rect x="19" y="1" width="5" height="8" fill="#B89C6A" ${ink}/>`;
  if (c.port) out += `<path d="M18 9h11l-2 3.2h-7.4Z" fill="#7A4A26" ${ink}/><path d="M23.2 9V1.2M23.8 1.8l4 6.2h-4Z" fill="#F4EEDC" ${ink}/>`;
  // otros edificios, dibujados en pequeño alrededor (atrás primero)
  const spots = [[-31, -8], [31, -8], [-34, 8], [34, 8]];
  const ex = (c.extra || []).slice(0, 4).map((k, i) => /** @type {[string, number[], number]} */ ([k, spots[i], c.lv?.[i] || 1])).sort((a, b) => a[1][1] - b[1][1]);
  const st = c.siege ? 'dañado' : '';
  out = ex.filter(([, [, y]]) => y < 0).map(([k, [x, y], l]) => `<g transform="translate(${x} ${y}) scale(.3)">${buildArtRaw(k, l, st)}</g>`).join('') + out
    + ex.filter(([, [, y]]) => y >= 0).map(([k, [x, y], l]) => `<g transform="translate(${x} ${y}) scale(.3)">${buildArtRaw(k, l, st)}</g>`).join('');
  // vida: molino que gira, humo de las fraguas, andamios de las obras
  if (c.mill) out += `<g transform="translate(-22 -6)"><path d="M-1.6 6 0-6 1.6 6Z" fill="#E8D8B6" stroke="#3B2410" stroke-width=".5"/><g class="mill" transform="translate(0 -6)"><path d="M0 0-7-1.2-7 1.2ZM0 0 7 1.2 7-1.2ZM0 0-1.2 7 1.2 7ZM0 0 1.2-7-1.2-7Z" fill="#F4EEDF" stroke="#3B2410" stroke-width=".4"/></g></g>`;
  if (c.smoke) out += `<g class="smk" transform="translate(${c.church ? 10 : 6} -14)"><circle r="2.4"/><circle r="2"/><circle r="1.6"/></g>`;
  if (c.works) out += `<g transform="translate(-6 -2) scale(.22)" class="works"><path d="M-22 18V-18M-8 18V-22M8 18V-22M22 18V-18M-24-6h48M-24 6h48" stroke="#8A6234" stroke-width="3" fill="none"/><path d="M14-22V-34h16" stroke="#5E4022" stroke-width="3" fill="none"/></g>`;
  if (c.port) out += `<g class="boat" transform="translate(30 12)"><path d="M-4 0h8l-1.4 2.2h-5.2Z" fill="#7A4A26" stroke="#3B2410" stroke-width=".4"/><path d="M0 0v-5l3 4.2H0Z" fill="#F4EEDC" stroke="#3B2410" stroke-width=".4"/></g>`;
  if (c.wonder) out += `<g transform="translate(${c.port ? -29 : 25} -2)"><circle r="9.5" fill="rgba(255,214,110,.28)"/><path d="${WONDER_ICON}" transform="scale(1.15)" fill="none" stroke="#3A2405" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="${WONDER_ICON}" transform="scale(1.15)" fill="none" stroke="#FFD66E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  return out;
}

export class Overlay {
  /** @param {SVGSVGElement} svg @param {import('../map/render.js').MapView} view */
  constructor(svg, view) {
    this.svg = svg; this.view = view;
    svg.innerHTML = '';
    svg.appendChild(el('defs')).innerHTML = `
      <linearGradient id="tkShine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
      <linearGradient id="tkGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1B8"/><stop offset=".5" stop-color="#F2C94C"/><stop offset="1" stop-color="#9A6A10"/></linearGradient>
      <radialGradient id="tkBld" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#5A4520"/><stop offset="1" stop-color="#1E1608"/></radialGradient>
      <radialGradient id="tkWon" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFF1B8"/><stop offset=".55" stop-color="#E0A62A"/><stop offset="1" stop-color="#7A4E06"/></radialGradient>
      <pattern id="catRiada" width="10" height="6" patternUnits="userSpaceOnUse"><path d="M0 3q2.5-2.4 5 0t5 0" fill="none" stroke="#9FD3FF" stroke-width=".9" stroke-opacity=".9"/></pattern>
      <pattern id="catSequia" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 4.5l3-1 1.5 2.5 3-2 1.5 1M3 3.5 2.5 0M4.5 6l-.5 3" fill="none" stroke="#5A2E08" stroke-width=".6" stroke-opacity=".75"/></pattern>
      <pattern id="catNieve" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" fill="#fff"/><circle cx="6" cy="5.5" r=".7" fill="#fff"/><circle cx="4.5" cy="1" r=".45" fill="#fff"/></pattern>
      <pattern id="catSismo" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M1 2 5 6 4 9 8 12 7 15M5 6 9 5 12 7M8 12 12 11 15 14" fill="none" stroke="#1E1A16" stroke-width=".8" stroke-opacity=".8"/></pattern>
      <radialGradient id="catFuego"><stop offset="0" stop-color="#FFD24A" stop-opacity=".75"/><stop offset=".55" stop-color="#FF6A1E" stop-opacity=".5"/><stop offset="1" stop-color="#B0200E" stop-opacity=".25"/></radialGradient>`;
    this.gFront = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-front'})));
    /** Catástrofes en curso (en coordenadas del mapa). */
    this.gCat = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-cat'})));
    this.catKey = '';
    /** Contorno de las regiones (coordenadas del mapa). */
    this.gReg = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-reg'})));
    this.gMap = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-map'})));
    this.gSmoke = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-smoke'})));
    /** @type {number[]} */ this.smokeAt = [];
    this.gArr = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-arr'})));
    /** Ciudades que crecen con los edificios (solo con zoom). */
    this.gCity = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-city'})));
    /** @type {Map<number, {g:SVGGElement, key:string}>} */ this.cityEls = new Map();
    this.gTok = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-tok'})));
    /** Ejércitos de campaña: estandarte, figuras y número. */
    this.gArmy = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-army'})));
    /** @type {{p:number, i:number, g:SVGGElement}[]} */ this.armyEls = [];
    this.armyKey = '';
    /** Textos que suben (+3, −20 de oro…). */
    this.gFx = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-fx'})));
    /** @type {Map<number, {g:SVGGElement, bg:SVGRectElement, txt:SVGTextElement, castle:SVGPathElement, extra:SVGTextElement, flag:SVGGElement, cloth:SVGPathElement, pill:SVGGElement, bld:SVGGElement, bldBg:SVGCircleElement, bldIcon:SVGPathElement, bldIn:SVGGElement, crown:SVGPathElement, cap:boolean, clothImg:SVGImageElement, img:string, b:string, shine:SVGRectElement, unit:SVGGElement, unitBg:SVGCircleElement, unitIcon:SVGPathElement, u:number}>} */
    this.tokens = new Map();
    /** @type {{from:number, to:number, col:string, path:SVGPathElement, under:SVGPathElement, head:SVGPathElement, t0:number, dur:number}[]} */
    this.arrows = [];
    this.visible = true;
    /** @type {boolean|null} */ this.far = null;
    this.raf = 0;
  }
  /** Geometría actual del mapa (cambia con el escenario de la península). */
  get map() { return this.view.map; }
  /** Fichas para las provincias que juegan. @param {number[]} active */
  build(active) {
    this.gTok.innerHTML = ''; this.tokens.clear();
    for (const p of active) {
      const g = /** @type {SVGGElement} */ (el('g', {class:'tk'}));
      const castle = /** @type {SVGPathElement} */ (el('path', {d:CASTLE, fill:'url(#tkGold)', stroke:'#3D2604', 'stroke-width':.8, transform:'translate(-31 6) scale(.95)', class:'tk-castle'}));
      const bg = /** @type {SVGRectElement} */ (el('rect', {x:-15, y:-9, width:34, height:18, rx:9}));
      const shine = /** @type {SVGRectElement} */ (el('rect', {x:-15, y:-9, width:34, height:18, rx:9, fill:'url(#tkShine)'}));
      const txt = /** @type {SVGTextElement} */ (el('text', {x:4, y:4.6, 'text-anchor':'middle'}));
      const extra = /** @type {SVGTextElement} */ (el('text', {x:18, y:-6, 'text-anchor':'middle', class:'tk-x'}));
      // tipo de tropa dominante: insignia redonda a la izquierda del número
      const unit = /** @type {SVGGElement} */ (el('g', {class:'tk-u', transform:'translate(-14 0)'}));
      const unitBg = /** @type {SVGCircleElement} */ (el('circle', {r:7.4, 'stroke-width':1.2}));
      const unitIcon = /** @type {SVGPathElement} */ (el('path', {fill:'none', 'stroke-width':1.5, 'stroke-linecap':'round', 'stroke-linejoin':'round', transform:'scale(.82)'}));
      unit.append(unitBg, unitIcon);
      // bandera ondeando sobre el castillo de la capital
      const flag = /** @type {SVGGElement} */ (el('g', {class:'tk-flag', transform:'translate(-31 1.5)'}));
      const cloth = /** @type {SVGPathElement} */ (el('path', {d:SWALLOW, stroke:'rgba(0,0,0,.45)', 'stroke-width':.5}));
      // bandera de verdad (si está descargada) recortada a la tela
      const clothImg = /** @type {SVGImageElement} */ (el('image', {x:.6, y:-13, width:12, height:8, preserveAspectRatio:'none'}));
      clothImg.style.display = 'none';
      const clothG = el('g', {class:'cloth'}); clothG.append(cloth, clothImg);
      flag.append(el('path', {d:'M0 0V-13.5', stroke:'#3D2604', 'stroke-width':1.3, 'stroke-linecap':'round'}), clothG);
      const pill = /** @type {SVGGElement} */ (el('g', {class:'tk-pill'}));
      pill.append(bg, shine, txt, unit);
      // edificio de la provincia: insignia redonda abajo a la derecha
      // (el grupo exterior coloca, el interior salta: la animación CSS no pisa la posición)
      const bld = /** @type {SVGGElement} */ (el('g', {transform:'translate(20 7)'}));
      const bldIn = /** @type {SVGGElement} */ (el('g', {class:'tk-b'}));
      const bldIcon = /** @type {SVGPathElement} */ (el('path', {fill:'none', stroke:'#FFE9A8', 'stroke-width':1.5, 'stroke-linecap':'round', 'stroke-linejoin':'round'}));
      const bldBg = /** @type {SVGCircleElement} */ (el('circle', {r:7.6, fill:'url(#tkBld)', stroke:'#F2C94C', 'stroke-width':1.1}));
      bldIn.append(bldBg, bldIcon); bld.appendChild(bldIn);
      bld.style.display = 'none';
      // de lejos, la capital es una coronita sobre el número
      const crown = /** @type {SVGPathElement} */ (el('path', {d:'M-4 1.6h8l1-5-2.6 2L0-4.6-2.4-1.4-5-3.4Z', fill:'url(#tkGold)', stroke:'#3D2604', 'stroke-width':.6, class:'tk-crown', transform:'translate(0 -8.5)'}));
      g.append(flag, castle, pill, bld, crown, extra);
      this.gTok.appendChild(g);
      this.tokens.set(p, {g, bg, txt, castle, extra, flag, cloth, pill, bld, bldIn, bldBg, bldIcon, b:'', shine, unit, unitBg, unitIcon, u:-2, crown, cap:false, clothImg, img:''});
    }
  }
  /**
   * Actualiza números y colores.
   * @param {{owner:number[], troops:(number|null)[], colors:string[], capitals:Set<number>, mine:number, marks?:Map<number, string>, bld?:string[], unit?:number[], flagImg?:string[], merged?:Map<number, number>}} s
   */
  update(s) {
    for (const [p, t] of this.tokens) {
      const f = s.owner[p], col = f >= 0 ? s.colors[f] || '#6B6F7A' : '#6B6F7A', n = s.troops[p];
      t.bg.setAttribute('fill', darken(col, .25));
      t.bg.setAttribute('stroke', f === s.mine ? '#FFD66E' : lighten(col, .35));
      t.bg.setAttribute('stroke-width', f === s.mine ? '2' : '1.2');
      // en una región, de lejos solo se ve la ficha de la sede con el total
      const mg = s.merged?.get(p);
      /** @type {any} */ (t).n = n == null ? '?' : String(n); /** @type {any} */ (t).rt = mg != null && mg >= 0 ? String(mg) : null;
      t.g.classList.toggle('rm', mg === -1); t.g.classList.toggle('rs', mg != null && mg >= 0);
      t.txt.textContent = this.far && /** @type {any} */ (t).rt ? /** @type {any} */ (t).rt : /** @type {any} */ (t).n;
      t.cap = s.capitals.has(p); t.g.classList.toggle('cap', t.cap);
      t.cloth.setAttribute('fill', col);
      const img = s.flagImg?.[p] || '';
      if (img !== t.img) {
        t.img = img; t.clothImg.style.display = img ? '' : 'none';
        if (img) t.clothImg.setAttribute('href', img);
        t.cloth.setAttribute('d', img ? 'M0.6-13h12v8h-12Z' : SWALLOW);
      }
      t.extra.textContent = s.marks?.get(p) || '';
      const b = s.bld?.[p] || '';
      if (b !== t.b) {
        t.b = b; t.bld.style.display = b ? '' : 'none';
        const won = b === 'maravilla';
        t.bldIcon.setAttribute('d', won ? WONDER_ICON : BUILDING_ICON[/** @type {'puerto'} */ (b)] || '');
        t.bldBg.setAttribute('fill', won ? 'url(#tkWon)' : 'url(#tkBld)');
        t.bldBg.setAttribute('stroke', won ? '#FFF1B8' : '#F2C94C');
        t.bldIcon.setAttribute('stroke', won ? '#3A2405' : '#FFE9A8');
      }
      const u = n == null ? -1 : s.unit?.[p] ?? 0;
      if (u !== t.u) {
        t.u = u; t.unit.style.display = u < 0 ? 'none' : '';
        if (u >= 0) {
          const [fill, line, ink] = UNIT_COL[u];
          t.unitBg.setAttribute('fill', fill); t.unitBg.setAttribute('stroke', line);
          t.unitIcon.setAttribute('stroke', ink); t.unitIcon.setAttribute('d', UNIT_ICON[u]);
        }
      }
      t.g.style.display = f < 0 ? 'none' : '';
    }
    this.sync();
  }
  /**
   * Resalta la provincia elegida y sus objetivos.
   * @param {{sel?:number, enemy?:number[], own?:number[]}} h
   */
  highlight(h) {
    this.gMap.innerHTML = '';
    const P = this.map.provinces;
    const add = (/** @type {number} */ p, /** @type {string} */ cls) => this.gMap.appendChild(el('path', {d:P[p].d, class:cls, 'vector-effect':'non-scaling-stroke', 'fill-rule':'evenodd'}));
    for (const p of h.own || []) add(p, 'hl-own');
    for (const p of h.enemy || []) add(p, 'hl-enemy');
    if (h.sel != null && h.sel >= 0) { add(h.sel, 'hl-sel-glow'); add(h.sel, 'hl-sel'); }
    this.sync();
  }
  /**
   * Ciudades: una por provincia, crecen con su categoría y sus edificios. Solo se ven con zoom.
   * @param {{p:number, lvl:number, walls:boolean, church:boolean, tower:boolean, port:boolean, wonder:boolean, extra?:string[], lv?:number[], works?:boolean, siege?:boolean, mill?:boolean, smoke?:boolean}[]} list
   */
  cities(list) {
    const seen = new Set();
    for (const c of list) {
      seen.add(c.p);
      const key = [c.lvl, c.walls, c.church, c.tower, c.port, c.wonder, c.works, c.siege, c.mill, c.smoke, ...(c.extra || []), ...(c.lv || [])].join();
      let e = this.cityEls.get(c.p);
      if (!e) { e = {g:/** @type {SVGGElement} */ (el('g', {class:'city'})), key:''}; this.gCity.appendChild(e.g); this.cityEls.set(c.p, e); }
      if (e.key !== key) {
        const grew = e.key !== '';
        e.key = key; e.g.innerHTML = `<g class="city-in">${cityMarkup({...c, seed:c.p})}</g>`;
        if (grew) { const i = /** @type {SVGGElement} */ (e.g.firstChild); i.classList.add('grow'); }
      }
    }
    for (const [p, e] of this.cityEls) if (!seen.has(p)) { e.g.remove(); this.cityEls.delete(p); }
    this.sync();
  }
  /**
   * Catástrofes y efectos sobre provincias: riada, sequía, incendio, terremoto, nevada y bloqueo.
   * @param {{p:number, kind:string}[]} list
   */
  catastrophes(list) {
    const key = list.map(x => x.kind + x.p).join();
    if (key === this.catKey) return;
    this.catKey = key; this.gCat.innerHTML = '';
    const P = this.map.provinces;
    const fill = /** @type {Record<string, string>} */ ({riada:'url(#catRiada)', sequia:'url(#catSequia)', incendio:'url(#catFuego)', terremoto:'url(#catSismo)', nevada:'url(#catNieve)', bloqueo:'none'});
    for (const x of list) {
      if (!(x.kind in fill) || !P[x.p]) continue;
      const g = el('g', {class:'cat cat-' + x.kind});
      g.append(el('path', {d:P[x.p].d, class:'cat-tint', 'fill-rule':'evenodd'}), el('path', {d:P[x.p].d, fill:fill[x.kind], class:'cat-pat', 'fill-rule':'evenodd'}), el('path', {d:P[x.p].d, class:'cat-edge', fill:'none', 'vector-effect':'non-scaling-stroke'}));
      this.gCat.appendChild(g);
    }
    this.sync();
  }
  /**
   * Choque de batalla en un punto de la pantalla: dos espadas que chocan, onda y chispas.
   * @param {number} x @param {number} y @param {string} ca @param {string} cd
   */
  clash(x, y, ca, cd) {
    const g = /** @type {SVGGElement} */ (el('g', {class:'clash', transform:`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(1.35)`}));
    const blade = 'M0 4V-20l2-3 2 3V4 M-4 4h12 M2 4v6';
    const ring = /** @type {SVGCircleElement} */ (el('circle', {r:4, fill:'none', stroke:'#FFE9A8', 'stroke-width':3}));
    const sA = /** @type {SVGGElement} */ (el('g')), sD = /** @type {SVGGElement} */ (el('g'));
    sA.innerHTML = `<path d="${blade}" fill="none" stroke="#2A1A08" stroke-width="5" stroke-linecap="round" transform="translate(-2 0)"/><path d="${blade}" fill="none" stroke="${lighten(ca, .5)}" stroke-width="2.4" stroke-linecap="round" transform="translate(-2 0)"/>`;
    sD.innerHTML = `<path d="${blade}" fill="none" stroke="#2A1A08" stroke-width="5" stroke-linecap="round" transform="translate(-2 0)"/><path d="${blade}" fill="none" stroke="${lighten(cd, .5)}" stroke-width="2.4" stroke-linecap="round" transform="translate(-2 0)"/>`;
    const sparks = /** @type {SVGGElement} */ (el('g', {stroke:'#FFD66E', 'stroke-width':2, 'stroke-linecap':'round'}));
    const dirs = Array.from({length:12}, (_, i) => (i / 12) * Math.PI * 2 + (i % 2) * .2);
    sparks.innerHTML = dirs.map(() => '<line/>').join('');
    g.append(ring, sA, sD, sparks);
    this.gFx.appendChild(g);
    const t0 = performance.now(), dur = 900;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur), hit = Math.min(1, k / .3), e = 1 - (1 - hit) ** 3;
      sA.setAttribute('transform', `translate(${(-26 * (1 - e)).toFixed(1)} 6) rotate(${(-75 + 40 * e).toFixed(1)})`);
      sD.setAttribute('transform', `translate(${(26 * (1 - e)).toFixed(1)} 6) rotate(${(75 - 40 * e).toFixed(1)}) scale(-1 1)`);
      const after = Math.max(0, (k - .3) / .7);
      ring.setAttribute('r', (4 + 46 * after).toFixed(1)); ring.style.opacity = String(k < .3 ? 0 : 1 - after);
      sparks.style.opacity = String(k < .3 ? 0 : 1 - after);
      sparks.querySelectorAll('line').forEach((l, i) => {
        const a = dirs[i], r0 = 6 + 26 * after, r1 = r0 + 7 * (1 - after);
        l.setAttribute('x1', (Math.cos(a) * r0).toFixed(1)); l.setAttribute('y1', (Math.sin(a) * r0).toFixed(1));
        l.setAttribute('x2', (Math.cos(a) * r1).toFixed(1)); l.setAttribute('y2', (Math.sin(a) * r1).toFixed(1));
      });
      g.style.opacity = String(k > .8 ? (1 - k) / .2 : 1);
      if (k < 1) requestAnimationFrame(step); else g.remove();
    };
    requestAnimationFrame(step);
  }
  /** Contornos de las regiones. @param {{d:string, mine:boolean}[]} list */
  regions(list) {
    this.gReg.innerHTML = '';
    for (const x of list) this.gReg.appendChild(el('path', {d:x.d, class:x.mine ? 'reg mine' : 'reg', 'vector-effect':'non-scaling-stroke'}));
    this.sync();
  }
  /**
   * Ejércitos de campaña en el mapa.
   * @param {{id:number, p:number, u:number[], col:string, mine:boolean, name:string, moving:boolean}[]} list
   */
  armies(list) {
    const key = list.map(a => [a.id, a.p, a.u.join('.'), a.moving].join(':')).join('|');
    if (key === this.armyKey) { this.sync(); return; }
    this.armyKey = key; this.gArmy.innerHTML = ''; this.armyEls = [];
    const per = new Map();
    for (const a of list) {
      const i = per.get(a.p) || 0; per.set(a.p, i + 1);
      const n = a.u[0] + a.u[1] + a.u[2] + a.u[3];
      const g = /** @type {SVGGElement} */ (el('g', {class:'army-tk' + (a.mine ? ' mine' : '') + (a.moving ? ' moving' : '')}));
      g.innerHTML = `<ellipse cx="6" cy="1" rx="15" ry="3.5" fill="rgba(0,0,0,.35)"/><g class="sq">${squad(a.u, a.col, 4)}</g>
        <path d="M-8 2V-26" stroke="#2B1A0C" stroke-width="1.4"/><path class="cloth" d="M-8-26h11l-2.6 3.4 2.6 3.4h-11Z" fill="${a.col}" stroke="#2B1A0C" stroke-width=".6"/>
        <g transform="translate(-8 6)"><rect x="-9" y="-6" width="18" height="12" rx="6" fill="#1B1410" stroke="${a.mine ? '#FFD66E' : a.col}" stroke-width="1.4"/><text y="3.6" text-anchor="middle">${n}</text></g>`;
      this.gArmy.appendChild(g);
      this.armyEls.push({p:a.p, i, g});
    }
    this.sync();
  }
  /** Frentes de guerra: fronteras entre tú y tus enemigos, en rojo. @param {string[]} paths */
  fronts(paths) {
    this.gFront.innerHTML = '';
    for (const d of paths) {
      this.gFront.appendChild(el('path', {d, class:'front-glow', 'vector-effect':'non-scaling-stroke'}));
      this.gFront.appendChild(el('path', {d, class:'front', 'vector-effect':'non-scaling-stroke'}));
    }
    this.sync();
  }
  /** Humo y brasas donde hubo batalla. @param {number[]} ps */
  smoke(ps) {
    this.smokeAt = ps.slice(0, 10); this.gSmoke.innerHTML = '';
    for (const p of this.smokeAt) {
      const g = el('g', {class:'smoke', 'data-p':p});
      g.innerHTML = '<circle r="5"/><circle r="5"/><circle r="5"/><circle class="ember" r="1.8" cx="-4" cy="2"/><circle class="ember" r="1.4" cx="5" cy="1"/>';
      this.gSmoke.appendChild(g);
    }
    this.sync();
  }
  /** Punto de anclaje de la ficha de una provincia (pantalla). @param {number} p */
  anchor(p) { const l = this.map.provinces[p].label; return this.view.toScreen(l[0], l[1]); }
  /**
   * Flecha curva de una provincia a otra.
   * @param {number} from @param {number} to @param {string} col @param {{dur?:number, keep?:boolean}} [o]
   * @returns {Promise<void>}
   */
  arrow(from, to, col, o = {}) {
    const under = /** @type {SVGPathElement} */ (el('path', {class:'arr-under'}));
    const path = /** @type {SVGPathElement} */ (el('path', {class:'arr', stroke:col}));
    const head = /** @type {SVGPathElement} */ (el('path', {class:'arr-head', fill:col}));
    this.gArr.append(under, path, head);
    const a = {from, to, col, path, under, head, t0:performance.now(), dur:o.dur || 900};
    this.arrows.push(a);
    this.sync(); this.tick();
    if (o.keep) return Promise.resolve();
    return new Promise(res => setTimeout(() => { this.drop(a); res(); }, a.dur));
  }
  clearArrows() { for (const a of [...this.arrows]) this.drop(a); }
  /** La ficha de una provincia da un salto (al reclutar, construir…). @param {number} p */
  pop(p) {
    const t = this.tokens.get(p); if (!t) return;
    t.pill.classList.remove('pop'); t.bldIn.classList.remove('pop'); void t.pill.getBoundingClientRect();
    t.pill.classList.add('pop'); if (t.b) t.bldIn.classList.add('pop');
  }
  /**
   * Texto que sube desde la ficha y se desvanece.
   * @param {number} p @param {string} text @param {'gain'|'cost'|'loss'|'info'} kind @param {number} [delay]
   */
  float(p, text, kind, delay = 0) {
    const t = /** @type {SVGTextElement} */ (el('text', {class:'fx-float ' + kind, 'text-anchor':'middle'}));
    t.textContent = text; t.style.opacity = '0';
    this.gFx.appendChild(t);
    const t0 = performance.now() + delay, dur = 1300;
    const step = () => {
      const k = (performance.now() - t0) / dur;
      if (k < 0) { requestAnimationFrame(step); return; }
      const [x, y] = this.anchor(p), e = 1 - (1 - Math.min(1, k)) ** 3;
      t.setAttribute('x', x.toFixed(1)); t.setAttribute('y', (y - 12 - 34 * e).toFixed(1));
      t.style.opacity = String(k < .15 ? k / .15 : k > .7 ? Math.max(0, (1 - k) / .3) : 1);
      if (k < 1) requestAnimationFrame(step); else t.remove();
    };
    requestAnimationFrame(step);
  }
  /**
   * Una ficha con n tropas que viaja por la curva de la flecha (mover o atacar).
   * @param {number} from @param {number} to @param {string} col @param {number} n @param {number} dur @param {number} [stop] fracción del camino (0,5 para quedarse en la frontera)
   * @returns {Promise<void>}
   */
  march(from, to, col, n, dur, stop = 1) {
    const g = /** @type {SVGGElement} */ (el('g', {class:'tk march'}));
    const bg = el('rect', {x:-13, y:-8, width:26, height:16, rx:8, fill:darken(col, .2), stroke:lighten(col, .45), 'stroke-width':1.2});
    const t = el('text', {y:4.2, 'text-anchor':'middle'}); t.textContent = String(n);
    g.append(bg, el('rect', {x:-13, y:-8, width:26, height:16, rx:8, fill:'url(#tkShine)'}), t);
    this.gArr.appendChild(g);
    const t0 = performance.now();
    return new Promise(res => {
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / Math.max(1, dur)), e = (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2) * stop;
        const [x0, y0] = this.anchor(from), [x1, y1] = this.anchor(to);
        const cx = (x0 + x1) / 2 - (y1 - y0) * .22, cy = (y0 + y1) / 2 + (x1 - x0) * .22;
        const x = (1 - e) ** 2 * x0 + 2 * (1 - e) * e * cx + e * e * x1, y = (1 - e) ** 2 * y0 + 2 * (1 - e) * e * cy + e * e * y1;
        g.setAttribute('transform', `translate(${x.toFixed(1)} ${(y + 4).toFixed(1)})`);
        g.style.opacity = String(k > .85 ? (1 - k) / .15 : 1);
        if (k < 1) requestAnimationFrame(step); else { g.remove(); res(); }
      };
      step();
    });
  }
  /** @param {any} a */
  drop(a) { a.path.remove(); a.under.remove(); a.head.remove(); this.arrows = this.arrows.filter(x => x !== a); }
  /** Las flechas crecen al aparecer. */
  tick() {
    if (this.raf) return;
    const step = () => { this.raf = 0; this.sync(); if (this.arrows.some(a => performance.now() - a.t0 < 320)) this.raf = requestAnimationFrame(step); };
    this.raf = requestAnimationFrame(step);
  }
  /** Recoloca todo según la cámara. */
  sync() {
    const v = this.view, c = v.cam, f = v.free();
    const ox = f.x + f.w / 2 - c.x * c.s, oy = f.y + f.h / 2 - c.y * c.s;
    this.gMap.setAttribute('transform', `matrix(${c.s},0,0,${c.s},${ox},${oy})`);
    this.gFront.setAttribute('transform', `matrix(${c.s},0,0,${c.s},${ox},${oy})`);
    this.gReg.setAttribute('transform', `matrix(${c.s},0,0,${c.s},${ox},${oy})`);
    {
      const ka = Math.max(.75, Math.min(1.15, .5 + .3 * c.s / v.fitScale()));
      for (const a of this.armyEls) {
        const [x, y] = this.anchor(a.p);
        a.g.setAttribute('transform', `translate(${(x + 30 + a.i * 22).toFixed(1)} ${(y - 2).toFixed(1)}) scale(${ka.toFixed(3)})`);
      }
    }
    this.gCat.setAttribute('transform', `matrix(${c.s},0,0,${c.s},${ox},${oy})`);
    for (const [p, e] of this.cityEls) {
      const pr = this.map.provinces[p], room = pr.room * c.s;
      const tk = this.tokens.get(p), z = c.s / v.fitScale(), on = z >= 2.4 && room >= 22 && !!tk && tk.g.style.display !== 'none';
      e.g.classList.toggle('on', on);
      if (!on) continue;
      const [x, y] = v.toScreen(pr.label[0], pr.label[1] + pr.room * .62), kc = Math.max(.8, Math.min(1.6, .6 + .2 * z));
      e.g.setAttribute('transform', `translate(${x.toFixed(1)} ${(y + 6).toFixed(1)}) scale(${kc.toFixed(3)})`);
    }
    this.gSmoke.querySelectorAll('g').forEach(g => { const [x, y] = this.anchor(+(g.getAttribute('data-p') || 0)); g.setAttribute('transform', `translate(${(x + 16).toFixed(1)} ${(y - 6).toFixed(1)})`); });
    const k = Math.max(.9, Math.min(1.25, .6 + .35 * c.s / v.fitScale()));
    const far = c.s / v.fitScale() < 1.6;
    if (far !== this.far) {
      // de lejos: solo un número pequeño (y una corona en las capitales); de cerca: tipo de tropa, edificio y castillo
      this.far = far; this.gTok.classList.toggle('far', far);
      for (const t of this.tokens.values()) {
        for (const r of [t.bg, t.shine]) {
          r.setAttribute('x', far ? '-11' : '-14'); r.setAttribute('width', far ? '22' : '32');
          r.setAttribute('y', far ? '-7' : '-8'); r.setAttribute('height', far ? '14' : '16'); r.setAttribute('rx', far ? '7' : '8');
        }
        t.txt.setAttribute('x', far ? '0' : '4'); t.txt.setAttribute('y', far ? '3.5' : '4');
        t.unit.setAttribute('transform', 'translate(-12 0) scale(.86)');
        t.castle.setAttribute('transform', 'translate(-27 5) scale(.82)'); t.flag.setAttribute('transform', 'translate(-27 1) scale(.9)');
        t.bld.setAttribute('transform', 'translate(20 7) scale(.86)'); t.extra.setAttribute('x', far ? '11' : '17');
        const tt = /** @type {any} */ (t); if (tt.n != null) t.txt.textContent = far && tt.rt ? tt.rt : tt.n;
      }
    }
    for (const [p, t] of this.tokens) {
      if (t.g.style.display === 'none') continue;
      const [x, y] = this.anchor(p);
      t.g.setAttribute('transform', `translate(${x.toFixed(1)} ${(y + 4).toFixed(1)}) scale(${k.toFixed(3)})`);
    }
    for (const a of this.arrows) {
      const [x0, y0] = this.anchor(a.from), [x1r, y1r] = this.anchor(a.to);
      const grow = Math.min(1, (performance.now() - a.t0) / 300);
      const x1 = x0 + (x1r - x0) * grow, y1 = y0 + (y1r - y0) * grow;
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
      const cx = (x0 + x1) / 2 - dy * .22, cy = (y0 + y1) / 2 + dx * .22;
      // termina un poco antes del centro para que se vea la punta
      const tx = 2 * (x1 - cx), ty = 2 * (y1 - cy), tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
      const ex = x1 - ux * 9, ey = y1 - uy * 9;
      const d = `M${x0.toFixed(1)} ${y0.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      a.path.setAttribute('d', d); a.under.setAttribute('d', d);
      const hx = x1, hy = y1, w = 7;
      a.head.setAttribute('d', `M${hx.toFixed(1)} ${hy.toFixed(1)}L${(ex - uy * w).toFixed(1)} ${(ey + ux * w).toFixed(1)}L${(ex + uy * w).toFixed(1)} ${(ey - ux * w).toFixed(1)}Z`);
      void len;
    }
  }
  /** @param {boolean} v */
  show(v) { this.visible = v; this.svg.style.display = v ? '' : 'none'; }
}

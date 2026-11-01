// @ts-check
// Capa SVG sobre el mapa: fichas de ejército con su número, castillos en las capitales, resaltes de la provincia
// elegida y de sus objetivos, y flechas de ataque curvas y animadas. Se recoloca en cada fotograma de la cámara
// (fichas y flechas en píxeles de pantalla: siempre nítidas y del mismo tamaño).
import {lighten, darken} from '../art.js';

const NS = 'http://www.w3.org/2000/svg';
/** @param {string} tag @param {Record<string, string|number>} [attrs] */
function el(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); return e; }
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
};

export class Overlay {
  /** @param {SVGSVGElement} svg @param {import('../map/render.js').MapView} view */
  constructor(svg, view) {
    this.svg = svg; this.view = view;
    svg.innerHTML = '';
    svg.appendChild(el('defs')).innerHTML = `
      <linearGradient id="tkShine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
      <linearGradient id="tkGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1B8"/><stop offset=".5" stop-color="#F2C94C"/><stop offset="1" stop-color="#9A6A10"/></linearGradient>
      <radialGradient id="tkBld" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#5A4520"/><stop offset="1" stop-color="#1E1608"/></radialGradient>`;
    this.gFront = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-front'})));
    this.gMap = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-map'})));
    this.gSmoke = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-smoke'})));
    /** @type {number[]} */ this.smokeAt = [];
    this.gArr = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-arr'})));
    this.gTok = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-tok'})));
    /** Textos que suben (+3, −20 de oro…). */
    this.gFx = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-fx'})));
    /** @type {Map<number, {g:SVGGElement, bg:SVGRectElement, txt:SVGTextElement, castle:SVGPathElement, extra:SVGTextElement, flag:SVGGElement, cloth:SVGPathElement, pill:SVGGElement, bld:SVGGElement, bldIcon:SVGPathElement, b:string}>} */
    this.tokens = new Map();
    /** @type {{from:number, to:number, col:string, path:SVGPathElement, under:SVGPathElement, head:SVGPathElement, t0:number, dur:number}[]} */
    this.arrows = [];
    this.visible = true;
    this.raf = 0;
  }
  /** Geometría actual del mapa (cambia con el escenario de la península). */
  get map() { return this.view.map; }
  /** Fichas para las provincias que juegan. @param {number[]} active */
  build(active) {
    this.gTok.innerHTML = ''; this.tokens.clear();
    for (const p of active) {
      const g = /** @type {SVGGElement} */ (el('g', {class:'tk'}));
      const castle = /** @type {SVGPathElement} */ (el('path', {d:CASTLE, fill:'url(#tkGold)', stroke:'#3D2604', 'stroke-width':.8, transform:'translate(-23 6) scale(.95)', class:'tk-castle'}));
      const bg = /** @type {SVGRectElement} */ (el('rect', {x:-15, y:-9, width:30, height:18, rx:9}));
      const shine = el('rect', {x:-15, y:-9, width:30, height:18, rx:9, fill:'url(#tkShine)'});
      const txt = /** @type {SVGTextElement} */ (el('text', {y:4.6, 'text-anchor':'middle'}));
      const extra = /** @type {SVGTextElement} */ (el('text', {x:14, y:-6, 'text-anchor':'middle', class:'tk-x'}));
      // bandera ondeando sobre el castillo de la capital
      const flag = /** @type {SVGGElement} */ (el('g', {class:'tk-flag', transform:'translate(-23 1.5)'}));
      const cloth = /** @type {SVGPathElement} */ (el('path', {d:'M0.6-11h8.6l-2 2.8 2 2.8H0.6Z', class:'cloth', stroke:'rgba(0,0,0,.45)', 'stroke-width':.5}));
      flag.append(el('path', {d:'M0 0V-11.5', stroke:'#3D2604', 'stroke-width':1.3, 'stroke-linecap':'round'}), cloth);
      const pill = /** @type {SVGGElement} */ (el('g', {class:'tk-pill'}));
      pill.append(bg, shine, txt);
      // edificio de la provincia: insignia redonda abajo a la derecha
      const bld = /** @type {SVGGElement} */ (el('g', {class:'tk-b', transform:'translate(17 8)'}));
      const bldIcon = /** @type {SVGPathElement} */ (el('path', {fill:'none', stroke:'#FFE9A8', 'stroke-width':1.5, 'stroke-linecap':'round', 'stroke-linejoin':'round'}));
      bld.append(el('circle', {r:7.6, fill:'url(#tkBld)', stroke:'#F2C94C', 'stroke-width':1.1}), bldIcon);
      bld.style.display = 'none';
      g.append(flag, castle, pill, bld, extra);
      this.gTok.appendChild(g);
      this.tokens.set(p, {g, bg, txt, castle, extra, flag, cloth, pill, bld, bldIcon, b:''});
    }
  }
  /**
   * Actualiza números y colores.
   * @param {{owner:number[], troops:(number|null)[], colors:string[], capitals:Set<number>, mine:number, marks?:Map<number, string>, bld?:string[]}} s
   */
  update(s) {
    for (const [p, t] of this.tokens) {
      const f = s.owner[p], col = f >= 0 ? s.colors[f] || '#6B6F7A' : '#6B6F7A', n = s.troops[p];
      t.bg.setAttribute('fill', darken(col, .25));
      t.bg.setAttribute('stroke', f === s.mine ? '#FFD66E' : lighten(col, .35));
      t.bg.setAttribute('stroke-width', f === s.mine ? '2' : '1.2');
      t.txt.textContent = n == null ? '?' : String(n);
      t.castle.style.display = t.flag.style.display = s.capitals.has(p) ? '' : 'none';
      t.cloth.setAttribute('fill', col);
      t.extra.textContent = s.marks?.get(p) || '';
      const b = s.bld?.[p] || '';
      if (b !== t.b) {
        t.b = b; t.bld.style.display = b ? '' : 'none';
        t.bldIcon.setAttribute('d', BUILDING_ICON[/** @type {'puerto'} */ (b)] || '');
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
    t.pill.classList.remove('pop'); t.bld.classList.remove('pop'); void t.pill.getBoundingClientRect();
    t.pill.classList.add('pop'); if (t.b) t.bld.classList.add('pop');
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
    this.gSmoke.querySelectorAll('g').forEach(g => { const [x, y] = this.anchor(+(g.getAttribute('data-p') || 0)); g.setAttribute('transform', `translate(${(x + 16).toFixed(1)} ${(y - 6).toFixed(1)})`); });
    const k = Math.max(.8, Math.min(1.35, .55 + .45 * c.s / v.fitScale()));
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

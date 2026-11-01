// @ts-check
// Capa SVG sobre el mapa: fichas de ejército con su número, castillos en las capitales, resaltes de la provincia
// elegida y de sus objetivos, y flechas de ataque curvas y animadas. Se recoloca en cada fotograma de la cámara
// (fichas y flechas en píxeles de pantalla: siempre nítidas y del mismo tamaño).
import {lighten, darken} from '../art.js';

const NS = 'http://www.w3.org/2000/svg';
/** @param {string} tag @param {Record<string, string|number>} [attrs] */
function el(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); return e; }
const CASTLE = 'M-7 3V-5h2.4v2h1.8v-2h2.8v2h1.8v-2H7V3Z M-2 3V0a2 2 0 0 1 4 0v3Z';

export class Overlay {
  /** @param {SVGSVGElement} svg @param {import('../map/render.js').MapView} view */
  constructor(svg, view) {
    this.svg = svg; this.view = view;
    svg.innerHTML = '';
    svg.appendChild(el('defs')).innerHTML = `
      <linearGradient id="tkShine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
      <linearGradient id="tkGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1B8"/><stop offset=".5" stop-color="#F2C94C"/><stop offset="1" stop-color="#9A6A10"/></linearGradient>`;
    this.gFront = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-front'})));
    this.gMap = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-map'})));
    this.gSmoke = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-smoke'})));
    /** @type {number[]} */ this.smokeAt = [];
    this.gArr = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-arr'})));
    this.gTok = /** @type {SVGGElement} */ (svg.appendChild(el('g', {class:'ov-tok'})));
    /** @type {Map<number, {g:SVGGElement, bg:SVGRectElement, txt:SVGTextElement, castle:SVGPathElement, extra:SVGTextElement, flag:SVGGElement, cloth:SVGPathElement}>} */
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
      const castle = /** @type {SVGPathElement} */ (el('path', {d:CASTLE, fill:'url(#tkGold)', stroke:'#3D2604', 'stroke-width':.8, transform:'translate(-23 0.5) scale(.95)', class:'tk-castle'}));
      const bg = /** @type {SVGRectElement} */ (el('rect', {x:-15, y:-9, width:30, height:18, rx:9}));
      const shine = el('rect', {x:-15, y:-9, width:30, height:18, rx:9, fill:'url(#tkShine)'});
      const txt = /** @type {SVGTextElement} */ (el('text', {y:4.6, 'text-anchor':'middle'}));
      const extra = /** @type {SVGTextElement} */ (el('text', {x:14, y:-6, 'text-anchor':'middle', class:'tk-x'}));
      // bandera ondeando sobre el castillo de la capital
      const flag = /** @type {SVGGElement} */ (el('g', {class:'tk-flag', transform:'translate(-23 -4)'}));
      const cloth = /** @type {SVGPathElement} */ (el('path', {d:'M0.6-13.5h9.4l-2.2 3 2.2 3H0.6Z', class:'cloth', stroke:'rgba(0,0,0,.45)', 'stroke-width':.5}));
      flag.append(el('path', {d:'M0 0V-14', stroke:'#3D2604', 'stroke-width':1.3, 'stroke-linecap':'round'}), cloth);
      g.append(flag, castle, bg, shine, txt, extra);
      this.gTok.appendChild(g);
      this.tokens.set(p, {g, bg, txt, castle, extra, flag, cloth});
    }
  }
  /**
   * Actualiza números y colores.
   * @param {{owner:number[], troops:(number|null)[], colors:string[], capitals:Set<number>, mine:number, marks?:Map<number, string>}} s
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

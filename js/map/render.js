// @ts-check
// Mapa en canvas. El mapa completo (degradados, bordes, brillos y textura) se pinta en una imagen grande en
// memoria solo cuando cambia de dueño una provincia; en cada fotograma se copia con la cámara aplicada
// y encima se dibujan en vectorial las provincias en disputa, la onda de conquista y los nombres.
import {lighten, darken, alpha, desaturate, mix} from '../art.js';

/** @typedef {{i:number, name:string, plate:string, d:string, c:number[], label:number[], room:number, bbox:number[], area:number, adj:number[]}} Province */
/** @typedef {{w:number, h:number, provinces:Province[], borders:Record<string,string>, outer:string[], land:string, neutral:string}} MapData */
/** @typedef {{x:number, y:number, s:number}} Cam */

const ease = (/** @type {number} */ t) => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeOut = (/** @type {number} */ t) => 1 - (1 - t) ** 3;
const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => Math.max(a, Math.min(b, v));
/** Margen (unidades del mapa) que la imagen en memoria pinta alrededor: tierra vecina sin cortes al moverse. */
const M = 200;

/** Puntos de un path de d3 (M x,y L x,y … Z). @param {string} d */
export function pathPoints(d) {
  const out = [];
  for (const m of d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) out.push([+m[1], +m[2]]);
  return out;
}
/** Clave de la frontera entre dos provincias. @param {number} a @param {number} b */
export const borderKey = (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`;

/** Textura de ruido fino (una vez). */
function noiseTile() {
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), img = x.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) { const v = 110 + Math.random() * 145; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  return c;
}

export class MapView {
  /** @param {HTMLCanvasElement} canvas @param {MapData} map @param {string[]} colors color de cada bando */
  constructor(canvas, map, colors) {
    this.canvas = canvas;
    this.ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    this.map = map;
    this.colors = colors;
    this.paths = map.provinces.map(p => new Path2D(p.d));
    /** @type {Map<string, Path2D>} */
    this.borderPaths = new Map(Object.entries(map.borders).map(([k, d]) => [k, new Path2D(d)]));
    this.outerPaths = map.outer.map(d => new Path2D(d));
    this.land = new Path2D(map.land);
    this.neutral = new Path2D(map.neutral);
    this.owner = map.provinces.map(p => p.i);
    /** @type {boolean[]} */
    this.dead = map.provinces.map(() => false);
    const xs = map.provinces.flatMap(p => [p.bbox[0], p.bbox[2]]), ys = map.provinces.flatMap(p => [p.bbox[1], p.bbox[3]]);
    this.bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    this.insets = {top:0, bottom:0, left:0, right:0};
    this.W = innerWidth; this.H = innerHeight;
    /** @type {Cam} */ this.cam = {x:map.w / 2, y:map.h / 2, s:.4};
    /** @type {{from:Cam, to:Cam, t0:number, dur:number}|null} */ this.tween = null;
    this.dim = 0; this.dimTo = 0; this.dimT0 = 0; this.dimFrom = 0; this.dimDur = 400;
    /** @type {Set<number>} */ this.active = new Set();
    /** @type {string[]} fronteras en disputa */ this.hot = [];
    /** @type {number} provincia resaltada por la ruleta del mapa */ this.hop = -1;
    /** @type {Set<number>} candidatas */ this.cands = new Set();
    /** @type {{p:number, from:string, to:string, ox:number, oy:number, t0:number, dur:number, gray:boolean}|null} */ this.wave = null;
    this.labels = true;
    this.contrast = false;
    this.theme = 'marina';
    this.dpr = Math.min(3, devicePixelRatio || 1);
    /** Baja la resolución (nunca de 2x) si el móvil no llega a 60 fps. */
    this.adaptive = true;
    this.raf = 0; this.dirty = true;
    this.noise = noiseTile();
    /** @type {HTMLCanvasElement|null} */ this.cache = null;
    this.cacheK = 1;
    this.frameTimes = /** @type {number[]} */ ([]);
    this.lastFrame = 0;
    /** @type {((ms:number)=>void)|null} */ this.onFrame = null;
    /** Reloj (se sustituye por el de la partida para que la pausa congele el mapa). */
    this.now = () => performance.now();
    /** @param {number} ms @returns {Promise<unknown>} */
    this.wait = ms => new Promise(r => setTimeout(r, ms));
    this.resize();
  }

  /* ---------- Tamaño y cámara ---------- */
  /** @param {boolean} [keepCam] mantener la cámara (cambio de resolución) */
  resize(keepCam = false) {
    const r = this.canvas.getBoundingClientRect();
    this.W = r.width || innerWidth; this.H = r.height || innerHeight;
    this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
    const prev = this.cacheK;
    this.cacheK = Math.min(4096 / (this.map.w + 2 * M), 4096 / (this.map.h + 2 * M), this.fitScale() * this.dpr * 2.2);
    if (!this.cache || Math.abs(prev - this.cacheK) > .01) this.rebuild();
    if (!keepCam && !this.tween && !this.active.size) this.cam = this.overview();
    this.invalidate();
  }
  /** Hueco libre para el mapa (lo que no tapan los paneles). @param {{top?:number, bottom?:number, left?:number, right?:number}} o */
  setInsets(o) { Object.assign(this.insets, o); }
  free() {
    const {top, bottom, left, right} = this.insets;
    return {x:left, y:top, w:Math.max(80, this.W - left - right), h:Math.max(80, this.H - top - bottom)};
  }
  fitScale() {
    const f = this.free(), [x0, y0, x1, y1] = this.bounds;
    return Math.min((f.w - 8) / (x1 - x0), (f.h - 8) / (y1 - y0));
  }
  /** @returns {Cam} */
  overview() {
    const [x0, y0, x1, y1] = this.bounds;
    return {x:(x0 + x1) / 2, y:(y0 + y1) / 2, s:this.fitScale()};
  }
  /** Encuadre de un grupo de provincias, con margen. @param {number[]} ps @param {number} [maxZoom] @returns {Cam} */
  frameOf(ps, maxZoom = 3.4) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of ps) { const b = this.map.provinces[p].bbox; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    const f = this.free(), pad = 34;
    const s = clamp(Math.min((f.w - pad * 2) / (x1 - x0), (f.h - pad * 2) / (y1 - y0)), this.fitScale(), this.fitScale() * maxZoom);
    return {x:(x0 + x1) / 2, y:(y0 + y1) / 2, s};
  }
  /** @param {Cam} to @param {number} dur ms (0 = corte) */
  moveTo(to, dur) {
    if (dur <= 0) { this.cam = {...to}; this.tween = null; }
    else this.tween = {from:{...this.cam}, to:{...to}, t0:this.now(), dur};
    this.invalidate();
    return this.wait(Math.max(0, dur));
  }
  /** Mapa → pantalla (px CSS). @param {number} x @param {number} y */
  toScreen(x, y) {
    const f = this.free(), c = this.cam;
    return [(x - c.x) * c.s + f.x + f.w / 2, (y - c.y) * c.s + f.y + f.h / 2];
  }
  /** Pantalla → mapa. @param {number} sx @param {number} sy */
  toMap(sx, sy) {
    const f = this.free(), c = this.cam;
    return [(sx - f.x - f.w / 2) / c.s + c.x, (sy - f.y - f.h / 2) / c.s + c.y];
  }
  /** Provincia bajo un punto de la pantalla. @param {number} sx @param {number} sy */
  hit(sx, sy) {
    const [x, y] = this.toMap(sx, sy);
    for (let i = 0; i < this.paths.length; i++) if (this.ctx.isPointInPath(this.paths[i], x, y, 'evenodd')) return i;
    return -1;
  }

  /* ---------- Estado visible ---------- */
  /** @param {number[]} owner @param {boolean[]} [dead] bandos eliminados */
  setOwners(owner, dead) {
    this.wave = null;
    const changed = owner.flatMap((o, p) => o !== this.owner[p] ? [p] : []);
    const deadChanged = dead && dead.some((v, i) => v !== this.dead[i]);
    this.owner = [...owner]; if (dead) this.dead = [...dead];
    if (!changed.length && !deadChanged) return;
    if (changed.length) this.rebuild(changed.length <= 4 ? changed : undefined);
    if (deadChanged || changed.length) this.invalidate();
  }
  /** Atenúa el resto del mapa y resalta unas provincias. @param {number[]} ps @param {string[]} [hot] fronteras @param {number} [dur] */
  focus(ps, hot = [], dur = 400) {
    this.active = new Set(ps); this.hot = hot;
    this.dimFrom = this.dimNow(); this.dimTo = ps.length ? 1 : 0; this.dimT0 = this.now(); this.dimDur = dur;
    this.invalidate();
  }
  dimNow() {
    const t = clamp((this.now() - this.dimT0) / this.dimDur, 0, 1);
    return this.dimFrom + (this.dimTo - this.dimFrom) * ease(t);
  }
  /**
   * Onda de color desde la frontera: la provincia pasa al color del conquistador.
   * @param {number} p @param {number} toFaction @param {number[]} origin punto del mapa @param {number} dur @param {boolean} gray el bando derrotado desaparece
   */
  conquer(p, toFaction, origin, dur, gray) {
    const w = this.wave = {p, from:this.colors[this.owner[p]], to:this.colors[toFaction], ox:origin[0], oy:origin[1], t0:this.now(), dur, gray};
    this.invalidate();
    return this.wait(dur).then(() => {
      if (this.wave !== w) return; // se salió de la partida a mitad de la onda
      this.owner[p] = toFaction; this.wave = null; this.rebuild([p]); this.invalidate();
    });
  }
  /** Punto medio de la frontera entre una provincia y un grupo. @param {number} p @param {number[]} from */
  borderMid(p, from) {
    let best = null, len = -1;
    for (const q of from) {
      const d = this.map.borders[borderKey(p, q)]; if (!d) continue;
      const pts = pathPoints(d);
      if (pts.length > len) { len = pts.length; best = pts[Math.floor(pts.length / 2)]; }
    }
    return best || this.map.provinces[p].label;
  }

  /* ---------- Imagen del mapa en memoria ---------- */
  /** Repinta la imagen del mapa. Con `around`, solo la zona de esas provincias y sus vecinas (tras una conquista). @param {number[]} [around] */
  rebuild(around) {
    const k = this.cacheK, m = this.map;
    const W = Math.ceil((m.w + 2 * M) * k), H = Math.ceil((m.h + 2 * M) * k);
    if (around && this.cache && this.cache.width === W && this.cache.height === H) {
      const zone = new Set(around);
      for (const p of around) for (const q of m.provinces[p].adj) zone.add(q);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of around) { const b = m.provinces[p].bbox; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
      const pad = 14 / this.fitScale();
      const r = [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2];
      // todo lo que toca el rectángulo se vuelve a pintar dentro de él
      const hit = new Set();
      for (const p of m.provinces) { const b = p.bbox; if (b[2] >= r[0] && b[0] <= r[0] + r[2] && b[3] >= r[1] && b[1] <= r[1] + r[3]) hit.add(p.i); }
      const x = /** @type {CanvasRenderingContext2D} */ (this.cache.getContext('2d'));
      x.save(); x.setTransform(k, 0, 0, k, M * k, M * k);
      x.beginPath(); x.rect(r[0], r[1], r[2], r[3]); x.clip();
      x.clearRect(r[0], r[1], r[2], r[3]);
      this.paintBase(x, k, hit);
      x.restore();
      this.version = (this.version || 0) + 1; this.dirty = true;
      return;
    }
    const c = this.cache || document.createElement('canvas');
    c.width = W; c.height = H;
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    x.setTransform(k, 0, 0, k, M * k, M * k);
    x.clearRect(-M, -M, m.w + 2 * M, m.h + 2 * M);
    this.paintBase(x, k);
    this.cache = c;
    this.version = (this.version || 0) + 1;
    this.dirty = true;
  }
  /** Colores del tema para el mar y la tierra neutral. */
  pal() {
    return this.theme === 'atlas'
      ? {neutral:'#D9C9A6', neutralEdge:'rgba(90,64,30,.45)', grid:'rgba(90,64,30,.12)', shadow:'rgba(70,45,15,.45)', coast:'rgba(70,110,140,.35)', ink:'#2B1E10', halo:'rgba(250,240,220,.85)', dim:'rgba(236,224,196,.62)', line:'rgba(40,25,10,.7)'}
      : {neutral:'#15233D', neutralEdge:'rgba(140,175,230,.22)', grid:'rgba(120,170,255,.07)', shadow:'rgba(0,0,0,.65)', coast:'rgba(110,190,255,.28)', ink:'#FFFFFF', halo:'rgba(4,10,24,.8)', dim:'rgba(3,8,20,.66)', line:'rgba(6,10,22,.85)'};
  }
  /** Relleno con luz de una provincia: degradado del color del bando según su caja. @param {CanvasRenderingContext2D} x @param {number} p @param {string} col */
  fillProvince(x, p, col) {
    const b = this.map.provinces[p].bbox;
    const g = x.createLinearGradient(b[0], b[1], b[2], b[3]);
    g.addColorStop(0, lighten(col, .16)); g.addColorStop(.55, col); g.addColorStop(1, darken(col, .2));
    x.fillStyle = g; x.fill(this.paths[p], 'evenodd');
  }
  /** Borde interior oscuro fino y bisel de luz. @param {CanvasRenderingContext2D} x @param {number} p @param {string} col @param {number} u unidad (1 px de pantalla en vista general) */
  rimProvince(x, p, col, u) {
    x.save(); x.clip(this.paths[p], 'evenodd');
    x.strokeStyle = alpha(darken(col, .6), .55); x.lineWidth = 2.6 * u; x.stroke(this.paths[p]);
    x.strokeStyle = alpha(lighten(col, .55), .32); x.lineWidth = 5.2 * u; x.globalCompositeOperation = 'source-atop';
    x.translate(-.7 * u, -.9 * u); x.stroke(this.paths[p]);
    x.restore();
  }
  /** Brillo del color del bando en sus fronteras con otros bandos. @param {CanvasRenderingContext2D} x @param {number} p @param {number} u @param {number} [boost] */
  glowProvince(x, p, u, boost = 1) {
    const f = this.owner[p], col = this.colors[f], keys = [];
    for (const q of this.map.provinces[p].adj) if (this.owner[q] !== f) keys.push(borderKey(p, q));
    const outer = this.outerPaths[p];
    x.save(); x.clip(this.paths[p], 'evenodd');
    x.globalCompositeOperation = 'lighter';
    for (const [w, a] of [[9, .07], [4.6, .12], [2, .3]]) {
      x.strokeStyle = alpha(lighten(col, .5), a * boost); x.lineWidth = w * u;
      for (const k of keys) { const bp = this.borderPaths.get(k); if (bp) x.stroke(bp); }
    }
    x.globalCompositeOperation = 'source-over';
    // costa: luz fría muy suave hacia dentro
    x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 3 * u; x.stroke(outer);
    x.restore();
  }
  /** @param {CanvasRenderingContext2D} x @param {number} k */
  /** @param {CanvasRenderingContext2D} x @param {number} k @param {Set<number>} [only] provincias a pintar (repintado parcial) */
  paintBase(x, k, only) {
    const m = this.map, P = this.pal(), u = 1 / this.fitScale();
    const each = (/** @type {(p:number)=>void} */ fn) => { for (let p = 0; p < m.provinces.length; p++) if (!only || only.has(p)) fn(p); };
    // tierra neutral alrededor
    x.save();
    x.fillStyle = P.neutral; x.fill(this.neutral, 'evenodd');
    x.strokeStyle = P.neutralEdge; x.lineWidth = 1.1 * u; x.stroke(this.neutral);
    x.restore();
    // sombra de la península y luz de costa
    x.save();
    x.shadowColor = P.shadow; x.shadowBlur = 26 * u * k; x.shadowOffsetY = 7 * u * k;
    x.fillStyle = '#0A1426'; x.fill(this.land, 'evenodd');
    x.restore();
    x.save(); x.strokeStyle = P.coast; x.lineWidth = 7 * u; x.filter = 'none'; x.stroke(this.land); x.restore();
    // provincias
    each(p => this.fillProvince(x, p, this.provColor(p)));
    // luz general desde arriba a la izquierda y textura
    x.save(); x.clip(this.land, 'evenodd');
    const lg = x.createRadialGradient(m.w * .3, m.h * .15, 0, m.w * .45, m.h * .45, m.w * .8);
    lg.addColorStop(0, 'rgba(255,255,255,.16)'); lg.addColorStop(.5, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(0,0,20,.28)');
    x.fillStyle = lg; x.fillRect(0, 0, m.w, m.h);
    x.globalCompositeOperation = 'overlay'; x.globalAlpha = .1;
    const pat = x.createPattern(this.noise, 'repeat');
    if (pat) { pat.setTransform(new DOMMatrix().scale(1 / k)); x.fillStyle = pat; x.fillRect(0, 0, m.w, m.h); }
    x.restore();
    each(p => this.rimProvince(x, p, this.provColor(p), u));
    each(p => this.glowProvince(x, p, u));
    // líneas de frontera: finas entre provincias del mismo bando, marcadas entre bandos
    x.save(); x.lineJoin = 'round'; x.lineCap = 'round';
    for (const [key, bp] of this.borderPaths) {
      const [a, b] = key.split('-').map(Number), same = this.owner[a] === this.owner[b];
      if (only && !only.has(a) && !only.has(b)) continue;
      x.strokeStyle = same ? alpha(darken(this.provColor(a), .5), .55) : P.line;
      x.lineWidth = (same ? .9 : 1.6) * u * (this.contrast ? 1.6 : 1);
      if (same) x.setLineDash([2.4 * u, 2.2 * u]); else x.setLineDash([]);
      x.stroke(bp);
    }
    x.setLineDash([]);
    // costa: línea clara y nítida
    x.strokeStyle = this.theme === 'atlas' ? 'rgba(60,40,15,.75)' : 'rgba(230,240,255,.55)'; x.lineWidth = 1.1 * u; x.stroke(this.land);
    x.restore();
  }
  /** @param {number} p */
  provColor(p) { const f = this.owner[p]; return this.dead[f] ? desaturate(this.colors[f], .9) : this.colors[f]; }

  /* ---------- Bucle de dibujo ---------- */
  invalidate() { this.dirty = true; if (!this.raf) this.raf = requestAnimationFrame(t => this.frame(t)); }
  /** @param {number} real marca de requestAnimationFrame */
  frame(real) {
    this.raf = 0;
    const now = this.now();
    const animating = this.step(now);
    this.draw(now);
    if (this.lastFrame && animating) this.measure(real - this.lastFrame);
    this.lastFrame = animating ? real : 0;
    if (this.onFrame && this.lastFrame) this.onFrame(real);
    if (animating) this.raf = requestAnimationFrame(t => this.frame(t));
  }
  /** Avanza las animaciones. Devuelve si sigue habiendo movimiento. @param {number} now */
  step(now) {
    let moving = false;
    if (this.tween) {
      const {from, to, t0, dur} = this.tween, t = clamp((now - t0) / dur, 0, 1), e = ease(t);
      // zoom en espacio logarítmico para que acercar y alejar se sientan iguales
      const s = Math.exp(Math.log(from.s) + (Math.log(to.s) - Math.log(from.s)) * e);
      this.cam = {x:from.x + (to.x - from.x) * e, y:from.y + (to.y - from.y) * e, s};
      if (t >= 1) this.tween = null; else moving = true;
    }
    if (now - this.dimT0 < this.dimDur) moving = true;
    if (this.wave || this.hot.length || this.hop >= 0) moving = true;
    return moving;
  }
  /** Adapta la resolución si el dispositivo no llega a 60 fps. @param {number} dt */
  measure(dt) {
    if (!this.adaptive) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 24 && this.dpr > 2) { this.dpr = Math.max(2, this.dpr - .5); this.resize(true); }
  }
  /** @param {number} now */
  draw(now) {
    const x = this.ctx, d = this.dpr, c = this.cam, f = this.free();
    const dim = this.dimNow();
    const still = !this.tween && now - this.dimT0 >= this.dimDur;
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (still) {
      // Cámara quieta: el fondo (mapa, atenuado, provincias activas y nombres) se pinta una vez a tamaño de pantalla
      const key = [c.x, c.y, c.s, dim, [...this.active].join(','), this.labels, this.version, this.canvas.width, this.canvas.height, this.wave ? this.wave.p : -1].join('|');
      if (key !== this.snapKey) {
        const sn = this.snap || (this.snap = document.createElement('canvas'));
        if (sn.width !== this.canvas.width || sn.height !== this.canvas.height) { sn.width = this.canvas.width; sn.height = this.canvas.height; }
        this.renderStatic(/** @type {CanvasRenderingContext2D} */ (sn.getContext('2d')), dim, d);
        this.snapKey = key;
      }
      x.clearRect(0, 0, this.canvas.width, this.canvas.height);
      x.drawImage(/** @type {HTMLCanvasElement} */ (this.snap), 0, 0);
    } else {
      // Cámara en movimiento: se pinta a menos resolución y se escala (el movimiento lo disimula)
      const ld = Math.min(d, 1.5), lo = this.lo || (this.lo = document.createElement('canvas'));
      const lw = Math.round(this.W * ld), lh = Math.round(this.H * ld);
      if (lo.width !== lw || lo.height !== lh) { lo.width = lw; lo.height = lh; }
      this.renderStatic(/** @type {CanvasRenderingContext2D} */ (lo.getContext('2d')), dim, ld);
      x.clearRect(0, 0, this.canvas.width, this.canvas.height);
      x.imageSmoothingQuality = 'low';
      x.drawImage(lo, 0, 0, this.canvas.width, this.canvas.height);
      this.snapKey = '';
    }
    const ox = f.x + f.w / 2 - c.x * c.s, oy = f.y + f.h / 2 - c.y * c.s;
    x.setTransform(d * c.s, 0, 0, d * c.s, d * ox, d * oy);
    const u = 1 / c.s; // un píxel de pantalla en unidades del mapa
    if (this.wave) { x.save(); x.globalAlpha = dim > .001 && !this.active.has(this.wave.p) ? 1 - dim * .6 : 1; this.drawWave(x, now, u); x.restore(); }
    // candidatas y resalte de la ruleta del mapa
    if (this.cands.size) {
      const pulse = .5 + .5 * Math.sin(now / 160);
      x.save(); x.lineJoin = 'round';
      for (const p of this.cands) { x.strokeStyle = `rgba(255,255,255,${.45 + pulse * .35})`; x.lineWidth = 2 * u; x.setLineDash([6 * u, 4 * u]); x.lineDashOffset = -now / 40 * u; x.stroke(this.paths[p]); }
      x.restore();
    }
    if (this.hop >= 0) {
      x.save(); x.lineJoin = 'round';
      const hp = this.paths[this.hop];
      x.fillStyle = 'rgba(255,255,255,.3)'; x.fill(hp, 'evenodd');
      x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 12 * u; x.stroke(hp);
      x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 6 * u; x.stroke(hp);
      x.strokeStyle = '#FFFFFF'; x.lineWidth = 2.6 * u; x.stroke(hp);
      x.restore();
    }
    // frontera en disputa: brillo que late
    if (this.hot.length) {
      const pulse = .55 + .45 * Math.sin(now / 130);
      x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
      for (const k of this.hot) {
        const bp = this.borderPaths.get(k); if (!bp) continue;
        x.strokeStyle = `rgba(255,214,120,${.25 * pulse})`; x.lineWidth = 12 * u; x.stroke(bp);
        x.strokeStyle = `rgba(255,236,190,${.55 + .35 * pulse})`; x.lineWidth = 4 * u; x.stroke(bp);
        x.strokeStyle = '#FFFFFF'; x.lineWidth = 1.4 * u; x.stroke(bp);
      }
      x.restore();
    }
    this.dirty = false;
  }
  /** Fondo: retícula, mapa en memoria, atenuado, provincias activas y nombres. @param {CanvasRenderingContext2D} x @param {number} dim @param {number} d escala de píxeles */
  renderStatic(x, dim, d) {
    const c = this.cam, f = this.free();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, x.canvas.width, x.canvas.height);
    const ox = f.x + f.w / 2 - c.x * c.s, oy = f.y + f.h / 2 - c.y * c.s;
    x.setTransform(d * c.s, 0, 0, d * c.s, d * ox, d * oy);
    this.drawGrid(x, c, d);
    if (this.cache) { x.imageSmoothingQuality = 'high'; x.drawImage(this.cache, -M, -M, this.map.w + 2 * M, this.map.h + 2 * M); }
    const u = 1 / c.s;
    if (dim > .001) {
      x.save(); x.setTransform(d, 0, 0, d, 0, 0); x.fillStyle = this.pal().dim; x.globalAlpha = dim; x.fillRect(0, 0, this.W, this.H); x.restore();
      x.save(); x.globalAlpha = Math.min(1, dim * 1.4);
      for (const p of this.active) { this.fillProvince(x, p, this.provColor(p)); this.rimProvince(x, p, this.provColor(p), u); this.glowProvince(x, p, u, 1.6); }
      x.restore();
    }
    if (this.labels) this.drawLabels(x, dim, d);
  }
  /** Retícula de estado mayor en toda la pantalla, pegada al mapa. @param {CanvasRenderingContext2D} x @param {Cam} c @param {number} d */
  drawGrid(x, c, d) {
    const [mx0, my0] = this.toMap(0, 0), [mx1, my1] = this.toMap(this.W, this.H), step = 62.5;
    x.save(); x.strokeStyle = this.pal().grid; x.lineWidth = 1 / c.s;
    x.beginPath();
    for (let gx = Math.floor(mx0 / step) * step; gx <= mx1; gx += step) { x.moveTo(gx, my0); x.lineTo(gx, my1); }
    for (let gy = Math.floor(my0 / step) * step; gy <= my1; gy += step) { x.moveTo(mx0, gy); x.lineTo(mx1, gy); }
    x.stroke(); x.restore();
  }
  /** @param {CanvasRenderingContext2D} x @param {number} now @param {number} u */
  drawWave(x, now, u) {
    const w = /** @type {NonNullable<MapView['wave']>} */ (this.wave), t = clamp((now - w.t0) / w.dur, 0, 1);
    const b = this.map.provinces[w.p].bbox;
    const R = Math.hypot(Math.max(Math.abs(b[0] - w.ox), Math.abs(b[2] - w.ox)), Math.max(Math.abs(b[1] - w.oy), Math.abs(b[3] - w.oy))) * 1.05;
    const r = R * easeOut(t);
    x.save(); x.clip(this.paths[w.p], 'evenodd');
    // el color del derrotado se apaga (y se queda gris si el bando desaparece)
    const old = w.gray ? desaturate(w.from, Math.min(1, t * 3)) : mix(w.from, darken(w.from, .2), Math.min(1, t * 2));
    this.fillProvince(x, w.p, old);
    x.beginPath(); x.arc(w.ox, w.oy, r, 0, Math.PI * 2);
    const g = x.createRadialGradient(w.ox, w.oy, 0, w.ox, w.oy, Math.max(1, r));
    g.addColorStop(0, darken(w.to, .1)); g.addColorStop(.85, w.to); g.addColorStop(1, lighten(w.to, .5));
    x.fillStyle = g; x.fill();
    x.strokeStyle = alpha('#FFFFFF', .85 * (1 - t)); x.lineWidth = 3.5 * u; x.stroke();
    x.strokeStyle = alpha(lighten(w.to, .6), .5 * (1 - t)); x.lineWidth = 12 * u; x.stroke();
    x.restore();
  }
  /** Nombres de provincia en tamaño de pantalla constante. @param {CanvasRenderingContext2D} x @param {number} dim @param {number} d */
  drawLabels(x, dim, d) {
    const P = this.pal(), s = this.cam.s;
    x.save(); x.setTransform(d, 0, 0, d, 0, 0);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    for (const p of this.map.provinces) {
      const act = this.active.has(p.i) || this.hop === p.i;
      const room = p.room * s;
      if (room < 9 && !act) continue;
      const size = clamp(room * .42, 8.5, act ? 17 : 13.5);
      let a = clamp((room - 9) / 6, 0, 1);
      if (act) a = 1; else if (dim > 0) a *= 1 - dim * .85;
      if (a <= .02) continue;
      const [sx, sy] = this.toScreen(p.label[0], p.label[1]);
      if (sx < -40 || sx > this.W + 40 || sy < -20 || sy > this.H + 20) continue;
      x.globalAlpha = a;
      x.font = `${act ? 700 : 600} ${size.toFixed(1)}px 'Barlow Condensed','Arial Narrow',sans-serif`;
      const t = p.name.toUpperCase();
      x.lineWidth = this.contrast ? 4.5 : 3; x.strokeStyle = P.halo; x.strokeText(t, sx, sy);
      x.fillStyle = P.ink; x.fillText(t, sx, sy);
    }
    x.restore();
  }
}

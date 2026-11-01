// @ts-check
// Mapa en canvas. El mapa completo (degradados, bordes, brillos y textura) se pinta en una imagen grande en
// memoria solo cuando cambia de dueño una provincia; en cada fotograma se copia con la cámara aplicada
// y encima se dibujan en vectorial las provincias en disputa, la onda de conquista y los nombres.
import {lighten, darken, alpha, desaturate, mix} from '../art.js';

/** @typedef {{i:number, ine:string, name:string, plate:string, d:string, c:number[], label:number[], room:number, bbox:number[], area:number, adj:number[]}} Province */
/** @typedef {{w:number, h:number, provinces:Province[], borders:Record<string,string>, outer:string[], land:string, neutral:string, pt?:any, full?:boolean, rivers?:{lines:{n:string, d:string}[], cross:Record<string, string>}}} MapData */
/** @typedef {{x:number, y:number, s:number}} Cam */

const ease = (/** @type {number} */ t) => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeOut = (/** @type {number} */ t) => 1 - (1 - t) ** 3;
const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => Math.max(a, Math.min(b, v));
/** Margen (unidades del mapa) que la imagen en memoria pinta alrededor: tierra vecina sin cortes al moverse. */
const M = 200;
/**
 * Temas del mapa: colores del entorno y cuánto pesan los efectos (relieve, líneas de agua, brillo, textura).
 * tint acerca los colores de los bandos a un tono (pergamino, noche); flat quita volumen (minimalista).
 */
const THEMES = {
  marina:{wave:'#FFFFFF', river:'rgba(120,195,255,.5)', neutral:'#15233D', neutralEdge:'rgba(140,175,230,.22)', grid:'rgba(120,170,255,.07)', shadow:'rgba(0,0,0,.65)', coast:'rgba(110,190,255,.28)', ink:'#FFFFFF', halo:'rgba(4,10,24,.8)', dim:'rgba(3,8,20,.66)', line:'rgba(6,10,22,.85)',
    empty:'#3A4560', coastLine:'rgba(230,240,255,.55)', water:.13, relief:.62, glow:1, noise:.1, tint:/** @type {[string, number]|null} */ (null), flat:false},
  atlas:{wave:'#3A5A70', river:'rgba(50,105,150,.6)', neutral:'#D9C9A6', neutralEdge:'rgba(90,64,30,.45)', grid:'rgba(90,64,30,.12)', shadow:'rgba(70,45,15,.45)', coast:'rgba(70,110,140,.35)', ink:'#2B1E10', halo:'rgba(250,240,220,.85)', dim:'rgba(236,224,196,.62)', line:'rgba(40,25,10,.7)',
    empty:'#CDBF9F', coastLine:'rgba(60,40,15,.75)', water:.3, relief:.5, glow:1, noise:.1, tint:null, flat:false},
  pergamino:{wave:'#5A3A1A', river:'rgba(45,85,115,.55)', neutral:'#C9B184', neutralEdge:'rgba(80,48,18,.5)', grid:'rgba(80,48,18,.1)', shadow:'rgba(60,35,10,.5)', coast:'rgba(90,55,25,.32)', ink:'#2A1808', halo:'rgba(242,228,195,.88)', dim:'rgba(215,195,150,.62)', line:'rgba(52,28,8,.85)',
    empty:'#BFA77C', coastLine:'rgba(58,32,10,.9)', water:.42, relief:.55, glow:.35, noise:.2, tint:['#E2CB98', .42], flat:false},
  tactico:{wave:'#7CFFB2', river:'rgba(110,255,200,.4)', neutral:'#06130D', neutralEdge:'rgba(90,255,170,.28)', grid:'rgba(90,255,170,.08)', shadow:'rgba(0,0,0,.85)', coast:'rgba(90,255,170,.22)', ink:'#D6FFE9', halo:'rgba(0,10,5,.88)', dim:'rgba(0,6,3,.72)', line:'rgba(150,255,205,.6)',
    empty:'#0C1F17', coastLine:'rgba(120,255,190,.75)', water:.18, relief:.35, glow:1.5, noise:.05, tint:['#03140D', .52], flat:false},
  minimal:{wave:'#7C93B8', river:'rgba(110,145,190,.55)', neutral:'#FFFFFF', neutralEdge:'rgba(30,40,60,.14)', grid:'rgba(0,0,0,0)', shadow:'rgba(30,40,60,.16)', coast:'rgba(0,0,0,0)', ink:'#1A2230', halo:'rgba(255,255,255,.92)', dim:'rgba(238,241,245,.72)', line:'rgba(255,255,255,.95)',
    empty:'#DCE1E9', coastLine:'rgba(30,40,60,.3)', water:0, relief:0, glow:0, noise:0, tint:['#FFFFFF', .2], flat:true},
};

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
    this.colors = colors;
    /** @type {MapData} */ this.map = map;
    /** @type {Path2D[]} */ this.paths = [];
    /** @type {Map<string, Path2D>} */ this.borderPaths = new Map();
    /** @type {Path2D[]} */ this.outerPaths = [];
    this.land = new Path2D(); this.neutral = new Path2D(); this.rivers = new Path2D();
    /** @type {number[]} */ this.owner = [];
    /** @type {boolean[]} */ this.dead = [];
    /** @type {number[]} */ this.bounds = [0, 0, 1, 1];
    this.setMap(map, false);
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
    /** Desplazamiento vertical de los nombres (px), para dejar sitio a las fichas de ejército. */ this.labelDy = 0;
    /** @type {((cam:Cam) => void)|null} aviso en cada fotograma (capa de fichas y flechas) */ this.onCam = null;
    /** @type {number} bando del jugador (se marca su territorio en oro) */ this.me = -1;
    this.contrast = false;
    this.theme = 'marina';
    this.dpr = Math.min(3, devicePixelRatio || 1);
    /** Baja la resolución (nunca de 2x) si el móvil no llega a 60 fps. */
    this.adaptive = true;
    this.raf = 0; this.dirty = true;
    this.noise = noiseTile();
    /** @type {HTMLImageElement|null} relieve sombreado (data/relief.png) */ this.relief = null;
    /** @type {HTMLCanvasElement|null} */ this.snowMask = null;
    /** Invierno: nieve en las montañas. */ this.winter = false;
    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => { this.relief = img; this.rebuild(); this.invalidate(); };
      img.src = 'data/relief.png';
    }
    /** @type {HTMLCanvasElement|null} */ this.cache = null;
    /** Olas: dos capas de líneas de agua detrás del mapa que laten desfasadas (solo cambia su opacidad, en CSS). */
    /** @type {HTMLCanvasElement[]} */ this.waveEls = [];
    /** @type {HTMLCanvasElement[]} */ this.waveCache = [];
    this.waveKey = '';
    if (typeof document !== 'undefined' && canvas.parentElement) for (const k of ['a', 'b']) {
      const c = document.createElement('canvas'); c.className = 'waves ' + k; c.setAttribute('aria-hidden', 'true');
      canvas.parentElement.insertBefore(c, canvas); this.waveEls.push(c);
    }
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

  /**
   * Cambia la geometría (el escenario de la península añade Portugal).
   * @param {MapData} map @param {boolean} [redraw]
   */
  setMap(map, redraw = true) {
    if (redraw && map === this.map) return;
    this.map = map;
    this.paths = map.provinces.map(p => new Path2D(p.d));
    this.borderPaths = new Map(Object.entries(map.borders).map(([k, d]) => [k, new Path2D(d)]));
    this.outerPaths = map.outer.map(d => new Path2D(d));
    this.land = new Path2D(map.land);
    this.neutral = new Path2D(map.neutral);
    this.rivers = new Path2D((map.rivers?.lines || []).map(l => l.d).join(''));
    this.owner = map.provinces.map(p => p.i < 47 ? p.i : -1);
    this.dead = map.provinces.map(() => false);
    const xs = map.provinces.flatMap(p => [p.bbox[0], p.bbox[2]]), ys = map.provinces.flatMap(p => [p.bbox[1], p.bbox[3]]);
    this.bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    if (redraw) { this.rebuild(); this.invalidate(); }
  }

  /* ---------- Tamaño y cámara ---------- */
  /** @param {boolean} [keepCam] mantener la cámara (cambio de resolución) */
  resize(keepCam = false) {
    const r = this.canvas.getBoundingClientRect();
    this.W = r.width || innerWidth; this.H = r.height || innerHeight;
    this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
    const wd = Math.min(this.dpr, 1.5);
    for (const c of this.waveEls) { c.width = Math.round(this.W * wd); c.height = Math.round(this.H * wd); }
    this.waveKey = '';
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
    const [x, y] = this.toMap(sx, sy), c = this.ctx;
    // isPointInPath aplica la transformación del contexto: se mide sin ella
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    let hit = -1;
    for (let i = 0; i < this.paths.length; i++) if (c.isPointInPath(this.paths[i], x, y, 'evenodd')) { hit = i; break; }
    c.restore();
    return hit;
  }

  /* ---------- Estado visible ---------- */
  /** @param {number[]} owner @param {boolean[]} [dead] bandos eliminados */
  setOwners(owner, dead) {
    this.wave = null;
    if (owner.length < this.map.provinces.length) owner = [...owner, ...new Array(this.map.provinces.length - owner.length).fill(-1)];
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
    this.buildWaves(k);
    this.version = (this.version || 0) + 1;
    this.dirty = true;
  }
  /** Colores y efectos del tema. */
  pal() { return THEMES[/** @type {'marina'} */ (this.theme)] || THEMES.marina; }
  /** Relleno con luz de una provincia: degradado del color del bando según su caja. @param {CanvasRenderingContext2D} x @param {number} p @param {string} col */
  fillProvince(x, p, col) {
    if (this.pal().flat) { x.fillStyle = col; x.fill(this.paths[p], 'evenodd'); return; }
    const b = this.map.provinces[p].bbox;
    const g = x.createLinearGradient(b[0], b[1], b[2], b[3]);
    g.addColorStop(0, lighten(col, .16)); g.addColorStop(.55, col); g.addColorStop(1, darken(col, .2));
    x.fillStyle = g; x.fill(this.paths[p], 'evenodd');
  }
  /** Borde interior oscuro fino y bisel de luz. @param {CanvasRenderingContext2D} x @param {number} p @param {string} col @param {number} u unidad (1 px de pantalla en vista general) */
  rimProvince(x, p, col, u) {
    if (this.pal().flat) return;
    x.save(); x.clip(this.paths[p], 'evenodd'); x.lineJoin = 'round'; x.lineCap = 'round';
    x.strokeStyle = alpha(darken(col, .6), .5); x.lineWidth = 2.2 * u; x.stroke(this.paths[p]);
    x.strokeStyle = alpha(lighten(col, .55), .28); x.lineWidth = 4 * u; x.globalCompositeOperation = 'source-atop';
    x.translate(-.7 * u, -.9 * u); x.stroke(this.paths[p]);
    x.restore();
  }
  /** Brillo del color del bando en sus fronteras con otros bandos. @param {CanvasRenderingContext2D} x @param {number} p @param {number} u @param {number} [boost] */
  glowProvince(x, p, u, boost = 1) {
    const f = this.owner[p], col = this.colors[f], keys = [], gl = this.pal().glow;
    if (f < 0 || !col || !gl) return;
    boost *= gl;
    for (const q of this.map.provinces[p].adj) if (this.owner[q] !== f) keys.push(borderKey(p, q));
    const outer = this.outerPaths[p];
    x.save(); x.clip(this.paths[p], 'evenodd'); x.lineJoin = 'round'; x.lineCap = 'round';
    x.globalCompositeOperation = 'lighter';
    for (const [w, a] of [[5, .045], [2.6, .08], [1.3, .2]]) {
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
    if (!P.flat) {
      x.save(); x.clip(this.land, 'evenodd');
      const lg = x.createRadialGradient(m.w * .3, m.h * .15, 0, m.w * .45, m.h * .45, m.w * .8);
      lg.addColorStop(0, 'rgba(255,255,255,.16)'); lg.addColorStop(.5, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(0,0,20,.28)');
      x.fillStyle = lg; x.fillRect(0, 0, m.w, m.h);
      x.globalCompositeOperation = 'overlay'; x.globalAlpha = P.noise;
      const pat = x.createPattern(this.noise, 'repeat');
      if (pat) { pat.setTransform(new DOMMatrix().scale(1 / k)); x.fillStyle = pat; x.fillRect(0, 0, m.w, m.h); }
      x.restore();
    }
    // relieve: sombreado de las cordilleras y, en invierno, nieve en las cumbres
    if (this.relief && P.relief) {
      x.save(); x.clip(this.land, 'evenodd');
      x.globalCompositeOperation = 'overlay'; x.globalAlpha = P.relief;
      x.drawImage(this.relief, 0, 0, m.w, m.h);
      x.globalCompositeOperation = 'source-over';
      if (this.winter && !P.flat) {
        if (!this.snowMask) {
          const c = document.createElement('canvas'); c.width = this.relief.width; c.height = this.relief.height;
          const cx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
          cx.drawImage(this.relief, 0, 0); cx.globalCompositeOperation = 'source-in'; cx.fillStyle = '#F4F8FF'; cx.fillRect(0, 0, c.width, c.height);
          this.snowMask = c;
        }
        x.globalAlpha = .26; x.drawImage(this.snowMask, 0, 0, m.w, m.h);
      }
      x.restore();
    }
    void only;
  }
  /**
   * Bordes, relieve de cada provincia, brillo entre bandos y ríos, siempre en vectorial: con zoom siguen finos y
   * nítidos (crecen poco) y no se descuadran con la imagen en memoria. Solo se pinta lo que se ve.
   * @param {CanvasRenderingContext2D} x @param {boolean} [full] con la cámara en marcha solo ríos y fronteras
   */
  drawEdges(x, full = true) {
    const c = this.cam, z = c.s / this.fitScale(), e = Math.min(2, Math.pow(z, .35)) / c.s, P = this.pal();
    const [vx0, vy0] = this.toMap(0, 0), [vx1, vy1] = this.toMap(this.W, this.H);
    const seen = this.map.provinces.map(pr => { const b = pr.bbox; return b[2] >= vx0 && b[0] <= vx1 && b[3] >= vy0 && b[1] <= vy1; });
    if (full) {
      for (let p = 0; p < seen.length; p++) if (seen[p]) this.rimProvince(x, p, this.provColor(p), e);
      for (let p = 0; p < seen.length; p++) if (seen[p]) this.glowProvince(x, p, e);
    }
    x.save(); x.clip(this.land, 'evenodd'); x.lineJoin = 'round'; x.lineCap = 'round';
    x.strokeStyle = alpha('#000000', .18); x.lineWidth = 2.4 * e; x.stroke(this.rivers);
    x.strokeStyle = P.river; x.lineWidth = 1.3 * e; x.stroke(this.rivers);
    x.restore();
    this.strokeBorders(x, e, undefined, seen);
  }
  /**
   * Fronteras (finas y discontinuas dentro de un bando, marcadas entre bandos) y línea de costa. Se pintan en la
   * imagen en memoria y, con zoom, otra vez en vectorial encima para que sigan nítidas.
   * @param {CanvasRenderingContext2D} x @param {number} u @param {Set<number>} [only] @param {boolean[]} [seen] provincias a la vista
   */
  strokeBorders(x, u, only, seen) {
    const P = this.pal();
    x.save(); x.lineJoin = 'round'; x.lineCap = 'round';
    for (const [key, bp] of this.borderPaths) {
      const [a, b] = key.split('-').map(Number), same = this.owner[a] === this.owner[b];
      if (only && !only.has(a) && !only.has(b)) continue;
      if (seen && !seen[a] && !seen[b]) continue;
      x.strokeStyle = same ? alpha(darken(this.provColor(a), .5), .4) : P.line;
      x.lineWidth = (same ? .9 : 1.6) * u * (this.contrast ? 1.6 : 1);
      if (same) x.setLineDash([2.4 * u, 2.2 * u]); else x.setLineDash([]);
      x.stroke(bp);
    }
    x.setLineDash([]);
    // costa: línea clara y nítida
    x.strokeStyle = P.coastLine; x.lineWidth = 1.1 * u; x.stroke(this.land);
    x.restore();
  }
  /** Las dos capas de olas (anillos alternos alrededor de la costa) en imágenes del tamaño del mapa. @param {number} k */
  buildWaves(k) {
    this.waveKey = '';
    const P = this.pal(), u = 1 / this.fitScale();
    if (!this.waveEls.length || !P.water || !this.cache) { this.waveCache = []; return; }
    this.waveCache = [[4, 13, 22], [8.5, 17.5, 26.5]].map((rings, j) => {
      const c = this.waveCache[j] || document.createElement('canvas');
      c.width = /** @type {HTMLCanvasElement} */ (this.cache).width; c.height = /** @type {HTMLCanvasElement} */ (this.cache).height;
      const l = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
      l.setTransform(k, 0, 0, k, M * k, M * k); l.lineJoin = 'round';
      for (let i = rings.length - 1; i >= 0; i--) { // de fuera adentro para no borrar las anteriores
        const d = rings[i];
        l.globalAlpha = Math.min(1, P.water * 2.4) * (1 - i * .25);
        l.globalCompositeOperation = 'source-over'; l.strokeStyle = P.wave; l.lineWidth = (d * 2 + 1.1) * u; l.stroke(this.land);
        l.globalCompositeOperation = 'destination-out'; l.globalAlpha = 1; l.lineWidth = (d * 2 - 1.1) * u; l.stroke(this.land);
      }
      return c;
    });
  }
  /** Copia las olas con la cámara actual (solo si ha cambiado algo). */
  drawWaves() {
    if (!this.waveEls.length) return;
    const c = this.cam, f = this.free(), wd = Math.min(this.dpr, 1.5), m = this.map;
    const key = [c.x, c.y, c.s, f.x, f.y, f.w, f.h, this.waveCache.length, this.version].join('|');
    if (key === this.waveKey) return;
    this.waveKey = key;
    const ox = f.x + f.w / 2 - c.x * c.s, oy = f.y + f.h / 2 - c.y * c.s;
    this.waveEls.forEach((el, i) => {
      const x = /** @type {CanvasRenderingContext2D} */ (el.getContext('2d'));
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, el.width, el.height);
      const src = this.waveCache[i]; if (!src) return;
      x.setTransform(wd * c.s, 0, 0, wd * c.s, wd * ox, wd * oy);
      x.drawImage(src, -M, -M, m.w + 2 * M, m.h + 2 * M);
    });
  }
  /** @param {number} p */
  provColor(p) {
    const f = this.owner[p];
    const P = this.pal();
    if (f < 0 || !this.colors[f]) return P.empty;
    const c = P.tint ? mix(this.colors[f], P.tint[0], P.tint[1]) : this.colors[f];
    return this.dead[f] ? desaturate(c, .9) : c;
  }
  /** Colores por bando (modo conquista). @param {string[]} colors */
  setColors(colors) { this.colors = colors; this.rebuild(); this.invalidate(); }

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
      const key = [c.x, c.y, c.s, f.x, f.y, f.w, f.h, dim, [...this.active].join(','), this.labels, this.labelDy, this.me, this.version, this.canvas.width, this.canvas.height, this.wave ? this.wave.p : -1].join('|');
      if (key !== this.snapKey) {
        const sn = this.snap || (this.snap = document.createElement('canvas'));
        if (sn.width !== this.canvas.width || sn.height !== this.canvas.height) { sn.width = this.canvas.width; sn.height = this.canvas.height; }
        this.renderStatic(/** @type {CanvasRenderingContext2D} */ (sn.getContext('2d')), dim, d, true);
        this.snapKey = key;
      }
      x.clearRect(0, 0, this.canvas.width, this.canvas.height);
      x.drawImage(/** @type {HTMLCanvasElement} */ (this.snap), 0, 0);
    } else {
      // Cámara en movimiento: se pinta a menos resolución y se escala (el movimiento lo disimula)
      const ld = Math.min(d, 1.5), lo = this.lo || (this.lo = document.createElement('canvas'));
      const lw = Math.round(this.W * ld), lh = Math.round(this.H * ld);
      if (lo.width !== lw || lo.height !== lh) { lo.width = lw; lo.height = lh; }
      this.renderStatic(/** @type {CanvasRenderingContext2D} */ (lo.getContext('2d')), dim, ld, false);
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
    this.drawWaves();
    this.dirty = false;
    if (this.onCam) this.onCam(this.cam);
  }
  /** Fondo: retícula, mapa en memoria, atenuado, provincias activas y nombres. @param {CanvasRenderingContext2D} x @param {number} dim @param {number} d escala de píxeles */
  renderStatic(x, dim, d, still = true) {
    const c = this.cam, f = this.free();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, x.canvas.width, x.canvas.height);
    const ox = f.x + f.w / 2 - c.x * c.s, oy = f.y + f.h / 2 - c.y * c.s;
    x.setTransform(d * c.s, 0, 0, d * c.s, d * ox, d * oy);
    this.drawGrid(x, c, d);
    if (this.cache) { x.imageSmoothingQuality = 'high'; x.drawImage(this.cache, -M, -M, this.map.w + 2 * M, this.map.h + 2 * M); }
    const u = 1 / c.s;
    this.drawEdges(x, still);
    if (dim > .001) {
      x.save(); x.setTransform(d, 0, 0, d, 0, 0); x.fillStyle = this.pal().dim; x.globalAlpha = dim; x.fillRect(0, 0, this.W, this.H); x.restore();
      x.save(); x.globalAlpha = Math.min(1, dim * 1.4);
      for (const p of this.active) { this.fillProvince(x, p, this.provColor(p)); this.rimProvince(x, p, this.provColor(p), u); this.glowProvince(x, p, u, 1.6); }
      x.restore();
    }
    if (this.me >= 0) this.drawMine(x, u);
    if (this.labels) this.drawLabels(x, dim, d);
  }
  /** Contorno dorado del territorio del jugador. @param {CanvasRenderingContext2D} x @param {number} u */
  drawMine(x, u) {
    const me = this.me, own = (/** @type {number} */ p) => this.owner[p] === me;
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
    for (const [w, a] of [[7, .18], [2.4, 1]]) {
      x.strokeStyle = a < 1 ? `rgba(255,214,110,${a})` : '#FFD66E'; x.lineWidth = w * u;
      for (const [key, bp] of this.borderPaths) { const [a1, b1] = key.split('-').map(Number); if (own(a1) !== own(b1)) x.stroke(bp); }
      this.map.provinces.forEach(p => { if (own(p.i) && this.map.outer[p.i]) x.stroke(this.outerPaths[p.i]); });
    }
    x.restore();
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
      if (!(this.owner[p.i] >= 0)) continue; // fuera de juego
      const room = p.room * s;
      if (room < 9 && !act) continue;
      const size = clamp(room * .42, 8.5, act ? 17 : 13.5);
      let a = clamp((room - 9) / 6, 0, 1);
      if (act) a = 1; else if (dim > 0) a *= 1 - dim * .85;
      if (a <= .02) continue;
      const [sx, sy0] = this.toScreen(p.label[0], p.label[1]), sy = sy0 + this.labelDy;
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

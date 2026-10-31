// @ts-check
// Ruleta de bandos: rueda dibujada una vez en canvas y girada con CSS (va fluida en cualquier móvil).
// Gira con inercia y frena; cada separador que pasa por la aguja hace tic y la aguja cabecea.
import {lighten, darken, alpha, inkOn, GOLD_STOPS} from '../art.js';
import {flag} from '../flags.js';
import {sound, reduced} from '../fx.js';
import {esc} from './dom.js';

const TAU = Math.PI * 2;

/** Aguja de oro con gema. */
const POINTER = `<svg viewBox="0 0 40 52" class="ptr" aria-hidden="true"><defs>
  <linearGradient id="wpG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GOLD_STOPS[0]}"/><stop offset=".45" stop-color="${GOLD_STOPS[1]}"/><stop offset="1" stop-color="${GOLD_STOPS[3]}"/></linearGradient>
  <radialGradient id="wpJ" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#FFB3B3"/><stop offset=".4" stop-color="#E5243B"/><stop offset="1" stop-color="#6E0A18"/></radialGradient></defs>
  <path d="M20 51 6.5 20A14 14 0 1 1 33.5 20Z" fill="url(#wpG)" stroke="#5A3606" stroke-opacity=".7" stroke-width="1"/>
  <path d="M20 44 10.5 21A10 10 0 0 1 20 6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round"/>
  <circle cx="20" cy="14.5" r="6" fill="url(#wpJ)" stroke="#5A3606" stroke-opacity=".5"/><circle cx="18" cy="12.5" r="1.8" fill="#fff" opacity=".8"/></svg>`;

export class Wheel {
  /** @param {HTMLElement} box @param {{colors:string[], names:string[], plates:string[]}} world @param {import('./clock.js').Clock} clock */
  constructor(box, world, clock) {
    this.box = box; this.world = world; this.clock = clock;
    /** @type {number[]} */ this.items = [];
    this.angle = 0; this.raf = 0;
  }
  /** @param {number[]} alive bandos de la ruleta */
  show(alive) {
    this.items = alive;
    this.box.hidden = false;
    this.box.innerHTML = `<div class="wheel"><canvas></canvas>${POINTER}<div class="hub"></div><div class="wname" aria-hidden="true"><small>Ruleta</small><span></span></div></div>`;
    this.el = /** @type {HTMLElement} */ (this.box.firstElementChild);
    this.cv = /** @type {HTMLCanvasElement} */ (this.el.querySelector('canvas'));
    this.ptr = /** @type {HTMLElement} */ (this.el.querySelector('.ptr'));
    this.hub = /** @type {HTMLElement} */ (this.el.querySelector('.hub'));
    this.nameEl = /** @type {HTMLElement} */ (this.el.querySelector('.wname span'));
    this.angle = Math.random() * TAU; // posición de partida solo visual
    this.paint();
    this.setAngle(this.angle);
  }
  hide() {
    if (!this.el) return Promise.resolve();
    cancelAnimationFrame(this.raf);
    const el = this.el; el.classList.add('out');
    return new Promise(res => setTimeout(() => { if (this.el === el) { this.box.hidden = true; this.box.innerHTML = ''; this.el = undefined; } res(undefined); }, reduced() ? 0 : 320));
  }
  paint() {
    const cv = /** @type {HTMLCanvasElement} */ (this.cv), r = cv.getBoundingClientRect(), dpr = Math.min(3, devicePixelRatio || 1);
    const S = Math.round((r.width || 300) * dpr); cv.width = cv.height = S;
    const x = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d')), R = S / 2, n = this.items.length, seg = TAU / n;
    x.translate(R, R);
    // aro exterior metálico
    const rim = x.createLinearGradient(-R, -R, R, R);
    rim.addColorStop(0, GOLD_STOPS[0]); rim.addColorStop(.3, GOLD_STOPS[1]); rim.addColorStop(.55, GOLD_STOPS[2]); rim.addColorStop(.75, GOLD_STOPS[1]); rim.addColorStop(1, GOLD_STOPS[3]);
    x.beginPath(); x.arc(0, 0, R * .995, 0, TAU); x.fillStyle = rim; x.fill();
    x.beginPath(); x.arc(0, 0, R * .93, 0, TAU); x.fillStyle = '#120A02'; x.fill();
    const inner = R * .915, hubR = R * .2;
    // gajos
    this.items.forEach((f, i) => {
      const a0 = -Math.PI / 2 + i * seg, a1 = a0 + seg, col = this.world.colors[f];
      const g = x.createRadialGradient(0, 0, hubR, 0, 0, inner);
      g.addColorStop(0, darken(col, .35)); g.addColorStop(.45, col); g.addColorStop(1, lighten(col, .18));
      x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, inner, a0, a1); x.closePath(); x.fillStyle = g; x.fill();
    });
    // separadores
    x.lineWidth = Math.max(1, R * .006);
    this.items.forEach((_, i) => {
      const a = -Math.PI / 2 + i * seg;
      x.strokeStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.moveTo(Math.cos(a) * hubR, Math.sin(a) * hubR); x.lineTo(Math.cos(a) * inner, Math.sin(a) * inner); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.moveTo(Math.cos(a + .004) * hubR, Math.sin(a + .004) * hubR); x.lineTo(Math.cos(a + .004) * inner, Math.sin(a + .004) * inner); x.stroke();
    });
    // nombres en radial
    const mid = R * .6, width = seg * mid;
    const size = Math.min(R * .085, width * .78);
    const useName = size >= R * .042;
    x.textAlign = 'right'; x.textBaseline = 'middle';
    this.items.forEach((f, i) => {
      const a = -Math.PI / 2 + (i + .5) * seg, col = this.world.colors[f];
      x.save(); x.rotate(a);
      x.font = `${useName ? 700 : 800} ${(useName ? size : Math.min(R * .07, width * .9)).toFixed(1)}px 'Barlow Condensed','Arial Narrow',sans-serif`;
      const t = (useName ? this.world.names[f] : this.world.plates[f]).toUpperCase();
      const ink = inkOn(col);
      x.fillStyle = ink === '#FFFFFF' ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.35)'; x.fillText(t, inner - R * .05 + 1, 1.2);
      x.fillStyle = ink; x.fillText(t, inner - R * .05, 0);
      x.restore();
    });
    // volumen: cúpula de luz y sombra junto al aro
    const dome = x.createRadialGradient(-R * .35, -R * .45, 0, 0, 0, inner);
    dome.addColorStop(0, 'rgba(255,255,255,.26)'); dome.addColorStop(.55, 'rgba(255,255,255,0)'); dome.addColorStop(.88, 'rgba(0,0,0,0)'); dome.addColorStop(1, 'rgba(0,0,0,.42)');
    x.beginPath(); x.arc(0, 0, inner, 0, TAU); x.fillStyle = dome; x.fill();
    // tachuelas del aro
    if (n <= 64) this.items.forEach((_, i) => {
      const a = -Math.PI / 2 + i * seg, sx = Math.cos(a) * R * .962, sy = Math.sin(a) * R * .962, sr = R * .016;
      const sg = x.createRadialGradient(sx - sr * .4, sy - sr * .4, 0, sx, sy, sr);
      sg.addColorStop(0, '#FFFBEA'); sg.addColorStop(.5, GOLD_STOPS[1]); sg.addColorStop(1, GOLD_STOPS[3]);
      x.beginPath(); x.arc(sx, sy, sr, 0, TAU); x.fillStyle = sg; x.fill();
    });
    // buje
    const hg = x.createRadialGradient(-hubR * .3, -hubR * .3, 0, 0, 0, hubR * 1.15);
    hg.addColorStop(0, '#2C3B5E'); hg.addColorStop(1, '#070D1C');
    x.beginPath(); x.arc(0, 0, hubR * 1.12, 0, TAU); x.fillStyle = rim; x.fill();
    x.beginPath(); x.arc(0, 0, hubR, 0, TAU); x.fillStyle = hg; x.fill();
    x.strokeStyle = alpha('#000000', .5); x.lineWidth = R * .01; x.stroke();
  }
  /** @param {number} a */
  setAngle(a) {
    this.angle = a;
    if (this.cv) this.cv.style.transform = `rotate(${a}rad)`;
    const n = this.items.length, seg = TAU / n;
    const idx = Math.floor((((-a) % TAU) + TAU) % TAU / seg) % n;
    if (idx !== this.cur) {
      this.cur = idx;
      const f = this.items[idx];
      if (this.hub) this.hub.innerHTML = flag(f);
      if (this.nameEl) this.nameEl.textContent = this.world.names[f];
      return true;
    }
    return false;
  }
  /**
   * Gira hasta el bando elegido.
   * @param {number} faction @param {number} dur ms de partida @param {number} jitter 0..1 posición dentro del gajo (visual)
   */
  spin(faction, dur, jitter = .5) {
    const n = this.items.length, seg = TAU / n, i = this.items.indexOf(faction);
    const goal = -(i + .2 + .6 * jitter) * seg;
    const turns = reduced() ? 0 : Math.max(2, Math.round(dur / 600));
    const from = this.angle, delta = ((goal - from) % TAU + TAU) % TAU + turns * TAU;
    if (reduced() || dur < 60) { this.setAngle(from + delta); return Promise.resolve(); }
    const t0 = this.clock.now();
    return new Promise(res => {
      const step = () => {
        if (this.clock.stopped || !this.el) return res(undefined);
        const t = Math.min(1, (this.clock.now() - t0) / dur);
        const e = 1 - (1 - t) ** 3.4; // frenado progresivo
        if (this.setAngle(from + delta * e)) {
          sound('tick');
          if (this.ptr) { this.ptr.classList.remove('flap'); void this.ptr.offsetWidth; this.ptr.classList.add('flap'); }
        }
        if (t < 1) this.raf = requestAnimationFrame(step); else res(undefined);
      };
      step();
    });
  }
  /** Nombre accesible del resultado. @param {number} f */
  label(f) { return esc(this.world.names[f]); }
}

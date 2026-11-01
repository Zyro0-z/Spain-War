// @ts-check
// Efectos: sonido sintetizado con WebAudio, partículas, temblor y avisos para VoiceOver.
import {S} from './store.js';

const sysRM = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : {matches:false};
export const reduced = () => sysRM.matches || S.settings.motion === 'reduced';

/* ---------- Sonido ---------- */
/** @type {AudioContext|null} */
let AC = null;
/** @type {GainNode|null} */
let master = null;
/** @type {ConvolverNode|null} */
let hall = null;
/** @type {AudioBuffer|null} */
let noiseBuf = null;

function ctx() {
  if (!AC) {
    try {
      const C = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      AC = new C();
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = .003; comp.release.value = .2;
      master = AC.createGain(); master.gain.value = .9;
      master.connect(comp).connect(AC.destination);
      // Sala: respuesta al impulso sintética (ruido que se apaga) para dar cuerpo a fanfarrias e impactos
      hall = AC.createConvolver();
      const len = AC.sampleRate * 1.6, ir = AC.createBuffer(2, len, AC.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2; }
      hall.buffer = ir;
      const wet = AC.createGain(); wet.gain.value = .22; hall.connect(wet).connect(master);
    } catch (e) { return null; }
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
/** Salida de audio compartida (para la música). */
export function audioOut() { const a = ctx(); return a && master ? {a, out:master, hall, noise:noise(a)} : null; }
/** iOS solo deja sonar tras un toque: se desbloquea con el primero. */
export function unlockAudio() {
  const once = () => {
    const a = ctx(); if (a) { const b = a.createBuffer(1, 1, 22050), s = a.createBufferSource(); s.buffer = b; s.connect(a.destination); s.start(0); }
    removeEventListener('pointerdown', once, true); removeEventListener('keydown', once, true);
  };
  addEventListener('pointerdown', once, true); addEventListener('keydown', once, true);
}
/** @param {AudioContext} a */
function noise(a) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = a.createBuffer(1, a.sampleRate * .5, a.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
/**
 * @param {number} f @param {number} at @param {number} dur
 * @param {{type?:OscillatorType, vol?:number, glide?:number, attack?:number, wet?:boolean, detune?:number}} [o]
 */
function tone(f, at, dur, {type = 'sine', vol = .12, glide = 1, attack = .006, wet = false, detune = 0} = {}) {
  const a = ctx(); if (!a || !master) return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (glide !== 1) o.frequency.exponentialRampToValueAtTime(f * glide, t + dur * .85);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(master); if (wet && hall) g.connect(hall);
  o.start(t); o.stop(t + dur + .05);
}
/** Ruido filtrado: golpes, chasquidos, viento. @param {number} at @param {number} freq @param {number} vol @param {number} dur @param {{q?:number, type?:BiquadFilterType, wet?:boolean, sweep?:number}} [o] */
function burst(at, freq, vol, dur, {q = 4, type = 'bandpass', wet = false, sweep = 1} = {}) {
  const a = ctx(); if (!a || !master) return;
  const t = a.currentTime + at, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise(a); s.playbackRate.value = .8 + Math.random() * .4;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f).connect(g).connect(master); if (wet && hall) g.connect(hall);
  s.start(t, Math.random() * .2); s.stop(t + dur + .02);
}
/** Metal de trompeta: diente de sierra con filtro que se abre. @param {number} f @param {number} at @param {number} dur @param {number} vol */
function brass(f, at, dur, vol = .07) {
  const a = ctx(); if (!a || !master) return;
  const t = a.currentTime + at, g = a.createGain(), lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(f * 1.2, t); lp.frequency.exponentialRampToValueAtTime(f * 6, t + .08); lp.frequency.exponentialRampToValueAtTime(f * 2.5, t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .04); g.gain.setValueAtTime(vol, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  for (const det of [-7, 6]) { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + .05); }
  lp.connect(g).connect(master); if (hall) g.connect(hall);
}
let lastTick = 0;
/** @param {string} kind @param {number} [n] */
export function sound(kind, n = 0) {
  if (!S.settings.sound) return;
  const a = ctx(); if (!a) return;
  switch (kind) {
    case 'tick': { // ruleta: chasquido de la lengüeta
      const now = performance.now(); if (now - lastTick < 28) return; lastTick = now;
      burst(0, 3200 + Math.random() * 400, .32, .028, {q:8}); tone(1900, 0, .03, {vol:.03, type:'triangle'}); break;
    }
    case 'hop': burst(0, 2400, .18, .03, {q:6}); tone(880 + n * 30, 0, .06, {vol:.04, type:'triangle'}); break;
    case 'lock': tone(660, 0, .12, {vol:.08, type:'triangle'}); tone(990, .06, .22, {vol:.07, type:'triangle', wet:true}); burst(0, 1800, .2, .06); break;
    case 'whoosh': burst(0, 600, .2, .45, {q:1.2, sweep:4}); break;
    case 'roll': // dados rodando: muchos golpecitos de madera
      for (let i = 0; i < 9; i++) burst(i * .045 + Math.random() * .02, 1600 + Math.random() * 1600, .22 - i * .015, .03, {q:5});
      break;
    case 'land': burst(0, 900, .35, .06, {q:3}); tone(140, 0, .12, {vol:.16, glide:.6}); break;
    case 'impact': // choque de armas
      tone(70, 0, .5, {vol:.42, glide:.5, attack:.002}); burst(0, 500, .5, .35, {q:.8, type:'lowpass', wet:true});
      burst(.01, 4200, .16, .25, {q:9, wet:true}); burst(.02, 6100, .1, .3, {q:12}); break;
    case 'conquer': // fanfarria breve
      [[392, 0], [523, .11], [659, .22]].forEach(([f, t]) => brass(f, t, .5, .06)); brass(784, .33, .9, .07);
      tone(98, 0, .6, {vol:.25, glide:.7}); break;
    case 'defend': // escudo que aguanta
      burst(0, 2600, .3, .25, {q:14, wet:true}); burst(0, 3900, .18, .4, {q:18, wet:true}); tone(220, 0, .3, {vol:.12, type:'triangle', glide:.9}); break;
    case 'eliminate':
      tone(196, 0, 1.2, {vol:.12, type:'triangle', glide:.5, wet:true}); tone(147, .15, 1.3, {vol:.1, type:'triangle', glide:.5, wet:true});
      tone(55, 0, 1.1, {vol:.3, glide:.7}); break;
    case 'victory': {
      const seq = [[523, 0, .25], [523, .18, .12], [523, .3, .12], [659, .42, .5], [523, .9, .25], [659, 1.1, .25], [784, 1.3, 1.6]];
      seq.forEach(([f, t, d]) => { brass(f, t, d, .065); brass(f / 2, t, d, .04); });
      [0, .42, 1.3].forEach(t => { tone(65, t, .7, {vol:.4, glide:.6, attack:.002}); burst(t, 300, .3, .4, {q:.7, type:'lowpass'}); });
      break;
    }
    case 'tap': tone(1200, 0, .04, {vol:.035, type:'triangle'}); break;
    default: burst(0, 3800, .1, .02);
  }
}
export function haptic(/** @type {number|number[]} */ p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

/* ---------- Avisos para lectores de pantalla ---------- */
/** @type {ReturnType<typeof setTimeout>|undefined} */
let srT;
/** @param {string} msg */
export function announce(msg) {
  const r = document.getElementById('sr'); if (!r) return;
  clearTimeout(srT); r.textContent = ''; srT = setTimeout(() => { r.textContent = msg; }, 60);
}

/* ---------- Temblor de pantalla ---------- */
/** @param {Element|null} el @param {number} [px] @returns {Animation|null} */
export function shake(el, px = 7) {
  if (!el || reduced()) return null;
  const k = [0, 1, -1, .7, -.6, .35, -.2, 0].map((v, i) => ({transform:`translate(${(v * px).toFixed(1)}px, ${(i % 2 ? -1 : 1) * v * px * .45}px)`}));
  return el.animate(k, {duration:380, easing:'ease-out'});
}

/* ---------- Partículas ---------- */
/**
 * @typedef {{k:'spark'|'ember'|'smoke'|'confetti'|'ring', x:number, y:number, vx:number, vy:number, g:number, life:number, max:number, size:number, col:string, r:number, vr:number, drag:number}} P
 */
/** @type {{p:P[], raf:number, frozen:boolean}} */
const FX = {p:[], raf:0, frozen:false};
/** Congela las partículas (capturas). @param {boolean} v */
export function freezeFx(v) { FX.frozen = v; }
/** Avanza las partículas a mano mientras están congeladas. @param {number} n fotogramas */
export function stepFx(n) { for (let i = 0; i < n; i++) for (const p of FX.p) physics(p); }
/** @param {P} p */
function physics(p) { p.life++; if (p.life < 0) return; p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag; p.x += p.vx; p.y += p.vy; p.r += p.vr; }
function canvas() {
  const c = /** @type {HTMLCanvasElement} */ (document.getElementById('fx')), dpr = Math.min(2, devicePixelRatio || 1);
  if (c.width !== Math.round(innerWidth * dpr) || c.height !== Math.round(innerHeight * dpr)) { c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr); }
  return c;
}
/** Estallido de conquista: chispas, brasas y un anillo del color del bando. @param {number} x @param {number} y @param {string} col @param {number} [power] */
export function burstAt(x, y, col, power = 1) {
  if (reduced()) return;
  canvas();
  const n = Math.round(46 * power);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6 * power;
    FX.p.push({k:i % 3 ? 'spark' : 'ember', x, y, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp - 1.5, g:.12, life:0, max:40 + Math.random() * 40, size:1.2 + Math.random() * 2.2,
      col:i % 4 === 0 ? '#FFF4D6' : col, r:0, vr:0, drag:.94});
  }
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, sp = .5 + Math.random() * 1.2;
    FX.p.push({k:'smoke', x, y, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp - .5, g:-.01, life:0, max:60 + Math.random() * 30, size:6 + Math.random() * 8, col:'#D8D0C0', r:0, vr:0, drag:.97});
  }
  FX.p.push({k:'ring', x, y, vx:0, vy:0, g:0, life:0, max:34, size:8, col, r:0, vr:0, drag:1});
  start();
}
/** Confeti y fuegos artificiales de victoria. @param {string[]} cols */
export function celebrate(cols) {
  if (reduced()) return;
  canvas();
  const W = innerWidth, H = innerHeight;
  for (let b = 0; b < 6; b++) {
    const cx = W * (.15 + Math.random() * .7), cy = H * (.12 + Math.random() * .3), col = cols[b % cols.length], delay = b * 16;
    for (let i = 0; i < 50; i++) { const a = i / 50 * Math.PI * 2, sp = 2.5 + Math.random() * 3.5; FX.p.push({k:'spark', x:cx, y:cy, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp, g:.05, life:-delay, max:90, size:2, col, r:0, vr:0, drag:.97}); }
  }
  for (let i = 0; i < 140; i++) {
    const a = -Math.PI / 2 + (Math.random() - .5) * 2.4, sp = 6 + Math.random() * 9;
    FX.p.push({k:'confetti', x:W / 2 + (Math.random() - .5) * 60, y:H * .42, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp - 2, g:.26, life:0, max:300, size:5 + Math.random() * 5,
      col:i % 3 ? cols[i % cols.length] : '#F2C94C', r:Math.random() * 6.3, vr:(Math.random() - .5) * .4, drag:.985});
  }
  start();
}
function start() { if (!FX.raf) FX.raf = requestAnimationFrame(loop); }
function loop() {
  const c = canvas(), x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), dpr = Math.min(2, devicePixelRatio || 1);
  x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, innerWidth, innerHeight);
  FX.p = FX.p.filter(p => p.life < p.max && p.y < innerHeight + 60);
  for (const p of FX.p) {
    if (!FX.frozen) physics(p);
    if (p.life < 0) continue;
    const t = p.life / p.max, fade = Math.max(0, 1 - t);
    x.save();
    if (p.k === 'smoke') {
      x.globalAlpha = .16 * fade * Math.min(1, p.life / 8); x.fillStyle = p.col;
      x.beginPath(); x.arc(p.x, p.y, p.size * (1 + t * 1.6), 0, 6.283); x.fill();
    } else if (p.k === 'ring') {
      x.globalAlpha = fade * .9; x.strokeStyle = p.col; x.lineWidth = 3 * fade + .5; x.shadowColor = p.col; x.shadowBlur = 12;
      x.beginPath(); x.arc(p.x, p.y, p.size + t * 70, 0, 6.283); x.stroke();
    } else if (p.k === 'confetti') {
      x.globalAlpha = Math.min(1, (p.max - p.life) / 50); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.col;
      const s = Math.cos(p.life * .2 + p.r); x.fillRect(-p.size / 2, -p.size * .3 * s, p.size, p.size * .6 * s);
    } else {
      x.globalCompositeOperation = 'lighter'; x.globalAlpha = fade; x.fillStyle = p.col;
      if (p.k === 'spark') { x.strokeStyle = p.col; x.lineWidth = p.size; x.lineCap = 'round'; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); x.stroke(); }
      else { x.shadowColor = p.col; x.shadowBlur = 8; x.beginPath(); x.arc(p.x, p.y, p.size, 0, 6.283); x.fill(); }
    }
    x.restore();
  }
  FX.raf = FX.p.length ? requestAnimationFrame(loop) : (x.clearRect(0, 0, innerWidth, innerHeight), 0);
}

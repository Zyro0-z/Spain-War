// @ts-check
// Música sintetizada para la conquista. En paz: acordes suaves y un arpegio de cuerda pulsada (re menor,
// i–VI–III–VII). En guerra entra la cadencia andaluza (i–VII–VI–V) con bajo y tambores. El ánimo cambia
// poco a poco, compás a compás, según las guerras abiertas.
import {S} from './store.js';
import {audioOut} from './fx.js';

const EIGHTH = 60 / 78 / 2;
/** Acordes en semitonos desde re (D3). */
const PEACE = [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 9]];
const WAR = [[0, 3, 7, 12], [-2, 2, 5, 10], [-4, 0, 3, 8], [-5, -1, 2, 7]];
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
const hz = (/** @type {number} */ s) => 146.83 * 2 ** (s / 12);

/** @type {{a:AudioContext, bus:GainNode, send:GainNode|null, noise:AudioBuffer, timer:any, next:number, step:number, war:number, target:number}|null} */
let st = null;
const on = () => S.settings.sound && S.settings.music !== false;

/**
 * @param {number} t @param {number} f @param {number} dur
 * @param {{type?:OscillatorType, vol?:number, attack?:number, release?:number, lp?:number, wet?:boolean}} [o]
 */
function note(t, f, dur, {type = 'triangle', vol = .05, attack = .01, release = .3, lp = 0, wet = false} = {}) {
  if (!st) return;
  const a = st.a, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.setTargetAtTime(0, t + dur, release / 3);
  /** @type {AudioNode} */ let n = o;
  if (lp) { const f2 = a.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp; o.connect(f2); n = f2; }
  n.connect(g).connect(st.bus); if (wet && st.send) g.connect(st.send);
  o.start(t); o.stop(t + dur + release + .2);
}
/** Tambor: golpe grave con caída de tono y un poco de parche. @param {number} t @param {number} vol @param {boolean} low */
function drum(t, vol, low) {
  if (!st || vol < .01) return;
  const a = st.a, o = a.createOscillator(), g = a.createGain();
  o.frequency.setValueAtTime(low ? 105 : 170, t); o.frequency.exponentialRampToValueAtTime(low ? 48 : 85, t + .22);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + (low ? .5 : .28));
  o.connect(g).connect(st.bus); o.start(t); o.stop(t + .6);
  const n = a.createBufferSource(), bp = a.createBiquadFilter(), ng = a.createGain();
  n.buffer = st.noise; bp.type = 'bandpass'; bp.frequency.value = low ? 700 : 1400; bp.Q.value = .9;
  ng.gain.setValueAtTime(vol * .35, t); ng.gain.exponentialRampToValueAtTime(.001, t + .09);
  n.connect(bp).connect(ng).connect(st.bus); n.start(t); n.stop(t + .12);
}
/** @param {number} step @param {number} t */
function schedule(step, t) {
  if (!st) return;
  const s = step % 8, bar = Math.floor(step / 8);
  if (s === 0) st.war += (st.target - st.war) * .5;
  const w = st.war, prog = w > .5 ? WAR : PEACE, ch = prog[bar % 4];
  if (s === 0) for (const k of ch.slice(0, 3)) note(t, hz(k), EIGHTH * 7.5, {type:'sawtooth', vol:.018, attack:1, release:1.6, lp:700 + 500 * w, wet:true});
  // arpegio de cuerda pulsada (sobre todo en paz)
  if ([0, 2, 3, 5, 6].includes(s) && w < .85) note(t, hz(ch[ARP[s] % ch.length] + 12), .5, {type:'triangle', vol:.05 * (1 - w * .8), attack:.004, release:.5, wet:true});
  // bajo y tambores en guerra
  if (w > .08) {
    if (s === 0 || s === 3 || s === 4) note(t, hz(ch[0] - 12), EIGHTH * (s === 4 ? 3.5 : 1.5), {type:'sine', vol:.11 * w, attack:.01, release:.2});
    if (s === 0 || s === 4) drum(t, .22 * w, true);
    if (s === 3 || s === 6 || s === 7) drum(t, .1 * w, false);
  }
}
function tick() {
  if (!st) return;
  if (document.hidden) { st.next = st.a.currentTime + .1; return; }
  while (st.next < st.a.currentTime + .3) { schedule(st.step, st.next); st.next += EIGHTH; st.step++; }
}

export const music = {
  start() {
    if (st || !on()) return;
    const o = audioOut(); if (!o) return;
    const bus = o.a.createGain();
    bus.gain.setValueAtTime(0, o.a.currentTime); bus.gain.linearRampToValueAtTime(.5, o.a.currentTime + 2.5);
    bus.connect(o.out);
    let send = null;
    if (o.hall) { send = o.a.createGain(); send.gain.value = .5; send.connect(o.hall); }
    st = {a:o.a, bus, send, noise:o.noise, timer:0, next:o.a.currentTime + .15, step:0, war:0, target:0};
    st.timer = setInterval(tick, 90);
  },
  stop() {
    if (!st) return;
    const s = st; st = null; clearInterval(s.timer);
    s.bus.gain.cancelScheduledValues(s.a.currentTime);
    s.bus.gain.setTargetAtTime(0, s.a.currentTime, .4);
    setTimeout(() => s.bus.disconnect(), 2500);
  },
  /** Ánimo de 0 (paz) a 1 (guerra abierta). @param {number} v */
  mood(v) { if (st) st.target = Math.max(0, Math.min(1, v)); },
  /** Tras cambiar los ajustes. */
  sync() { if (!on()) this.stop(); },
};

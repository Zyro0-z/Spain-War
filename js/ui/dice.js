// @ts-check
// Dados 3D con CSS: seis caras con material del color del bando, brillo y puntos con relieve.
// Ruedan con varias vueltas, rebotan y caen mostrando el valor que ha tirado el motor.
import {luminance} from '../art.js';
import {reduced} from '../fx.js';

/** Puntos de cada cara en una rejilla 3×3 (fila, columna). */
const PIPS = {1:[[2, 2]], 2:[[1, 3], [3, 1]], 3:[[1, 3], [2, 2], [3, 1]], 4:[[1, 1], [1, 3], [3, 1], [3, 3]], 5:[[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]], 6:[[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]]};
/** Giro que deja cada cara de frente: [rotateX, rotateY]. */
const FACE = {1:[0, 0], 6:[0, 180], 3:[0, -90], 4:[0, 90], 5:[-90, 0], 2:[90, 0]};
const BASE = 'rotateX(-24deg) rotateY(28deg)';

/** @param {number} v */
const face = v => `<div class="f f${v}">${/** @type {number[][]} */ (PIPS[/** @type {1} */ (v)]).map(([r, c]) => `<i style="grid-area:${r}/${c}"></i>`).join('')}</div>`;

/** Fila de tres dados del color de un bando. @param {string} color */
export function diceRow(color) {
  const ink = luminance(color) > .5 ? ' ink' : '';
  const die = `<div class="die${ink}" style="--c:${color}"><div class="cube" style="transform:${BASE} rotateX(0deg) rotateY(0deg) rotateZ(0deg)">${[1, 2, 3, 4, 5, 6].map(face).join('')}</div><b class="shd"></b></div>`;
  return `<div class="dice" aria-hidden="true">${die}${die}${die}</div>`;
}

/**
 * Tira los dados de una fila hasta los valores dados.
 * @param {HTMLElement} row @param {number[]} values @param {number} dur ms
 * @param {import('./clock.js').Clock} clock @param {number} seedish desfase visual (no afecta al resultado)
 */
export function roll(row, values, dur, clock, seedish = 0) {
  const dice = /** @type {HTMLElement[]} */ ([...row.querySelectorAll('.die')]);
  const jobs = dice.map((d, i) => {
    d.classList.remove('win');
    const cube = /** @type {HTMLElement} */ (d.querySelector('.cube')), shd = /** @type {HTMLElement} */ (d.querySelector('.shd'));
    const [fx, fy] = FACE[/** @type {1} */ (values[i])];
    const r = (k => ((Math.sin(seedish * 12.9898 + i * 78.233 + k) * 43758.5453) % 1 + 1) % 1);
    const kx = 2 + Math.floor(r(1) * 2), ky = 1 + Math.floor(r(2) * 2), tilt = (r(3) - .5) * 16;
    const end = `${BASE} rotateX(${fx + 360 * kx}deg) rotateY(${fy + 360 * ky}deg) rotateZ(${tilt.toFixed(1)}deg)`;
    if (reduced() || dur < 80) {
      cube.style.transform = `${BASE} rotateX(${fx}deg) rotateY(${fy}deg) rotateZ(${tilt.toFixed(1)}deg)`;
      return Promise.resolve();
    }
    const start = `${BASE} rotateX(${(r(4) * 180).toFixed(0)}deg) rotateY(${(r(5) * 180).toFixed(0)}deg) rotateZ(${((r(6) - .5) * 90).toFixed(0)}deg)`;
    const delay = i * dur * .06, d1 = dur - delay;
    const a1 = clock.track(cube.animate([{transform:start}, {transform:end}], {duration:d1, delay, easing:'cubic-bezier(.15,.6,.25,1)', fill:'forwards'}));
    const side = row.closest('.def') ? 1 : -1;
    clock.track(d.animate([
      {transform:`translate(${side * 46}px,-34px)`, offset:0},
      {transform:'translate(0,0)', offset:.42, easing:'ease-out'},
      {transform:'translate(0,-13px)', offset:.6, easing:'ease-in'},
      {transform:'translate(0,0)', offset:.76, easing:'ease-out'},
      {transform:'translate(0,-4px)', offset:.87, easing:'ease-in'},
      {transform:'translate(0,0)', offset:1},
    ], {duration:d1, delay, easing:'linear', fill:'backwards'}));
    clock.track(shd.animate([
      {opacity:.15, transform:'translateZ(-30px) scale(.5)'}, {opacity:1, transform:'translateZ(-30px) scale(1)', offset:.42},
      {opacity:.55, transform:'translateZ(-30px) scale(.8)', offset:.6}, {opacity:1, transform:'translateZ(-30px) scale(1)', offset:.76}, {opacity:1, transform:'translateZ(-30px) scale(1)'},
    ], {duration:d1, delay, fill:'backwards'}));
    return a1.finished.then(() => { cube.style.transform = end; a1.cancel(); }).catch(() => {});
  });
  return Promise.all(jobs);
}
/** Resalta los dados del ganador. @param {HTMLElement} row */
export const markWin = row => row.querySelectorAll('.die').forEach(d => d.classList.add('win'));

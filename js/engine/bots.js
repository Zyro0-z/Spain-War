// @ts-check
// Bots: eligen a qué provincia atacar cuando la ruleta les toca. Puros y deterministas.
// - Recluta: al azar.
// - Estratega: busca la mejor probabilidad y evita a los rivales mucho más fuertes.
// - Mariscal: además remata a los bandos débiles y castiga más atacar a los fuertes.
// Simulaciones (1500 partidas por variante): Estratega y Mariscal ganan ~57 % de los duelos contra Recluta y
// empatan entre sí; priorizar cerrar frentes le hacía perder (38-49 %), por eso no lo hace.
import {winProb} from './prob.js';
import {counts} from './game.js';
import {int} from './rng.js';

/** @typedef {'recluta'|'estratega'|'mariscal'} Level */
/** @type {Record<Level, {name:string, desc:string}>} */
export const LEVELS = {
  recluta:{name:'Recluta', desc:'Ataca a cualquiera'},
  estratega:{name:'Estratega', desc:'Busca la mejor probabilidad y evita a los fuertes'},
  mariscal:{name:'Mariscal', desc:'Además remata a los débiles y no provoca a los fuertes'},
};
/** Pesos del Mariscal (ajustados con simulaciones de partidas completas). */
export const MARISCAL = {strong:.4, finish:.3, weak:.02};
/** @param {unknown} v @returns {Level} */
export const level = v => v === 'recluta' || v === 'mariscal' ? v : 'estratega';

/**
 * Puntuación de cada objetivo según el nivel. Más alto es mejor.
 * @param {Level} lv @param {import('./game.js').Graph} graph @param {import('./game.js').Game} g @param {number} f @param {number} t
 * @param {number[]} c provincias por bando
 */
export function score(lv, graph, g, f, t, c) {
  const d = g.owner[t], pa = g.power[f], pd = g.power[d], p = winProb(pa, pd).p;
  if (lv === 'recluta') return 0;
  // rival fuerte: mucho más poder que yo, y además grande
  const strong = Math.max(0, (pd - pa) / pa) + Math.max(0, c[d] - c[f]) * .01;
  const W = MARISCAL;
  let s = p - (lv === 'mariscal' ? W.strong : .3) * strong;
  if (lv === 'mariscal') {
    const maxC = Math.max(...c);
    // rematar: un bando con una sola provincia, si la probabilidad acompaña
    if (c[d] === 1) s += W.finish * p;
    // bandos débiles antes que fuertes
    s += W.weak * (1 - c[d] / maxC);
  }
  return s;
}

/**
 * Bot que elige objetivo (firma de Chooser de game.js).
 * @param {Level} lv @param {import('./game.js').Graph} graph
 * @returns {import('./game.js').Chooser}
 */
export function bot(lv, graph) {
  return (g, f, targets, rng) => {
    if (lv === 'recluta') return targets[int(rng, targets.length)];
    const c = counts(g);
    let best = -Infinity, pick = /** @type {number[]} */ ([]);
    for (const t of targets) {
      const s = score(lv, graph, g, f, t, c);
      if (s > best + 1e-9) { best = s; pick = [t]; } else if (Math.abs(s - best) <= 1e-9) pick.push(t);
    }
    return pick.length === 1 ? pick[0] : pick[int(rng, pick.length)];
  };
}

/** El mejor objetivo por probabilidad (cuando se agota el tiempo del jugador). Sin azar. @param {import('./game.js').Game} g @param {number} f @param {number[]} targets */
export function bestTarget(g, f, targets) {
  let best = -1, pick = targets[0];
  for (const t of targets) { const p = winProb(g.power[f], g.power[g.owner[t]]).p; if (p > best + 1e-12) { best = p; pick = t; } }
  return pick;
}

/**
 * Elector para partidas con humanos y bots: los humanos devuelven null (decide la interfaz o la red).
 * @param {Level} lv @param {import('./game.js').Graph} graph @param {Set<number>} humans
 */
export function mixed(lv, graph, humans) {
  const b = bot(lv, graph);
  /** @type {(g:import('./game.js').Game, f:number, targets:number[], rng:import('./rng.js').RngState) => number|null} */
  return (g, f, targets, rng) => humans.has(f) ? null : b(g, f, targets, rng);
}

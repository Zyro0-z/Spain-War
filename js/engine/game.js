// @ts-check
// Reglas de España en Guerra. Puro y determinista: sin DOM, sin Date ni Math.random.
// Cada función devuelve una partida nueva y no toca la que recibe.
//
// - Al empezar, cada provincia es un bando con poder 100. El poder y la eliminación son del bando.
// - Ronda: la ruleta elige un bando vivo; ataca una provincia enemiga limítrofe con alguna suya.
// - Cada bando tira 3d6. Puntuación = suma × poder/100. Empate: se repite la tirada.
// - Ganador +3 de poder, perdedor −3 (mínimo 1). Si gana el atacante, conquista la provincia.
// - Un bando sin provincias queda eliminado. La partida acaba cuando queda uno.
import {seedState, int, d6} from './rng.js';
import {winProb} from './prob.js';

export const START_POWER = 100, GAIN = 3, LOSS = 3, MIN_POWER = 1;
const MAX_REROLLS = 200;

/** @typedef {import('./rng.js').RngState} RngState */
/** @typedef {{n:number, adj:number[][]}} Graph */
/**
 * @typedef {object} Game
 * @property {1} v
 * @property {string} seed
 * @property {RngState} rng
 * @property {number} round rondas jugadas
 * @property {number[]} owner bando dueño de cada provincia
 * @property {number[]} power poder de cada bando
 * @property {boolean[]} alive
 * @property {number} winner bando vencedor o -1
 * @property {{conq:number[], wins:number[], peak:number[]}} stats por bando
 */
/** @typedef {{a:number[], d:number[]}} Roll */
/**
 * Resultado completo de una ronda: con esto cualquier cliente puede animarla sin volver a calcular.
 * @typedef {object} Round
 * @property {number} n número de ronda (desde 1)
 * @property {number[]} alive bandos vivos al empezar (la ruleta)
 * @property {number} attacker bando atacante
 * @property {number[]} targets provincias que podía atacar
 * @property {number} target provincia atacada
 * @property {number} defender bando defensor
 * @property {number[]} from provincias del atacante que tocan el objetivo
 * @property {number} pa poder del atacante antes del combate
 * @property {number} pd poder del defensor antes del combate
 * @property {number} prob probabilidad exacta de que gane el atacante
 * @property {Roll[]} rolls tiradas (más de una si hubo empates)
 * @property {boolean} won ganó el atacante
 * @property {number} paAfter
 * @property {number} pdAfter
 * @property {number} eliminated bando eliminado o -1
 * @property {number} winner vencedor de la partida o -1
 */

/** @param {{provinces:{adj:number[]}[]}} map @returns {Graph} */
export const graphOf = map => ({n:map.provinces.length, adj:map.provinces.map(p => p.adj)});

/** @param {Game} g @returns {Game} */
const clone = g => ({...g, rng:/** @type {RngState} */ ([...g.rng]), owner:[...g.owner], power:[...g.power], alive:[...g.alive],
  stats:{conq:[...g.stats.conq], wins:[...g.stats.wins], peak:[...g.stats.peak]}});

/** Partida nueva: una provincia por bando. @param {Graph} graph @param {string} seed @returns {Game} */
export function newGame(graph, seed) {
  const n = graph.n;
  return {v:1, seed, rng:seedState('eeg:' + seed), round:0,
    owner:Array.from({length:n}, (_, i) => i), power:new Array(n).fill(START_POWER), alive:new Array(n).fill(true), winner:-1,
    stats:{conq:new Array(n).fill(0), wins:new Array(n).fill(0), peak:new Array(n).fill(1)}};
}

/** Bandos vivos en orden. @param {Game} g */
export const aliveFactions = g => g.alive.flatMap((a, f) => a ? [f] : []);
/** Provincias de un bando. @param {Game} g @param {number} f */
export const territory = (g, f) => g.owner.flatMap((o, p) => o === f ? [p] : []);
/** Número de provincias por bando. @param {Game} g */
export const counts = g => { const c = new Array(g.alive.length).fill(0); for (const o of g.owner) c[o]++; return c; };

/** Provincias enemigas limítrofes con alguna del bando. @param {Graph} graph @param {Game} g @param {number} f */
export function targetsOf(graph, g, f) {
  const out = new Set();
  for (let p = 0; p < graph.n; p++) if (g.owner[p] === f) for (const q of graph.adj[p]) if (g.owner[q] !== f) out.add(q);
  return [...out].sort((a, b) => a - b);
}
/** Provincias del bando que tocan el objetivo. @param {Graph} graph @param {Game} g @param {number} f @param {number} target */
export const sourcesOf = (graph, g, f, target) => graph.adj[target].filter(q => g.owner[q] === f);

/** La ruleta: bando atacante entre los vivos. @param {Game} g @returns {{game:Game, attacker:number, alive:number[]}} */
export function spin(g) {
  if (g.winner >= 0) throw new Error('La partida ha terminado');
  const game = clone(g), alive = aliveFactions(game);
  return {game, attacker:alive[int(game.rng, alive.length)], alive};
}

/** Tira 3d6 por bando hasta que no haya empate. @param {RngState} rng @param {number} pa @param {number} pd */
function battle(rng, pa, pd) {
  /** @type {Roll[]} */
  const rolls = [];
  for (let i = 0; i < MAX_REROLLS; i++) {
    const a = [d6(rng), d6(rng), d6(rng)], d = [d6(rng), d6(rng), d6(rng)];
    rolls.push({a, d});
    const x = (a[0] + a[1] + a[2]) * pa, y = (d[0] + d[1] + d[2]) * pd;
    if (x !== y) return {rolls, won:x > y};
  }
  return {rolls, won:pa >= pd}; // inalcanzable en la práctica
}

/**
 * Combate del atacante contra una provincia. Comprueba que el objetivo sea válido.
 * @param {Graph} graph @param {Game} g recién salida de spin() @param {number} attacker @param {number} target
 * @param {number[]} [alive] bandos de la ruleta, para el registro
 * @returns {{game:Game, round:Round}}
 */
export function attack(graph, g, attacker, target, alive = aliveFactions(g)) {
  check(graph, g, attacker, target);
  const game = clone(g), defender = game.owner[target];
  const {rolls} = battle(game.rng, game.power[attacker], game.power[defender]);
  return resolve(graph, game, attacker, target, rolls, alive);
}

/** @param {Graph} graph @param {Game} g @param {number} attacker @param {number} target */
function check(graph, g, attacker, target) {
  if (g.winner >= 0 || !g.alive[attacker] || !targetsOf(graph, g, attacker).includes(target)) throw new Error('Objetivo no válido');
}

/**
 * Aplica un combate con tiradas ya hechas (las del anfitrión en el multijugador).
 * Comprueba el objetivo y que las tiradas repetidas fueran empates. No usa el generador.
 * @param {Graph} graph @param {Game} g @param {number} attacker @param {number} target @param {Roll[]} rolls @param {number[]} [alive]
 * @returns {{game:Game, round:Round}}
 */
export function resolve(graph, g, attacker, target, rolls, alive = aliveFactions(g)) {
  check(graph, g, attacker, target);
  const game = clone(g), defender = game.owner[target], from = sourcesOf(graph, game, attacker, target);
  const targets = targetsOf(graph, game, attacker);
  const pa = game.power[attacker], pd = game.power[defender];
  const ok = (/** @type {number[]} */ v) => Array.isArray(v) && v.length === 3 && v.every(x => Number.isInteger(x) && x >= 1 && x <= 6);
  if (!rolls.length || !rolls.every(r => ok(r.a) && ok(r.d))) throw new Error('Tiradas no válidas');
  const sc = (/** @type {Roll} */ r) => [(r.a[0] + r.a[1] + r.a[2]) * pa, (r.d[0] + r.d[1] + r.d[2]) * pd];
  rolls.slice(0, -1).forEach(r => { const [x, y] = sc(r); if (x !== y) throw new Error('Tiradas no válidas'); });
  const [x, y] = sc(rolls[rolls.length - 1]);
  if (x === y) throw new Error('Tiradas no válidas');
  const won = x > y;
  const [w, l] = won ? [attacker, defender] : [defender, attacker];
  game.power[w] += GAIN;
  game.power[l] = Math.max(MIN_POWER, game.power[l] - LOSS);
  game.stats.wins[w]++;
  let eliminated = -1;
  if (won) {
    game.owner[target] = attacker;
    game.stats.conq[attacker]++;
    const c = counts(game);
    game.stats.peak[attacker] = Math.max(game.stats.peak[attacker], c[attacker]);
    if (c[defender] === 0) { game.alive[defender] = false; eliminated = defender; }
  }
  game.round++;
  const left = aliveFactions(game);
  if (left.length === 1) game.winner = left[0];
  return {game, round:{n:game.round, alive, attacker, targets, target, defender, from, pa, pd, prob:winProb(pa, pd).p, rolls:rolls.map(r => ({a:[...r.a], d:[...r.d]})), won,
    paAfter:game.power[attacker], pdAfter:game.power[defender], eliminated, winner:game.winner}};
}

/* ---------- Formato compacto para la red ---------- */
/** Tiradas como texto: "345612.112334" (3 dados del atacante y 3 del defensor por tirada). @param {Roll[]} rolls */
export const packRolls = rolls => rolls.map(r => r.a.join('') + r.d.join('')).join('.');
/** @param {string} s @returns {Roll[]} */
export function unpackRolls(s) {
  return String(s).split('.').filter(Boolean).map(t => {
    if (!/^[1-6]{6}$/.test(t)) throw new Error('Tiradas no válidas');
    const v = [...t].map(Number); return {a:v.slice(0, 3), d:v.slice(3)};
  });
}
/** Estado mínimo para reconectar: dueños, poder y estadísticas. @param {Game} g */
export const packGame = g => ({seed:g.seed, n:g.round, o:g.owner, p:g.power, c:g.stats.conq, w:g.stats.wins, k:g.stats.peak});
/** @param {Graph} graph @param {ReturnType<typeof packGame>} s @returns {Game} */
export function unpackGame(graph, s) {
  const g = newGame(graph, s.seed);
  const n = graph.n, arr = (/** @type {unknown} */ v) => Array.isArray(v) && v.length === n && v.every(x => Number.isInteger(x) && x >= 0);
  if (!arr(s.o) || !arr(s.p) || !s.o.every(o => o < n)) throw new Error('Estado no válido');
  g.round = +s.n || 0; g.owner = [...s.o]; g.power = s.p.map(x => Math.max(MIN_POWER, x));
  if (arr(s.c)) g.stats.conq = [...s.c]; if (arr(s.w)) g.stats.wins = [...s.w]; if (arr(s.k)) g.stats.peak = [...s.k];
  const c = counts(g); g.alive = c.map(x => x > 0);
  const left = aliveFactions(g); g.winner = left.length === 1 ? left[0] : -1;
  return g;
}

/**
 * Elige objetivo. Modo normal: al azar entre las limítrofes, con el generador de la partida.
 * @callback Chooser
 * @param {Game} g @param {number} attacker @param {number[]} targets @param {RngState} rng
 * @returns {number}
 */
/** @type {Chooser} */
export const randomTarget = (g, attacker, targets, rng) => targets[int(rng, targets.length)];

/** Ronda completa: ruleta, objetivo y combate. @param {Graph} graph @param {Game} g @param {Chooser} [choose] */
export function playRound(graph, g, choose = randomTarget) {
  const {game, attacker, alive} = spin(g);
  const target = choose(game, attacker, targetsOf(graph, game, attacker), game.rng);
  return attack(graph, game, attacker, target, alive);
}

/** Juega hasta el final (pruebas y simulaciones). @param {Graph} graph @param {Game} g @param {Chooser} [choose] */
export function playOut(graph, g, choose = randomTarget, max = 100000) {
  /** @type {Round[]} */
  const rounds = [];
  while (g.winner < 0 && rounds.length < max) { const r = playRound(graph, g, choose); g = r.game; rounds.push(r.round); }
  return {game:g, rounds};
}

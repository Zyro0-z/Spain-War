// @ts-check
// Quién decide cada ronda del modo espectador. La partida (play.js) solo anima; el «conductor» dice quién ataca,
// a quién y con qué dados: todo al azar con la semilla.
import {spin, targetsOf, attack, randomTarget} from '../engine/game.js';

/** @typedef {import('../engine/game.js').Game} Game */
/** @typedef {import('../engine/game.js').Round} Round */
/** @typedef {import('../engine/game.js').Graph} Graph */
/** @typedef {{game:Game, round:Round}} Result */
/**
 * @typedef {object} Step
 * @property {number} n
 * @property {number} attacker
 * @property {number[]} alive
 * @property {number[]} targets
 * @property {'me'|'bot'|'remote'} who
 * @property {Result} [known] resultado ya decidido
 * @property {Game} [spun] partida tras la ruleta (para decidir)
 * @property {Game} [jump] ponerse al día directamente con este estado
 * @property {boolean} [fast] va con retraso: animar deprisa
 * @property {Game} [prev] partida antes de la ronda
 */
/**
 * @typedef {object} Driver
 * @property {'normal'|'solo'|'host'|'guest'} kind
 * @property {number} me mi bando (-1 si no juego)
 * @property {(prev:Game) => Promise<Step>} next
 * @property {(step:Step, target:number) => Promise<Result>} decide mi decisión
 * @property {(step:Step) => Promise<Result>} settle esperar la decisión de otro
 * @property {(f:number) => string|null} [nameOf] nombre del jugador humano de un bando
 * @property {(cb:(s:'ok'|'away') => void) => void} [onStatus]
 * @property {() => void} [close]
 */

/** @implements {Driver} */
export class NormalDriver {
  /** @param {Graph} graph */
  constructor(graph) { this.graph = graph;
    /** @type {'normal'} */
    this.kind = 'normal'; this.me = -1; }
  /** @param {Game} prev @returns {Promise<Step>} */
  async next(prev) {
    const sp = spin(prev), targets = targetsOf(this.graph, sp.game, sp.attacker);
    const t = randomTarget(sp.game, sp.attacker, targets, sp.game.rng);
    return {n:prev.round + 1, attacker:sp.attacker, alive:sp.alive, targets, who:'bot', known:attack(this.graph, sp.game, sp.attacker, t, sp.alive)};
  }
  /** @returns {Promise<Result>} */
  decide() { return Promise.reject(new Error('Sin jugador')); }
  /** @returns {Promise<Result>} */
  settle() { return Promise.reject(new Error('Nada que esperar')); }
}

// @ts-check
// Quién decide cada ronda. La partida (play.js) solo anima; el «conductor» dice quién ataca, a quién y con qué dados.
// - Normal: todo al azar con la semilla.  - Un jugador: tú y bots.
// - Anfitrión: motor local, publica en la sala y espera a los invitados.  - Invitado: aplica lo que manda el anfitrión.
import {spin, targetsOf, attack, randomTarget, aliveFactions} from '../engine/game.js';
import {bot} from '../engine/bots.js';
import {AWAY_MS} from '../net/room.js';

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

/** @implements {Driver} */
export class SoloDriver {
  /** @param {Graph} graph @param {number} me @param {import('../engine/bots.js').Level} level */
  constructor(graph, me, level) { this.graph = graph;
    /** @type {'solo'} */
    this.kind = 'solo'; this.me = me; this.level = level; this.bot = bot(level, graph); }
  /** @param {Game} prev @returns {Promise<Step>} */
  async next(prev) {
    const sp = spin(prev), targets = targetsOf(this.graph, sp.game, sp.attacker);
    const base = {n:prev.round + 1, attacker:sp.attacker, alive:sp.alive, targets};
    if (sp.attacker === this.me) return {...base, who:'me', spun:sp.game};
    const t = this.bot(sp.game, sp.attacker, targets, sp.game.rng);
    return {...base, who:'bot', known:attack(this.graph, sp.game, sp.attacker, t, sp.alive)};
  }
  /** @param {Step} step @param {number} target */
  async decide(step, target) { return attack(this.graph, /** @type {Game} */ (step.spun), step.attacker, target, step.alive); }
  /** @returns {Promise<Result>} */
  settle() { return Promise.reject(new Error('Nada que esperar')); }
}

/** @implements {Driver} */
export class HostDriver {
  /** @param {import('../net/room.js').Host} host */
  constructor(host) {
    this.host = host;
    /** @type {'host'} */
    this.kind = 'host';
    /** @type {Result[]} */ this.queue = [];
  }
  get me() { const p = this.host.players.find(x => x.id === this.host.id); return p ? p.f : -1; }
  /** Calcula y publica hasta el primer turno humano. */
  async init() { this.queue.push(...await this.host.advance()); }
  /** @param {number} f */
  nameOf(f) { const p = this.host.players.find(x => x.f === f && !x.left); return p ? p.name : null; }
  /** @param {number} f @returns {'me'|'bot'|'remote'} */
  who(f) { const id = this.host.humanOf(f); return !id ? 'bot' : id === this.host.id ? 'me' : 'remote'; }
  /** @param {Game} prev @returns {Promise<Step>} */
  async next(prev) {
    const n = prev.round + 1;
    this.host.shown = prev.round;
    while (this.queue.length && this.queue[0].round.n < n) this.queue.shift();
    const q = this.queue[0];
    if (q && q.round.n === n) { this.queue.shift(); return {n, attacker:q.round.attacker, alive:q.round.alive, targets:q.round.targets, who:this.who(q.round.attacker), known:q}; }
    const p = this.host.pending;
    if (p && p.n === n) return {n, attacker:p.attacker, alive:p.alive, targets:targetsOf(this.host.graph, p.g, p.attacker), who:this.who(p.attacker)};
    // la vista va por detrás del motor (al volver a abrir): saltar al estado del anfitrión
    return {n, attacker:-1, alive:[], targets:[], who:'bot', jump:/** @type {Game} */ (this.host.game)};
  }
  /** @param {Step} step @param {number} target */
  async decide(step, target) { const rs = await this.host.play(target); this.queue.push(...rs.slice(1)); return rs[0]; }
  /** @param {Step} step */
  async settle(step) { const t = await this.host.waitMove(); return this.decide(step, t); }
  close() { this.host.close(); }
}

/** @implements {Driver} */
export class GuestDriver {
  /** @param {import('../net/room.js').Guest} guest */
  constructor(guest) {
    this.guest = guest;
    /** @type {'guest'} */
    this.kind = 'guest';
    /** @type {(s:'ok'|'away') => void} */ this.status = () => {};
    this.away = false;
  }
  get me() { return this.guest.role === 'spectator' ? -1 : this.guest.me; }
  /** @param {(s:'ok'|'away') => void} cb */
  onStatus(cb) { this.status = cb; }
  /** @param {number} f */
  nameOf(f) { const p = this.guest.players.find(x => x.f === f); return p ? p.name : null; }
  /** @param {number} f @returns {'me'|'bot'|'remote'} */
  who(f) { return f === this.me ? 'me' : this.guest.players.some(x => x.f === f) ? 'remote' : 'bot'; }
  /** Espera noticias del anfitrión; tras 20 s sin nada, avisa de que la partida está en pausa. */
  async news() {
    const ok = await this.guest.waitNews(AWAY_MS);
    if (!ok && !this.away) { this.away = true; this.status('away'); }
    if (ok && this.away) { this.away = false; this.status('ok'); }
  }
  /** @param {Game} prev @returns {Promise<Step>} */
  async next(prev) {
    for (;;) {
      const n = prev.round + 1, it = this.guest.item(n);
      if (it) {
        const alive = aliveFactions(prev), targets = targetsOf(this.guest.graph, prev, it.a);
        // solo se acelera si va por detrás de lo que ya enseña el anfitrión (al volver de segundo plano)
        const fast = this.guest.hostShown - n > 2;
        if (it.t != null) { const known = this.guest.resolveNext(prev); if (known) return {n, attacker:it.a, alive, targets, who:this.who(it.a), known, fast, prev}; }
        return {n, attacker:it.a, alive, targets, who:this.who(it.a), fast, prev};
      }
      const snap = this.guest.snap;
      if (snap && snap.n > prev.round && !this.guest.items.has(prev.round + 1)) return {n, attacker:-1, alive:[], targets:[], who:'bot', jump:/** @type {Game} */ (this.guest.snapshot())};
      await this.news();
    }
  }
  /** Espera el resultado de la ronda (lo decide el anfitrión). @param {Step} step @returns {Promise<Result>} */
  async settle(step) {
    for (;;) {
      const it = this.guest.item(step.n);
      if (it && it.t != null && step.prev) {
        const r = this.guest.resolveNext(step.prev);
        if (r) return r;
      }
      await this.news();
    }
  }
  /** @param {Step} step @param {number} target */
  async decide(step, target) {
    await this.guest.move(step.n, target).catch(() => {});
    return this.settle(step);
  }
  close() { this.guest.close(); }
}

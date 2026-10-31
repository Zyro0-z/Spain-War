// @ts-check
// Protocolo de la sala multijugador. El anfitrión es la autoridad: ejecuta el motor, tira los dados y valida
// las decisiones de los invitados. Los invitados solo envían decisiones (hola, provincia, objetivo).
//
// Mensajes (cuerpo JSON, v:1). Los del anfitrión llevan un número de secuencia `s` para procesarlos en orden.
//   invitado → anfitrión: hello {id, name, role}, pick {id, f}, leave {id}, move {id, n, target}
//   anfitrión → todos:    lobby {s, players, level, sp}, start {s, seed, players, level, sp},
//                         batch {s, r:[[n, atacante, objetivo, tiradas]...], turn:[n, atacante]|null, snap}
// Para respetar los límites de ntfy, el anfitrión agrupa en un mensaje todas las rondas de bots hasta el
// siguiente turno humano (troceadas si pasan de ~3,8 KB), y la sala se anuncia como mucho cada 0,6 s.
import {newGame, spin, targetsOf, attack, resolve, packRolls, unpackRolls, packGame, unpackGame} from '../engine/game.js';
import {bot, bestTarget, level as toLevel} from '../engine/bots.js';
import {newSeed} from '../engine/rng.js';
import {bytes, MAX_BYTES} from './transport.js';

export const MAX_PLAYERS = 8;
/** Tiempo para elegir objetivo, margen de red del anfitrión y aviso de anfitrión caído (ms). */
export const TURN_MS = 12000, GRACE_MS = 4000, AWAY_MS = 20000;
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Código de sala de 6 caracteres. @param {() => number} [rand] */
export const newCode = (rand = Math.random) => Array.from({length:6}, () => ALPHA[Math.floor(rand() * ALPHA.length)]).join('');
/** @param {unknown} s */
export const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export const newId = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
/** @param {unknown} s */
const cleanName = s => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, 16) || 'Jugador';

/** @typedef {import('../engine/game.js').Game} Game */
/** @typedef {import('../engine/game.js').Round} Round */
/** @typedef {import('../engine/game.js').Graph} Graph */
/** @typedef {import('./transport.js').Transport} Transport */
/** @typedef {import('./transport.js').NetMsg} NetMsg */
/** @typedef {{id:string, name:string, f:number, host?:boolean, left?:boolean}} Player */
/** @typedef {{now?:() => number, setTimeout?:(f:() => void, ms:number) => any, clearTimeout?:(t:any) => void}} Clockish */

/* ======================= Anfitrión ======================= */
export class Host {
  /**
   * @param {{transport:Transport, graph:Graph, id:string, name:string, code:string, level?:string, sp?:number, onChange?:() => void} & Clockish} o
   */
  constructor(o) {
    this.t = o.transport; this.graph = o.graph; this.id = o.id; this.code = o.code;
    this.now = o.now || Date.now; this.setT = o.setTimeout || ((f, ms) => setTimeout(f, ms)); this.clearT = o.clearTimeout || (t => clearTimeout(t));
    this.onChange = o.onChange || (() => {});
    /** @type {'lobby'|'play'} */ this.phase = 'lobby';
    /** @type {Player[]} */ this.players = [{id:o.id, name:cleanName(o.name), f:-1, host:true}];
    this.level = toLevel(o.level); this.sp = o.sp === 2 ? 2 : 1;
    this.s = 0; this.seed = ''; this.lastId = '';
    /** Ronda que está mostrando el anfitrión (los invitados se ponen al día si van por detrás). */ this.shown = 0;
    /** @type {Game|null} */ this.game = null;
    /** @type {{n:number, attacker:number, alive:number[], g:Game}|null} */ this.pending = null;
    /** @type {Map<number, {id:string, target:number}>} */ this.moves = new Map();
    /** @type {((t:number) => void)|null} */ this.moveWaiter = null;
    this.lobbyT = null;
  }
  /** Empieza a escuchar (y recupera lo perdido si se vuelve a abrir). */
  async open(since = '') {
    if (since) for (const m of await this.t.poll(since)) this.onMsg(m);
    this.t.subscribe(m => this.onMsg(m), since || undefined);
    if (this.phase === 'lobby') this.sendLobby();
  }
  /** @param {NetMsg} m */
  onMsg(m) {
    this.lastId = m.id;
    const b = m.body; if (!b || b.v !== 1 || b.id === this.id) return;
    const p = this.players.find(x => x.id === b.id);
    if (b.t === 'hello') {
      if (p) { p.left = false; p.name = cleanName(b.name); }
      else if (this.phase === 'lobby' && b.role !== 'spectator' && this.players.length < MAX_PLAYERS) this.players.push({id:String(b.id).slice(0, 24), name:cleanName(b.name), f:-1});
      this.scheduleLobby();
    } else if (b.t === 'pick' && p && this.phase === 'lobby') {
      const f = +b.f;
      if (Number.isInteger(f) && f >= -1 && f < this.graph.n && !this.players.some(x => x !== p && x.f === f)) { p.f = f; this.scheduleLobby(); }
    } else if (b.t === 'leave' && p) {
      if (this.phase === 'lobby') this.players = this.players.filter(x => x !== p); else p.left = true;
      this.scheduleLobby();
    } else if (b.t === 'move' && p && this.phase === 'play') {
      const n = +b.n, target = +b.target;
      this.moves.set(n, {id:p.id, target});
      this.checkMove();
    }
    this.onChange();
  }
  scheduleLobby() {
    if (this.phase !== 'lobby' || this.lobbyT) return;
    this.lobbyT = this.setT(() => { this.lobbyT = null; this.sendLobby(); }, 600);
  }
  sendLobby() { return this.t.publish({v:1, t:'lobby', s:++this.s, players:this.players, level:this.level, sp:this.sp}).catch(() => {}); }
  /** @param {number} f provincia del anfitrión */
  pick(f) { if (this.players.some(x => !x.host && x.f === f)) return false; this.players[0].f = f; this.scheduleLobby(); this.onChange(); return true; }
  /** @param {{level?:string, sp?:number}} o */
  configure(o) { if (o.level) this.level = toLevel(o.level); if (o.sp) this.sp = o.sp === 2 ? 2 : 1; this.scheduleLobby(); this.onChange(); }
  canStart() { const act = this.players.filter(p => !p.left); return act.length >= 2 && act.every(p => p.f >= 0); }
  /** Jugador que controla un bando (null si es bot). @param {number} f */
  humanOf(f) { const p = this.players.find(x => x.f === f && !x.left); return p ? p.id : null; }
  /** @param {string} [seed] */
  async start(seed) {
    if (!this.canStart()) throw new Error('Faltan jugadores o provincias');
    this.players = this.players.filter(p => !p.left);
    this.seed = seed || newSeed(); this.game = newGame(this.graph, this.seed); this.phase = 'play';
    if (this.lobbyT) { this.clearT(this.lobbyT); this.lobbyT = null; }
    await this.t.publish({v:1, t:'start', s:++this.s, seed:this.seed, players:this.players, level:this.level, sp:this.sp});
    this.onChange();
  }
  /**
   * Juega las rondas de bots hasta el siguiente turno humano (o el final) y las publica juntas.
   * @param {boolean} [publish] @returns {Promise<{round:Round, game:Game}[]>}
   */
  async advance(publish = true) {
    const g0 = /** @type {Game} */ (this.game), out = [], choose = bot(this.level, this.graph);
    let g = g0;
    while (g.winner < 0) {
      const sp = spin(g);
      if (this.humanOf(sp.attacker)) { this.pending = {n:g.round + 1, attacker:sp.attacker, alive:sp.alive, g:sp.game}; break; }
      const t = choose(sp.game, sp.attacker, targetsOf(this.graph, sp.game, sp.attacker), sp.game.rng);
      const r = attack(this.graph, sp.game, sp.attacker, t, sp.alive);
      out.push(r); g = r.game;
    }
    this.game = g;
    if (publish) await this.publishBatch(out.map(x => x.round));
    return out;
  }
  /**
   * Resuelve el turno humano pendiente con el objetivo elegido y sigue hasta el siguiente.
   * @param {number} target @returns {Promise<{round:Round, game:Game}[]>}
   */
  async play(target) {
    const p = this.pending; if (!p) throw new Error('No hay turno pendiente');
    const targets = targetsOf(this.graph, p.g, p.attacker);
    if (!targets.includes(target)) target = bestTarget(p.g, p.attacker, targets);
    const r = attack(this.graph, p.g, p.attacker, target, p.alive);
    this.pending = null; this.moves.delete(p.n); this.game = r.game;
    const rest = await this.advance(false);
    await this.publishBatch([r.round, ...rest.map(x => x.round)]);
    return [r, ...rest];
  }
  /**
   * Espera la decisión del invitado para el turno pendiente; al agotarse el tiempo, el mejor objetivo.
   * @param {number} ms
   * @returns {Promise<number>}
   */
  waitMove(ms = TURN_MS + GRACE_MS) {
    const p = this.pending; if (!p) return Promise.reject(new Error('No hay turno pendiente'));
    return new Promise(res => {
      const done = (/** @type {number} */ t) => { this.clearT(timer); this.moveWaiter = null; res(t); };
      const timer = this.setT(() => done(bestTarget(p.g, p.attacker, targetsOf(this.graph, p.g, p.attacker))), ms);
      this.moveWaiter = done;
      this.checkMove();
    });
  }
  checkMove() {
    const p = this.pending; if (!p || !this.moveWaiter) return;
    const mv = this.moves.get(p.n);
    if (mv && mv.id === this.humanOf(p.attacker) && targetsOf(this.graph, p.g, p.attacker).includes(mv.target)) this.moveWaiter(mv.target);
  }
  /** Publica rondas en uno o varios mensajes (máx. ~3,8 KB) con el turno pendiente y el estado al final. @param {Round[]} rounds */
  async publishBatch(rounds) {
    const rows = rounds.map(r => [r.n, r.attacker, r.target, packRolls(r.rolls)]);
    const tail = {turn:this.pending ? [this.pending.n, this.pending.attacker] : null, hn:this.shown, snap:packGame(/** @type {Game} */ (this.game))};
    const msgs = [];
    let cur = [];
    const size = (/** @type {any[]} */ r, last = false) => bytes(JSON.stringify({v:1, t:'batch', s:999999, r, ...(last ? tail : {turn:null})}));
    for (const row of rows) {
      if (cur.length && size([...cur, row], true) > MAX_BYTES) { msgs.push(cur); cur = []; }
      cur.push(row);
    }
    msgs.push(cur);
    for (let i = 0; i < msgs.length; i++) {
      const last = i === msgs.length - 1;
      await this.t.publish({v:1, t:'batch', s:++this.s, r:msgs[i], ...(last ? tail : {turn:null})});
    }
  }
  toJSON() {
    return {code:this.code, id:this.id, phase:this.phase, players:this.players, level:this.level, sp:this.sp, s:this.s, seed:this.seed, lastId:this.lastId,
      game:this.game, pending:this.pending};
  }
  /** @param {any} j */
  restore(j) {
    Object.assign(this, {phase:j.phase, players:j.players, level:toLevel(j.level), sp:j.sp, s:j.s, seed:j.seed, lastId:j.lastId, game:j.game, pending:j.pending});
  }
  /** Al volver de segundo plano: lo perdido y escucha de nuevo. */
  async resync() { const since = this.lastId; if (since) for (const m of await this.t.poll(since).catch(() => [])) this.onMsg(m); this.t.subscribe(m => this.onMsg(m), this.lastId || undefined); }
  close() { if (this.lobbyT) this.clearT(this.lobbyT); this.t.close(); }
}

/* ======================= Invitado o espectador ======================= */
export class Guest {
  /**
   * @param {{transport:Transport, graph:Graph, id:string, name:string, code:string, role?:'player'|'spectator', onChange?:() => void, onStart?:() => void} & Clockish} o
   */
  constructor(o) {
    this.t = o.transport; this.graph = o.graph; this.id = o.id; this.name = cleanName(o.name); this.code = o.code;
    this.role = o.role === 'spectator' ? 'spectator' : 'player';
    this.now = o.now || Date.now; this.setT = o.setTimeout || ((f, ms) => setTimeout(f, ms)); this.clearT = o.clearTimeout || (t => clearTimeout(t));
    this.onChange = o.onChange || (() => {}); this.onStart = o.onStart || (() => {});
    /** @type {'join'|'lobby'|'play'} */ this.phase = 'join';
    /** @type {Player[]} */ this.players = []; this.level = 'estratega'; this.sp = 1; this.seed = '';
    this.hs = 0; this.lastId = ''; this.lastHostAt = this.now();
    /** @type {Map<number, any>} mensajes del anfitrión que han llegado antes de tiempo */ this.buffer = new Map();
    /** @type {Map<number, {a:number, t?:number, r?:string}>} rondas conocidas */ this.items = new Map();
    /** @type {any} */ this.snap = null;
    /** Ronda que mostraba el anfitrión al publicar lo último. */ this.hostShown = 0;
    /** @type {Set<() => void>} */ this.waiters = new Set();
    this.gapT = null;
  }
  /** Mi bando (o -1 si miro o aún no he elegido). */
  get me() { const p = this.players.find(x => x.id === this.id); return p ? p.f : -1; }
  /** Entra en la sala: recupera lo guardado en ntfy y escucha. @param {string} [since] */
  async join(since = 'all') {
    for (const m of await this.t.poll(since)) this.onMsg(m);
    this.t.subscribe(m => this.onMsg(m), this.lastId || undefined);
    if (this.phase !== 'play') await this.t.publish({v:1, t:'hello', id:this.id, name:this.name, role:this.role}).catch(() => {});
    if (this.phase === 'join') this.phase = 'lobby';
  }
  /** @param {number} f */
  pick(f) { return this.t.publish({v:1, t:'pick', id:this.id, f}); }
  leave() { return this.t.publish({v:1, t:'leave', id:this.id}).catch(() => {}); }
  /** @param {number} n @param {number} target */
  move(n, target) { return this.t.publish({v:1, t:'move', id:this.id, n, target}); }
  /** @param {NetMsg} m */
  onMsg(m) {
    this.lastId = m.id;
    const b = m.body; if (!b || b.v !== 1 || typeof b.s !== 'number') return; // solo mensajes del anfitrión
    if (b.s <= this.hs) return; // repetido
    this.buffer.set(b.s, b);
    this.drain();
    // hueco: falta alguno anterior; se pide lo guardado al poco
    if (this.buffer.size && !this.gapT) this.gapT = this.setT(() => { this.gapT = null; this.refill(); }, 1500);
  }
  async refill() {
    if (!this.buffer.size) return;
    try { for (const m of await this.t.poll('all')) this.onMsg(m); } catch (e) {}
  }
  drain() {
    while (this.buffer.has(this.hs + 1)) {
      const b = this.buffer.get(this.hs + 1); this.buffer.delete(this.hs + 1); this.hs++;
      this.lastHostAt = this.now();
      this.apply(b);
    }
    this.onChange();
    this.waiters.forEach(w => w());
  }
  /** @param {any} b */
  apply(b) {
    if (b.t === 'lobby') { this.players = b.players; this.level = b.level; this.sp = b.sp; if (this.phase !== 'play') this.phase = 'lobby'; }
    else if (b.t === 'start') { this.players = b.players; this.level = b.level; this.sp = b.sp; this.seed = b.seed; this.phase = 'play'; this.onStart(); }
    else if (b.t === 'batch') {
      for (const [n, a, t, r] of b.r || []) this.items.set(n, {a, t, r});
      if (b.turn) { const [n, a] = b.turn; if (!this.items.has(n)) this.items.set(n, {a}); }
      if (b.snap) this.snap = b.snap;
      if (typeof b.hn === 'number') this.hostShown = Math.max(this.hostShown, b.hn);
    }
  }
  /** Lo que se sabe de la ronda n (o undefined). @param {number} n */
  item(n) { return this.items.get(n); }
  /** Espera a que llegue algo nuevo del anfitrión. @param {number} ms */
  waitNews(ms) {
    return new Promise(res => {
      const w = () => { this.waiters.delete(w); this.clearT(timer); res(true); };
      const timer = this.setT(() => { this.waiters.delete(w); res(false); }, ms);
      this.waiters.add(w);
    });
  }
  /**
   * Aplica la ronda n a la partida si ya se conoce el resultado.
   * @param {Game} g @returns {{game:Game, round:Round}|null}
   */
  resolveNext(g) {
    const it = this.items.get(g.round + 1);
    if (!it || it.t == null || it.r == null) return null;
    return resolve(this.graph, g, it.a, it.t, unpackRolls(it.r));
  }
  /** Partida desde el último estado recibido (para ponerse al día). */
  snapshot() { return this.snap ? unpackGame(this.graph, this.snap) : null; }
  /** Partida inicial. */
  initial() { return newGame(this.graph, this.seed); }
  toJSON() { return {code:this.code, id:this.id, name:this.name, role:this.role, phase:this.phase, players:this.players, level:this.level, sp:this.sp, seed:this.seed, hs:this.hs, lastId:this.lastId, snap:this.snap, hostShown:this.hostShown, items:[...this.items]}; }
  /** @param {any} j */
  restore(j) {
    Object.assign(this, {phase:j.phase, players:j.players || [], level:j.level, sp:j.sp, seed:j.seed, hs:j.hs || 0, lastId:j.lastId || '', snap:j.snap || null, hostShown:j.hostShown || 0});
    this.items = new Map(j.items || []);
  }
  /** Al volver de segundo plano: lo perdido y escucha de nuevo. */
  async resync() { const since = this.lastId || 'all'; for (const m of await this.t.poll(since).catch(() => [])) this.onMsg(m); this.t.subscribe(m => this.onMsg(m), this.lastId || undefined); }
  close() { if (this.gapT) this.clearT(this.gapT); this.t.close(); }
}

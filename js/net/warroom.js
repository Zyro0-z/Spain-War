// @ts-check
// Sala de la conquista online (protocolo v:2). Turnos simultáneos: cada jugador da sus órdenes en su móvil y
// las publica al terminar; cuando el anfitrión tiene las de todos (o se agota el tiempo) publica el cierre del
// turno. Cada móvil aplica las mismas órdenes con el mismo motor determinista (resolveTurn) y comprueba que
// llega al mismo estado con la huella que manda el anfitrión. Así no viaja nunca la partida entera.
//
// Mensajes (cuerpo JSON, v:2). Los del anfitrión llevan un número de secuencia `s` y se procesan en orden.
//   cualquiera → todos: hello {id, name, role}, pick {id, f, custom}, leave {id},
//                       orders {id, turn, f, h, part, parts, a}, chat {id, f, k}
//   anfitrión → todos:  lobby {s, players, cfg}, start {s, seed, players, cfg},
//                       resolve {s, turn, inc:{f:h}, drop:[f], hash}
import {hash as stateHash} from '../conquest/engine.js';
import {resolveTurn} from '../conquest/turn.js';
import {bytes, MAX_BYTES} from './transport.js';

export const MAX_PLAYERS = 8;
/** Frases rápidas del chat. */
export const CHAT = ['¡Hola!', 'Buena suerte', '¿Hacemos las paces?', '¿Alianza contra el líder?', 'Cuidado conmigo', 'Bien jugado', 'Un momento, ahora vuelvo', '¡Venga, termina el turno!'];
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Código de sala de 6 caracteres. @param {() => number} [rand] */
export const newCode = (rand = Math.random) => Array.from({length:6}, () => ALPHA[Math.floor(rand() * ALPHA.length)]).join('');
/** @param {unknown} s */
export const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export const newId = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
/** @param {unknown} s */
const cleanName = s => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, 16) || 'Jugador';
/** Huella corta de una lista de órdenes. @param {any[]} acts */
export function ordersHash(acts) {
  const s = JSON.stringify(acts);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** @typedef {import('../conquest/engine.js').Game} Game */
/** @typedef {import('../conquest/engine.js').Geo} Geo */
/** @typedef {import('./transport.js').Transport} Transport */
/** @typedef {import('./transport.js').NetMsg} NetMsg */
/** @typedef {{name:string, flag:any, color?:string, motto?:string}} Custom */
/** @typedef {{id:string, name:string, f:number, host?:boolean, left?:boolean, custom?:Custom|null}} Player */
/** @typedef {{sc:string, diff:'facil'|'normal'|'dificil', rules:{fog:boolean, events:boolean, seasons:boolean, victory:string}, timer:number}} Config */
/** @typedef {{now?:() => number, setTimeout?:(f:() => void, ms:number) => any, clearTimeout?:(t:any) => void}} Clockish */
/**
 * @typedef {object} PeerOptions
 * @property {Transport} transport
 * @property {string} id
 * @property {string} name
 * @property {string} code
 * @property {(start:{seed:string, players:Player[], cfg:Config}) => Game} build crea la partida inicial (igual en todos)
 * @property {(sc:string) => Geo} geo geografía del escenario
 * @property {() => void} [onChange]
 * @property {(prev:Game, next:Game, ev:any[]) => void} [onTurn] turno resuelto
 * @property {(m:{f:number, name:string, text:string}) => void} [onChat]
 * @property {() => void} [onStart]
 * @property {() => void} [onDesync]
 */
export const DEFAULT_CFG = /** @type {Config} */ ({sc:'comunidades', diff:'normal', rules:{fog:false, events:true, seasons:true, victory:'dominacion'}, timer:0});

/* ======================= Común ======================= */
class Peer {
  /** @param {PeerOptions & Clockish} o */
  constructor(o) {
    this.t = o.transport; this.id = o.id; this.name = cleanName(o.name); this.code = o.code;
    this.build = o.build; this.geoOf = o.geo;
    this.now = o.now || Date.now; this.setT = o.setTimeout || ((f, ms) => setTimeout(f, ms)); this.clearT = o.clearTimeout || (t => clearTimeout(t));
    this.onChange = o.onChange || (() => {}); this.onTurn = o.onTurn || (() => {}); this.onChat = o.onChat || (() => {});
    this.onStart = o.onStart || (() => {}); this.onDesync = o.onDesync || (() => {});
    /** @type {'join'|'lobby'|'play'} */ this.phase = 'join';
    /** @type {Player[]} */ this.players = [];
    /** @type {Config} */ this.cfg = structuredCopy(DEFAULT_CFG);
    this.seed = ''; this.lastId = '';
    /** @type {Game|null} partida confirmada (el principio del turno en curso) */ this.game = null;
    /** @type {Map<string, {h:string, parts:any[][], n:number}>} órdenes recibidas por `turno:bando` */ this.orders = new Map();
    /** @type {Map<number, any>} cierres de turno pendientes de aplicar */ this.resolves = new Map();
    this.refillT = null; this.desynced = false;
  }
  /** @param {'join'|'lobby'|'play'} p */
  setPhase(p) { this.phase = p; }
  /** Mi bando (o -1). */
  get me() { const p = this.players.find(x => x.id === this.id); return p ? p.f : -1; }
  /** Bandos humanos que aún tienen que mandar órdenes este turno. */
  waiting() {
    const g = this.game; if (!g || g.over) return [];
    return g.humans.filter(f => g.F.alive[f] && !this.players.find(p => p.f === f)?.left && !this.hasOrders(g.turn, f));
  }
  /** @param {number} turn @param {number} f */
  hasOrders(turn, f) { const o = this.orders.get(turn + ':' + f); return !!o && o.parts.filter(Boolean).length === o.n; }
  /** @param {number} turn @param {number} f */
  ordersOf(turn, f) { const o = this.orders.get(turn + ':' + f); return o && o.parts.filter(Boolean).length === o.n ? {h:o.h, a:o.parts.flat()} : null; }
  /** Publica mis órdenes del turno (troceadas si no caben en un mensaje). @param {any[]} acts */
  async sendOrders(acts) {
    const g = this.game, f = this.me; if (!g || f < 0) return;
    const h = ordersHash(acts), parts = [];
    let cur = [];
    const size = (/** @type {any[]} */ a) => bytes(JSON.stringify({v:2, t:'orders', id:this.id, turn:g.turn, f, h, part:99, parts:99, a}));
    for (const a of acts) { if (cur.length && size([...cur, a]) > MAX_BYTES) { parts.push(cur); cur = []; } cur.push(a); }
    parts.push(cur);
    const msgs = parts.map((a, i) => ({v:2, t:'orders', id:this.id, turn:g.turn, f, h, part:i, parts:parts.length, a}));
    for (const m of msgs) this.common(structuredCopy(m)); // las mías cuentan ya, sin esperar el eco de ntfy
    for (const m of msgs) await this.t.publish(m);
  }
  /** @param {number} k frase del chat */
  chat(k) { return this.t.publish({v:2, t:'chat', id:this.id, f:this.me, k}).catch(() => {}); }
  /** Lo común de los mensajes: órdenes y chat. @param {any} b */
  common(b) {
    if (b.t === 'orders' && Number.isInteger(b.turn) && Number.isInteger(b.f) && Array.isArray(b.a)) {
      const p = this.players.find(x => x.id === b.id);
      if (!p || p.f !== b.f) return; // solo el dueño del bando
      const key = b.turn + ':' + b.f, n = Math.max(1, Math.min(20, +b.parts || 1));
      let o = this.orders.get(key);
      if (!o || o.h !== b.h) { o = {h:String(b.h), parts:new Array(n).fill(null), n}; this.orders.set(key, o); }
      const i = +b.part || 0; if (i >= 0 && i < n) o.parts[i] = b.a;
      this.step();
    } else if (b.t === 'chat' && Number.isInteger(b.k) && CHAT[b.k]) {
      const p = this.players.find(x => x.id === b.id);
      if (p && b.id !== this.id) this.onChat({f:p.f, name:p.name, text:CHAT[b.k]});
    }
  }
  /** Empieza la partida con el mensaje de inicio. @param {any} b */
  begin(b) {
    this.players = b.players; this.cfg = b.cfg; this.seed = b.seed; this.phase = 'play';
    this.game = this.build({seed:b.seed, players:b.players, cfg:b.cfg});
    this.onStart();
  }
  /** Aplica los cierres de turno que ya se pueden aplicar (si faltan órdenes, las pide a ntfy). */
  step() {
    for (;;) {
      const g = this.game; if (!g) return;
      const r = this.resolves.get(g.turn); if (!r) return;
      /** @type {Record<number, any[]>} */ const orders = {};
      let missing = false;
      for (const [f, h] of Object.entries(r.inc || {})) {
        if (h == null) continue;
        const o = this.ordersOf(g.turn, +f);
        if (!o || o.h !== h) { missing = true; break; }
        orders[+f] = o.a;
      }
      if (missing) { this.refill(); return; }
      const {g:next, ev} = resolveTurn(this.geoOf(g.scenario), g, orders, r.drop || []);
      this.resolves.delete(g.turn);
      for (const k of [...this.orders.keys()]) if (+k.split(':')[0] <= g.turn) this.orders.delete(k);
      if (r.hash && stateHash(next) !== r.hash && !this.desynced) { this.desynced = true; this.onDesync(); }
      for (const f of r.drop || []) { const p = this.players.find(x => x.f === f); if (p) p.left = true; }
      this.game = next;
      this.onTurn(g, next, ev);
      this.onChange();
    }
  }
  refill() {
    if (this.refillT) return;
    this.refillT = this.setT(async () => {
      this.refillT = null;
      try { for (const m of await this.t.poll('all')) this.onMsg(m); } catch (e) {}
    }, 1200);
  }
  /** @param {NetMsg} m */
  onMsg(m) { void m; }
  /** Al volver de segundo plano: lo perdido y escucha de nuevo. */
  async resync() { const since = this.lastId || 'all'; for (const m of await this.t.poll(since).catch(() => [])) this.onMsg(m); this.t.subscribe(m => this.onMsg(m), this.lastId || undefined); }
  close() { if (this.refillT) this.clearT(this.refillT); this.t.close(); }
  base() {
    return {code:this.code, id:this.id, name:this.name, phase:this.phase, players:this.players, cfg:this.cfg, seed:this.seed, lastId:this.lastId, game:this.game,
      orders:[...this.orders].map(([k, o]) => [k, o]), resolves:[...this.resolves]};
  }
  /** @param {any} j */
  restoreBase(j) {
    Object.assign(this, {phase:j.phase, players:j.players || [], cfg:j.cfg || structuredCopy(DEFAULT_CFG), seed:j.seed || '', lastId:j.lastId || '', game:j.game || null});
    this.orders = new Map(j.orders || []); this.resolves = new Map(j.resolves || []);
  }
}
/** @template T @param {T} v @returns {T} */
const structuredCopy = v => JSON.parse(JSON.stringify(v));

/* ======================= Anfitrión ======================= */
export class WarHost extends Peer {
  /** @param {PeerOptions & Clockish & {cfg?:Config}} o */
  constructor(o) {
    super(o);
    this.setPhase('lobby');
    /** @type {Player[]} */ const ps = [{id:o.id, name:this.name, f:-1, host:true}];
    this.players = ps;
    if (o.cfg) this.cfg = structuredCopy(o.cfg);
    this.s = 0; this.lobbyT = null; this.timerT = null;
    /** Cuándo empezó el turno en curso (para el límite de tiempo). */ this.turnAt = 0;
  }
  /** @param {string} [since] */
  async open(since = '') {
    if (since) for (const m of await this.t.poll(since)) this.onMsg(m);
    this.t.subscribe(m => this.onMsg(m), since || undefined);
    if (this.phase === 'lobby') this.sendLobby();
    else this.armTimer();
  }
  /** @param {NetMsg} m */
  onMsg(m) {
    this.lastId = m.id;
    const b = m.body; if (!b || b.v !== 2 || typeof b.s === 'number') return; // lo del propio anfitrión ya está aplicado
    const p = this.players.find(x => x.id === b.id);
    if (b.t === 'hello') {
      if (p) { p.left = false; p.name = cleanName(b.name); }
      else if (this.phase === 'lobby' && b.role !== 'spectator' && this.players.length < MAX_PLAYERS) this.players.push({id:String(b.id).slice(0, 24), name:cleanName(b.name), f:-1});
      this.scheduleLobby();
    } else if (b.t === 'pick' && p && this.phase === 'lobby') {
      const f = +b.f;
      if (Number.isInteger(f) && f >= -1 && f < 64 && (f < 0 || !this.players.some(x => x !== p && x.f === f))) { p.f = f; p.custom = cleanCustom(b.custom); this.scheduleLobby(); }
    } else if (b.t === 'leave' && p) {
      if (this.phase === 'lobby') this.players = this.players.filter(x => x !== p); else p.left = true;
      this.scheduleLobby(); this.check();
    } else this.common(b);
    if (b.t === 'orders') this.check();
    this.onChange();
  }
  scheduleLobby() {
    if (this.phase !== 'lobby' || this.lobbyT) return;
    this.lobbyT = this.setT(() => { this.lobbyT = null; this.sendLobby(); }, 600);
  }
  sendLobby() { return this.t.publish({v:2, t:'lobby', s:++this.s, players:this.players, cfg:this.cfg}).catch(() => {}); }
  /** @param {number} f @param {Custom|null} [custom] */
  pick(f, custom = null) {
    if (f >= 0 && this.players.some(x => !x.host && x.f === f)) return false;
    this.players[0].f = f; this.players[0].custom = cleanCustom(custom);
    this.scheduleLobby(); this.onChange(); return true;
  }
  /** Cambia la configuración; al cambiar de escenario se vacían las elecciones. @param {Partial<Config>} c */
  configure(c) {
    if (c.sc && c.sc !== this.cfg.sc) for (const p of this.players) p.f = -1;
    this.cfg = {...this.cfg, ...c, rules:{...this.cfg.rules, ...(c.rules || {})}};
    this.scheduleLobby(); this.onChange();
  }
  canStart() { const act = this.players.filter(p => !p.left); return act.length >= 2 && act.every(p => p.f >= 0); }
  /** @param {string} seed */
  async start(seed) {
    if (!this.canStart()) throw new Error('Faltan jugadores o bandos');
    this.players = this.players.filter(p => !p.left);
    if (this.lobbyT) { this.clearT(this.lobbyT); this.lobbyT = null; }
    const b = {v:2, t:'start', s:++this.s, seed, players:this.players, cfg:this.cfg};
    await this.t.publish(b);
    this.begin(b);
    this.armTimer();
    this.onChange();
  }
  /** Límite de tiempo del turno (si lo hay). */
  armTimer() {
    if (this.timerT) this.clearT(this.timerT);
    this.timerT = null; this.turnAt = this.now();
    if (this.cfg.timer > 0 && this.phase === 'play') this.timerT = this.setT(() => { this.timerT = null; this.close_(); }, this.cfg.timer * 1000);
  }
  /** Si ya están las órdenes de todos, cierra el turno. */
  check() { if (this.phase === 'play' && this.game && !this.game.over && !this.waiting().length) this.close_(); }
  /** Cierra el turno sin esperar a los que faltan (sus órdenes quedan vacías). */
  skip() { if (this.phase === 'play') this.close_(); }
  /** Publica el cierre del turno y lo aplica. */
  close_() {
    const g = this.game; if (!g || g.over || this.resolves.has(g.turn)) return;
    /** @type {Record<number, string|null>} */ const inc = {};
    /** @type {Record<number, any[]>} */ const orders = {};
    for (const f of g.humans) { const o = this.ordersOf(g.turn, f); inc[f] = o ? o.h : null; if (o) orders[f] = o.a; }
    const drop = g.humans.filter(f => this.players.find(p => p.f === f)?.left);
    const {g:next} = resolveTurn(this.geoOf(g.scenario), g, orders, drop);
    const r = {v:2, t:'resolve', s:++this.s, turn:g.turn, inc, drop, hash:stateHash(next)};
    this.resolves.set(g.turn, r);
    this.t.publish(r).catch(() => {});
    this.step();
    this.armTimer();
  }
  /** @param {any[]} acts */
  async sendOrders(acts) { const p = super.sendOrders(acts); this.check(); await p; }
  toJSON() { return {...this.base(), kind:'host', s:this.s}; }
  /** @param {any} j */
  restore(j) { this.restoreBase(j); this.s = j.s || 0; }
  close() { if (this.lobbyT) this.clearT(this.lobbyT); if (this.timerT) this.clearT(this.timerT); super.close(); }
}

/* ======================= Invitado o espectador ======================= */
export class WarGuest extends Peer {
  /** @param {PeerOptions & Clockish & {role?:'player'|'spectator'}} o */
  constructor(o) {
    super(o);
    this.role = o.role === 'spectator' ? 'spectator' : 'player';
    this.hs = 0; this.lastHostAt = this.now();
    /** @type {Map<number, any>} mensajes del anfitrión que llegan antes de tiempo */ this.buffer = new Map();
    this.gapT = null;
  }
  /** @param {string} [since] */
  async join(since = 'all') {
    for (const m of await this.t.poll(since)) this.onMsg(m);
    this.t.subscribe(m => this.onMsg(m), this.lastId || undefined);
    if (this.phase !== 'play') await this.t.publish({v:2, t:'hello', id:this.id, name:this.name, role:this.role}).catch(() => {});
    if (this.phase === 'join') this.phase = 'lobby';
    this.onChange();
  }
  /** @param {number} f @param {Custom|null} [custom] */
  pick(f, custom = null) { return this.t.publish({v:2, t:'pick', id:this.id, f, custom:cleanCustom(custom)}); }
  leave() { return this.t.publish({v:2, t:'leave', id:this.id}).catch(() => {}); }
  /** @param {NetMsg} m */
  onMsg(m) {
    this.lastId = m.id;
    const b = m.body; if (!b || b.v !== 2) return;
    if (typeof b.s !== 'number') { this.common(b); this.onChange(); return; }
    if (b.s <= this.hs) return;
    this.buffer.set(b.s, b);
    while (this.buffer.has(this.hs + 1)) {
      const x = this.buffer.get(this.hs + 1); this.buffer.delete(this.hs + 1); this.hs++;
      this.lastHostAt = this.now();
      if (x.t === 'lobby') { this.players = x.players; this.cfg = x.cfg; if (this.phase !== 'play') this.phase = 'lobby'; }
      else if (x.t === 'start') this.begin(x);
      else if (x.t === 'resolve') { this.resolves.set(x.turn, x); this.step(); }
    }
    // hueco: falta alguno anterior; se pide lo guardado al poco
    if (this.buffer.size && !this.gapT) this.gapT = this.setT(() => { this.gapT = null; this.refill(); }, 1500);
    this.onChange();
  }
  toJSON() { return {...this.base(), kind:'guest', role:this.role, hs:this.hs}; }
  /** @param {any} j */
  restore(j) { this.restoreBase(j); this.hs = j.hs || 0; this.role = j.role === 'spectator' ? 'spectator' : 'player'; }
  close() { if (this.gapT) this.clearT(this.gapT); super.close(); }
}

/** Bando propio recibido por la red: solo campos conocidos y cortos. @param {any} c @returns {Custom|null} */
export function cleanCustom(c) {
  if (!c || typeof c !== 'object' || typeof c.name !== 'string') return null;
  const hex = (/** @type {any} */ v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '';
  const f = c.flag && typeof c.flag === 'object' ? {layout:String(c.flag.layout || '').slice(0, 12), c:Array.isArray(c.flag.c) ? c.flag.c.slice(0, 3).map(hex) : [], sym:String(c.flag.sym || '').slice(0, 12), sc:hex(c.flag.sc)} : null;
  return {name:cleanName(c.name).slice(0, 22), flag:f, color:hex(c.color), motto:String(c.motto || '').replace(/[<>&"]/g, '').slice(0, 40)};
}

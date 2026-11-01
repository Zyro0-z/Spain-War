// @ts-check
// Motor del modo conquista. Puro y determinista: sin DOM, sin Date ni Math.random y solo aritmética entera,
// así una semilla y las mismas órdenes dan la misma partida en cualquier dispositivo (necesario para el online).
// Reglas detalladas en docs/DISENO.md.
import {seedState, int, d6} from '../engine/rng.js';
import {winProb} from '../engine/prob.js';
import {tier, terrain, coastal, TERRAIN_DEF, GIVEN, EPITHET} from './data.js';

/* ======================= Constantes ======================= */
export const PEACE = 0, WAR = 1, PACT = 2, ALLY = 3;
export const STATUS_NAME = ['Paz', 'Guerra', 'Pacto', 'Alianza'];
export const PACT_TURNS = 10;
export const COST = {
  recruit:4, recruitCuartel:3, maxRecruit:10,
  build:{fortaleza:40, cuartel:35, puerto:30, mercado:45},
  tech:[30, 60, 100], general:60, maxGenerals:3,
  spy:{espiar:15, sabotear:35, agitar:25}, gift:[20, 50],
};
/** @typedef {'fortaleza'|'cuartel'|'puerto'|'mercado'} Building */
export const BUILDINGS = {
  fortaleza:{name:'Fortaleza', desc:'+50 % de defensa'},
  cuartel:{name:'Cuartel', desc:'+2 tropas por turno, reclutar a 3 de oro'},
  puerto:{name:'Puerto', desc:'+2 de oro por turno (solo en la costa)'},
  mercado:{name:'Mercado', desc:'+50 % de oro de la provincia'},
};
/** @typedef {'logistica'|'artilleria'|'diplomacia'|'espionaje'} Tech */
export const TECHS = /** @type {Tech[]} */ (['logistica', 'artilleria', 'diplomacia', 'espionaje']);
export const TECH_INFO = {
  logistica:{name:'Logística', desc:['Mover 2 provincias', 'Mover 3 provincias', 'Suministro por aliados']},
  artilleria:{name:'Artillería', desc:['+10 % ataque', '+20 % ataque', '+30 % ataque']},
  diplomacia:{name:'Diplomacia', desc:['Aceptan más fácil', 'Regalos rinden el doble', 'Pactos de 20 turnos']},
  espionaje:{name:'Espionaje', desc:['+15 % éxito', '+30 % éxito y −30 % coste', '+45 % éxito']},
};
/** @typedef {'asedio'|'defensa'|'rapidez'|'carisma'} Skill */
export const SKILLS = {
  asedio:{name:'Asedio', desc:'+15 % ataque (+5 por nivel)'},
  defensa:{name:'Defensa', desc:'+20 % defensa (+5 por nivel)'},
  rapidez:{name:'Rapidez', desc:'+1 de alcance al mover'},
  carisma:{name:'Carisma', desc:'+10 de lealtad por turno alrededor'},
};
/** @typedef {'conquistador'|'diplomatico'|'mercader'|'constructor'|'estratega'|'guardian'} Trait */
export const TRAITS = {
  conquistador:{name:'Conquistador', desc:'+15 % ataque, los demás desconfían'},
  diplomatico:{name:'Diplomático', desc:'Aceptan antes tus propuestas'},
  mercader:{name:'Mercader', desc:'+20 % de oro'},
  constructor:{name:'Constructor', desc:'Edificios un 30 % más baratos'},
  estratega:{name:'Estratega', desc:'+1 de alcance al mover'},
  guardian:{name:'Guardián', desc:'+15 % defensa y más lealtad'},
};
export const SEASONS = ['Primavera', 'Verano', 'Otoño', 'Invierno'];
/** @typedef {'facil'|'normal'|'dificil'} Difficulty */
export const DIFFICULTY = {
  facil:{name:'Fácil', sub:'Paz', desc:'Todos en paz. Solo pelea contigo quien atacas.'},
  normal:{name:'Normal', sub:'Tensión', desc:'Guerras entre bots; te atacan si te ven débil o si creces mucho.'},
  dificil:{name:'Difícil', sub:'Guerra total', desc:'Todos contra todos y coalición contra el líder.'},
};

/* ======================= Tipos ======================= */
/**
 * @typedef {object} General
 * @property {number} id
 * @property {number} f
 * @property {number} p provincia
 * @property {string} name
 * @property {Skill} skill
 * @property {number} xp
 * @property {number} lvl
 */
/**
 * @typedef {object} Rules
 * @property {Difficulty} difficulty
 * @property {{type:'dominacion'|'capitales'|'diplomatica'|'supervivencia'|'puntos', n?:number, turns?:number}} victory
 * @property {boolean} fog
 * @property {boolean} events
 * @property {boolean} seasons
 * @property {number} incomeMul porcentaje
 * @property {number} startTroops
 */
/**
 * @typedef {object} Game
 * @property {2} v
 * @property {string} seed
 * @property {import('../engine/rng.js').RngState} rng
 * @property {number} turn
 * @property {number} winner bando ganador o -1
 * @property {boolean} over
 * @property {string} scenario
 * @property {Rules} rules
 * @property {number[]} humans bandos humanos
 * @property {{owner:number[], troops:number[], ready:number[], bld:string[], loyal:number[], origin:number[], active:boolean[]}} P
 * @property {{name:string[], flag:number[], color:string[], capital:number[], home:number[], gold:number[], morale:number[], alive:boolean[], tech:number[][], trait:string[], banner?:any[]}} F banner: bandera dibujada (Portugal o bando propio)
 * @property {number[][]} rel relación −100..100 (simétrica)
 * @property {number[][]} st estado diplomático
 * @property {number[][]} until fin del pacto
 * @property {General[]} gens
 * @property {number} genSeq
 * @property {{f:number, p:number, until:number}[]} intel
 * @property {{kind:string, p:number, f:number, until:number}[]} fx efectos temporales (sequía, nevada…)
 * @property {{from:number, to:number, kind:string, turn:number}[]} offers propuestas de los bots a humanos
 * @property {{conq:number[], won:number[], lost:number[], caps:number[], peak:number[], betrayals:number[]}} stats
 * @property {string[]} hist dueños por turno
 * @property {{kind:string, id:string}} [tag] campaña, desafío diario o tutorial
 * @property {{n:number, t:string, a:number, b?:number, p?:number, k?:string}[]} [chron] crónica: sucesos destacados
 * @property {string[]} [motto] lema de cada bando (bando propio)
 * @property {any[]} log sucesos del turno en curso
 */
/** @typedef {{n:number, adj:number[][], ine:string[], tier:number[], terrain:('m'|'s'|'l')[], coast:boolean[], river:Record<string, string>}} Geo */

/* ======================= Geografía ======================= */
/** @param {{provinces:{adj:number[], ine:string}[], rivers?:{cross?:Record<string, string>}}} map @returns {Geo} */
export function geoOf(map) {
  const ine = map.provinces.map(p => p.ine);
  return {n:ine.length, adj:map.provinces.map(p => p.adj), ine, tier:ine.map(tier), terrain:ine.map(terrain), coast:ine.map(coastal), river:map.rivers?.cross || {}};
}
/** Río que hay que cruzar para atacar de una provincia a otra ('' si ninguno). @param {Geo} geo @param {number} a @param {number} b */
export const riverBetween = (geo, a, b) => (geo.river || {})[a < b ? `${a}-${b}` : `${b}-${a}`] || '';
export const RIVER_DEF = 10;

/* ======================= Creación ======================= */
/**
 * @typedef {object} ScenarioSpec
 * @property {string} id
 * @property {number} [center] provincia elegida (escenarios parciales)
 * @property {number[]} [neutral] provincias en juego sin bando (tierras libres, de los rebeldes)
 * @property {{name:string, flag:number, color:string, provinces:number[], capital:number, banner?:any, motto?:string}[]} factions
 */
/**
 * @param {Geo} geo @param {ScenarioSpec} sc @param {{seed:string, humans:number[], rules?:Partial<Rules>, traits?:Record<number, string>}} o
 * @returns {Game}
 */
export function createGame(geo, sc, o) {
  const nf = sc.factions.length, R = nf; // R = rebeldes
  /** @type {Rules} */
  const rules = {difficulty:'normal', victory:{type:'dominacion'}, fog:false, events:true, seasons:true, incomeMul:100, startTroops:6, ...(o.rules || {})};
  const rng = seedState('eeg2:' + o.seed);
  const owner = new Array(geo.n).fill(-1), active = new Array(geo.n).fill(false);
  sc.factions.forEach((f, i) => f.provinces.forEach(p => { owner[p] = i; active[p] = true; }));
  for (const p of sc.neutral || []) if (owner[p] < 0) { owner[p] = R; active[p] = true; }
  const capital = [...sc.factions.map(f => f.capital), -1];
  const troops = owner.map((f, p) => f < 0 ? 0 : rules.startTroops + (capital[f] === p ? 4 : 0));
  const sq = (/** @type {number} */ v) => Array.from({length:nf + 1}, () => new Array(nf + 1).fill(v));
  const traitKeys = /** @type {Trait[]} */ (Object.keys(TRAITS));
  const trait = [...sc.factions.map((_, i) => o.traits && o.traits[i] ? o.traits[i] : traitKeys[int(rng, traitKeys.length)]), ''];
  /** @type {Game} */
  const g = {
    v:2, seed:o.seed, rng, turn:1, winner:-1, over:false, scenario:sc.id, rules, humans:[...o.humans],
    P:{owner, troops, ready:[...troops], bld:new Array(geo.n).fill(''), loyal:owner.map(f => f < 0 ? 0 : 100), origin:[...owner], active},
    F:{name:[...sc.factions.map(f => f.name), sc.neutral?.length ? 'Tierras libres' : 'Rebeldes'], flag:[...sc.factions.map(f => f.flag), -1], color:[...sc.factions.map(f => f.color), '#6B6F7A'],
      capital, home:[...capital], gold:new Array(nf + 1).fill(20), morale:new Array(nf + 1).fill(100), alive:[...sc.factions.map(() => true), false],
      tech:Array.from({length:nf + 1}, () => [0, 0, 0, 0]), trait, banner:[...sc.factions.map(f => f.banner || null), null]},
    motto:[...sc.factions.map(f => f.motto || ''), ''],
    rel:sq(0), st:sq(PEACE), until:sq(0),
    gens:[], genSeq:0, intel:[], fx:[], offers:[],
    stats:{conq:new Array(nf + 1).fill(0), won:new Array(nf + 1).fill(0), lost:new Array(nf + 1).fill(0), caps:new Array(nf + 1).fill(0), peak:counts(owner, nf + 1), betrayals:new Array(nf + 1).fill(0)},
    hist:[], log:[],
  };
  for (let i = 0; i <= nf; i++) { g.st[i][R] = g.st[R][i] = WAR; g.rel[i][R] = g.rel[R][i] = -100; }
  if (rules.difficulty === 'dificil') {
    // guerra total: los humanos empiezan en guerra con todos sus vecinos y los bots con la mitad de los suyos
    const near = sq(0);
    for (let p = 0; p < geo.n; p++) for (const q of geo.adj[p]) { const a = owner[p], b = owner[q]; if (a >= 0 && b >= 0 && a !== b) near[a][b] = 1; }
    for (let i = 0; i < nf; i++) for (let j = i + 1; j < nf; j++) {
      g.rel[i][j] = g.rel[j][i] = -30;
      if (near[i][j] && (o.humans.includes(i) || o.humans.includes(j) || int(rng, 2) === 0)) g.st[i][j] = g.st[j][i] = WAR;
    }
  }
  for (let i = 0; i < nf; i++) if (trait[i] === 'conquistador') for (let j = 0; j < nf; j++) if (j !== i) { g.rel[i][j] -= 10; g.rel[j][i] -= 10; }
  // un general para cada humano, en su capital
  for (const h of o.humans) hireFree(g, h, capital[h], 'asedio');
  g.hist.push(encode(g));
  return g;
}

/* ======================= Utilidades ======================= */
/** @param {number[]} owner @param {number} n */
export function counts(owner, n) { const c = new Array(n).fill(0); for (const o of owner) if (o >= 0) c[o]++; return c; }
/** @param {Game} g */
export const nFactions = g => g.F.name.length - 1;
export const rebels = (/** @type {Game} */ g) => g.F.name.length - 1;
/** @param {Game} g @returns {Game} */
export function clone(g) { return structuredCloneSafe(g); }
/** structuredClone no existe en todos los iPhone antiguos: copia JSON (el estado es JSON puro). @param {any} g */
function structuredCloneSafe(g) { return typeof structuredClone === 'function' ? structuredClone(g) : JSON.parse(JSON.stringify(g)); }
/** Dueños como texto (para la cámara rápida y la red). @param {Game} g */
export const encode = g => g.P.owner.map(o => o < 0 ? '.' : String.fromCharCode(48 + o)).join('');
/** Huella del estado para detectar desajustes en red. @param {Game} g */
export function hash(g) {
  const s = JSON.stringify([g.turn, g.P.owner, g.P.troops, g.F.gold, g.F.morale, g.st, g.rng]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
export const season = (/** @type {Game} */ g) => Math.floor((g.turn - 1) / 3) % 4;
export const year = (/** @type {Game} */ g) => 1 + Math.floor((g.turn - 1) / 12);
/** @param {Game} g @param {number} f */
export const provincesOf = (g, f) => g.P.owner.flatMap((o, p) => o === f ? [p] : []);
/** @param {Game} g @param {number} f */
export const generalsOf = (g, f) => g.gens.filter(x => x.f === f);
/** @param {Game} g @param {number} p */
export const generalAt = (g, p) => g.gens.find(x => x.p === p);
/** Fuerza aproximada de un bando (tropas + provincias). @param {Game} g @param {number} f */
export function strength(g, f) { let s = 0; for (let p = 0; p < g.P.owner.length; p++) if (g.P.owner[p] === f) s += g.P.troops[p] + 5; return s; }
/** @param {Game} g @param {number} a @param {number} b */
export const atWar = (g, a, b) => a !== b && g.st[a][b] === WAR;
/** Sucesos que pasan a la crónica (el periódico de la partida). */
const NEWS = new Set(['war', 'betray', 'elim', 'accept', 'revolt', 'victory']);
/** @param {Game} g @param {any} e */
const emit = (g, e) => {
  g.log.push({turn:g.turn, ...e});
  const cap = e.t === 'attack' && e.capital;
  if (!NEWS.has(e.t) && !cap) return;
  if (!g.chron) g.chron = [];
  const n = cap ? {n:g.turn, t:'cap', a:e.f, b:e.d, p:e.to}
    : e.t === 'elim' ? {n:g.turn, t:'elim', a:e.f, b:e.by}
    : e.t === 'revolt' ? {n:g.turn, t:'revolt', a:e.from, p:e.p}
    : e.t === 'victory' ? {n:g.turn, t:'victory', a:e.f, k:e.how}
    : {n:g.turn, t:e.t, a:e.a, b:e.b, k:e.kind || e.why || ''};
  g.chron.push(n);
  if (g.chron.length > 160) g.chron.splice(0, g.chron.length - 160);
};
/** @param {number} v @param {number} a @param {number} b */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ======================= Suministro, oro y crecimiento ======================= */
/** Provincias unidas a la capital por territorio propio (o aliado con Logística 3). @param {Geo} geo @param {Game} g @param {number} f */
export function supplied(geo, g, f) {
  const ok = new Array(geo.n).fill(false), cap = g.F.capital[f];
  if (cap < 0 || g.P.owner[cap] !== f) return ok;
  const allies = g.F.tech[f][0] >= 3;
  const pass = (/** @type {number} */ p) => g.P.owner[p] === f || (allies && g.P.owner[p] >= 0 && g.st[f][g.P.owner[p]] === ALLY);
  const st = [cap]; ok[cap] = true;
  while (st.length) { const p = /** @type {number} */ (st.pop()); for (const q of geo.adj[p]) if (!ok[q] && pass(q)) { ok[q] = true; st.push(q); } }
  return ok;
}
/** @param {Game} g @param {number} p @param {string} kind */
const effectOn = (g, p, kind) => g.fx.some(e => e.p === p && e.kind === kind && e.until >= g.turn);
/** Oro de una provincia para su dueño. @param {Geo} geo @param {Game} g @param {number} p @param {boolean[]} sup */
export function provinceIncome(geo, g, p, sup) {
  const f = g.P.owner[p]; if (f < 0 || f === rebels(g)) return 0;
  if (effectOn(g, p, 'sequia')) return 0;
  let v = geo.tier[p] + (g.F.capital[f] === p ? 2 : 0) + (g.P.bld[p] === 'puerto' ? 2 : 0);
  if (g.P.bld[p] === 'mercado') v = Math.floor(v * 3 / 2);
  if (!sup[p] || g.P.loyal[p] < 30) v = Math.floor(v / 2);
  return v;
}
/** Oro por turno de un bando. @param {Geo} geo @param {Game} g @param {number} f */
export function income(geo, g, f) {
  const sup = supplied(geo, g, f);
  let v = 0;
  for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f) v += provinceIncome(geo, g, p, sup);
  let mul = g.rules.incomeMul;
  if (g.F.trait[f] === 'mercader') mul = mul * 120 / 100;
  if (g.rules.difficulty === 'dificil' && !g.humans.includes(f)) mul = mul * 125 / 100;
  return Math.floor(v * mul / 100);
}
/** Tope de tropas de una provincia. @param {Geo} geo @param {Game} g @param {number} p */
export function cap(geo, g, p) {
  const f = g.P.owner[p];
  return 12 + 4 * geo.tier[p] + (g.P.bld[p] === 'cuartel' ? 10 : 0) + (f >= 0 && g.F.capital[f] === p ? 10 : 0);
}
/** Crecimiento por turno de una provincia. @param {Geo} geo @param {Game} g @param {number} p @param {boolean[]} sup */
export function growth(geo, g, p, sup) {
  const f = g.P.owner[p]; if (f < 0 || f === rebels(g)) return 0;
  if (!sup[p] || g.P.loyal[p] < 30 || effectOn(g, p, 'sequia')) return 0;
  let v = 1 + (geo.tier[p] >= 4 ? 1 : 0) + (g.P.bld[p] === 'cuartel' ? 2 : 0) + (g.F.capital[f] === p ? 1 : 0);
  if (g.rules.seasons && season(g) === 3 && geo.terrain[p] !== 'l') v -= 1;
  return Math.max(0, v);
}
/** Alcance de movimiento desde una provincia. @param {Game} g @param {number} f @param {number} from */
export function moveRange(g, f, from) {
  const gen = generalAt(g, from);
  return 1 + Math.min(2, g.F.tech[f][0]) + (g.F.trait[f] === 'estratega' ? 1 : 0) + (gen && gen.f === f && gen.skill === 'rapidez' ? 1 : 0);
}
/** Provincias propias alcanzables al mover. @param {Geo} geo @param {Game} g @param {number} f @param {number} from */
export function reachable(geo, g, f, from) {
  const range = moveRange(g, f, from), dist = new Map([[from, 0]]), q = [from];
  while (q.length) {
    const p = /** @type {number} */ (q.shift()), d = /** @type {number} */ (dist.get(p));
    if (d >= range || (g.rules.seasons && effectOn(g, p, 'nevada') && p !== from)) continue;
    for (const r of geo.adj[p]) if (!dist.has(r) && g.P.owner[r] === f) { dist.set(r, d + 1); q.push(r); }
  }
  dist.delete(from);
  return [...dist.keys()].sort((a, b) => a - b);
}

/* ======================= Combate ======================= */
/** Multiplicador de ataque (porcentaje). @param {Geo} geo @param {Game} g @param {number} f @param {number} from @param {number} to @param {boolean} [gen] */
export function attackMul(geo, g, f, from, to, gen = true) {
  let m = 100 + (g.F.morale[f] - 100) + 10 * g.F.tech[f][1];
  const gn = generalAt(g, from);
  if (gen && gn && gn.f === f && gn.skill === 'asedio') m += 15 + 5 * gn.lvl;
  if (g.F.trait[f] === 'conquistador') m += 15;
  if (!supplied(geo, g, f)[from]) m -= 30;
  if (g.rules.seasons && season(g) === 3 && geo.terrain[to] !== 'l') m -= 25;
  return Math.max(20, m);
}
/** Multiplicador de defensa (porcentaje). Con `from`, cuenta el río entre las dos. @param {Geo} geo @param {Game} g @param {number} p @param {number} [from] */
export function defenseMul(geo, g, p, from = -1) {
  const d = g.P.owner[p];
  let m = 100 + TERRAIN_DEF[geo.terrain[p]] + (g.P.bld[p] === 'fortaleza' ? 50 : 0) + (from >= 0 && riverBetween(geo, from, p) ? RIVER_DEF : 0);
  if (d >= 0 && d !== rebels(g)) {
    m += g.F.morale[d] - 100;
    if (g.F.capital[d] === p) m += 20;
    if (g.F.trait[d] === 'guardian') m += 15;
  }
  const gn = generalAt(g, p);
  if (gn && gn.f === d && gn.skill === 'defensa') m += 20 + 5 * gn.lvl;
  return Math.max(20, m);
}
/**
 * Probabilidad exacta de ganar un ataque con n tropas.
 * @param {Geo} geo @param {Game} g @param {number} f @param {number} from @param {number} to @param {number} n
 */
export function odds(geo, g, f, from, to, n) {
  const D = g.P.troops[to], mA = attackMul(geo, g, f, from, to), mD = defenseMul(geo, g, to, from);
  if (D <= 0) return {p:1, SA:n * mA, SD:0, mA, mD, D};
  const SA = n * mA, SD = D * mD;
  return {p:winProb(SA, SD).p, SA, SD, mA, mD, D};
}

/* ======================= Diplomacia (interna) ======================= */
/** @param {Game} g @param {number} a @param {number} b @param {number} v */
function relAdd(g, a, b, v) { if (a === b) return; const r = clamp(g.rel[a][b] + v, -100, 100); g.rel[a][b] = g.rel[b][a] = r; }
/** @param {Game} g @param {number} a @param {number} b @param {number} s */
function setStatus(g, a, b, s, untilTurn = 0) { g.st[a][b] = g.st[b][a] = s; g.until[a][b] = g.until[b][a] = untilTurn; }
/** Declara la guerra (con traición si había pacto o alianza) y arrastra a los aliados. @param {Game} g @param {number} a @param {number} b @param {string} why */
export function declareWar(g, a, b, why = '') {
  if (a === b || g.st[a][b] === WAR) return;
  const prev = g.st[a][b], R = rebels(g);
  if (b === R || a === R) { setStatus(g, a, b, WAR); return; }
  if (prev === PACT || prev === ALLY) {
    g.stats.betrayals[a]++;
    for (let x = 0; x < R; x++) if (x !== a && g.F.alive[x]) relAdd(g, a, x, -40);
    emit(g, {t:'betray', a, b});
  }
  setStatus(g, a, b, WAR);
  relAdd(g, a, b, -50);
  emit(g, {t:'war', a, b, why});
  // los aliados de b entran en la guerra
  for (let x = 0; x < R; x++) if (x !== a && x !== b && g.F.alive[x] && g.st[b][x] === ALLY && g.st[a][x] !== WAR) {
    setStatus(g, a, x, WAR); relAdd(g, a, x, -30); emit(g, {t:'war', a:x, b:a, why:'alianza'});
  }
}

/* ======================= Generales ======================= */
/** @param {Game} g @param {number} f @param {number} p @param {Skill} skill @param {import('../engine/rng.js').RngState} [rng] */
function hireFree(g, f, p, skill, rng = g.rng) {
  const name = GIVEN[int(rng, GIVEN.length)] + ' ' + EPITHET[int(rng, EPITHET.length)];
  const gen = {id:++g.genSeq, f, p, name, skill, xp:0, lvl:0};
  g.gens.push(gen);
  return gen;
}
/** @param {Game} g @param {General} gen */
function gainXp(g, gen) { gen.xp++; const lvl = gen.xp >= 6 ? 2 : gen.xp >= 3 ? 1 : 0; if (lvl > gen.lvl) { gen.lvl = lvl; emit(g, {t:'genup', f:gen.f, id:gen.id, lvl}); } }

/* ======================= Acciones ======================= */
/**
 * @typedef {{type:'move', f:number, from:number, to:number, n:number, gen?:boolean}
 *  | {type:'attack', f:number, from:number, to:number, n:number, gen?:boolean, q?:number, x?:number[]}
 *  | {type:'recruit', f:number, p:number, n:number}
 *  | {type:'build', f:number, p:number, b:Building}
 *  | {type:'research', f:number, k:Tech}
 *  | {type:'hire', f:number, p:number, skill:Skill}
 *  | {type:'spy', f:number, p:number, kind:'espiar'|'sabotear'|'agitar'}
 *  | {type:'diplo', f:number, d:number, kind:'paz'|'pacto'|'alianza'|'regalo'|'tributo'|'anexion'|'guerra', amount?:number}
 *  | {type:'answer', f:number, i?:number, from?:number, kind?:string, accept:boolean}} Action
 * Opcionales en multijugador: q (número de la orden en el turno, para los dados) y x (en un ataque, dueño y
 * tropas que se esperan en el objetivo; si han cambiado, la orden se anula).
 */
/**
 * Generador de dados de una orden. En multijugador (con q) sale de la semilla, el turno, el bando y q, así el
 * resultado no depende del orden en que se aplican las órdenes de los demás jugadores.
 * @param {Game} g @param {any} a
 */
function rngFor(g, a) { return a.q != null ? seedState(`eeg2:${g.seed}:${g.turn}:${a.f}:${a.q}`) : g.rng; }
/** Error de regla con mensaje para el jugador. */
export class RuleError extends Error {}
/** @param {boolean} c @param {string} msg */
const need = (c, msg) => { if (!c) throw new RuleError(msg); };

/**
 * Aplica una orden. No toca la partida recibida.
 * @param {Geo} geo @param {Game} g0 @param {Action} a
 * @returns {{g:Game, ev:any[]}}
 */
export function apply(geo, g0, a) {
  need(!g0.over, 'La partida ha terminado');
  const g = clone(g0); g.log = [];
  doAction(geo, g, a);
  return {g, ev:g.log};
}
/** Igual que apply pero sobre la partida (para la IA y el fin de turno). @param {Geo} geo @param {Game} g @param {Action} a */
export function doAction(geo, g, a) {
  const f = a.f, P = g.P;
  need(f >= 0 && f < rebels(g) && g.F.alive[f], 'Bando no válido');
  switch (a.type) {
    case 'move': {
      need(P.owner[a.from] === f, 'No es tuya');
      need(reachable(geo, g, f, a.from).includes(a.to), 'Fuera de alcance');
      const n = Math.floor(a.n);
      need(n >= 1 && n <= P.ready[a.from] && n <= P.troops[a.from] - 1, 'No hay tropas suficientes (al menos 1 se queda)');
      P.troops[a.from] -= n; P.ready[a.from] -= n; P.troops[a.to] += n;
      const gn = generalAt(g, a.from);
      if (gn && gn.f === f && a.gen) gn.p = a.to;
      emit(g, {t:'move', f, from:a.from, to:a.to, n});
      break;
    }
    case 'attack': return attack(geo, g, a);
    case 'recruit': {
      need(P.owner[a.p] === f, 'No es tuya');
      need(supplied(geo, g, f)[a.p], 'Sin suministro no se puede reclutar');
      const n = Math.floor(a.n), price = P.bld[a.p] === 'cuartel' ? COST.recruitCuartel : COST.recruit;
      need(n >= 1 && n <= COST.maxRecruit, `Entre 1 y ${COST.maxRecruit} tropas`);
      need(g.F.gold[f] >= n * price, 'No hay oro suficiente');
      g.F.gold[f] -= n * price; P.troops[a.p] += n;
      emit(g, {t:'recruit', f, p:a.p, n});
      break;
    }
    case 'build': {
      need(P.owner[a.p] === f, 'No es tuya');
      need(!P.bld[a.p], 'Ya tiene un edificio');
      need(a.b in BUILDINGS, 'Edificio no válido');
      need(a.b !== 'puerto' || geo.coast[a.p], 'El puerto necesita costa');
      const price = buildCost(g, f, a.b);
      need(g.F.gold[f] >= price, 'No hay oro suficiente');
      g.F.gold[f] -= price; P.bld[a.p] = a.b;
      emit(g, {t:'build', f, p:a.p, b:a.b});
      break;
    }
    case 'research': {
      const k = TECHS.indexOf(a.k), lvl = g.F.tech[f][k];
      need(k >= 0 && lvl < 3, 'Ya está al máximo');
      need(g.F.gold[f] >= COST.tech[lvl], 'No hay oro suficiente');
      g.F.gold[f] -= COST.tech[lvl]; g.F.tech[f][k]++;
      emit(g, {t:'tech', f, k:a.k, lvl:lvl + 1});
      break;
    }
    case 'hire': {
      need(P.owner[a.p] === f, 'No es tuya');
      need(generalsOf(g, f).length < COST.maxGenerals, `Máximo ${COST.maxGenerals} generales`);
      need(!generalAt(g, a.p), 'Ya hay un general allí');
      need(a.skill in SKILLS, 'Habilidad no válida');
      need(g.F.gold[f] >= COST.general, 'No hay oro suficiente');
      g.F.gold[f] -= COST.general;
      const gen = hireFree(g, f, a.p, a.skill, rngFor(g, a));
      emit(g, {t:'hire', f, p:a.p, id:gen.id});
      break;
    }
    case 'spy': return spy(geo, g, a);
    case 'diplo': return diplo(geo, g, a);
    case 'answer': {
      const i = a.from != null ? g.offers.findIndex(o => o.from === a.from && o.to === f && o.kind === a.kind) : a.i ?? -1;
      const o = g.offers[i];
      need(!!o && o.to === f, 'Propuesta no válida');
      g.offers.splice(i, 1);
      if (a.accept) acceptOffer(g, o);
      else { relAdd(g, o.from, f, -5); emit(g, {t:'reject', a:f, b:o.from, kind:o.kind}); }
      break;
    }
    default: throw new RuleError('Orden desconocida');
  }
}
/** @param {Game} g @param {number} f @param {Building} b */
export const buildCost = (g, f, b) => Math.floor(COST.build[b] * (g.F.trait[f] === 'constructor' ? 70 : 100) / 100);
/** @param {Game} g @param {number} f @param {'espiar'|'sabotear'|'agitar'} kind */
export const spyCost = (g, f, kind) => Math.floor(COST.spy[kind] * (g.F.tech[f][3] >= 2 ? 70 : 100) / 100);
/** @param {Game} g @param {number} f */
export const spyChance = (g, f) => Math.min(95, 55 + 15 * g.F.tech[f][3]);

/** @param {Geo} geo @param {Game} g @param {Extract<Action, {type:'attack'}>} a */
function attack(geo, g, a) {
  const f = a.f, P = g.P, to = a.to, from = a.from, R = rebels(g);
  need(P.owner[from] === f, 'No es tuya');
  need(geo.adj[from].includes(to), 'No es limítrofe');
  need(P.active[to] && P.owner[to] !== f, 'No se puede atacar');
  const n = Math.floor(a.n);
  need(n >= 1 && n <= P.ready[from] && n <= P.troops[from] - 1, 'No hay tropas suficientes (al menos 1 se queda)');
  if (a.x) need(P.owner[to] === a.x[0] && P.troops[to] === a.x[1], 'La provincia cambió antes de tu ataque');
  const d = P.owner[to], rng = rngFor(g, a);
  if (d !== R && g.st[f][d] !== WAR) declareWar(g, f, d, 'ataque');
  const gn = generalAt(g, from), withGen = !!(gn && gn.f === f && a.gen !== false);
  const mA = attackMul(geo, g, f, from, to, withGen), mD = defenseMul(geo, g, to, from), D = P.troops[to];
  P.troops[from] -= n; P.ready[from] -= n;
  /** @type {{a:number[], d:number[]}[]} */
  const rolls = [];
  let won = true, attLoss = 0, defLoss = D, r = 0;
  const p = D > 0 ? winProb(n * mA, D * mD).p : 1;
  if (D > 0) {
    const SA = n * mA, SD = D * mD;
    for (let i = 0; i < 200; i++) {
      const ra = [d6(rng), d6(rng), d6(rng)], rd = [d6(rng), d6(rng), d6(rng)];
      rolls.push({a:ra, d:rd});
      const x = (ra[0] + ra[1] + ra[2]) * SA, y = (rd[0] + rd[1] + rd[2]) * SD;
      if (x !== y) { won = x > y; r = Math.floor(Math.min(x, y) * 100 / Math.max(x, y)); break; }
    }
    if (won) { attLoss = Math.min(n - 1, Math.floor(D * r * 70 / 10000)); defLoss = D; }
    else { attLoss = Math.min(n, Math.ceil(n * (50 + Math.floor(r / 2)) / 100)); defLoss = Math.min(D - 1, Math.floor(n * r * 70 / 10000)); }
  }
  const ev = {t:'attack', f, d, from, to, n, D, rolls, won, attLoss, defLoss, p, mA, mD, capital:false, elim:false};
  if (won) {
    P.troops[to] = n - attLoss; P.ready[to] = 0;
    P.owner[to] = f;
    P.loyal[to] = P.origin[to] === f ? 70 : 25;
    g.stats.conq[f]++;
    // general defensor capturado; el atacante entra con sus tropas
    g.gens = g.gens.filter(x => !(x.p === to && x.f === d));
    if (withGen && gn) { gn.p = to; gainXp(g, gn); }
    if (d !== R) {
      g.F.morale[f] = clamp(g.F.morale[f] + 3, 50, 200); g.F.morale[d] = clamp(g.F.morale[d] - 3, 50, 200);
      g.stats.won[f]++; g.stats.lost[d]++;
      if (g.F.capital[d] === to) {
        ev.capital = true;
        const loot = Math.floor(g.F.gold[d] * 30 / 100);
        g.F.gold[d] -= loot; g.F.gold[f] += loot; g.F.morale[d] = clamp(g.F.morale[d] - 10, 50, 200);
        g.stats.caps[f]++;
        moveCapital(geo, g, d);
      }
      if (!P.owner.includes(d)) { eliminate(g, d, f); ev.elim = true; }
    }
    const c = counts(P.owner, R + 1);
    g.stats.peak[f] = Math.max(g.stats.peak[f], c[f]);
  } else {
    P.troops[from] += n - attLoss; // vuelven los que quedan (ya no actúan)
    P.troops[to] = D - defLoss;
    if (withGen && gn && n - attLoss <= 0) g.gens = g.gens.filter(x => x !== gn);
    if (d !== R) {
      g.F.morale[d] = clamp(g.F.morale[d] + 3, 50, 200); g.F.morale[f] = clamp(g.F.morale[f] - 3, 50, 200);
      g.stats.won[d]++; g.stats.lost[f]++;
      const dg = generalAt(g, to); if (dg && dg.f === d) gainXp(g, dg);
    }
  }
  emit(g, ev);
  checkVictory(geo, g);
}
/** La capital pasa a la provincia más poblada que le quede. @param {Geo} geo @param {Game} g @param {number} f */
function moveCapital(geo, g, f) {
  let best = -1;
  for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f && (best < 0 || geo.tier[p] > geo.tier[best])) best = p;
  g.F.capital[f] = best;
  if (best >= 0) emit(g, {t:'capital', f, p:best});
}
/** @param {Game} g @param {number} f @param {number} by */
function eliminate(g, f, by) {
  g.F.alive[f] = false; g.F.capital[f] = -1;
  g.gens = g.gens.filter(x => x.f !== f);
  g.offers = g.offers.filter(o => o.from !== f && o.to !== f);
  for (let x = 0; x < rebels(g); x++) if (x !== f && g.st[f][x] !== WAR) setStatus(g, f, x, PEACE);
  emit(g, {t:'elim', f, by});
}

/** @param {Geo} geo @param {Game} g @param {Extract<Action, {type:'spy'}>} a */
function spy(geo, g, a) {
  const f = a.f, d = g.P.owner[a.p];
  need(g.P.active[a.p] && d !== f && d >= 0, 'Elige una provincia ajena');
  const price = spyCost(g, f, a.kind);
  need(g.F.gold[f] >= price, 'No hay oro suficiente');
  if (a.kind === 'sabotear') need(!!g.P.bld[a.p], 'No tiene edificio');
  g.F.gold[f] -= price;
  const ok = int(rngFor(g, a), 100) < spyChance(g, f);
  if (ok) {
    if (a.kind === 'espiar') g.intel.push({f, p:a.p, until:g.turn + 3});
    if (a.kind === 'sabotear') g.P.bld[a.p] = '';
    if (a.kind === 'agitar') g.P.loyal[a.p] = Math.max(0, g.P.loyal[a.p] - 30);
  } else if (d !== rebels(g)) relAdd(g, f, d, -20);
  emit(g, {t:'spy', f, d, p:a.p, kind:a.kind, ok});
}

/**
 * Si un bot aceptaría una propuesta (determinista, para avisar antes).
 * @param {Geo} geo @param {Game} g @param {number} f quien propone @param {number} d bot @param {string} kind
 * @returns {{ok:boolean, why:string}}
 */
export function wouldAccept(geo, g, f, d, kind) {
  const rel = g.rel[f][d] + (g.F.trait[f] === 'diplomatico' ? 20 : 0) + 10 * g.F.tech[f][2];
  const sf = strength(g, f), sd = strength(g, d);
  const c = counts(g.P.owner, rebels(g) + 1);
  switch (kind) {
    case 'paz':
      if (g.st[f][d] !== WAR) return {ok:false, why:'No estáis en guerra'};
      if (sd * 100 < sf * 80) return {ok:true, why:'Va perdiendo la guerra'};
      if (rel > -20) return {ok:true, why:'Quiere paz'};
      return {ok:false, why:'Cree que puede ganar'};
    case 'pacto':
      if (g.st[f][d] === WAR) return {ok:false, why:'Primero hay que firmar la paz'};
      if (g.st[f][d] !== PEACE) return {ok:false, why:'Ya hay un acuerdo'};
      return rel >= 0 ? {ok:true, why:'Se fía de ti'} : {ok:false, why:'Desconfía de ti'};
    case 'alianza': {
      if (g.st[f][d] === WAR) return {ok:false, why:'Estáis en guerra'};
      if (g.st[f][d] === ALLY) return {ok:false, why:'Ya sois aliados'};
      let common = false;
      for (let x = 0; x < rebels(g); x++) if (g.F.alive[x] && g.st[f][x] === WAR && g.st[d][x] === WAR) common = true;
      if (rel >= 50 && (common || sf > sd)) return {ok:true, why:common ? 'Tenéis un enemigo común' : 'Te admira'};
      return {ok:false, why:rel < 50 ? 'Necesita más confianza (relación 50)' : 'No le conviene'};
    }
    case 'tributo': {
      const near = g.P.owner.some((o, p) => o === f && geo.adj[p].some(q => g.P.owner[q] === d));
      if (near && c[f] >= 3 * c[d] && sf >= 2 * sd) return {ok:true, why:'Te teme'};
      return {ok:false, why:'No te teme lo suficiente'};
    }
    case 'anexion':
      if (c[d] <= 2 && rel >= 60 && sf >= 4 * sd) return {ok:true, why:'Prefiere unirse a ti'};
      return {ok:false, why:'Pide 2 provincias o menos, relación 60 y que seas 4 veces más fuerte'};
    default: return {ok:true, why:''};
  }
}
/** @param {Geo} geo @param {Game} g @param {Extract<Action, {type:'diplo'}>} a */
function diplo(geo, g, a) {
  const f = a.f, d = a.d, R = rebels(g);
  need(d !== f && d >= 0 && d < R && g.F.alive[d], 'Bando no válido');
  need(['paz', 'pacto', 'alianza', 'regalo', 'tributo', 'anexion', 'guerra'].includes(a.kind), 'Propuesta no válida');
  const human = g.humans.includes(d);
  switch (a.kind) {
    case 'guerra': declareWar(g, f, d, 'declaración'); return;
    case 'regalo': {
      const amount = a.amount === COST.gift[1] ? COST.gift[1] : COST.gift[0];
      need(g.F.gold[f] >= amount, 'No hay oro suficiente');
      g.F.gold[f] -= amount; g.F.gold[d] += amount;
      const v = (amount === COST.gift[1] ? 25 : 10) * (g.F.tech[f][2] >= 2 ? 2 : 1);
      relAdd(g, f, d, v); emit(g, {t:'gift', a:f, b:d, amount}); return;
    }
  }
  if (human) { // entre humanos: queda como propuesta que el otro acepta o rechaza
    need(!g.offers.some(o => o.from === f && o.to === d && o.kind === a.kind), 'Ya se la has propuesto');
    g.offers.push({from:f, to:d, kind:a.kind, turn:g.turn});
    emit(g, {t:'offer', a:f, b:d, kind:a.kind});
    return;
  }
  const w = wouldAccept(geo, g, f, d, a.kind);
  if (!w.ok) { relAdd(g, f, d, a.kind === 'tributo' ? -10 : -2); emit(g, {t:'reject', a:d, b:f, kind:a.kind, why:w.why}); return; }
  acceptOffer(g, {from:f, to:d, kind:a.kind, turn:g.turn});
}
/** @param {Game} g @param {{from:number, to:number, kind:string, turn?:number}} o */
function acceptOffer(g, o) {
  const f = o.from, d = o.to;
  if (o.kind === 'paz') { setStatus(g, f, d, PEACE); relAdd(g, f, d, 10); }
  else if (o.kind === 'pacto') setStatus(g, f, d, PACT, g.turn + PACT_TURNS * (g.F.tech[f][2] >= 3 ? 2 : 1));
  else if (o.kind === 'alianza') { setStatus(g, f, d, ALLY); relAdd(g, f, d, 10); }
  else if (o.kind === 'tributo') { const v = Math.floor(g.F.gold[d] * 20 / 100); g.F.gold[d] -= v; g.F.gold[f] += v; relAdd(g, f, d, -15); }
  else if (o.kind === 'anexion') {
    for (let p = 0; p < g.P.owner.length; p++) if (g.P.owner[p] === d) { g.P.owner[p] = f; g.P.loyal[p] = 60; }
    g.F.gold[f] += g.F.gold[d]; g.F.gold[d] = 0;
    g.gens.forEach(x => { if (x.f === d) x.f = f; });
    eliminate(g, d, f);
  }
  emit(g, {t:'accept', a:d, b:f, kind:o.kind});
}

/* ======================= Victoria ======================= */
/** Puntuación (victoria por puntos y desafío diario). @param {Game} g @param {number} f */
export function score(g, f) {
  let s = 0, caps = 0;
  for (let p = 0; p < g.P.owner.length; p++) if (g.P.owner[p] === f) { s += 10 + Math.floor(g.P.troops[p] / 5); if (g.F.capital.includes(p) && g.P.owner[p] === f) caps++; }
  return s + caps * 25 + Math.floor(g.F.gold[f] / 10);
}
/** @param {Geo} geo @param {Game} g */
export function checkVictory(geo, g) {
  if (g.over) return;
  const R = rebels(g), alive = g.F.alive.map((a, f) => a && f < R && g.P.owner.includes(f));
  const act = g.P.active.filter(Boolean).length, c = counts(g.P.owner, R + 1);
  const end = (/** @type {number} */ w, /** @type {string} */ how) => { g.over = true; g.winner = w; emit(g, {t:'victory', f:w, how}); };
  // humanos derrotados: la partida sigue (se puede mirar) salvo que no quede ninguno y sea supervivencia
  const v = g.rules.victory;
  for (let f = 0; f < R; f++) {
    if (!alive[f]) continue;
    if (c[f] === act) return end(f, 'dominacion');
    if (v.type === 'capitales') {
      let caps = 0; for (let x = 0; x < R; x++) { const h = (g.F.home || g.F.capital)[x]; if (h >= 0 && g.P.owner[h] === f) caps++; }
      if (caps >= (v.n || 5)) return end(f, 'capitales');
    }
    if (v.type === 'diplomatica' && c[f] * 100 >= act * 30) {
      let ok = true, others = 0;
      for (let x = 0; x < R; x++) if (x !== f && alive[x]) { others++; if (g.st[f][x] !== PACT && g.st[f][x] !== ALLY) ok = false; }
      if (ok && others > 0) return end(f, 'diplomatica');
    }
  }
  if ((v.type === 'puntos' || v.type === 'supervivencia') && g.turn > (v.turns || 50)) {
    let best = -1, bs = -1;
    for (let f = 0; f < R; f++) if (alive[f]) { const s = v.type === 'supervivencia' && g.humans.includes(f) ? 1e9 : score(g, f); if (s > bs) { bs = s; best = f; } }
    return end(best, v.type);
  }
  if (alive.filter(Boolean).length === 1) return end(alive.indexOf(true), 'dominacion');
}

/* ======================= Utilidades para la IA y el fin de turno ======================= */
export {relAdd, setStatus, emit, clamp, eliminate, moveCapital, hireFree, acceptOffer, effectOn};

// @ts-check
// Motor del modo conquista (v3). Puro y determinista: sin DOM, sin Date ni Math.random y solo aritmética entera,
// así una semilla y las mismas órdenes dan la misma partida en cualquier dispositivo (necesario para el online).
// Tablas de reglas en rules.js; números y razones en docs/DISENO.md.
import {seedState, int, d6} from '../engine/rng.js';
import {winProb} from '../engine/prob.js';
import {tier, terrain, coastal, TERRAIN_DEF, GIVEN, EPITHET, SPECIALTY, culture, SEA, SEA_ADJ} from './data.js';
import {
  BUILDINGS, BUILDING_KEYS, slotsFor, WONDERS, UNITS, INF, CAB, ART, MIL, unitAttack, TACTICS, SKILLS, GEN_XP,
  MINISTERS, MINISTER_NAMES, MINISTER_COST, eraOf, TAXES, UPKEEP_PER, SHIP_COST, SHIP_CAP, DECISIONS, SABERES, GOLD_PER_SABER,
} from './rules.js';
export * from './rules.js';
import {pop0, initRealm, realmAction, realmUpkeep, realmLoyalty, realmIncome, realmAttack, regionOf, regionIncome, law, unitRes, hasRes, payRes, missingRes, materials, setActor, addInfamy, addWarScore, estAvg} from './realm.js';
import {armyAction, armyById, defVec, moraleMul, xpBonus, hitDefenders, retreatArmies, shareOf, size, disband, armyGoldUpkeep, MERC_UPKEEP} from './armies.js';
export * from './realm.js';
export * from './armies.js';
import {storyDecision, treatyOk, signTreaty} from './story.js';
export * from './story.js';

/* ======================= Constantes ======================= */
export const PEACE = 0, WAR = 1, PACT = 2, ALLY = 3, FED = 4;
export const STATUS_NAME = ['Paz', 'Guerra', 'Pacto', 'Alianza', 'Federación'];
export const PACT_TURNS = 10;
export const COST = {
  maxRecruit:12, tech:[30, 60, 100], general:60, maxGenerals:3,
  spy:{espiar:15, sabotear:35, agitar:25, asesinar:45, robar:50, sobornar:0}, gift:[20, 50],
};
/** @typedef {'logistica'|'artilleria'|'diplomacia'|'espionaje'} Tech */
export const TECHS = /** @type {Tech[]} */ (['logistica', 'artilleria', 'diplomacia', 'espionaje']);
export const TECH_INFO = {
  logistica:{name:'Logística', desc:['Mover 2 provincias', 'Mover 3 provincias', 'Suministro por aliados']},
  artilleria:{name:'Armamento', desc:['+10 % ataque', '+20 % ataque', '+30 % ataque']},
  diplomacia:{name:'Diplomacia', desc:['Aceptan más fácil', 'Regalos rinden el doble', 'Pactos de 20 turnos']},
  espionaje:{name:'Espionaje', desc:['+15 % éxito', '+30 % éxito y −30 % coste', '+45 % éxito']},
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
export const SPY_KINDS = {
  espiar:{name:'Espiar', desc:'Ves sus tropas y su postura 3 turnos', mod:0},
  sabotear:{name:'Sabotear', desc:'Baja un nivel su mejor edificio', mod:0},
  agitar:{name:'Agitar', desc:'−30 de lealtad', mod:0},
  asesinar:{name:'Asesinar', desc:'Elimina al general de esa provincia', mod:-20},
  robar:{name:'Robar saberes', desc:'+1 nivel en una mejora en la que te supera', mod:-15},
  sobornar:{name:'Sobornar', desc:'Si su lealtad es baja, la provincia se pasa a ti', mod:-10},
};

/* ======================= Tipos ======================= */
/**
 * @typedef {object} General
 * @property {number} id
 * @property {number} f
 * @property {number} p provincia
 * @property {string} name
 * @property {import('./rules.js').Skill[]} skills
 * @property {number} xp
 * @property {number} lvl
 * @property {number} age turnos de servicio
 * @property {number} pend habilidades por elegir
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
 * @typedef {object} Prov estado de las provincias (un elemento por provincia)
 * @property {number[]} owner
 * @property {number[]} troops total de tropas (suma de u)
 * @property {number[][]} u tropas por tipo [infantería, caballería, artillería, milicia]
 * @property {number[]} ready tropas que aún pueden actuar este turno
 * @property {Record<string, number>[]} bld edificio → nivel
 * @property {number[]} loyal
 * @property {number[]} origin
 * @property {boolean[]} active
 * @property {number[]} tax 0 bajos, 1 normales, 2 altos
 * @property {number[]} stance postura de defensa
 * @property {string[]} cult cultura
 * @property {number[]} assim turnos de asimilación
 * @property {string[]} wonder maravilla construida
 * @property {number[]} pop población (miles, escala de juego)
 * @property {number[][]} est contento de los estamentos [campesinos, burgueses, nobles, clero]
 * @property {{f:number, b:string, lvl:number, left:number, gold?:number, w?:string}[][]} queue obras en curso
 * @property {number[]} auto reclutar hasta este número (0: no)
 */
/**
 * @typedef {object} Game
 * @property {number} v
 * @property {string} seed
 * @property {import('../engine/rng.js').RngState} rng
 * @property {number} turn
 * @property {number} winner bando ganador o -1
 * @property {boolean} over
 * @property {string} scenario
 * @property {Rules} rules
 * @property {number[]} humans bandos humanos
 * @property {Prov} P
 * @property {{name:string[], flag:number[], color:string[], capital:number[], home:number[], gold:number[], morale:number[], alive:boolean[], tech:number[][], know:string[][], rp:number[], trait:string[], banner?:any[], weary:number[], ships:number[], lord:number[], cult:string[], min:Record<string, {name:string, k:string}>[], res:Record<string, number>[], stab:number[], fac:number[][], laws:Record<string, number>[], lawT:Record<string, number>[], inf:number[], rally:number[], bonus:{adm:number, gold:number}[], indias:number[], chains:string[][], ruler:{name:string, age:number, wed:boolean, regent:boolean, heir:{name:string, age:number}|null}[], goals:{k:string, c?:string, p?:number, done:boolean}[][]}} F
 * @property {number[][]} rel relación −100..100 (simétrica)
 * @property {number[][]} st estado diplomático
 * @property {number[][]} until fin del pacto
 * @property {General[]} gens
 * @property {number} genSeq
 * @property {{f:number, p:number, until:number}[]} intel
 * @property {{kind:string, p:number, f:number, until:number}[]} fx efectos temporales (sequía, nevada, bloqueo…)
 * @property {{from:number, to:number, kind:string, turn:number, p?:number, ps?:number[], amount?:number, vas?:boolean}[]} offers propuestas a humanos
 * @property {{f:number, from:number, p:number, breach:number, mode?:string, food?:number}[]} sieges asedios en curso
 * @property {{id:number, f:number, kind:string, p:number, until:number}[]} decisions decisiones pendientes de los humanos
 * @property {number} decSeq
 * @property {{f:number, kind:string, p:number, n:number, base:number, until:number, reward:number}[]} missions
 * @property {{a:number, b:number, until:number}[]} weds bodas
 * @property {{a:number, b:number}[]} embargo
 * @property {{conq:number[], won:number[], lost:number[], caps:number[], peak:number[], betrayals:number[]}} stats
 * @property {string[]} hist dueños por turno
 * @property {{kind:string, id:string}} [tag] campaña, desafío diario o tutorial
 * @property {{n:number, t:string, a:number, b?:number, p?:number, k?:string}[]} [chron] crónica: sucesos destacados
 * @property {string[]} [motto] lema de cada bando (bando propio)
 * @property {any[]} log sucesos del turno en curso
 * @property {{id:number, f:number, name:string, ps:number[], seat:number, gov:{name:string, trait:string, policy:string, budget:number}|null}[]} regions regiones unificadas
 * @property {number} regSeq
 * @property {import('./armies.js').Army[]} armies ejércitos de campaña
 * @property {number} armySeq
 * @property {{price:Record<string, number>, vol:Record<string, number>, infl:number}} market
 * @property {Record<string, number>} ws puntuación de guerra por pareja
 * @property {{a:number, b:number, until:number}[]} access paso militar
 * @property {{k:string, f:number, p:number, stage:number, until:number}[]} chainsOn cadenas de sucesos en curso
 */
/** @typedef {{n:number, adj:number[][], ine:string[], tier:number[], terrain:('m'|'s'|'l')[], coast:boolean[], river:Record<string, string>, spec:string[], sea:string[][], wonderSite:string[]}} Geo */

/* ======================= Geografía ======================= */
/** @param {{provinces:{adj:number[], ine:string}[], rivers?:{cross?:Record<string, string>}}} map @returns {Geo} */
export function geoOf(map) {
  const ine = map.provinces.map(p => p.ine);
  const site = ine.map(i => Object.entries(WONDERS).find(([, w]) => w.ine === i)?.[0] || '');
  return {n:ine.length, adj:map.provinces.map(p => p.adj), ine, tier:ine.map(tier), terrain:ine.map(terrain), coast:ine.map(coastal), river:map.rivers?.cross || {},
    spec:ine.map(i => /** @type {Record<string, string>} */ (SPECIALTY)[i] || 'cereal'), sea:ine.map(i => /** @type {Record<string, string[]>} */ (SEA)[i] || []), wonderSite:site};
}
/** Río que hay que cruzar para atacar de una provincia a otra ('' si ninguno). @param {Geo} geo @param {number} a @param {number} b */
export const riverBetween = (geo, a, b) => (geo.river || {})[a < b ? `${a}-${b}` : `${b}-${a}`] || '';
export const RIVER_DEF = 10;
/** ¿Se puede desembarcar de una provincia a otra (mismo mar o vecino)? @param {Geo} geo @param {number} a @param {number} b */
export function seaReach(geo, a, b) {
  if (a === b || !geo.sea[a].length || !geo.sea[b].length) return false;
  return geo.sea[a].some(s => geo.sea[b].includes(s) || /** @type {Record<string, string[]>} */ (SEA_ADJ)[s].some(t => geo.sea[b].includes(t)));
}

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
  const cult = geo.ine.map(culture);
  /** @type {Game} */
  const g = /** @type {any} */ ({
    v:5, seed:o.seed, rng, turn:1, winner:-1, over:false, scenario:sc.id, rules, humans:[...o.humans],
    P:{owner, troops, u:troops.map(t => [t, 0, 0, 0]), ready:[...troops], bld:owner.map(() => ({})), loyal:owner.map(f => f < 0 ? 0 : 100), origin:[...owner], active,
      tax:owner.map(() => 1), stance:owner.map(() => 0), cult, assim:owner.map(() => 0), wonder:owner.map(() => '')},
    F:{name:[...sc.factions.map(f => f.name), sc.neutral?.length ? 'Tierras libres' : 'Rebeldes'], flag:[...sc.factions.map(f => f.flag), -1], color:[...sc.factions.map(f => f.color), '#6B6F7A'],
      capital, home:[...capital], gold:new Array(nf + 1).fill(20), morale:new Array(nf + 1).fill(100), alive:[...sc.factions.map(() => true), false],
      tech:Array.from({length:nf + 1}, () => [0, 0, 0, 0]), know:Array.from({length:nf + 1}, () => []), rp:new Array(nf + 1).fill(0), trait, banner:[...sc.factions.map(f => f.banner || null), null],
      weary:new Array(nf + 1).fill(0), ships:new Array(nf + 1).fill(0), lord:new Array(nf + 1).fill(-1),
      cult:[...capital.map(c => c >= 0 ? cult[c] : '')], min:[]},
    motto:[...sc.factions.map(f => f.motto || ''), ''],
    rel:sq(0), st:sq(PEACE), until:sq(0),
    gens:[], genSeq:0, intel:[], fx:[], offers:[], sieges:[], decisions:[], decSeq:0, missions:[], weds:[], embargo:[],
    stats:{conq:new Array(nf + 1).fill(0), won:new Array(nf + 1).fill(0), lost:new Array(nf + 1).fill(0), caps:new Array(nf + 1).fill(0), peak:counts(owner, nf + 1), betrayals:new Array(nf + 1).fill(0)},
    hist:[], log:[],
  });
  // un consejo de ministros por bando (al azar con la semilla)
  for (let f = 0; f <= nf; f++) g.F.min.push(Object.fromEntries(Object.keys(MINISTERS).map(k => [k, newMinister(rng, k, '')])));
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
  initRealm(geo, g);
  g.hist.push(encode(g));
  return g;
}
/** @param {import('../engine/rng.js').RngState} rng @param {string} role @param {string} not */
function newMinister(rng, role, not) {
  const keys = Object.keys(/** @type {Record<string, any>} */ (MINISTERS)[role]).filter(k => k !== not);
  return {name:MINISTER_NAMES[int(rng, MINISTER_NAMES.length)], k:keys[int(rng, keys.length)]};
}
/**
 * Pone al día una partida guardada con una versión anterior del motor (v2: un edificio, tropas sin tipo).
 * @param {Geo} geo @param {any} g @returns {Game}
 */
export function upgradeGame(geo, g) {
  if (!g || g.v >= 5) return g;
  if (g.v === 4) { initRealm(geo, g); g.v = 5; return g; }
  if (g.v < 3) upgradeV3(geo, g);
  // v4: árbol de saberes. Los niveles de las ramas se convierten en sus saberes, en orden de era.
  g.F.know = g.F.tech.map((/** @type {number[]} */ t) => t.flatMap((l, br) => SABERES.filter(x => x.br === br).sort((a, b) => a.era - b.era).slice(0, l).map(x => x.k)));
  g.F.rp = g.F.name.map(() => 0);
  initRealm(geo, g);
  g.v = 5;
  return g;
}
/** @param {Geo} geo @param {any} g */
function upgradeV3(geo, g) {
  const P = g.P, F = g.F, n = P.owner.length, nf = F.name.length;
  P.u = P.troops.map((/** @type {number} */ t) => [t, 0, 0, 0]);
  P.bld = P.bld.map((/** @type {any} */ b) => typeof b === 'string' && b ? {[b]:1} : {});
  P.tax = new Array(n).fill(1); P.stance = new Array(n).fill(0); P.assim = new Array(n).fill(0); P.wonder = new Array(n).fill('');
  P.cult = geo.ine.slice(0, n).map(culture);
  F.weary = new Array(nf).fill(0); F.ships = new Array(nf).fill(0); F.lord = new Array(nf).fill(-1);
  F.cult = F.home.map((/** @type {number} */ c) => c >= 0 ? P.cult[c] : '');
  const rng = seedState('v3:' + g.seed);
  F.min = F.name.map(() => Object.fromEntries(Object.keys(MINISTERS).map(k => [k, newMinister(rng, k, '')])));
  g.gens = (g.gens || []).map((/** @type {any} */ x) => ({...x, skills:x.skills || [x.skill || 'asedio'], age:x.age || 0, pend:0}));
  Object.assign(g, {sieges:[], decisions:[], decSeq:0, missions:[], weds:[], embargo:[], v:3});
}

/* ======================= Utilidades ======================= */
/** @param {number[]} owner @param {number} n */
export function counts(owner, n) { const c = new Array(n).fill(0); for (const o of owner) if (o >= 0) c[o]++; return c; }
/** @param {Game} g */
export const nFactions = g => g.F.name.length - 1;
export const rebels = (/** @type {Game} */ g) => g.F.name.length - 1;
/** @param {Game} g @returns {Game} */
export function clone(g) { return typeof structuredClone === 'function' ? structuredClone(g) : JSON.parse(JSON.stringify(g)); }
/** Dueños como texto (para la cámara rápida y la red). @param {Game} g */
export const encode = g => g.P.owner.map(o => o < 0 ? '.' : String.fromCharCode(48 + o)).join('');
/** Huella del estado para detectar desajustes en red. @param {Game} g */
export function hash(g) {
  const s = JSON.stringify([g.turn, g.P.owner, g.P.u, g.P.bld, g.F.gold, g.F.morale, g.F.rp, g.F.know, g.F.res, g.P.pop, (g.armies || []).map(a => [a.id, a.p, a.u]), g.st, g.rng]);
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
/** @param {General|undefined} gen @param {string} s */
export const hasSkill = (gen, s) => !!gen && gen.skills.includes(/** @type {any} */ (s));
/** Fuerza aproximada de un bando (tropas + provincias). @param {Game} g @param {number} f */
export function strength(g, f) { let s = 0; for (let p = 0; p < g.P.owner.length; p++) if (g.P.owner[p] === f) s += g.P.troops[p] + 5; return s; }
/** @param {Game} g @param {number} a @param {number} b */
export const atWar = (g, a, b) => a !== b && g.st[a][b] === WAR;
/** Pacto, alianza o federación. @param {number} s */
export const friendly = s => s === PACT || s === ALLY || s === FED;
/** Alianza o federación. @param {number} s */
export const allied = s => s === ALLY || s === FED;
/** Nivel de un edificio en una provincia. @param {Game} g @param {number} p @param {string} b */
export const lvl = (g, p, b) => (g.P.bld[p] && g.P.bld[p][b]) || 0;
/** Edificios (con su nivel) de una provincia. @param {Game} g @param {number} p */
export const buildingsAt = (g, p) => Object.entries(g.P.bld[p] || {}).filter(([, v]) => v > 0);
/** Huecos de edificio de una provincia. @param {Geo} geo @param {Game} g @param {number} p */
export const slots = (geo, g, p) => slotsFor(geo.tier[p]) + (g.P.owner[p] >= 0 && g.F.capital[g.P.owner[p]] === p ? 1 : 0);
/** ¿Tiene el bando esta maravilla? @param {Game} g @param {number} f @param {string} w */
export const hasWonder = (g, f, w) => g.P.wonder.some((x, p) => x === w && g.P.owner[p] === f);
/** ¿Tiene el bando este ministro? @param {Game} g @param {number} f @param {string} role @param {string} k */
export const minister = (g, f, role, k) => !!g.F.min[f] && g.F.min[f][role]?.k === k;
/** Era de un bando (0 medieval, 1 renacimiento, 2 moderna). @param {Game} g @param {number} f */
export const era = (g, f) => f >= 0 && g.F.know?.[f] ? eraOf(g.F.know[f].length) : 0;
/** Si un bando conoce un saber. @param {Game} g @param {number} f @param {string} k */
export const knows = (g, f, k) => f >= 0 && !!g.F.know?.[f]?.includes(k);
/** @type {Record<string, import('./rules.js').Saber>} */
export const SABER = Object.fromEntries(SABERES.map(x => [x.k, x]));
/** Tropas que pueden atacar (sin milicia). @param {Game} g @param {number} p */
export const attackers = (g, p) => g.P.u[p][INF] + g.P.u[p][CAB] + g.P.u[p][ART];
/** ¿Bando en guerra con alguien? @param {Game} g @param {number} f */
export const inWar = (g, f) => g.st[f].some((s, x) => s === WAR && x !== f && x < rebels(g) && g.F.alive[x]);
/** Sucesos que pasan a la crónica (el periódico de la partida). */
const NEWS = new Set(['war', 'betray', 'elim', 'accept', 'revolt', 'victory', 'wonder', 'era', 'catastrofe', 'vassal']);
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
    : e.t === 'wonder' ? {n:g.turn, t:'wonder', a:e.f, p:e.p, k:e.w}
    : e.t === 'era' ? {n:g.turn, t:'era', a:e.f, k:String(e.era)}
    : e.t === 'catastrofe' ? {n:g.turn, t:'catastrofe', a:-1, p:e.p, k:e.kind}
    : {n:g.turn, t:e.t, a:e.a, b:e.b, k:e.kind || e.why || ''};
  g.chron.push(n);
  if (g.chron.length > 160) g.chron.splice(0, g.chron.length - 160);
};
/** @param {number} v @param {number} a @param {number} b */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ======================= Tropas por tipo ======================= */
/** Rehace el total de una provincia. @param {Game} g @param {number} p */
function sync(g, p) { const u = g.P.u[p]; g.P.troops[p] = u[0] + u[1] + u[2] + u[3]; }
/** @param {Game} g @param {number} p @param {number} t @param {number} n */
export function addUnits(g, p, t, n) { g.P.u[p][t] += n; sync(g, p); }
/** Pone un vector de tropas. @param {Game} g @param {number} p @param {number[]} v */
function putUnits(g, p, v) { for (let t = 0; t < 4; t++) g.P.u[p][t] += v[t]; sync(g, p); }
/**
 * Reparte n entre los tipos de un vector de forma proporcional (resto mayor; desempata el tipo más bajo).
 * @param {number[]} u @param {number} n @returns {number[]}
 */
export function share(u, n) {
  const tot = u[0] + u[1] + u[2] + u[3]; if (tot <= 0 || n <= 0) return [0, 0, 0, 0];
  n = Math.min(n, tot);
  const out = u.map(x => Math.floor(x * n / tot)), rem = u.map((x, t) => ({t, r:(x * n) % tot}));
  let left = n - out.reduce((a, b) => a + b, 0);
  rem.sort((a, b) => b.r - a.r || a.t - b.t);
  for (const {t} of rem) { if (left <= 0) break; if (out[t] < u[t]) { out[t]++; left--; } }
  return out;
}
/** Quita n tropas en proporción y devuelve lo quitado. @param {Game} g @param {number} p @param {number} n */
export function removeTroops(g, p, n) { const v = share(g.P.u[p], n); for (let t = 0; t < 4; t++) g.P.u[p][t] -= v[t]; sync(g, p); return v; }
/** ¿Está fortificada (fortaleza o murallas)? @param {Game} g @param {number} p */
export const fortified = (g, p) => lvl(g, p, 'fortaleza') > 0 || lvl(g, p, 'muralla') > 0;
/**
 * Mezcla automática para atacar con n tropas: caballería en llanura, artillería contra lo fortificado y luego
 * infantería (la milicia no ataca).
 * @param {Geo} geo @param {Game} g @param {number} from @param {number} to @param {number} n @returns {number[]}
 */
export function autoMix(geo, g, from, to, n) {
  const u = g.P.u[from], order = [];
  if (fortified(g, to)) order.push(ART);
  if (geo.terrain[to] === 'l') order.push(CAB);
  order.push(INF, CAB, ART);
  const v = [0, 0, 0, 0];
  for (const t of order) { const k = Math.min(u[t] - v[t], n); if (k > 0) { v[t] += k; n -= k; } if (n <= 0) break; }
  return v;
}
/** Comprueba y normaliza un vector de tropas pedido. @param {any} u @returns {number[]|null} */
export const vecOf = u => Array.isArray(u) && u.length === 4 && u.every(x => Number.isInteger(x) && x >= 0) ? u.slice() : null;

/* ======================= Suministro, oro y crecimiento ======================= */
/** Provincias unidas a la capital por territorio propio (o aliado), más almacenes e intendentes. @param {Geo} geo @param {Game} g @param {number} f */
export function supplied(geo, g, f) {
  const ok = new Array(geo.n).fill(false), cap = g.F.capital[f];
  if (f < 0 || f >= g.F.capital.length) return ok;
  const allies = g.F.tech[f][0] >= 3;
  const pass = (/** @type {number} */ p) => g.P.owner[p] === f || (g.P.owner[p] >= 0 && (g.st[f][g.P.owner[p]] === FED || (allies && g.st[f][g.P.owner[p]] === ALLY)));
  if (cap >= 0 && g.P.owner[cap] === f) {
    const st = [cap]; ok[cap] = true;
    while (st.length) { const p = /** @type {number} */ (st.pop()); for (const q of geo.adj[p]) if (!ok[q] && pass(q)) { ok[q] = true; st.push(q); } }
  }
  for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f && lvl(g, p, 'almacen') > 0) ok[p] = true;
  for (const x of g.gens) if (x.f === f && hasSkill(x, 'intendente')) { if (g.P.owner[x.p] === f) ok[x.p] = true; for (const q of geo.adj[x.p]) if (g.P.owner[q] === f) ok[q] = true; }
  return ok;
}
/** @param {Game} g @param {number} p @param {string} kind */
export const effectOn = (g, p, kind) => g.fx.some(e => e.p === p && e.kind === kind && e.until >= g.turn);
/** @typedef {{lines:[string, string][], total:number}} Parts desglose para el informe de provincia */
/**
 * Oro de una provincia para su dueño (antes de los multiplicadores del bando).
 * @param {Geo} geo @param {Game} g @param {number} p @param {boolean[]} sup
 */
export const provinceIncome = (geo, g, p, sup) => incomeParts(geo, g, p, sup, false).total;
/**
 * El mismo cálculo con su desglose.
 * @param {Geo} geo @param {Game} g @param {number} p @param {boolean[]} sup @param {boolean} [why] @returns {Parts}
 */
export function incomeParts(geo, g, p, sup, why = true) {
  /** @type {[string, string][]} */ const L = [];
  const add = (/** @type {string} */ n, /** @type {number} */ v) => { if (why && v) L.push([n, (v > 0 ? '+' : '−') + Math.abs(v)]); return v; };
  const mul = (/** @type {string} */ n, /** @type {number} */ pc) => { if (why && pc !== 100) L.push([n, '×' + (pc / 100).toFixed(2).replace('.', ',')]); return pc; };
  const f = g.P.owner[p]; if (f < 0 || f === rebels(g)) return {lines:L, total:0};
  if (effectOn(g, p, 'sequia') || effectOn(g, p, 'cuarentena')) { if (why) L.push([effectOn(g, p, 'sequia') ? 'Sequía' : 'Cuarentena', 'sin oro']); return {lines:L, total:0}; }
  const blocked = effectOn(g, p, 'bloqueo'), sp = geo.spec[p];
  let v = add('Población', geo.tier[p]) + add('Capital', g.F.capital[f] === p ? 2 : 0) + add('Mina', lvl(g, p, 'mina') * (sp === 'mineria' ? 4 : 2));
  if (!blocked) v += add('Puerto', lvl(g, p, 'puerto') * 2) + add('Pesca', sp === 'pesca' ? 2 : 0);
  else if (why && lvl(g, p, 'puerto')) L.push(['Puerto bloqueado', '+0']);
  v += add('Especialidad', {vino:2, huerta:1, olivo:3, ganado:1, industria:3, mineria:2}[/** @type {'vino'} */ (sp)] || 0);
  if (sp === 'turismo' && !inWar(g, f)) v += add('Turismo en paz', 4);
  if (knows(g, f, 'gremios')) v += add('Gremios', lvl(g, p, 'mercado'));
  if (g.P.pop) v += add('Población', Math.floor((g.P.pop[p] - pop0Of(geo, p)) / 25));
  if (sp === 'ganado' && g.F.laws && law(g, f, 'mesta') === 0) v += add('Mesta', 1);
  let pct = 100 + mul('Mercado', 100 + 25 * lvl(g, p, 'mercado')) - 100 + mul('Comercio', sp === 'comercio' && !blocked ? 130 : 100) - 100;
  pct = pct * mul('Impuestos ' + TAXES[g.P.tax[p] ?? 1].name.toLowerCase(), TAXES[g.P.tax[p] ?? 1].gold) / 100;
  if (g.P.cult[p] !== g.F.cult[f]) pct = pct * mul('Otra cultura', 80) / 100;
  if (effectOn(g, p, 'bandidos')) pct = pct * mul('Bandidos', 50) / 100;
  if (g.P.est && g.P.est[p][1] < 20) pct = pct * mul('Burguesía en huelga', 50) / 100;
  if (g.regions) { const rm = regionIncome(g, p); if (rm !== 100) pct = pct * mul('Región', rm) / 100; }
  if (effectOn(g, p, 'peste')) pct = pct * mul('Peste', 50) / 100;
  v = Math.floor(v * pct / 100);
  if (!sup[p] || g.P.loyal[p] < 30) { v = Math.floor(v / 2); if (why) L.push([!sup[p] ? 'Sin suministro' : 'Poco leal', '×0,50']); }
  return {lines:L, total:v};
}
/** Porcentaje que se aplica al oro de las provincias de un bando. @param {Game} g @param {number} f */
export function incomeMul(g, f) {
  let mul = g.rules.incomeMul;
  if (g.F.trait[f] === 'mercader') mul = mul * 120 / 100;
  if (g.rules.difficulty === 'dificil' && !g.humans.includes(f)) mul = mul * 125 / 100;
  if (hasWonder(g, f, 'sagrada')) mul = mul * 115 / 100;
  if (minister(g, f, 'hacienda', 'recaudador')) mul = mul * 110 / 100;
  if (era(g, f) >= 1) mul = mul * 110 / 100;
  if (knows(g, f, 'banca')) mul = mul * 110 / 100;
  if (knows(g, f, 'ilustracion')) mul = mul * 110 / 100;
  for (const [, v] of realmIncome(g, f)) mul = mul * (100 + v) / 100;
  mul = mul * (200 - g.F.weary[f]) / 200;
  return mul;
}
/** Rutas comerciales: vecinos (o puertos) con pacto, alianza o federación, sin embargo. @param {Geo} geo @param {Game} g @param {number} f @returns {number[]} */
export function tradePartners(geo, g, f) {
  const R = rebels(g), out = [];
  const port = (/** @type {number} */ x) => g.P.owner.some((o, p) => o === x && lvl(g, p, 'puerto') > 0 && !effectOn(g, p, 'bloqueo'));
  const mine = port(f);
  for (let x = 0; x < R; x++) {
    if (x === f || !g.F.alive[x] || !(friendly(g.st[f][x]) || g.F.lord[x] === f || g.F.lord[f] === x)) continue;
    if (g.embargo.some(e => (e.a === f && e.b === x) || (e.a === x && e.b === f))) continue;
    const border = g.P.owner.some((o, p) => o === f && geo.adj[p].some(q => g.P.owner[q] === x));
    if (border || (mine && port(x))) out.push(x);
  }
  return out;
}
/** Oro por ruta comercial. @param {Game} g @param {number} f */
export function routeValue(g, f) {
  const com = Math.min(3, g.P.owner.filter((o, p) => o === f && g.P.bld[p] && g.P.bld[p].mercado > 0).length > 0 ? 1 : 0);
  return 2 + com + (hasWonder(g, f, 'giralda') ? 2 : 0) + (minister(g, f, 'hacienda', 'mercader') ? 1 : 0);
}
/**
 * Desglose del oro de un bando por turno.
 * @param {Geo} geo @param {Game} g @param {number} f
 * @returns {{provinces:number, trade:number, routes:number[], tribute:number, paid:number, upkeep:number, mercs:number, indias:number, total:number}}
 */
export function treasury(geo, g, f) {
  const sup = supplied(geo, g, f);
  let v = 0;
  for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f) v += provinceIncome(geo, g, p, sup);
  const provinces = Math.floor(v * incomeMul(g, f) / 100);
  const routes = tradePartners(geo, g, f);
  const comProv = Math.min(3, g.P.owner.filter((o, p) => o === f && geo.spec[p] === 'comercio').length);
  const trade = routes.length * (routeValue(g, f) + comProv + (g.F.laws && law(g, f, 'comercio') === 1 ? 1 : 0)) * (g.F.fac && g.F.fac[f][2] < 30 ? 50 : 100) / 100 | 0;
  let tribute = 0, paid = 0;
  const R = rebels(g);
  for (let x = 0; x < R; x++) if (g.F.lord[x] === f && g.F.alive[x]) tribute += vassalTribute(geo, g, x);
  if (g.F.lord[f] >= 0 && g.F.alive[g.F.lord[f]]) paid = vassalTribute(geo, g, f);
  const upkeep = upkeepOf(g, f, geo), mercs = (g.armies || []).filter(a => a.f === f && a.merc).length * MERC_UPKEEP;
  const indias = g.F.indias && g.F.indias[f] > 0 ? 25 : 0;
  return {provinces, trade, routes, tribute, paid, upkeep, mercs, indias, total:provinces + trade + tribute + indias - paid - upkeep - mercs};
}
/** Lo que un vasallo paga a su señor: el 25 % del oro de sus provincias. @param {Geo} geo @param {Game} g @param {number} x */
function vassalTribute(geo, g, x) {
  const sup = supplied(geo, g, x);
  let v = 0;
  for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === x) v += provinceIncome(geo, g, p, sup);
  return Math.floor(v * incomeMul(g, x) / 100 * 25 / 100);
}
/** Oro bruto por turno de un bando (sin mantenimiento ni tributos pagados). @param {Geo} geo @param {Game} g @param {number} f */
export function income(geo, g, f) { const t = treasury(geo, g, f); return t.provinces + t.trade + t.tribute; }
/** Guarnición que cada provincia mantiene sin coste. @param {number} tr nivel de población */
export const freeGarrison = tr => 6 + 2 * tr;
/**
 * Mantenimiento del ejército y la flota: lo que pasa de la guarnición gratuita de cada provincia (la caballería
 * y la artillería cuentan doble; la milicia no cuenta) y un oro por barco.
 * @param {Game} g @param {number} f @param {Geo} [geo]
 */
export function upkeepOf(g, f, geo) {
  let w = 0;
  for (let p = 0; p < g.P.owner.length; p++) if (g.P.owner[p] === f) {
    const u = g.P.u[p], tr = geo ? geo.tier[p] : 2;
    w += Math.max(0, u[INF] * UNITS[INF].up + u[CAB] * UNITS[CAB].up + u[ART] * UNITS[ART].up - freeGarrison(tr));
  }
  w += armyGoldUpkeep(g, f);
  if (g.F.laws && law(g, f, 'leva') === 1) w = Math.floor(w * 125 / 100);
  let v = Math.floor(w / UPKEEP_PER) + g.F.ships[f];
  if (hasWonder(g, f, 'acueducto')) v = Math.floor(v * 70 / 100);
  if (minister(g, f, 'guerra', 'intendente')) v = Math.floor(v * 80 / 100);
  return v;
}
/** Tope de tropas de una provincia. @param {Geo} geo @param {Game} g @param {number} p */
export function cap(geo, g, p) {
  const f = g.P.owner[p];
  return 12 + 4 * geo.tier[p] + 8 * lvl(g, p, 'cuartel') + 6 * lvl(g, p, 'almacen') + (f >= 0 && g.F.capital[f] === p ? 10 : 0);
}
/** Crecimiento por turno de una provincia (infantería). @param {Geo} geo @param {Game} g @param {number} p @param {boolean[]} sup */
export const growth = (geo, g, p, sup) => growthParts(geo, g, p, sup, false).total;
/** Crecimiento con su desglose. @param {Geo} geo @param {Game} g @param {number} p @param {boolean[]} sup @param {boolean} [why] @returns {Parts} */
export function growthParts(geo, g, p, sup, why = true) {
  /** @type {[string, string][]} */ const L = [];
  const add = (/** @type {string} */ n, /** @type {number} */ v) => { if (why && v) L.push([n, (v > 0 ? '+' : '−') + Math.abs(v)]); return v; };
  const f = g.P.owner[p]; if (f < 0 || f === rebels(g)) return {lines:L, total:0};
  const stop = !sup[p] ? 'Sin suministro' : g.P.loyal[p] < 30 ? 'Poco leal' : effectOn(g, p, 'sequia') ? 'Sequía' : effectOn(g, p, 'riada') ? 'Riada' : '';
  if (stop) { if (why) L.push([stop, 'no crece']); return {lines:L, total:0}; }
  const sp = geo.spec[p];
  let v = add('Base', 1) + add('Población grande', geo.tier[p] >= 4 ? 1 : 0) + add('Cuartel', lvl(g, p, 'cuartel')) + add('Granja', lvl(g, p, 'granja'))
    + add('Capital', g.F.capital[f] === p ? 1 : 0) + add(sp === 'huerta' ? 'Huerta' : 'Cereal', sp === 'cereal' || sp === 'huerta' ? 1 : 0)
    + add('Rotación de cultivos', knows(g, f, 'rotacion') && lvl(g, p, 'granja') > 0 ? 1 : 0);
  if (g.rules.seasons && season(g) === 3 && geo.terrain[p] !== 'l') v += add('Invierno en la sierra', -1);
  if (g.F.fac && g.F.fac[f][0] < 30) v += add('La nobleza retiene sus levas', -1);
  if (g.P.pop && g.P.troops[p] * 2 >= g.P.pop[p]) { if (why) L.push(['Poca población', 'no crece']); return {lines:L, total:0}; }
  return {lines:L, total:Math.max(0, v)};
}
/** Alcance de movimiento desde una provincia. @param {Game} g @param {number} f @param {number} from */
export function moveRange(g, f, from) {
  const gen = generalAt(g, from);
  return 1 + Math.min(2, g.F.tech[f][0]) + (g.F.trait[f] === 'estratega' ? 1 : 0) + (gen && gen.f === f && hasSkill(gen, 'rapidez') ? 1 : 0) + lvl(g, from, 'caminos');
}
/** Provincias propias alcanzables al mover. @param {Geo} geo @param {Game} g @param {number} f @param {number} from */
export function reachable(geo, g, f, from) {
  const range = moveRange(g, f, from), dist = new Map([[from, 0]]), q = [from];
  while (q.length) {
    const p = /** @type {number} */ (q.shift()), d = /** @type {number} */ (dist.get(p));
    if (d >= range || (g.rules.seasons && effectOn(g, p, 'nevada') && p !== from)) continue;
    for (const r of geo.adj[p]) if (!dist.has(r) && g.P.owner[r] === f) { dist.set(r, d + 1); q.push(r); }
  }
  // dentro de una región se mueve libremente
  const reg = g.regions ? regionOf(g, from) : null;
  if (reg && reg.f === f) for (const p of reg.ps) if (!dist.has(p)) dist.set(p, 1);
  dist.delete(from);
  return [...dist.keys()].sort((a, b) => a - b);
}

/* ======================= Costes ======================= */
/** Coste de construir (nivel 1) o mejorar un edificio. @param {Geo} geo @param {Game} g @param {number} f @param {number} p @param {string} b */
export function buildCost(geo, g, f, p, b) {
  const info = BUILDINGS[/** @type {import('./rules.js').Building} */ (b)]; if (!info) return 9999;
  let c = info.cost * (lvl(g, p, b) + queuedLv(g, p, b) + 1);
  if (knows(g, f, 'mamposteria')) c = c * 90 / 100;
  if (g.F.laws && law(g, f, 'comercio') === 0) c = c * 95 / 100;
  if (g.F.trait[f] === 'constructor') c = c * 70 / 100;
  if (minister(g, f, 'hacienda', 'constructor')) c = c * 85 / 100;
  if (geo.spec[p] === 'industria' || geo.spec[p] === 'madera') c = c * 80 / 100;
  return Math.floor(c);
}
/** Coste de una tropa de un tipo en una provincia. @param {Geo} geo @param {Game} g @param {number} f @param {number} p @param {number} t */
export function unitCost(geo, g, f, p, t) {
  let c = UNITS[t].cost;
  if (t !== MIL) {
    if (lvl(g, p, 'cuartel') > 0) c -= 1;
    if (hasWonder(g, f, 'alcazar')) c -= 1;
    if (minister(g, f, 'guerra', 'reclutador')) c -= 1;
    if (geo.spec[p] === 'hierro') c -= t === ART ? 2 : 1;
    if (geo.spec[p] === 'ganado' && t === CAB) c -= 2;
    if (g.F.laws && t === INF && law(g, f, 'leva') === 0) c -= 1;
    if (g.F.laws && law(g, f, 'leva') === 2) c += 1;
  }
  return Math.max(1, c);
}
/** Puntos de saber que cuesta un saber. @param {Game} g @param {number} f @param {string} k */
export function saberCost(g, f, k) {
  const x = SABER[k]; if (!x) return 9999;
  return Math.floor(x.cost * (hasWonder(g, f, 'salamanca') ? 75 : 100) / 100);
}
/** Oro que falta para aprender un saber ahora (0 si basta con el saber acumulado). @param {Game} g @param {number} f @param {string} k */
export const saberGold = (g, f, k) => Math.max(0, saberCost(g, f, k) - g.F.rp[f]) * GOLD_PER_SABER;
/** Si se puede aprender (ya, o cuando haya saber u oro). @param {Game} g @param {number} f @param {string} k @returns {{ok:boolean, why:string}} */
export function saberOpen(g, f, k) {
  const x = SABER[k];
  if (!x) return {ok:false, why:'No existe'};
  if (knows(g, f, k)) return {ok:false, why:'Ya lo conoces'};
  const miss = x.req.filter(r => !knows(g, f, r));
  if (miss.length) return {ok:false, why:'Requiere ' + miss.map(r => SABER[r].name).join(' y ')};
  if (era(g, f) < x.era) return {ok:false, why:x.era === 2 ? 'Llega con la era Moderna' : 'Llega con el Renacimiento'};
  return {ok:true, why:''};
}
/** Saber que gana un bando por turno. @param {Geo} geo @param {Game} g @param {number} f */
export function saberGain(geo, g, f) {
  let v = 2, n = 0;
  for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f) { n++; v += 2 * lvl(g, p, 'universidad'); }
  v += Math.floor(n / 4);
  if (knows(g, f, 'imprenta')) v += 3;
  if (hasWonder(g, f, 'salamanca')) v += 3;
  return v;
}
/** Aprende un saber (sube su rama y, si toca, la era). @param {Game} g @param {number} f @param {string} k */
function learn(g, f, k) {
  const before = era(g, f), x = SABER[k];
  g.F.know[f].push(k);
  if (x.br >= 0) g.F.tech[f][x.br] = Math.min(3, g.F.tech[f][x.br] + 1);
  emit(g, {t:'tech', f, k, lvl:g.F.know[f].length});
  if (era(g, f) > before) emit(g, {t:'era', f, era:era(g, f)});
}
/** @param {Game} g @param {number} f */
/** Tropas por barco. @param {Game} g @param {number} f */
export const shipCap = (g, f) => SHIP_CAP + (knows(g, f, 'navegacion') ? 2 : 0);
/** @param {Game} g @param {number} f */
export const shipCost = (g, f) => Math.floor(SHIP_COST * (hasWonder(g, f, 'belem') ? 60 : 100) / 100);
/** @param {Game} g @param {number} f @param {string} kind @param {number} [p] */
export function spyCost(g, f, kind, p = -1) {
  if (kind === 'sobornar') return p < 0 ? 0 : 20 + 2 * g.P.troops[p];
  return Math.floor((/** @type {Record<string, number>} */ (COST.spy))[kind] * (g.F.tech[f][3] >= 2 ? 70 : 100) / 100);
}
/** @param {Game} g @param {number} f @param {string} [kind] */
export const spyChance = (g, f, kind = 'espiar') => clamp(55 + 15 * g.F.tech[f][3] + (minister(g, f, 'diplomacia', 'espia') ? 10 : 0) + ((/** @type {Record<string, {mod:number}>} */ (SPY_KINDS))[kind]?.mod || 0), 5, 95);
/** Precio de una provincia ajena. @param {Geo} geo @param {Game} g @param {number} f @param {number} p */
export function provincePrice(geo, g, f, p) {
  let v = 25 * geo.tier[p] + 4 * g.P.troops[p] + 15 * buildingsAt(g, p).reduce((s, [, l]) => s + l, 0);
  if (minister(g, f, 'diplomacia', 'negociador')) v = v * 75 / 100;
  return Math.floor(v);
}

/* ======================= Combate ======================= */
/** Brecha abierta por el asedio de un bando. @param {Game} g @param {number} f @param {number} p */
export const breach = (g, f, p) => g.sieges.find(s => s.f === f && s.p === p)?.breach || 0;
/**
 * Multiplicador de ataque (porcentaje), sin la táctica.
 * @param {Geo} geo @param {Game} g @param {number} f @param {number} from @param {number} to @param {boolean} [gen]
 */
export function attackMul(geo, g, f, from, to, gen = true) {
  let m = 100 + (g.F.morale[f] - 100) + 10 * g.F.tech[f][1] - Math.floor(g.F.weary[f] / 5);
  const gn = generalAt(g, from);
  if (gen && gn && gn.f === f && hasSkill(gn, 'asedio')) m += 15 + 5 * gn.lvl;
  if (g.F.trait[f] === 'conquistador') m += 15;
  if (hasWonder(g, f, 'santiago')) m += 10;
  if (minister(g, f, 'guerra', 'estratega')) m += 5;
  if (era(g, f) >= 2) m += 10;
  m += realmAttack(g, f);
  if (g.P.owner[from] === f && !supplied(geo, g, f)[from]) m -= 30;
  if (g.rules.seasons && season(g) === 3 && geo.terrain[to] !== 'l') m -= 25;
  return Math.max(20, m);
}
/**
 * Multiplicador de defensa (porcentaje). Con `from` cuenta el río; con `f`, la brecha de su asedio.
 * @param {Geo} geo @param {Game} g @param {number} p @param {number} [from] @param {number} [f]
 */
export const defenseMul = (geo, g, p, from = -1, f = -1) => defenseParts(geo, g, p, from, f, false).total;
/** Defensa con su desglose (en puntos de porcentaje). @param {Geo} geo @param {Game} g @param {number} p @param {number} [from] @param {number} [f] @param {boolean} [why] @returns {Parts} */
export function defenseParts(geo, g, p, from = -1, f = -1, why = true) {
  /** @type {[string, string][]} */ const L = [];
  const add = (/** @type {string} */ n, /** @type {number} */ v) => { if (why && v) L.push([n, (v > 0 ? '+' : '−') + Math.abs(v) + ' %']); return v; };
  const d = g.P.owner[p];
  let m = 100 + add('Terreno', TERRAIN_DEF[geo.terrain[p]]) + add('Fortaleza', 25 * lvl(g, p, 'fortaleza')) + add('Torre de vigía', 10 * lvl(g, p, 'torre'))
    + add('Murallas', 30 * Math.max(0, lvl(g, p, 'muralla') - (f >= 0 ? breach(g, f, p) : 0)))
    + add('Río', from >= 0 && riverBetween(geo, from, p) ? RIVER_DEF : 0);
  if (d >= 0 && d !== rebels(g)) {
    m += add('Moral', g.F.morale[d] - 100) + add('Cansancio de guerra', -Math.floor(g.F.weary[d] / 5));
    if (g.F.capital[d] === p) m += add('Capital', 20) + add('Murallas de Ávila', hasWonder(g, d, 'murallas') ? 30 : 0);
    if (g.F.trait[d] === 'guardian') m += add('Líder guardián', 15);
    if (hasWonder(g, d, 'alhambra')) m += add('La Alhambra', 10);
    if (knows(g, d, 'abaluartada') && (lvl(g, p, 'muralla') > 0 || lvl(g, p, 'fortaleza') > 0)) m += add('Fortificación abaluartada', 15);
  }
  const gn = generalAt(g, p);
  if (gn && gn.f === d && hasSkill(gn, 'defensa')) m += add('General ' + gn.name, 20 + 5 * gn.lvl);
  return {lines:L, total:Math.max(20, m)};
}
/**
 * Cambio de lealtad por turno con su desglose.
 * @param {Geo} geo @param {Game} g @param {number} p @param {boolean} [why] @returns {Parts}
 */
export function loyaltyParts(geo, g, p, why = true) {
  /** @type {[string, string][]} */ const L = [];
  const add = (/** @type {string} */ n, /** @type {number} */ v) => { if (why && v) L.push([n, (v > 0 ? '+' : '−') + Math.abs(v)]); return v; };
  const f = g.P.owner[p]; if (f < 0 || f === rebels(g)) return {lines:L, total:0};
  let up = add('Calma', 5) + add('Guarnición de 5 o más', g.P.troops[p] >= 5 ? 5 : 0) + add('Líder guardián', g.F.trait[f] === 'guardian' ? 5 : 0)
    + add('Catedral', 5 * lvl(g, p, 'catedral')) + add('La Mezquita', hasWonder(g, f, 'mezquita') ? 3 : 0);
  up += add('Impuestos ' + TAXES[g.P.tax[p] ?? 1].name.toLowerCase(), /** @type {number} */ ([4, 0, minister(g, f, 'hacienda', 'austero') || (g.F.laws && law(g, f, 'cortes') === 1) ? -3 : -6][g.P.tax[p] ?? 1]));
  up += add('Otra cultura', g.P.cult[p] !== g.F.cult[f] ? -3 : 0) + add('Cansancio de guerra', -Math.floor(g.F.weary[f] / 25)) + add('Ilustración', knows(g, f, 'ilustracion') ? 2 : 0);
  if (g.gens.some(x => x.f === f && x.skills.includes('carisma') && (x.p === p || geo.adj[p].includes(x.p)))) up += add('General con carisma', 10);
  for (const [n, v] of realmLoyalty(geo, g, p)) up += add(n, v);
  return {lines:L, total:up};
}
/**
 * Efecto de la táctica del atacante frente a la postura del defensor.
 * @param {Game} g @param {number} tac @param {number} to @param {number[]} vec @param {General|undefined} gn general atacante
 * @returns {{att:number, loss:number}} att: puntos de ataque; loss: % de bajas del atacante
 */
export function tacticMod(g, tac, to, vec, gn) {
  const stance = g.P.stance[to] || 0, n = vec[0] + vec[1] + vec[2] + vec[3], tactico = hasSkill(gn, 'tactico');
  if (!(tac >= 0 && tac <= 2)) return {att:0, loss:100};
  if (stance === TACTICS[tac].counter) return {att:tactico ? -15 : -30, loss:tac === 2 ? 125 : 100};
  let att = tac === 0 ? 15 : tac === 1 ? (vec[CAB] * 3 >= n ? 25 : 5) : fortified(g, to) ? 25 : -10;
  if (tactico && att > 0) att *= 2;
  if (stance > 0) att += 5;
  return {att, loss:100};
}
/** Fases de la batalla: peso de cada tropa al atacar [inf, cab, art] y al defender [inf, cab, art, mil]. */
export const PHASES = [
  {name:'Escaramuza', att:[80, 70, 200], def:[90, 80, 140, 80]},
  {name:'Choque', att:[120, 100, 60], def:[120, 90, 50, 100]},
  {name:'Carga decisiva', att:[100, 140, 80], def:[100, 100, 70, 90]},
];
/**
 * Fuerzas de un ataque, fase a fase, y la probabilidad exacta de ganarlo: gana quien se lleva dos de las tres fases
 * (cada fase es un 3d6 por «suma × fuerza»; con retirada, perder la primera es perder la batalla).
 * @param {Geo} geo @param {Game} g @param {number} f @param {number} from @param {number} to @param {number[]} vec
 * @param {{tac?:number, gen?:boolean, naval?:boolean, plan?:{carga?:boolean, reserva?:boolean, retirada?:boolean}, morale?:number, xp?:number}} [o]
 */
export function battleOdds(geo, g, f, from, to, vec, o = {}) {
  const gn = generalAt(g, from), withGen = !!(gn && gn.f === f && o.gen !== false);
  const terr = geo.terrain[to], fort = fortified(g, to), plan = o.plan || {};
  const tm = tacticMod(g, o.tac ?? 0, to, vec, withGen ? gn : undefined);
  let mA = Math.max(20, attackMul(geo, g, f, from, to, withGen) + tm.att - (o.naval ? (knows(g, f, 'navegacion') ? 10 : 20) : 0));
  mA = Math.floor(mA * moraleMul(o.morale ?? 100) / 100 * (100 + xpBonus(o.xp || 0)) / 100);
  const mD = defenseMul(geo, g, to, o.naval ? -1 : from, f);
  const du = g.armies ? defVec(g, to) : [...g.P.u[to]], dOwn = g.P.owner[to];
  const ua = [0, 1, 2].map(t => unitAttack(t, terr, fort) * (100 + (t === CAB && withGen && hasSkill(gn, 'jinete') ? 20 : 0) + (t === CAB && knows(g, f, 'estribo') ? 15 : 0) + (t === INF && knows(g, f, 'tercios') ? 10 : 0)) / 100);
  const phases = PHASES.map((ph, i) => {
    let raw = 0, draw = 0;
    for (let t = 0; t < 3; t++) raw += vec[t] * ua[t] * (i === 0 && t === CAB && plan.carga ? 180 : ph.att[t]) / 100;
    if (plan.reserva) raw = raw * (i === 0 ? 75 : i === 1 ? 125 : 100) / 100;
    for (let t = 0; t < 4; t++) draw += du[t] * UNITS[t].def * (t === INF && knows(g, dOwn, 'tercios') ? 110 : 100) / 100 * ph.def[t] / 100;
    const SA = Math.floor(raw) * mA, SD = Math.floor(draw) * mD;
    return {SA, SD, p:SD <= 0 ? 1 : SA <= 0 ? 0 : winProb(SA, SD).p};
  });
  const D = du[0] + du[1] + du[2] + du[3], [a, b, c] = phases.map(x => x.p);
  const p = D <= 0 ? 1 : plan.retirada ? a * (b + (1 - b) * c) : a * b + (a * (1 - b) + (1 - a) * b) * c;
  return {p, SA:phases[1].SA, SD:phases[1].SD, phases, mA, mD, D, du, tm, withGen, gn};
}
/**
 * Probabilidad exacta de ganar un ataque con n tropas (mezcla automática) o con un vector de tropas.
 * @param {Geo} geo @param {Game} g @param {number} f @param {number} from @param {number} to @param {number|number[]} n @param {number} [tac]
 */
export function odds(geo, g, f, from, to, n, tac = 0) {
  const vec = Array.isArray(n) ? n : autoMix(geo, g, from, to, n);
  return battleOdds(geo, g, f, from, to, vec, {tac});
}

/* ======================= Diplomacia (interna) ======================= */
/** @param {Game} g @param {number} a @param {number} b @param {number} v */
function relAdd(g, a, b, v) { if (a === b) return; const r = clamp(g.rel[a][b] + v, -100, 100); g.rel[a][b] = g.rel[b][a] = r; }
/** @param {Game} g @param {number} a @param {number} b @param {number} s */
function setStatus(g, a, b, s, untilTurn = 0) { g.st[a][b] = g.st[b][a] = s; g.until[a][b] = g.until[b][a] = untilTurn; }
/** Declara la guerra (con traición si había acuerdo) y arrastra a aliados y vasallos. @param {Game} g @param {number} a @param {number} b @param {string} why */
export function declareWar(g, a, b, why = '') {
  if (a === b || g.st[a][b] === WAR) return;
  const prev = g.st[a][b], R = rebels(g);
  if (b === R || a === R) { setStatus(g, a, b, WAR); return; }
  const wed = g.weds.some(w => ((w.a === a && w.b === b) || (w.a === b && w.b === a)) && w.until >= g.turn);
  if (friendly(prev) || wed || g.F.lord[b] === a || g.F.lord[a] === b) {
    g.stats.betrayals[a]++;
    for (let x = 0; x < R; x++) if (x !== a && g.F.alive[x]) relAdd(g, a, x, wed ? -60 : -40);
    emit(g, {t:'betray', a, b});
  }
  if (g.F.lord[a] === b) { g.F.lord[a] = -1; emit(g, {t:'vassal', a, b, kind:'independencia'}); }
  if (g.F.lord[b] === a) g.F.lord[b] = -1;
  g.weds = g.weds.filter(w => !((w.a === a && w.b === b) || (w.a === b && w.b === a)));
  setStatus(g, a, b, WAR);
  relAdd(g, a, b, -50);
  emit(g, {t:'war', a, b, why});
  // los aliados de b y sus vasallos (y su señor) entran en la guerra
  for (let x = 0; x < R; x++) if (x !== a && x !== b && g.F.alive[x] && g.st[a][x] !== WAR && (allied(g.st[b][x]) || g.F.lord[x] === b || g.F.lord[b] === x)) {
    setStatus(g, a, x, WAR); relAdd(g, a, x, -30); emit(g, {t:'war', a:x, b:a, why:'alianza'});
  }
  // los vasallos de a le siguen
  for (let x = 0; x < R; x++) if (g.F.lord[x] === a && g.F.alive[x] && x !== b && g.st[x][b] !== WAR) { setStatus(g, x, b, WAR); emit(g, {t:'war', a:x, b, why:'vasallaje'}); }
}

/* ======================= Generales ======================= */
/** @param {Game} g @param {number} f @param {number} p @param {string} skill @param {import('../engine/rng.js').RngState} [rng] */
function hireFree(g, f, p, skill, rng = g.rng) {
  const name = GIVEN[int(rng, GIVEN.length)] + ' ' + EPITHET[int(rng, EPITHET.length)];
  /** @type {General} */
  const gen = {id:++g.genSeq, f, p, name, skills:[/** @type {any} */ (skill)], xp:0, lvl:0, age:0, pend:0};
  if (hasWonder(g, f, 'escorial') || knows(g, f, 'academias')) { gen.lvl = 1; gen.xp = GEN_XP[1]; gen.pend = 1; }
  g.gens.push(gen);
  if (gen.pend && !g.humans.includes(f)) autoSkill(g, gen, rng);
  return gen;
}
/** Un bot elige solo la habilidad nueva de su general. @param {Game} g @param {General} gen @param {import('../engine/rng.js').RngState} rng */
function autoSkill(g, gen, rng) {
  while (gen.pend > 0) {
    const left = Object.keys(SKILLS).filter(s => !gen.skills.includes(/** @type {any} */ (s)));
    if (!left.length) { gen.pend = 0; break; }
    gen.skills.push(/** @type {any} */ (left[int(rng, left.length)])); gen.pend--;
  }
}
/** @param {Game} g @param {General} gen @param {import('../engine/rng.js').RngState} rng */
function gainXp(g, gen, rng) {
  gen.xp++;
  const lv = gen.xp >= GEN_XP[3] ? 3 : gen.xp >= GEN_XP[2] ? 2 : gen.xp >= GEN_XP[1] ? 1 : 0;
  if (lv > gen.lvl) {
    gen.pend += lv - gen.lvl; gen.lvl = lv;
    emit(g, {t:'genup', f:gen.f, id:gen.id, lvl:lv});
    if (!g.humans.includes(gen.f)) autoSkill(g, gen, rng);
  }
}
/** Máximo de generales de un bando. @param {Game} g @param {number} f */
export const maxGenerals = (g, f) => COST.maxGenerals + (hasWonder(g, f, 'escorial') ? 1 : 0) + (knows(g, f, 'academias') ? 1 : 0);

/* ======================= Acciones ======================= */
/**
 * Órdenes. Opcionales en multijugador: q (número de la orden en el turno, para los dados) y x (en un ataque,
 * dueño y tropas que se esperan en el objetivo; si han cambiado, la orden se anula).
 * @typedef {{type:string, f:number, [k:string]:any}} Action
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
export const need = (c, msg) => { if (!c) throw new RuleError(msg); };

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
  const mine = (/** @type {number} */ p) => need(P.owner[p] === f, 'No es tuya');
  switch (a.type) {
    case 'move': {
      mine(a.from);
      need(reachable(geo, g, f, a.from).includes(a.to), 'Fuera de alcance');
      const v = vecOf(a.u) || share(P.u[a.from], Math.floor(a.n));
      const n = v[0] + v[1] + v[2] + v[3];
      need(n >= 1 && n <= P.ready[a.from] && n <= P.troops[a.from] - 1 && v.every((x, t) => x <= P.u[a.from][t]), 'No hay tropas suficientes (al menos 1 se queda)');
      for (let t = 0; t < 4; t++) P.u[a.from][t] -= v[t];
      sync(g, a.from); P.ready[a.from] -= n; putUnits(g, a.to, v);
      const gn = generalAt(g, a.from);
      if (gn && gn.f === f && a.gen) gn.p = a.to;
      emit(g, {t:'move', f, from:a.from, to:a.to, n, u:v});
      break;
    }
    case 'attack': return attack(geo, g, a, false);
    case 'naval': return attack(geo, g, a, true);
    case 'siege': {
      mine(a.from);
      const d = P.owner[a.to];
      need(geo.adj[a.from].includes(a.to) && d >= 0 && d !== f && P.active[a.to], 'Elige una provincia vecina');
      need(d === rebels(g) || g.st[f][d] === WAR, 'Solo se asedia en guerra');
      need(lvl(g, a.to, 'muralla') > 0, 'No tiene murallas: atácala');
      need(attackers(g, a.from) >= 5, 'Hacen falta 5 tropas para asediar');
      need(!g.sieges.some(s => s.f === f && s.p === a.to), 'Ya la estás asediando');
      g.sieges.push({f, from:a.from, p:a.to, breach:0, mode:'asedio', food:2 + 2 * lvl(g, a.to, 'almacen') + (lvl(g, a.to, 'granja') ? 1 : 0)});
      emit(g, {t:'siege', f, from:a.from, p:a.to, d});
      break;
    }
    case 'recruit': {
      mine(a.p);
      need(supplied(geo, g, f)[a.p], 'Sin suministro no se puede reclutar');
      const t = Number.isInteger(a.t) ? a.t : INF, n = Math.floor(a.n);
      need(t >= 0 && t < 4, 'Tropa no válida');
      need(!UNITS[t].era || era(g, f) >= /** @type {number} */ (UNITS[t].era), 'Esa tropa llega con el Renacimiento');
      need(n >= 1 && n <= COST.maxRecruit, `Entre 1 y ${COST.maxRecruit} tropas`);
      need(P.troops[a.p] + n <= 2 * cap(geo, g, a.p), `Caben ${Math.max(0, 2 * cap(geo, g, a.p) - P.troops[a.p])} tropas más aquí`);
      const merc = g.F.laws && law(g, f, 'leva') === 2, popCost = P.pop && t !== MIL && !merc;
      need(!popCost || P.pop[a.p] >= n + 5, `Falta población: quedan ${P.pop ? P.pop[a.p] : 0} mil y hacen falta 5 de reserva`);
      const rr = unitRes(t); need(hasRes(g, f, rr, n), `Faltan ${missingRes(g, f, rr, n)}`);
      const price = unitCost(geo, g, f, a.p, t) * n;
      need(g.F.gold[f] >= price, 'No hay oro suficiente');
      g.F.gold[f] -= price; addUnits(g, a.p, t, n); payRes(g, f, rr, n);
      if (popCost) P.pop[a.p] -= n;
      emit(g, {t:'recruit', f, p:a.p, n, u:t});
      break;
    }
    case 'build': {
      mine(a.p);
      const info = BUILDINGS[/** @type {import('./rules.js').Building} */ (a.b)];
      need(!!info, 'Edificio no válido');
      const q = P.queue ? P.queue[a.p] : null, cur = lvl(g, a.p, a.b) + queuedLv(g, a.p, a.b);
      need(cur < info.max, 'Ya está al máximo');
      need(!info.coast || geo.coast[a.p], 'Necesita costa');
      need(!info.hills || geo.terrain[a.p] !== 'l', 'Necesita montaña o sierra');
      need(!info.era || era(g, f) >= info.era, info.era === 2 ? 'Llega con la era Moderna' : 'Llega con el Renacimiento');
      need(!/** @type {any} */ (info).region || (!!g.regions && regionOf(g, a.p)?.seat === a.p), 'Solo en la sede de una región');
      const fresh = q ? q.filter(j => j.lvl === 1 && j.b !== '*').length : 0;
      need(cur > 0 || buildingsAt(g, a.p).length + fresh < slots(geo, g, a.p), 'No quedan huecos en esta provincia');
      need(!q || q.length < 2, 'Ya hay dos obras en marcha aquí');
      const price = buildCost(geo, g, f, a.p, a.b), mat = materials(a.b, cur + 1);
      need(g.F.gold[f] >= price, 'No hay oro suficiente');
      need(hasRes(g, f, mat), `Faltan ${missingRes(g, f, mat)}`);
      g.F.gold[f] -= price; payRes(g, f, mat);
      if (q) { q.push({f, b:a.b, lvl:cur + 1, left:cur + 1, gold:price}); emit(g, {t:'build', f, p:a.p, b:a.b, lvl:cur + 1, turns:cur + 1}); }
      else { P.bld[a.p] = {...P.bld[a.p], [a.b]:cur + 1}; emit(g, {t:'build', f, p:a.p, b:a.b, lvl:cur + 1}); }
      break;
    }
    case 'wonder': {
      mine(a.p);
      const w = geo.wonderSite[a.p], info = /** @type {Record<string, {cost:number, name:string}>} */ (WONDERS)[w];
      need(!!info && !P.wonder[a.p], 'Aquí no hay maravilla que construir');
      need(!P.queue || !P.queue[a.p].some(j => j.b === '*'), 'Ya se está levantando');
      need(g.F.gold[f] >= info.cost, 'No hay oro suficiente');
      const mat = {madera:20, hierro:10}; need(!P.queue || hasRes(g, f, mat), `Faltan ${missingRes(g, f, mat)}`);
      g.F.gold[f] -= info.cost;
      if (P.queue) { payRes(g, f, mat); P.queue[a.p].unshift({f, b:'*', w, lvl:1, left:5, gold:info.cost}); emit(g, {t:'wonderstart', f, p:a.p, w}); }
      else { P.wonder[a.p] = w; emit(g, {t:'wonder', f, p:a.p, w}); }
      break;
    }
    case 'research': {
      const o = saberOpen(g, f, a.k); need(o.ok, o.why);
      const cost = saberCost(g, f, a.k), gold = saberGold(g, f, a.k);
      need(g.F.gold[f] >= gold, `Faltan ${gold - g.F.gold[f]} de oro (o más saber)`);
      g.F.gold[f] -= gold; g.F.rp[f] = Math.max(0, g.F.rp[f] - cost);
      learn(g, f, a.k);
      break;
    }
    case 'hire': {
      mine(a.p);
      need(generalsOf(g, f).length < maxGenerals(g, f), `Máximo ${maxGenerals(g, f)} generales`);
      need(!generalAt(g, a.p), 'Ya hay un general allí');
      need(a.skill in SKILLS, 'Habilidad no válida');
      need(g.F.gold[f] >= COST.general, 'No hay oro suficiente');
      g.F.gold[f] -= COST.general;
      const gen = hireFree(g, f, a.p, a.skill, rngFor(g, a));
      emit(g, {t:'hire', f, p:a.p, id:gen.id});
      break;
    }
    case 'skill': {
      const gen = g.gens.find(x => x.id === a.id && x.f === f);
      need(!!gen && /** @type {General} */ (gen).pend > 0, 'No hay habilidad que elegir');
      need(a.skill in SKILLS && !/** @type {General} */ (gen).skills.includes(a.skill), 'Habilidad no válida');
      /** @type {General} */ (gen).skills.push(a.skill); /** @type {General} */ (gen).pend--;
      emit(g, {t:'skill', f, id:a.id, skill:a.skill});
      break;
    }
    case 'tax': {
      mine(a.p); need(a.lvl >= 0 && a.lvl <= 2, 'Nivel no válido');
      P.tax[a.p] = a.lvl; emit(g, {t:'tax', f, p:a.p, lvl:a.lvl}); break;
    }
    case 'stance': {
      mine(a.p); need(a.s >= 0 && a.s <= 3, 'Postura no válida');
      P.stance[a.p] = a.s; emit(g, {t:'stance', f, p:a.p, s:a.s}); break;
    }
    case 'ships': {
      mine(a.p);
      const l = lvl(g, a.p, 'astillero'), n = Math.floor(a.n);
      need(l > 0, 'Hace falta un astillero');
      need(n >= 1 && n <= 2 * l, `Hasta ${2 * l} barcos por turno aquí`);
      need(!g.fx.some(e => e.kind === 'astillero' && e.p === a.p && e.until >= g.turn), 'Este astillero ya ha trabajado este turno');
      const price = shipCost(g, f) * n * (geo.spec[a.p] === 'madera' ? 70 : 100) / 100;
      need(g.F.gold[f] >= price, 'No hay oro suficiente');
      need(hasRes(g, f, {madera:2}, n), `Faltan ${missingRes(g, f, {madera:2}, n)}`);
      g.F.gold[f] -= Math.floor(price); g.F.ships[f] += n; payRes(g, f, {madera:2}, n);
      g.fx.push({kind:'astillero', p:a.p, f, until:g.turn});
      emit(g, {t:'ships', f, p:a.p, n});
      break;
    }
    case 'blockade': {
      const d = P.owner[a.p];
      need(d >= 0 && d !== f && d < rebels(g) && g.st[f][d] === WAR, 'Solo se bloquea a un enemigo');
      need(geo.coast[a.p], 'No tiene costa');
      need(P.owner.some((o, p) => o === f && (lvl(g, p, 'puerto') > 0 || lvl(g, p, 'astillero') > 0) && seaReach(geo, p, a.p)), 'Necesitas un puerto en ese mar o en el vecino');
      need(g.F.ships[f] >= 3 && g.F.ships[f] > g.F.ships[d], 'Necesitas 3 barcos y más que él');
      need(!effectOn(g, a.p, 'bloqueo'), 'Ya está bloqueada');
      g.fx.push({kind:'bloqueo', p:a.p, f, until:g.turn + 3});
      emit(g, {t:'blockade', f, d, p:a.p});
      break;
    }
    case 'minister': {
      need(a.k in MINISTERS, 'Cargo no válido');
      need(g.F.gold[f] >= MINISTER_COST, 'No hay oro suficiente');
      g.F.gold[f] -= MINISTER_COST;
      g.F.min[f][a.k] = newMinister(rngFor(g, a), a.k, g.F.min[f][a.k]?.k || '');
      emit(g, {t:'minister', f, k:a.k});
      break;
    }
    case 'decide': {
      const i = g.decisions.findIndex(x => x.id === a.id && x.f === f);
      need(i >= 0, 'Decisión no válida');
      const d = g.decisions[i];
      g.decisions.splice(i, 1);
      applyDecision(geo, g, d, Math.floor(a.opt), rngFor(g, a));
      break;
    }
    case 'spy': return spy(geo, g, a);
    case 'diplo': return diplo(geo, g, a);
    case 'answer': {
      const i = a.from != null ? g.offers.findIndex(o => o.from === a.from && o.to === f && o.kind === a.kind) : a.i ?? -1;
      const o = g.offers[i];
      need(!!o && o.to === f, 'Propuesta no válida');
      g.offers.splice(i, 1);
      if (a.accept) acceptOffer(geo, g, o);
      else { relAdd(g, o.from, f, -5); emit(g, {t:'reject', a:f, b:o.from, kind:o.kind}); }
      break;
    }
    case 'army_attack': return attack(geo, g, {...a, army:a.id}, false);
    case 'siege_mode': {
      const sg = g.sieges.find(x => x.f === f && x.p === a.p); need(!!sg, 'No hay asedio');
      need(['asedio', 'bloqueo', 'minar'].includes(a.k), 'Modo no válido');
      /** @type {any} */ (sg).mode = a.k; emit(g, {t:'siegemode', f, p:a.p, k:a.k});
      break;
    }
    case 'siege_terms': {
      const sg = /** @type {any} */ (g.sieges.find(x => x.f === f && x.p === a.p)); need(!!sg, 'No hay asedio');
      const offer = Math.max(0, Math.floor(a.n || 0)); need(g.F.gold[f] >= offer, 'No hay oro suficiente');
      const d = P.owner[a.p], ok = (sg.food ?? 3) <= 1 || P.troops[a.p] * 4 <= attackers(g, sg.from) || offer >= Math.floor(provinceValue(geo, g, a.p) / 2);
      if (ok) {
        g.F.gold[f] -= offer; if (d >= 0 && d < rebels(g)) g.F.gold[d] += offer;
        transfer(g, a.p, f, false); P.u[a.p] = [Math.min(4, attackers(g, sg.from) - 1), 0, 0, 0]; sync(g, a.p);
        for (let t = 0; t < 4; t++) P.u[sg.from][t] = Math.max(t === INF ? 1 : 0, P.u[sg.from][t] - (t === INF ? P.u[a.p][INF] : 0));
        sync(g, sg.from); addInfamy(g, f, 1);
        emit(g, {t:'rendicion', f, d, p:a.p, gold:offer});
        if (d >= 0 && d < rebels(g) && !P.owner.includes(d)) eliminate(g, d, f);
      } else emit(g, {t:'noterms', f, d, p:a.p});
      break;
    }
    default: if (realmAction(geo, g, a) || armyAction(geo, g, a)) break; throw new RuleError('Orden desconocida');
  }
}

/** @param {Geo} geo @param {Game} g @param {any} a @param {boolean} naval */
function attack(geo, g, a, naval) {
  const f = a.f, P = g.P, to = a.to, R = rebels(g);
  const A = a.army != null ? armyById(g, a.army) : null;
  if (a.army != null) need(!!A && A.f === f, 'Ejército no válido');
  const from = A ? A.p : a.from;
  if (A) { need(A.ready, 'Este ejército ya ha actuado este turno'); need(!naval, 'Los ejércitos no desembarcan'); }
  else need(P.owner[from] === f, 'No es tuya');
  if (naval) {
    need(seaReach(geo, from, to), 'No se llega por mar');
    need(lvl(g, from, 'puerto') > 0 || lvl(g, from, 'astillero') > 0, 'Hace falta un puerto o un astillero');
  } else need(geo.adj[from].includes(to), 'No es limítrofe');
  need(P.active[to] && P.owner[to] !== f && P.owner[to] >= 0, 'No se puede atacar');
  const d0 = P.owner[to];
  need(!(g.F.lord[d0] === f || g.F.lord[f] === d0), 'No puedes atacar a tu vasallo ni a tu señor (rompe antes el vasallaje)');
  /** @type {number[]} */ let v;
  if (A) {
    v = vecOf(a.u) || [A.u[0], A.u[1], A.u[2], 0]; v[MIL] = 0;
    need(v[0] + v[1] + v[2] >= 1 && v.every((x, t) => x <= A.u[t]), 'El ejército no tiene esas tropas');
  } else {
    v = vecOf(a.u) || autoMix(geo, g, from, to, Math.floor(a.n)); v[MIL] = 0;
    const n0 = v[0] + v[1] + v[2];
    need(n0 >= 1 && n0 <= P.ready[from] && n0 <= P.troops[from] - 1 && v.every((x, t) => x <= P.u[from][t]), 'No hay tropas suficientes (al menos 1 se queda; la milicia no ataca)');
  }
  const n = v[0] + v[1] + v[2];
  if (naval) need(n <= g.F.ships[f] * shipCap(g, f), `Tus barcos llevan ${g.F.ships[f] * shipCap(g, f)} tropas`);
  if (a.x) need(P.owner[to] === a.x[0] && P.troops[to] === a.x[1], 'La provincia cambió antes de tu ataque');
  const d = d0, rng = rngFor(g, a), tac = Number.isInteger(a.tac) ? a.tac : 0;
  const plan = {carga:!!a.carga, reserva:!!a.reserva, retirada:!!a.retirada};
  if (d !== R && g.st[f][d] !== WAR) declareWar(g, f, d, 'ataque');
  const o = battleOdds(geo, g, f, from, to, v, {tac, gen:a.gen !== false, naval, plan, morale:A ? A.morale : 100, xp:A ? A.xp : 0});
  const {mA, mD, D, withGen, gn} = o;
  if (A) for (let t = 0; t < 4; t++) A.u[t] -= v[t];
  else { for (let t = 0; t < 4; t++) P.u[from][t] -= v[t]; sync(g, from); P.ready[from] -= n; }
  // bajas: hospitales, veteranos, medicina y contraataque al asedio
  let aMul = o.tm.loss * (100 - 15 * lvl(g, from, 'hospital')) / 100;
  if (withGen && hasSkill(gn, 'veterano')) aMul = aMul * 75 / 100;
  if (knows(g, f, 'medicina')) aMul = aMul * 80 / 100;
  const dg = generalAt(g, to);
  let dMul = 100 - 15 * lvl(g, to, 'hospital');
  if (dg && dg.f === d && hasSkill(dg, 'veterano')) dMul = dMul * 75 / 100;
  if (knows(g, d, 'medicina')) dMul = dMul * 80 / 100;
  /** @type {{a:number[], d:number[], ph:number}[]} */
  const rolls = [];
  /** @type {{ph:string, won:boolean, r:number, la:number, ld:number}[]} */
  const log = [];
  let wa = 0, wd = 0, won = true, retreated = false, cumA = 0, cumD = 0;
  const cabA = n ? Math.floor(v[CAB] * 100 / n) : 0, cabD = D ? Math.floor(o.du[CAB] * 100 / D) : 0;
  if (D > 0) {
    for (let i = 0; i < 3; i++) {
      if (i === 2 && wa !== wd) {
        // dos fases ganadas: la tercera es la persecución (la caballería del vencedor decide cuántos caen)
        const winA = wa > wd;
        const extra = winA ? Math.floor(Math.min(D - cumD, n - cumA) * (10 + cabA) / 400) : Math.floor(Math.min(n - cumA, D - cumD) * (10 + cabD) / 400);
        if (winA) cumD = Math.min(D, cumD + extra); else cumA = Math.min(n, cumA + extra);
        log.push({ph:'Persecución', won:winA, r:0, la:winA ? 0 : extra, ld:winA ? extra : 0});
        break;
      }
      const ph = o.phases[i];
      let x = 0, y = 0, k = 0;
      do {
        const ra = [d6(rng), d6(rng), d6(rng)], rd = [d6(rng), d6(rng), d6(rng)];
        rolls.push({a:ra, d:rd, ph:i});
        x = (ra[0] + ra[1] + ra[2]) * ph.SA; y = (rd[0] + rd[1] + rd[2]) * ph.SD; k++;
      } while (x === y && k < 60);
      const w = x > y, r = Math.floor(Math.min(x, y) * 100 / Math.max(1, x, y));
      const liveA = n - cumA, liveD = D - cumD, heavy = 12 + Math.floor((100 - r) / 5), light = 4 + Math.floor((100 - r) / 12);
      let la, ld;
      if (w) { ld = Math.floor(Math.min(liveD, liveA * 6 / 5) * heavy / 100 * dMul / 100); la = Math.floor(Math.min(liveA, liveD) * light / 100 * aMul / 100); }
      else { la = Math.floor(Math.min(liveA, liveD * 6 / 5) * heavy / 100 * aMul / 100); ld = Math.floor(Math.min(liveD, liveA) * light / 100 * dMul / 100); }
      if (i === 0 && plan.reserva) la = Math.floor(la * 70 / 100);
      if (i === 0 && plan.carga && v[CAB]) la += Math.floor(la * cabA / 200);
      cumA = Math.min(n, cumA + la); cumD = Math.min(D, cumD + ld);
      log.push({ph:PHASES[i].name, won:w, r, la, ld});
      if (w) wa++; else wd++;
      if (plan.retirada && i === 0 && !w) { retreated = true; break; }
    }
    won = !retreated && wa > wd;
  }
  const attLoss = won ? Math.min(n - 1, cumA) : Math.min(n, cumA + (retreated ? 0 : Math.floor((n - cumA) * 15 / 100)));
  const defLoss = won ? D : Math.min(D - 1, cumD);
  const ev = {t:naval ? 'naval' : 'attack', f, d, from, to, n, D, rolls, phases:log, won, retreated, attLoss, defLoss, p:o.p, mA, mD, SA:o.SA, SD:o.SD, tac, plan,
    stance:P.stance[to] || 0, u:v, du:[...o.du], army:A ? A.id : -1, armyName:A ? A.name : '', capital:false, elim:false, gdead:'', wonder:P.wonder[to] || ''};
  const survivors = share(v, n - attLoss);
  if (won) {
    if (g.armies) retreatArmies(geo, g, to, d);
    if (A) {
      const keep = shareOf(survivors, Math.max(1, Math.floor((n - attLoss) / 8)));
      P.u[to] = keep;
      for (let t = 0; t < 4; t++) A.u[t] += survivors[t] - keep[t];
      A.p = to; A.ready = false; A.morale = Math.min(100, A.morale + 10); A.xp++; A.dest = -1;
      const ag = g.gens.find(x => x.id === A.gen); if (ag) ag.p = to;
    } else P.u[to] = survivors;
    sync(g, to); P.ready[to] = 0;
    P.owner[to] = f;
    P.loyal[to] = P.origin[to] === f ? 70 : hasWonder(g, f, 'pilar') ? 60 : 25;
    P.stance[to] = 0; P.tax[to] = 1;
    if (P.queue) P.queue[to] = [];
    if (P.pop) P.pop[to] = Math.floor(P.pop[to] * 95 / 100);
    g.sieges = g.sieges.filter(s => s.p !== to);
    g.stats.conq[f]++;
    // general defensor capturado; el atacante entra con sus tropas
    g.gens = g.gens.filter(x => !(x.p === to && x.f === d));
    if (withGen && gn) { gn.p = to; gainXp(g, gn, rng); if (int(rng, 100) < 5) { ev.gdead = gn.name; g.gens = g.gens.filter(x => x !== gn); } }
    if (d !== R) {
      g.F.morale[f] = clamp(g.F.morale[f] + 3, 50, 200); g.F.morale[d] = clamp(g.F.morale[d] - 3, 50, 200);
      g.stats.won[f]++; g.stats.lost[d]++; g.F.weary[d] = clamp(g.F.weary[d] + 3, 0, 100);
      addInfamy(g, f, 2 + geo.tier[to]); addWarScore(g, f, d, 5 + 2 * geo.tier[to]);
      if (g.F.capital[d] === to) {
        ev.capital = true;
        const loot = Math.floor(g.F.gold[d] * 30 / 100);
        g.F.gold[d] -= loot; g.F.gold[f] += loot; g.F.morale[d] = clamp(g.F.morale[d] - 10, 50, 200);
        g.stats.caps[f]++; addWarScore(g, f, d, 15); addInfamy(g, f, 5);
        moveCapital(geo, g, d);
      }
      if (!P.owner.includes(d)) { eliminate(g, d, f); ev.elim = true; }
    }
    const c = counts(P.owner, R + 1);
    g.stats.peak[f] = Math.max(g.stats.peak[f], c[f]);
  } else {
    if (A) {
      for (let t = 0; t < 4; t++) A.u[t] += survivors[t];
      A.morale = Math.max(0, A.morale - (retreated ? 8 : 20)); A.ready = false; A.xp++;
      if (size(A.u) === 0) disband(g, A);
    } else putUnits(g, from, survivors);
    if (g.armies) hitDefenders(g, to, defLoss); else removeTroops(g, to, defLoss);
    if (naval && g.F.ships[f] > 0) g.F.ships[f]--;
    if (withGen && gn && (n - attLoss <= 0 || int(rng, 100) < (retreated ? 10 : 35))) { ev.gdead = gn.name; g.gens = g.gens.filter(x => x !== gn); }
    if (d !== R) {
      g.F.morale[d] = clamp(g.F.morale[d] + 3, 50, 200); g.F.morale[f] = clamp(g.F.morale[f] - 3, 50, 200);
      g.stats.won[d]++; g.stats.lost[f]++; g.F.weary[f] = clamp(g.F.weary[f] + 3, 0, 100);
      addWarScore(g, d, f, 3);
      const dg2 = generalAt(g, to); if (dg2 && dg2.f === d) gainXp(g, dg2, rng);
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
  if (g.armies) g.armies = g.armies.filter(x => x.f !== f);
  if (g.regions) g.regions = g.regions.filter(x => x.f !== f);
  g.gens = g.gens.filter(x => x.f !== f);
  g.offers = g.offers.filter(o => o.from !== f && o.to !== f);
  g.sieges = g.sieges.filter(s => s.f !== f);
  g.decisions = g.decisions.filter(x => x.f !== f);
  g.missions = g.missions.filter(x => x.f !== f);
  for (let x = 0; x < rebels(g); x++) { if (g.F.lord[x] === f) g.F.lord[x] = -1; if (x !== f && g.st[f][x] !== WAR) setStatus(g, f, x, PEACE); }
  g.F.lord[f] = -1;
  emit(g, {t:'elim', f, by});
}
/** Cambia de dueño una provincia sin batalla (cesión, compra, soborno). @param {Game} g @param {number} p @param {number} to @param {boolean} keepTroops */
function transfer(g, p, to, keepTroops) {
  const from = g.P.owner[p];
  if (g.armies) for (const x of g.armies.filter(y => y.p === p && y.f === from)) disband(g, x);
  if (g.P.queue) g.P.queue[p] = [];
  g.P.owner[p] = to; g.P.loyal[p] = 50; g.P.stance[p] = 0; g.P.tax[p] = 1;
  if (!keepTroops) { g.P.u[p] = [0, 0, 0, 1]; sync(g, p); }
  g.P.ready[p] = 0;
  g.gens = g.gens.filter(x => !(x.p === p && x.f === from));
  g.sieges = g.sieges.filter(s => s.p !== p);
}

/** Saberes de d que f podría aprender ya. @param {Game} g @param {number} f @param {number} d */
export const stealable = (g, f, d) => (g.F.know[d] || []).filter(k => saberOpen(g, f, k).ok);
/** @param {Geo} geo @param {Game} g @param {any} a */
function spy(geo, g, a) {
  const f = a.f, d = g.P.owner[a.p], kind = a.kind;
  need(kind in SPY_KINDS, 'Misión no válida');
  need(g.P.active[a.p] && d !== f && d >= 0, 'Elige una provincia ajena');
  const price = spyCost(g, f, kind, a.p);
  need(g.F.gold[f] >= price, 'No hay oro suficiente');
  if (kind === 'sabotear') need(buildingsAt(g, a.p).length > 0, 'No tiene edificios');
  if (kind === 'asesinar') need(!!generalAt(g, a.p), 'No hay ningún general allí');
  if (kind === 'robar') need(d < rebels(g) && stealable(g, f, d).length > 0, 'No sabe nada que tú puedas aprender');
  if (kind === 'sobornar') need(g.P.loyal[a.p] < 40 && g.F.capital[d] !== a.p, 'Solo provincias poco leales (menos de 40) y que no sean capital');
  g.F.gold[f] -= price;
  const rng = rngFor(g, a), ok = int(rng, 100) < spyChance(g, f, kind);
  if (ok) {
    if (kind === 'espiar') g.intel.push({f, p:a.p, until:g.turn + 3});
    if (kind === 'sabotear') { const [b, l] = buildingsAt(g, a.p).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0]; g.P.bld[a.p] = {...g.P.bld[a.p], [b]:l - 1}; }
    if (kind === 'agitar') g.P.loyal[a.p] = Math.max(0, g.P.loyal[a.p] - 30);
    if (kind === 'asesinar') g.gens = g.gens.filter(x => x.p !== a.p);
    if (kind === 'robar') learn(g, f, stealable(g, f, d)[0]);
    if (kind === 'sobornar') { transfer(g, a.p, f, true); if (d < rebels(g) && !g.P.owner.includes(d)) eliminate(g, d, f); }
  } else if (d !== rebels(g)) relAdd(g, f, d, kind === 'asesinar' || kind === 'sobornar' ? -35 : -20);
  emit(g, {t:'spy', f, d, p:a.p, kind, ok});
}

/**
 * Si un bot aceptaría una propuesta (determinista, para avisar antes).
 * @param {Geo} geo @param {Game} g @param {number} f quien propone @param {number} d bot @param {string} kind @param {number} [p] provincia (ultimátum, compra)
 * @returns {{ok:boolean, why:string}}
 */
export function wouldAccept(geo, g, f, d, kind, p = -1) {
  const rel = g.rel[f][d] + (g.F.trait[f] === 'diplomatico' ? 20 : 0) + 10 * g.F.tech[f][2] + (minister(g, f, 'diplomacia', 'embajador') ? 10 : 0);
  const sf = strength(g, f), sd = strength(g, d);
  const c = counts(g.P.owner, rebels(g) + 1);
  const near = g.P.owner.some((o, q) => o === f && geo.adj[q].some(r => g.P.owner[r] === d));
  switch (kind) {
    case 'paz':
      if (g.st[f][d] !== WAR) return {ok:false, why:'No estáis en guerra'};
      if (sd * 100 < sf * 80) return {ok:true, why:'Va perdiendo la guerra'};
      if (rel > -20 || g.F.weary[d] >= 40) return {ok:true, why:g.F.weary[d] >= 40 ? 'Está cansado de la guerra' : 'Quiere paz'};
      return {ok:false, why:'Cree que puede ganar'};
    case 'pacto':
      if (g.st[f][d] === WAR) return {ok:false, why:'Primero hay que firmar la paz'};
      if (g.st[f][d] !== PEACE) return {ok:false, why:'Ya hay un acuerdo'};
      return rel >= 0 ? {ok:true, why:'Se fía de ti'} : {ok:false, why:'Desconfía de ti'};
    case 'alianza': {
      if (g.st[f][d] === WAR) return {ok:false, why:'Estáis en guerra'};
      if (allied(g.st[f][d])) return {ok:false, why:'Ya sois aliados'};
      let common = false;
      for (let x = 0; x < rebels(g); x++) if (g.F.alive[x] && g.st[f][x] === WAR && g.st[d][x] === WAR) common = true;
      if (rel >= 50 && (common || sf > sd)) return {ok:true, why:common ? 'Tenéis un enemigo común' : 'Te admira'};
      return {ok:false, why:rel < 50 ? 'Necesita más confianza (relación 50)' : 'No le conviene'};
    }
    case 'federacion':
      if (g.st[f][d] !== ALLY) return {ok:false, why:'Primero hay que ser aliados'};
      return rel >= 75 ? {ok:true, why:'Uniréis vuestros destinos'} : {ok:false, why:'Necesita relación 75'};
    case 'tributo':
      if (near && c[f] >= 3 * c[d] && sf >= 2 * sd) return {ok:true, why:'Te teme'};
      return {ok:false, why:'No te teme lo suficiente'};
    case 'anexion':
      if (g.F.lord[d] === f && rel >= 20) return {ok:true, why:'Tu vasallo se une a ti'};
      if (c[d] <= 2 && rel >= 60 && sf >= 4 * sd) return {ok:true, why:'Prefiere unirse a ti'};
      return {ok:false, why:'Pide 2 provincias o menos, relación 60 y que seas 4 veces más fuerte (o que sea tu vasallo)'};
    case 'vasallaje':
      if (g.F.lord[d] >= 0) return {ok:false, why:'Ya es vasallo de alguien'};
      if (g.F.lord[f] >= 0) return {ok:false, why:'Tú eres vasallo'};
      if (near && sf >= 3 * sd && rel >= -20) return {ok:true, why:'Prefiere servirte a caer'};
      return {ok:false, why:'Tienes que ser 3 veces más fuerte, vecino y no odiado'};
    case 'boda':
      if (g.st[f][d] === WAR) return {ok:false, why:'Estáis en guerra'};
      if (g.weds.some(w => (w.a === f && w.b === d) || (w.a === d && w.b === f))) return {ok:false, why:'Ya hay boda entre vuestras casas'};
      return rel >= (minister(g, f, 'diplomacia', 'casamentero') ? 0 : 20) ? {ok:true, why:'Las familias se aprecian'} : {ok:false, why:'Necesita relación 20'};
    case 'ultimatum':
      if (p < 0 || g.P.owner[p] !== d) return {ok:false, why:'Elige una de sus provincias'};
      if (g.F.capital[d] === p) return {ok:false, why:'Nunca entregará su capital'};
      if (near && sf >= 5 * sd / 2) return {ok:true, why:'Te teme'};
      return {ok:false, why:'Tienes que ser 2,5 veces más fuerte'};
    case 'comprar':
      if (p < 0 || g.P.owner[p] !== d) return {ok:false, why:'Elige una de sus provincias'};
      if (g.F.capital[d] === p || c[d] < 2) return {ok:false, why:'No vende su capital ni su última provincia'};
      if (!geo.adj[p].some(q => g.P.owner[q] === f)) return {ok:false, why:'Tiene que tocar con lo tuyo'};
      if (g.F.gold[f] < provincePrice(geo, g, f, p)) return {ok:false, why:`Cuesta ${provincePrice(geo, g, f, p)} de oro`};
      return rel >= 10 ? {ok:true, why:'Acepta el trato'} : {ok:false, why:'Necesita relación 10'};
    case 'independencia':
      return g.F.lord[f] === d ? {ok:true, why:''} : {ok:false, why:'No es tu señor'};
    case 'paso':
      if (g.st[f][d] === WAR) return {ok:false, why:'Estáis en guerra'};
      if ((g.access || []).some(x => (x.a === f && x.b === d))) return {ok:false, why:'Ya tienes paso'};
      return friendly(g.st[f][d]) || rel >= 20 ? {ok:true, why:'Os deja pasar 20 turnos'} : {ok:false, why:'Necesita relación 20 o un acuerdo'};
    default: return {ok:true, why:''};
  }
}
/** @param {Geo} geo @param {Game} g @param {any} a */
function diplo(geo, g, a) {
  const f = a.f, d = a.d, R = rebels(g), kind = a.kind;
  need(d !== f && d >= 0 && d < R && g.F.alive[d], 'Bando no válido');
  need(['paz', 'pacto', 'alianza', 'federacion', 'regalo', 'tributo', 'anexion', 'guerra', 'vasallaje', 'boda', 'ultimatum', 'embargo', 'comprar', 'independencia', 'tratado', 'paso'].includes(kind), 'Propuesta no válida');
  const human = g.humans.includes(d);
  switch (kind) {
    case 'guerra': need(g.F.lord[f] !== d && g.F.lord[d] !== f, 'Rompe antes el vasallaje'); declareWar(g, f, d, 'declaración'); return;
    case 'independencia':
      need(g.F.lord[f] === d, 'No es tu señor');
      g.F.lord[f] = -1; relAdd(g, f, d, -40); emit(g, {t:'vassal', a:f, b:d, kind:'independencia'});
      if (strength(g, d) > strength(g, f) * 2) declareWar(g, d, f, 'rebelión');
      return;
    case 'embargo': {
      const i = g.embargo.findIndex(e => e.a === f && e.b === d);
      if (i >= 0) { g.embargo.splice(i, 1); emit(g, {t:'embargo', a:f, b:d, on:false}); }
      else { g.embargo.push({a:f, b:d}); relAdd(g, f, d, -15); emit(g, {t:'embargo', a:f, b:d, on:true}); }
      return;
    }
    case 'regalo': {
      const amount = a.amount === COST.gift[1] ? COST.gift[1] : COST.gift[0];
      need(g.F.gold[f] >= amount, 'No hay oro suficiente');
      g.F.gold[f] -= amount; g.F.gold[d] += amount;
      const v = (amount === COST.gift[1] ? 25 : 10) * (g.F.tech[f][2] >= 2 ? 2 : 1);
      relAdd(g, f, d, v); emit(g, {t:'gift', a:f, b:d, amount}); return;
    }
  }
  if (kind === 'ultimatum' || kind === 'comprar') need(Number.isInteger(a.p) && g.P.owner[a.p] === d, 'Elige una de sus provincias');
  const clauses = {ps:Array.isArray(a.ps) ? a.ps.filter((/** @type {number} */ q) => g.P.owner[q] === d) : [], amount:Math.max(0, Math.floor(a.amount || 0)), vas:!!a.vas};
  if (kind === 'tratado') need(g.st[f][d] === WAR, 'No estáis en guerra');
  if (human) { // entre humanos: queda como propuesta que el otro acepta o rechaza
    need(!g.offers.some(o => o.from === f && o.to === d && o.kind === kind), 'Ya se la has propuesto');
    g.offers.push({from:f, to:d, kind, turn:g.turn, p:a.p, ...(kind === 'tratado' ? clauses : {})});
    emit(g, {t:'offer', a:f, b:d, kind});
    return;
  }
  const w = kind === 'tratado' ? treatyOk(geo, g, f, d, clauses) : wouldAccept(geo, g, f, d, kind, a.p);
  if (!w.ok) {
    relAdd(g, f, d, kind === 'tributo' || kind === 'ultimatum' || kind === 'vasallaje' ? -10 : -2);
    emit(g, {t:'reject', a:d, b:f, kind, why:w.why});
    if (kind === 'ultimatum' && g.rel[f][d] < 0 && g.st[f][d] !== WAR) declareWar(g, d, f, 'ultimátum');
    return;
  }
  acceptOffer(geo, g, {from:f, to:d, kind, turn:g.turn, p:a.p, ...clauses});
}
/** @param {Geo} geo @param {Game} g @param {{from:number, to:number, kind:string, turn?:number, p?:number, ps?:number[], amount?:number, vas?:boolean}} o */
function acceptOffer(geo, g, o) {
  const f = o.from, d = o.to;
  if (o.kind === 'tratado') { signTreaty(geo, g, f, d, o, transfer); relAdd(g, f, d, 5); if (g.ws) for (const k of Object.keys(g.ws)) if (k === `${Math.min(f, d)}-${Math.max(f, d)}`) delete g.ws[k]; return; }
  if (o.kind === 'paso') { g.access.push({a:f, b:d, until:g.turn + 20}); emit(g, {t:'accept', a:d, b:f, kind:'paso'}); return; }
  if (o.kind === 'paz') { setStatus(g, f, d, PEACE); relAdd(g, f, d, 10); }
  else if (o.kind === 'pacto') setStatus(g, f, d, PACT, g.turn + PACT_TURNS * (g.F.tech[f][2] >= 3 ? 2 : 1));
  else if (o.kind === 'alianza') { setStatus(g, f, d, ALLY); relAdd(g, f, d, 10); }
  else if (o.kind === 'federacion') { setStatus(g, f, d, FED); relAdd(g, f, d, 10); }
  else if (o.kind === 'tributo') { const v = Math.floor(g.F.gold[d] * 20 / 100); g.F.gold[d] -= v; g.F.gold[f] += v; relAdd(g, f, d, -15); }
  else if (o.kind === 'vasallaje') { g.F.lord[d] = f; if (g.st[f][d] === WAR) setStatus(g, f, d, PEACE); relAdd(g, f, d, -10); emit(g, {t:'vassal', a:d, b:f, kind:'vasallaje'}); }
  else if (o.kind === 'boda') { g.weds.push({a:f, b:d, until:g.turn + 20}); relAdd(g, f, d, 30); if (g.st[f][d] === PEACE) setStatus(g, f, d, PACT, g.turn + 20); }
  else if (o.kind === 'ultimatum' && o.p != null && g.P.owner[o.p] === d) { transfer(g, o.p, f, false); relAdd(g, f, d, -25); }
  else if (o.kind === 'comprar' && o.p != null && g.P.owner[o.p] === d) {
    const price = provincePrice(geo, g, f, o.p);
    if (g.F.gold[f] >= price) { g.F.gold[f] -= price; g.F.gold[d] += price; transfer(g, o.p, f, false); }
  } else if (o.kind === 'anexion') {
    for (let p = 0; p < g.P.owner.length; p++) if (g.P.owner[p] === d) { g.P.owner[p] = f; g.P.loyal[p] = 60; }
    g.F.gold[f] += g.F.gold[d]; g.F.gold[d] = 0; g.F.ships[f] += g.F.ships[d]; g.F.ships[d] = 0;
    g.gens.forEach(x => { if (x.f === d) x.f = f; });
    eliminate(g, d, f);
  }
  emit(g, {t:'accept', a:d, b:f, kind:o.kind, p:o.p});
}

/* ======================= Decisiones ======================= */
/**
 * Aplica la opción elegida de una decisión (la última si no es válida).
 * @param {Geo} geo @param {Game} g @param {{id:number, f:number, kind:string, p:number}} d @param {number} opt @param {import('../engine/rng.js').RngState} rng
 */
export function applyDecision(geo, g, d, opt, rng) {
  if (storyDecision(geo, g, d, opt)) return;
  const f = d.f, p = d.p, P = g.P, info = /** @type {Record<string, {opts:string[]}>} */ (DECISIONS)[d.kind];
  if (!info) return;
  if (!(opt >= 0 && opt < info.opts.length)) opt = info.opts.length - 1;
  const own = p >= 0 && P.owner[p] === f, gold = (/** @type {number} */ v) => { g.F.gold[f] = Math.max(0, g.F.gold[f] + v); };
  const loyal = (/** @type {number} */ q, /** @type {number} */ v) => { if (q >= 0 && P.owner[q] === f) P.loyal[q] = clamp(P.loyal[q] + v, 0, 100); };
  const capi = g.F.capital[f];
  switch (d.kind) {
    case 'revuelta':
      if (opt === 0 && g.F.gold[f] >= 30) { gold(-30); loyal(p, 30); }
      else if (opt === 1 && own && P.troops[p] > 3) { removeTroops(g, p, 3); loyal(p, 15); }
      else loyal(p, -20);
      break;
    case 'cosecha': if (opt === 0) gold(40); else if (own) addUnits(g, p, INF, 4); break;
    case 'mercaderes':
      if (opt === 0 && g.F.gold[f] >= 60) { const k = SABERES.filter(x => saberOpen(g, f, x.k).ok).sort((a, b) => a.cost - b.cost)[0]; if (k) { gold(-60); learn(g, f, k.k); } }
      else gold(25);
      break;
    case 'refugiados': if (opt === 0 && own) { addUnits(g, p, MIL, 5); loyal(p, -10); } break;
    case 'bandidos':
      if (opt === 0 && own && P.troops[p] > 2) { removeTroops(g, p, 2); loyal(p, 10); }
      else if (opt === 1 && g.F.gold[f] >= 20) gold(-20);
      else if (own) g.fx.push({kind:'bandidos', p, f, until:g.turn + 3});
      break;
    case 'noble': if (opt === 0 && g.F.gold[f] >= 30) { gold(-30); loyal(capi, 15); } else { g.F.morale[f] = clamp(g.F.morale[f] + 5, 50, 200); loyal(capi, -10); } break;
    case 'plata':
      if (opt === 0 && own && geo.terrain[p] !== 'l' && lvl(g, p, 'mina') < 3 && (lvl(g, p, 'mina') > 0 || buildingsAt(g, p).length < slots(geo, g, p))) P.bld[p] = {...P.bld[p], mina:lvl(g, p, 'mina') + 1};
      else gold(opt === 0 ? 30 : 50);
      break;
    case 'epidemia': if (opt === 0) { if (own) g.fx.push({kind:'cuarentena', p, f, until:g.turn + 2}); } else if (own && !knows(g, f, 'medicina')) removeTroops(g, p, Math.floor(P.troops[p] * 30 / 100)); break;
    case 'artistas': if (opt === 0 && g.F.gold[f] >= 40) { gold(-40); g.F.morale[f] = clamp(g.F.morale[f] + 10, 50, 200); } break;
    case 'desertor':
      if (opt === 0 && capi >= 0 && generalsOf(g, f).length < maxGenerals(g, f) && !generalAt(g, capi)) hireFree(g, f, capi, 'tactico', rng);
      else if (opt === 1) { const x = int(rng, rebels(g)); if (x !== f && g.F.alive[x]) relAdd(g, f, x, 15); }
      break;
  }
  emit(g, {t:'decided', f, kind:d.kind, opt, p});
}

/* ======================= Victoria ======================= */
/** Puntuación (victoria por puntos y desafío diario). @param {Game} g @param {number} f */
export function score(g, f) {
  let s = 0, caps = 0;
  for (let p = 0; p < g.P.owner.length; p++) if (g.P.owner[p] === f) {
    s += 10 + Math.floor(g.P.troops[p] / 5) + 3 * buildingsAt(g, p).reduce((a, [, l]) => a + l, 0) + (g.P.wonder[p] ? 30 : 0);
    if (g.F.capital.includes(p)) caps++;
  }
  return s + caps * 25 + Math.floor(g.F.gold[f] / 10);
}
/** @param {Geo} geo @param {Game} g */
export function checkVictory(geo, g) {
  if (g.over) return;
  const R = rebels(g), alive = g.F.alive.map((a, f) => a && f < R && g.P.owner.includes(f));
  const act = g.P.active.filter(Boolean).length, c = counts(g.P.owner, R + 1);
  const end = (/** @type {number} */ w, /** @type {string} */ how) => { g.over = true; g.winner = w; emit(g, {t:'victory', f:w, how}); };
  const v = g.rules.victory;
  for (let f = 0; f < R; f++) {
    if (!alive[f]) continue;
    if (c[f] === act) return end(f, 'dominacion');
    // dominio: el 60 % del mapa y todos los demás son tus vasallos
    let others = 0, vass = true;
    for (let x = 0; x < R; x++) if (x !== f && alive[x]) { others++; if (g.F.lord[x] !== f) vass = false; }
    if (others > 0 && vass && c[f] * 100 >= act * 60) return end(f, 'dominacion');
    if (v.type === 'capitales') {
      let caps = 0; for (let x = 0; x < R; x++) { const h = (g.F.home || g.F.capital)[x]; if (h >= 0 && g.P.owner[h] === f) caps++; }
      if (caps >= (v.n || 5)) return end(f, 'capitales');
    }
    if (v.type === 'diplomatica' && c[f] * 100 >= act * 30) {
      let ok = true, n = 0;
      for (let x = 0; x < R; x++) if (x !== f && alive[x]) { n++; if (!friendly(g.st[f][x]) && g.F.lord[x] !== f) ok = false; }
      if (ok && n > 0) return end(f, 'diplomatica');
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
/** Niveles de un edificio que ya están en obras. @param {Game} g @param {number} p @param {string} b */
export const queuedLv = (g, p, b) => g.P.queue ? g.P.queue[p].filter(j => j.b === b).length : 0;
/** Población inicial de una provincia. @param {Geo} geo @param {number} p */
const pop0Of = (geo, p) => pop0(geo.ine[p]);
/** Valor de una provincia (para tratados y rendiciones). @param {Geo} geo @param {Game} g @param {number} p */
export const provinceValue = (geo, g, p) => 30 + 15 * geo.tier[p] + 4 * g.P.troops[p] + 10 * buildingsAt(g, p).reduce((s2, [, l]) => s2 + l, 0);
export {relAdd, setStatus, emit, clamp, eliminate, moveCapital, hireFree, acceptOffer, sync, putUnits, transfer, gainXp, newMinister};
// los gobernadores, las órdenes permanentes y los bots actúan con las mismas reglas que los jugadores
setActor(doAction);

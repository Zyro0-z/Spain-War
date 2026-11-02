// @ts-check
// El reino por dentro (v5): población y estamentos, recursos y mercado, capacidad administrativa, regiones con
// gobernador, corona y sucesión, facciones de la corte y leyes, estabilidad, infamia, órdenes permanentes y obras
// por turnos. Puro y determinista como el resto del motor (solo aritmética entera y el generador de la partida).
import {int} from '../engine/rng.js';
import {POP, COMMUNITIES, KINGDOMS, GIVEN, EPITHET} from './data.js';
import {INF, CAB, ART, MIL} from './rules.js';
import {
  lvl, buildingsAt, provincesOf, supplied, emit, clamp, rebels, addUnits, removeTroops, era, knows, hasWonder,
  cap, unitCost, freeGarrison, effectOn, season, WAR, need, putUnits, sync, eliminate, relAdd, TRAITS,
} from './engine.js';

/** @typedef {import('./engine.js').Game} Game */
/** @typedef {import('./engine.js').Geo} Geo */

/* ======================= Tablas ======================= */
/** Recursos y precio base en décimas de oro. */
export const RES = /** @type {const} */ (['grano', 'madera', 'hierro', 'caballos', 'polvora']);
/** @typedef {'grano'|'madera'|'hierro'|'caballos'|'polvora'} Res */
export const RES_INFO = {
  grano:{name:'Grano', base:20, desc:'Lo comen las tropas; sin él hay hambre'},
  madera:{name:'Madera', base:30, desc:'Para edificios y barcos'},
  hierro:{name:'Hierro', base:40, desc:'Fortificaciones, minas y artillería'},
  caballos:{name:'Caballos', base:70, desc:'Uno por cada jinete'},
  polvora:{name:'Pólvora', base:90, desc:'Uno por cada cañón (llega con el saber Pólvora)'},
};
export const ESTATES = ['Campesinos', 'Burgueses', 'Nobles', 'Clero'];
export const FACTIONS = [
  {k:'nobleza', name:'Nobleza', estate:2, desc:'Señores y levas feudales'},
  {k:'iglesia', name:'Iglesia', estate:3, desc:'Obispos y órdenes'},
  {k:'burguesia', name:'Burguesía', estate:1, desc:'Ciudades, gremios y comercio'},
  {k:'ejercito', name:'Ejército', estate:-1, desc:'Capitanes y soldados'},
];
/** Poder base de cada facción (se ajusta con las leyes). */
const POWER = [35, 25, 20, 20];
/**
 * Leyes: cada opción gusta (likes) o disgusta (hates) a algunas facciones. Cambiar una cuesta 30 de oro, necesita
 * el apoyo de facciones con poder suficiente (o imponerla: −15 de estabilidad) y no se puede volver a tocar en 10 turnos.
 * @type {Record<'cortes'|'fueros'|'leva'|'religion'|'mesta'|'comercio', {name:string, opts:{name:string, desc:string, likes:number[], hates:number[]}[]}>}
 */
export const LAWS = {
  cortes:{name:'Gobierno', opts:[
    {name:'Absolutismo', desc:'+2 de administración; los impuestos altos restan la lealtad de siempre', likes:[1, 3], hates:[2]},
    {name:'Cortes', desc:'Impuestos altos: −3 de lealtad en vez de −6; −1 de administración', likes:[0, 2], hates:[3]},
  ]},
  fueros:{name:'Territorios', opts:[
    {name:'Fueros', desc:'+3 de lealtad en provincias de otra cultura; −1 de administración', likes:[0], hates:[3]},
    {name:'Centralismo', desc:'+3 de administración; se asimila el doble de rápido; −3 de lealtad en otra cultura', likes:[3], hates:[0]},
  ]},
  leva:{name:'Ejército', opts:[
    {name:'Levas feudales', desc:'Infantería −1 de oro; −5 % de ataque', likes:[0], hates:[3]},
    {name:'Ejército profesional', desc:'+10 % de ataque; mantenimiento +25 %', likes:[3], hates:[0]},
    {name:'Mercenarios', desc:'Compañías −30 %; reclutar no gasta población', likes:[2], hates:[3, 0]},
  ]},
  religion:{name:'Religión', opts:[
    {name:'Tolerancia', desc:'+1 de saber por turno; asimilación más rápida', likes:[2], hates:[1]},
    {name:'Inquisición', desc:'Clero contento; +1 de estabilidad por turno; −1 de saber', likes:[1], hates:[2]},
  ]},
  mesta:{name:'Campo', opts:[
    {name:'Privilegios de la Mesta', desc:'+1 de oro y de caballos en tierras de ganado; campesinos descontentos', likes:[0], hates:[]},
    {name:'Agricultura', desc:'+1 de grano por provincia; campesinos contentos', likes:[], hates:[0]},
  ]},
  comercio:{name:'Comercio', opts:[
    {name:'Gremios', desc:'Edificios −5 %; burgueses algo más contentos', likes:[2], hates:[]},
    {name:'Libre comercio', desc:'+1 de oro por ruta comercial; burgueses contentos', likes:[2], hates:[0, 1]},
  ]},
};
/** @typedef {keyof typeof LAWS} LawKey */
export const LAW_KEYS = /** @type {LawKey[]} */ (Object.keys(LAWS));
export const DEFAULT_LAWS = {cortes:1, fueros:0, leva:0, religion:0, mesta:0, comercio:0};
export const LAW_COST = 30, LAW_COOLDOWN = 10;
/** Gobernadores: rasgos y políticas. */
export const GOV_TRAITS = {
  capaz:'+10 % de oro en su región',
  corrupto:'−15 % de oro en su región (se lo queda)',
  severo:'+3 de lealtad; campesinos descontentos',
  popular:'Campesinos contentos',
};
export const POLICIES = {
  economica:{name:'Económica', desc:'Construye mercados, granjas, minas y caminos'},
  militar:{name:'Militar', desc:'Recluta en la frontera de la región'},
  defensiva:{name:'Defensiva', desc:'Fortifica la frontera y levanta milicia'},
};
export const GOV_COST = 40;
/** Objetivos de cada bando (árbol): se generan con su tierra de origen. */
export const GOAL_INFO = {
  unir:{name:'Unifica {C}', reward:'+10 de estabilidad y 50 de oro'},
  mar:{name:'Salida al mar', reward:'+30 de oro y 15 de saber'},
  region:{name:'Funda tu primera región', reward:'+2 de administración para siempre'},
  reino:{name:'Corona de {K}', reward:'+10 % de oro para siempre'},
  capital:{name:'Toma {P}', reward:'+20 de moral y su tesoro'},
  imperio:{name:'Domina 15 provincias', reward:'+3 de administración para siempre'},
  renac:{name:'Llega al Renacimiento', reward:'+25 de saber'},
  ejercito:{name:'Forma un ejército de 30 tropas', reward:'El ejército te apoya (+20)'},
  maravilla:{name:'Levanta una maravilla', reward:'+15 de estabilidad'},
  ley:{name:'Reforma una ley', reward:'+10 de apoyo de todas las facciones'},
};

/* ======================= Utilidades ======================= */
/** Raíz cuadrada entera. @param {number} n */
export function isqrt(n) { let r = 0; while ((r + 1) * (r + 1) <= n) r++; return r; }
/** Población inicial (miles, escala de juego) a partir de la de hoy. @param {string} ine */
export const pop0 = ine => Math.max(20, 4 * isqrt(/** @type {Record<string, number>} */ (POP)[ine] || 200));
/** @param {Game} g @param {number} f @param {LawKey} k */
export const law = (g, f, k) => g.F.laws?.[f]?.[k] ?? DEFAULT_LAWS[k];
/** Recursos vacíos. */
export const noRes = () => ({grano:0, madera:0, hierro:0, caballos:0, polvora:0});
/** Región de una provincia. @param {Game} g @param {number} p */
export const regionOf = (g, p) => (g.regions || []).find(r => r.ps.includes(p)) || null;
/** Media entera. @param {number[]} a */
const avg = a => a.length ? Math.floor(a.reduce((s, x) => s + x, 0) / a.length) : 50;
/** Nombre de persona. @param {import('../engine/rng.js').RngState} rng */
const person = rng => GIVEN[int(rng, GIVEN.length)] + ' ' + EPITHET[int(rng, EPITHET.length)];
/** Comunidad de una provincia (por su INE). @param {string} ine */
export const communityOf = ine => COMMUNITIES.find(c => c.ine.includes(ine)) || null;
/** Reino histórico de una provincia. @param {string} ine */
export const kingdomOf = ine => KINGDOMS.find(c => c.ine.includes(ine)) || null;

/* ======================= Inicio y migración ======================= */
/** Añade el estado del reino a una partida (nueva o de una versión anterior). @param {Geo} geo @param {any} g */
export function initRealm(geo, g) {
  const n = g.P.owner.length, nf = g.F.name.length, rng = g.rng;
  g.P.pop = geo.ine.slice(0, n).map(pop0);
  g.P.est = g.P.owner.map(() => [60, 55, 60, 60]);
  g.P.queue = g.P.owner.map(() => []);
  g.P.auto = new Array(n).fill(0);
  g.F.res = g.F.name.map(() => ({grano:20, madera:12, hierro:6, caballos:4, polvora:0}));
  g.F.stab = new Array(nf).fill(60);
  g.F.fac = g.F.name.map(() => [60, 60, 55, 55]);
  g.F.laws = g.F.name.map(() => ({...DEFAULT_LAWS}));
  g.F.lawT = g.F.name.map(() => ({}));
  g.F.inf = new Array(nf).fill(0);
  g.F.rally = new Array(nf).fill(-1);
  g.F.bonus = g.F.name.map(() => ({adm:0, gold:0}));
  g.F.indias = new Array(nf).fill(0);
  g.F.chains = g.F.name.map(() => []);
  g.F.ruler = g.F.name.map(() => {
    const age = 20 + int(rng, 26), wed = int(rng, 10) < 7;
    return {name:person(rng), age, wed, regent:false, heir:wed && int(rng, 10) < 6 ? {name:person(rng), age:int(rng, 14)} : null};
  });
  g.F.goals = g.F.name.map((_, f) => goalsFor(geo, g, f));
  g.regions = []; g.regSeq = 0;
  g.armies = g.armies || []; g.armySeq = g.armySeq || 0;
  g.market = {price:Object.fromEntries(RES.map(r => [r, RES_INFO[r].base])), vol:noRes(), infl:0};
  g.ws = {};
  g.access = [];
  g.chainsOn = [];
  // los bandos grandes empiezan con sus tierras ya unidas en una región (si son contiguas)
  for (let f = 0; f < nf - 1; f++) {
    const ps = provincesOf(g, f);
    if (ps.length >= 4) for (const grp of groups(geo, ps)) if (grp.length >= 3) makeRegion(geo, g, f, grp, false);
  }
}
/** Partes conexas de un conjunto de provincias. @param {Geo} geo @param {number[]} ps */
function groups(geo, ps) {
  const left = new Set(ps), out = [];
  while (left.size) {
    const s = /** @type {number} */ (left.values().next().value), grp = [s], q = [s]; left.delete(s);
    while (q.length) { const p = /** @type {number} */ (q.pop()); for (const r of geo.adj[p]) if (left.has(r)) { left.delete(r); grp.push(r); q.push(r); } }
    out.push(grp.sort((a, b) => a - b));
  }
  return out;
}
/** Objetivos de un bando según su tierra de origen. @param {Geo} geo @param {any} g @param {number} f */
function goalsFor(geo, g, f) {
  const home = g.F.capital[f]; if (home < 0) return [];
  const com = communityOf(geo.ine[home]), king = kingdomOf(geo.ine[home]);
  const out = [];
  if (com && com.ine.length > 1) out.push({k:'unir', c:com.name, done:false});
  if (!geo.coast[home] && !provincesOf(g, f).some(p => geo.coast[p])) out.push({k:'mar', done:false});
  out.push({k:'region', done:false}, {k:'ley', done:false});
  if (king && king.ine.length > 2) out.push({k:'reino', c:king.name, done:false});
  out.push({k:'renac', done:false}, {k:'ejercito', done:false}, {k:'maravilla', done:false}, {k:'capital', p:-1, done:false}, {k:'imperio', done:false});
  return out;
}

/* ======================= Recursos ======================= */
/** Materiales de una obra (al nivel al que se sube). @param {string} b @param {number} lv */
export function materials(b, lv) {
  const heavy = ['fortaleza', 'muralla', 'mina', 'cuartel', 'torre', 'astillero', 'audiencia'].includes(b);
  return {madera:2 * lv, hierro:heavy ? lv : 0};
}
/** Lo que pide cada tropa además del oro. @param {number} t */
/** @type {(t:number) => Record<string, number>} */
export const unitRes = t => t === CAB ? {caballos:1} : t === ART ? {hierro:1, polvora:1} : {};
/** Si un bando tiene los recursos. @param {Game} g @param {number} f @param {Record<string, number>} need @param {number} [n] */
export const hasRes = (g, f, need, n = 1) => !g.F.res || Object.entries(need).every(([r, v]) => (g.F.res[f][/** @type {Res} */ (r)] || 0) >= v * n);
/** @param {Game} g @param {number} f @param {Record<string, number>} need @param {number} [n] */
export function payRes(g, f, need, n = 1) { if (!g.F.res) return; for (const [r, v] of Object.entries(need)) g.F.res[f][/** @type {Res} */ (r)] -= v * n; }
/** Texto de lo que falta. @param {Game} g @param {number} f @param {Record<string, number>} need @param {number} [n] */
export function missingRes(g, f, need, n = 1) {
  return Object.entries(need).filter(([r, v]) => (g.F.res?.[f]?.[/** @type {Res} */ (r)] || 0) < v * n).map(([r, v]) => `${v * n} de ${RES_INFO[/** @type {Res} */ (r)].name.toLowerCase()}`).join(' y ');
}
/** Producción de una provincia por turno. @param {Geo} geo @param {Game} g @param {number} p */
export function production(geo, g, p) {
  const f = g.P.owner[p], out = noRes();
  if (f < 0 || f === rebels(g)) return out;
  const sp = geo.spec[p], t = geo.terrain[p];
  out.grano = 1 + 2 * lvl(g, p, 'granja') + ({cereal:3, huerta:2, olivo:1, vino:1}[/** @type {'cereal'} */ (sp)] || 0) + Math.floor((g.P.pop?.[p] || 0) / 150) + (law(g, f, 'mesta') === 1 ? 1 : 0);
  out.madera = (sp === 'madera' ? 3 : 0) + (t !== 'l' ? 1 : 0);
  out.hierro = lvl(g, p, 'mina') * (sp === 'mineria' || sp === 'hierro' ? 2 : 1) + (sp === 'hierro' ? 2 : 0);
  out.caballos = (sp === 'ganado' ? 2 : 0) + (t === 'l' && lvl(g, p, 'granja') >= 2 ? 1 : 0) + (sp === 'ganado' && law(g, f, 'mesta') === 0 ? 1 : 0);
  out.polvora = knows(g, f, 'polvora') ? lvl(g, p, 'mina') + (sp === 'industria' ? 2 : 0) : 0;
  // cosechas y desgracias
  if (g.rules.seasons) { const s = season(g); if (s === 2) out.grano *= 2; else if (s === 3) out.grano = Math.floor(out.grano / 2); }
  if (effectOn(g, p, 'sequia') || effectOn(g, p, 'hambruna')) out.grano = 0;
  if (effectOn(g, p, 'peste')) for (const r of RES) out[r] = Math.floor(out[r] / 2);
  if (g.P.loyal[p] < 30) for (const r of RES) out[r] = Math.floor(out[r] / 2);
  return out;
}
/** Producción total y consumo de un bando. @param {Geo} geo @param {Game} g @param {number} f */
export function resBook(geo, g, f) {
  const prod = noRes();
  for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f) { const x = production(geo, g, p); for (const r of RES) prod[r] += x[r]; }
  let troops = 0; for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f) troops += g.P.troops[p];
  let field = 0; for (const a of g.armies || []) if (a.f === f) field += a.u[0] + a.u[1] + a.u[2] + a.u[3];
  const use = noRes();
  use.grano = Math.ceil(troops / 12) + Math.ceil(field / 6);
  const capR = resCap(geo, g, f);
  return {prod, use, cap:capR};
}
/** Almacenaje. @param {Geo} geo @param {Game} g @param {number} f */
export function resCap(geo, g, f) {
  let n = 0, alm = 0;
  for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f) { n++; alm += lvl(g, p, 'almacen'); }
  return 60 + 12 * n + 40 * alm;
}

/* ======================= Mercado ======================= */
/** Precio de compra y de venta de n unidades. @param {Game} g @param {Res} r @param {number} n */
export function quote(g, r, n) {
  const pr = g.market?.price[r] ?? RES_INFO[r].base;
  return {buy:Math.ceil(pr * n / 10), sell:Math.floor(pr * n * 7 / 100)};
}
/** Si el bando puede comerciar (mercado o puerto en alguna provincia). @param {Game} g @param {number} f */
export const canTrade = (g, f) => g.P.owner.some((o, p) => o === f && (lvl(g, p, 'mercado') > 0 || lvl(g, p, 'puerto') > 0 || g.F.capital[f] === p));

/* ======================= Administración ======================= */
/** Capacidad administrativa. @param {Game} g @param {number} f */
export function adminCap(g, f) {
  let v = 8 + 2 * era(g, f) + (g.F.bonus?.[f]?.adm || 0);
  for (const r of g.regions || []) if (r.f === f) v += 3 * lvl(g, r.seat, 'audiencia');
  if (law(g, f, 'cortes') === 0) v += 2; else v -= 1;
  if (law(g, f, 'fueros') === 1) v += 3; else v -= 1;
  return Math.max(4, v);
}
/** Lo que cuesta administrar: cada provincia suelta 1 y cada región 2. @param {Game} g @param {number} f */
export function adminUse(g, f) {
  let loose = 0, regs = 0;
  for (let p = 0; p < g.P.owner.length; p++) if (g.P.owner[p] === f && !regionOf(g, p)) loose++;
  for (const r of g.regions || []) if (r.f === f) regs++;
  return loose + 2 * regs;
}
/** Exceso sobre la capacidad (0 si no hay). @param {Game} g @param {number} f */
export const adminOver = (g, f) => g.F.res ? Math.max(0, adminUse(g, f) - adminCap(g, f)) : 0;

/* ======================= Facciones, estabilidad y estamentos ======================= */
/** Poder de cada facción (suma 100). @param {Game} g @param {number} f */
export function facPower(g, f) {
  const w = [...POWER];
  if (law(g, f, 'cortes') === 0) { w[0] -= 10; w[3] += 5; } else { w[2] += 10; w[0] += 5; }
  if (law(g, f, 'religion') === 1) w[1] += 15;
  if (law(g, f, 'comercio') === 1) w[2] += 10;
  if (law(g, f, 'leva') === 1) w[3] += 10; else if (law(g, f, 'leva') === 0) w[0] += 10;
  const s = w.reduce((a, b) => a + b, 0);
  return w.map(x => Math.floor(x * 100 / s));
}
/** Hacia dónde va el contento de cada estamento de una provincia. @param {Geo} geo @param {Game} g @param {number} p */
export function estTarget(geo, g, p) {
  const f = g.P.owner[p], tax = g.P.tax[p] ?? 1, reg = regionOf(g, p), gov = reg?.gov;
  const hunger = g.F.res && g.F.res[f] && g.F.res[f].grano <= 0;
  const camp = 60 - 12 * (tax - 1) + 5 * Math.min(2, lvl(g, p, 'granja')) - Math.floor(g.F.weary[f] / 5) - (hunger ? 20 : 0)
    + (law(g, f, 'mesta') === 1 ? 10 : -8) + (gov?.trait === 'popular' ? 10 : gov?.trait === 'severo' ? -10 : 0) - (effectOn(g, p, 'peste') ? 15 : 0);
  const burg = 50 + (lvl(g, p, 'mercado') ? 10 : 0) + 5 * Math.min(2, lvl(g, p, 'puerto')) - 10 * (tax - 1) - (g.embargo.some(e => e.a === f || e.b === f) ? 8 : 0)
    + (law(g, f, 'comercio') === 1 ? 15 : 5) + (law(g, f, 'cortes') === 1 ? 10 : -5) + (law(g, f, 'religion') === 1 ? -10 : 0);
  const nob = 55 + (law(g, f, 'fueros') === 0 ? 10 : -15) + (law(g, f, 'cortes') === 1 ? 10 : -10) + (law(g, f, 'leva') === 0 ? 10 : law(g, f, 'leva') === 1 ? -5 : -10)
    + (law(g, f, 'mesta') === 0 ? 5 : -10) + (g.F.ruler?.[f]?.regent ? -10 : 0) + (g.F.capital[f] === p ? 5 : 0);
  const clero = 55 + 8 * Math.min(2, lvl(g, p, 'catedral')) + (law(g, f, 'religion') === 1 ? 15 : -10) - 3 * lvl(g, p, 'universidad') - (knows(g, f, 'ilustracion') ? 10 : 0);
  return [camp, burg, nob, clero].map(v => clamp(v, 0, 100));
}
/** Efecto de los estamentos sobre la lealtad (de −5 a +5). @param {Game} g @param {number} p */
export const estLoyalty = (g, p) => g.P.est ? Math.floor((avg(g.P.est[p]) - 50) / 10) : 0;
/** Contento medio de un estamento en todo el bando. @param {Game} g @param {number} f @param {number} i */
export function estAvg(g, f, i) {
  const v = []; for (let p = 0; p < g.P.owner.length; p++) if (g.P.owner[p] === f && g.P.est) v.push(g.P.est[p][i]);
  return avg(v);
}
/** Puntos de lealtad que añade el reino (estamentos, estabilidad, región, leyes, administración). @param {Geo} geo @param {Game} g @param {number} p @returns {[string, number][]} */
export function realmLoyalty(geo, g, p) {
  const f = g.P.owner[p]; if (!g.F.res || f < 0 || f === rebels(g)) return [];
  const out = /** @type {[string, number][]} */ ([]);
  out.push(['Estamentos', estLoyalty(g, p)]);
  out.push(['Estabilidad', Math.floor((g.F.stab[f] - 50) / 10)]);
  const reg = regionOf(g, p);
  if (reg) out.push(['Región ' + reg.name, 2 + (lvl(g, reg.seat, 'audiencia') ? 2 : 0) + (reg.gov?.trait === 'severo' ? 3 : 0)]);
  const foreign = g.P.cult[p] !== g.F.cult[f];
  if (foreign) out.push([law(g, f, 'fueros') === 0 ? 'Fueros' : 'Centralismo', law(g, f, 'fueros') === 0 ? 3 : -3]);
  if (g.F.fac[f][1] < 30) out.push(['La Iglesia, molesta', -2]);
  if (g.P.est[p][3] < 20) out.push(['Clero descontento', -5]);
  const over = adminOver(g, f);
  if (over) out.push(['Administración desbordada', -Math.ceil(over / 2)]);
  return out.filter(([, v]) => v);
}
/** Multiplicador de oro del reino (porcentaje). @param {Game} g @param {number} f @returns {[string, number][]} */
export function realmIncome(g, f) {
  if (!g.F.res) return [];
  const out = /** @type {[string, number][]} */ ([]);
  const over = adminOver(g, f);
  if (over) out.push(['Administración desbordada', -Math.min(50, 5 * over)]);
  if (g.F.stab[f] < 30) out.push(['Inestabilidad', -10]);
  if (g.F.fac[f][2] > 70) out.push(['Burguesía satisfecha', 10]);
  if (g.F.bonus[f].gold) out.push(['Objetivos cumplidos', g.F.bonus[f].gold]);
  return out;
}
/** Puntos de ataque del reino (ejército y leyes). @param {Game} g @param {number} f */
export function realmAttack(g, f) {
  if (!g.F.res) return 0;
  return (law(g, f, 'leva') === 1 ? 10 : law(g, f, 'leva') === 0 ? -5 : 0) + (g.F.fac[f][3] < 30 ? -10 : 0);
}

/* ======================= Regiones ======================= */
/** Si un conjunto de provincias puede formar región (o por qué no). @param {Geo} geo @param {Game} g @param {number} f @param {number[]} ps */
export function canUnify(geo, g, f, ps) {
  if (ps.length < 2) return 'Hacen falta al menos 2 provincias';
  if (ps.some(p => g.P.owner[p] !== f)) return 'Todas tienen que ser tuyas';
  if (ps.some(p => regionOf(g, p))) return 'Alguna ya está en una región';
  const low = ps.filter(p => g.P.loyal[p] < 90);
  if (low.length) return `Lealtad 90 o más (no la tienen ${low.length})`;
  if (groups(geo, ps).length > 1) return 'Tienen que tocarse entre sí';
  if (g.sieges.some(s => ps.includes(s.p))) return 'Alguna está asediada';
  return '';
}
/** Provincias que podrían unirse ya (grupos conexos de lealtad alta fuera de regiones). @param {Geo} geo @param {Game} g @param {number} f */
export function unifyCandidates(geo, g, f) {
  const ok = provincesOf(g, f).filter(p => g.P.loyal[p] >= 90 && !regionOf(g, p) && !g.sieges.some(s => s.p === p));
  return groups(geo, ok).filter(x => x.length >= 2);
}
/** Coste de fundar una región. @param {number[]} ps */
export const unifyCost = ps => 40 + 10 * ps.length;
/** @param {Geo} geo @param {Game} g @param {number} f @param {number[]} ps @param {boolean} [ev] */
function makeRegion(geo, g, f, ps, ev = true) {
  const tally = new Map();
  for (const p of ps) { const c = communityOf(geo.ine[p]); if (c) tally.set(c.name, (tally.get(c.name) || 0) + 1); }
  let name = [...tally.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] || 'Región';
  const same = (g.regions || []).filter(r => r.name.startsWith(name)).length;
  if (same) name += ' ' + ['', 'II', 'III', 'IV', 'V'][Math.min(4, same)];
  const seat = ps.includes(g.F.capital[f]) ? g.F.capital[f] : [...ps].sort((a, b) => geo.tier[b] - geo.tier[a] || a - b)[0];
  const r = {id:++g.regSeq, f, name, ps:[...ps].sort((a, b) => a - b), seat, gov:null};
  g.regions.push(r);
  if (ev) emit(g, {t:'region', f, id:r.id, name, n:ps.length});
  return r;
}
/** Quita de las regiones lo que ya no encaja (provincia perdida o poco leal) y deshace las de una sola. @param {Geo} geo @param {Game} g */
export function tidyRegions(geo, g) {
  for (const r of [...(g.regions || [])]) {
    const out = r.ps.filter(p => g.P.owner[p] !== r.f || g.P.loyal[p] < 50);
    if (out.length) r.ps = r.ps.filter(p => !out.includes(p));
    // si se ha partido, se queda la parte con la sede (o la mayor)
    const parts = groups(geo, r.ps);
    if (parts.length > 1) r.ps = parts.find(x => x.includes(r.seat)) || parts.sort((a, b) => b.length - a.length)[0];
    if (!r.ps.includes(r.seat) && r.ps.length) r.seat = [...r.ps].sort((a, b) => geo.tier[b] - geo.tier[a] || a - b)[0];
    if (r.ps.length < 2 || !g.F.alive[r.f]) { g.regions = g.regions.filter(x => x !== r); emit(g, {t:'regionend', f:r.f, name:r.name}); }
    else if (out.length) emit(g, {t:'regionloss', f:r.f, name:r.name, n:out.length});
  }
}
/** Multiplicador de oro de la región de una provincia (porcentaje). @param {Game} g @param {number} p */
export function regionIncome(g, p) {
  const r = regionOf(g, p); if (!r) return 100;
  return 105 + (r.gov?.trait === 'capaz' ? 10 : r.gov?.trait === 'corrupto' ? -15 : 0);
}

/* ======================= Acciones ======================= */
/**
 * Órdenes del reino. Devuelve false si no es suya.
 * @param {Geo} geo @param {Game} g @param {any} a
 */
export function realmAction(geo, g, a) {
  const f = a.f, P = g.P;
  switch (a.type) {
    case 'trade': {
      const r = /** @type {Res} */ (a.k), n = Math.floor(a.n);
      need(RES.includes(r), 'Recurso no válido');
      need(canTrade(g, f), 'Hace falta un mercado, un puerto o la capital');
      need(n !== 0 && Math.abs(n) <= 100, 'Entre 1 y 100 unidades');
      const q = quote(g, r, Math.abs(n));
      if (n > 0) { need(g.F.gold[f] >= q.buy, 'No hay oro suficiente'); g.F.gold[f] -= q.buy; g.F.res[f][r] += n; }
      else { need(g.F.res[f][r] >= -n, 'No tienes tanto'); g.F.res[f][r] += n; g.F.gold[f] += q.sell; }
      g.market.vol[r] += n;
      emit(g, {t:'trade', f, k:r, n, gold:n > 0 ? -q.buy : q.sell});
      return true;
    }
    case 'unify': {
      const ps = Array.isArray(a.ps) ? [...new Set(a.ps.map(Number))] : [];
      const why = canUnify(geo, g, f, ps); need(!why, why);
      const cost = unifyCost(ps); need(g.F.gold[f] >= cost, 'No hay oro suficiente');
      g.F.gold[f] -= cost; makeRegion(geo, g, f, ps);
      return true;
    }
    case 'region_add': {
      const r = g.regions.find(x => x.id === a.id && x.f === f); need(!!r, 'Región no válida');
      const rr = /** @type {any} */ (r);
      need(P.owner[a.p] === f && !regionOf(g, a.p), 'Provincia no válida');
      need(geo.adj[a.p].some(q => rr.ps.includes(q)), 'Tiene que tocar la región');
      need(P.loyal[a.p] >= 90, 'Hace falta lealtad 90');
      need(g.F.gold[f] >= 15, 'No hay oro suficiente');
      g.F.gold[f] -= 15; rr.ps = [...rr.ps, a.p].sort((x, y) => x - y);
      emit(g, {t:'regionadd', f, name:rr.name, p:a.p});
      return true;
    }
    case 'region_set': {
      const r = g.regions.find(x => x.id === a.id && x.f === f); need(!!r, 'Región no válida');
      for (const p of /** @type {any} */ (r).ps) { if (a.lvl >= 0 && a.lvl <= 2) P.tax[p] = a.lvl; if (a.s >= 0 && a.s <= 3) P.stance[p] = a.s; }
      emit(g, {t:'regionset', f, id:a.id});
      return true;
    }
    case 'region_split': {
      const r = g.regions.find(x => x.id === a.id && x.f === f); need(!!r, 'Región no válida');
      g.regions = g.regions.filter(x => x !== r); emit(g, {t:'regionend', f, name:/** @type {any} */ (r).name});
      return true;
    }
    case 'governor': {
      const r = /** @type {any} */ (g.regions.find(x => x.id === a.id && x.f === f)); need(!!r, 'Región no válida');
      need(a.k in POLICIES, 'Política no válida');
      const budget = clamp(Math.floor(a.n || 0), 0, 30);
      if (!r.gov || a.accept) {
        need(g.F.gold[f] >= GOV_COST, 'No hay oro suficiente');
        g.F.gold[f] -= GOV_COST;
        const traits = Object.keys(GOV_TRAITS);
        r.gov = {name:person(g.rng), trait:traits[int(g.rng, traits.length)], policy:a.k, budget};
        emit(g, {t:'governor', f, name:r.gov.name, region:r.name});
      } else { r.gov.policy = a.k; r.gov.budget = budget; }
      return true;
    }
    case 'law': {
      const k = /** @type {LawKey} */ (a.k), opt = Math.floor(a.opt);
      need(k in LAWS && opt >= 0 && opt < LAWS[k].opts.length, 'Ley no válida');
      need(law(g, f, k) !== opt, 'Ya está en vigor');
      const last = g.F.lawT[f][k] ?? -99;
      need(g.turn - last >= LAW_COOLDOWN, `Podrás cambiarla en ${LAW_COOLDOWN - (g.turn - last)} turnos`);
      need(g.F.gold[f] >= LAW_COST, 'No hay oro suficiente');
      const sup = lawSupport(g, f, k, opt);
      need(sup >= 40 || a.accept, `Solo la apoya el ${sup} % del poder: hace falta el 40 % (o imponerla)`);
      g.F.gold[f] -= LAW_COST;
      g.F.laws[f][k] = opt; g.F.lawT[f][k] = g.turn;
      const o = LAWS[k].opts[opt];
      for (const i of o.likes) g.F.fac[f][i] = clamp(g.F.fac[f][i] + 10, 0, 100);
      for (const i of o.hates) g.F.fac[f][i] = clamp(g.F.fac[f][i] - (sup < 40 ? 20 : 12), 0, 100);
      if (sup < 40) g.F.stab[f] = clamp(g.F.stab[f] - 15, 0, 100);
      emit(g, {t:'law', f, k, opt, forced:sup < 40});
      return true;
    }
    case 'casar': {
      const r = g.F.ruler[f]; need(!r.wed, 'Ya está casado');
      need(g.F.gold[f] >= 30, 'No hay oro suficiente');
      g.F.gold[f] -= 30; r.wed = true; g.F.fac[f][0] = clamp(g.F.fac[f][0] + 5, 0, 100);
      emit(g, {t:'casar', f, name:r.name});
      return true;
    }
    case 'rally': {
      need(a.p === -1 || P.owner[a.p] === f, 'No es tuya');
      g.F.rally[f] = a.p; emit(g, {t:'rally', f, p:a.p});
      return true;
    }
    case 'autorecruit': {
      need(P.owner[a.p] === f, 'No es tuya');
      P.auto[a.p] = clamp(Math.floor(a.n || 0), 0, 2 * cap(geo, g, a.p)); emit(g, {t:'auto', f, p:a.p, n:P.auto[a.p]});
      return true;
    }
    case 'rush': {
      need(P.owner[a.p] === f && P.queue[a.p].length > 0, 'No hay obras');
      const c = rushCost(g, a.p); need(g.F.gold[f] >= c, 'No hay oro suficiente');
      g.F.gold[f] -= c; P.queue[a.p][0].left = 1;
      const job = P.queue[a.p].shift(); if (job) { if (job.b === '*') { P.wonder[a.p] = job.w || ''; emit(g, {t:'wonder', f, p:a.p, w:job.w}); } else { P.bld[a.p] = {...P.bld[a.p], [job.b]:job.lvl}; emit(g, {t:'built', f, p:a.p, b:job.b, lvl:job.lvl, rush:true}); } }
      return true;
    }
    case 'cancel_build': {
      need(P.owner[a.p] === f && P.queue[a.p].length > 0, 'No hay obras');
      const job = P.queue[a.p].pop(); if (job) g.F.gold[f] += Math.floor((job.gold || 0) / 2);
      emit(g, {t:'cancelbuild', f, p:a.p});
      return true;
    }
  }
  return false;
}
/** Porcentaje del poder que apoya una opción de ley. @param {Game} g @param {number} f @param {LawKey} k @param {number} opt */
export function lawSupport(g, f, k, opt) {
  const o = LAWS[k].opts[opt], pw = facPower(g, f);
  let s = 0;
  for (let i = 0; i < 4; i++) {
    if (o.hates.includes(i)) continue;
    if (o.likes.includes(i) ? g.F.fac[f][i] >= 30 : g.F.fac[f][i] >= 60) s += pw[i];
  }
  return s;
}

/* ======================= Mantenimiento por turno ======================= */
/**
 * Todo lo del reino al final del turno.
 * @param {Geo} geo @param {Game} g
 */
export function realmUpkeep(geo, g) {
  if (!g.F.res) return;
  const R = rebels(g), nf = R;
  tidyRegions(geo, g);
  for (let f = 0; f < nf; f++) if (g.F.alive[f]) { governors(geo, g, f); orders(geo, g, f); }
  buildQueues(geo, g);
  // recursos: producción, consumo, hambre y almacén
  for (let f = 0; f < nf; f++) {
    if (!g.F.alive[f]) continue;
    const b = resBook(geo, g, f), res = g.F.res[f];
    for (const r of RES) res[r] += b.prod[r] - b.use[r];
    if (res.grano < 0) {
      res.grano = 0;
      const ps = provincesOf(g, f);
      for (const p of ps) { const v = Math.floor(g.P.troops[p] * 4 / 100); if (v && g.P.troops[p] > v + 1) removeTroops(g, p, v); }
      emit(g, {t:'hambre', f});
    }
    for (const r of RES) res[r] = clamp(res[r], 0, b.cap);
    if (g.F.indias[f] > 0) { g.F.gold[f] += 25; g.market.infl = Math.min(80, g.market.infl + 1); }
    if (law(g, f, 'religion') === 0) g.F.rp[f] += 1; else g.F.rp[f] = Math.max(0, g.F.rp[f] - 1);
  }
  // mercado: los precios se mueven con lo comprado y vendido y vuelven poco a poco a su base (más la inflación)
  for (const r of RES) {
    const base = Math.floor(RES_INFO[r].base * (100 + g.market.infl) / 100), pr = g.market.price[r], vol = g.market.vol[r];
    let np = pr + Math.floor(pr * clamp(vol, -60, 60) / 300);
    np += Math.floor((base - np) / 8);
    g.market.price[r] = clamp(np, Math.floor(base / 2), base * 3);
    g.market.vol[r] = 0;
  }
  // población
  for (let p = 0; p < geo.n; p++) {
    const f = g.P.owner[p]; if (f < 0 || f === R) continue;
    const pop = g.P.pop[p], top = Math.floor(pop0(geo.ine[p]) * (150 + 8 * buildingsAt(g, p).reduce((s, [, l]) => s + l, 0)) / 100);
    const hungry = g.F.res[f].grano <= 0, sick = effectOn(g, p, 'peste');
    let rate = 4 + 2 * lvl(g, p, 'granja') + 2 * lvl(g, p, 'hospital') + (g.P.est[p][0] >= 60 ? 2 : 0) - ((g.P.tax[p] ?? 1) === 2 ? 2 : 0);
    if (hungry) rate = -15; if (sick) rate = -60;
    let d = Math.floor(pop * rate / 1000); if (rate > 0 && d < 1 && pop < top) d = 1;
    g.P.pop[p] = clamp(pop + (pop >= top && d > 0 ? 0 : d), 5, Math.max(top, pop));
  }
  // estamentos: se acercan a lo que piden sus circunstancias; si alguno estalla, hay consecuencias
  for (let p = 0; p < geo.n; p++) {
    const f = g.P.owner[p]; if (f < 0 || f === R) continue;
    const t = estTarget(geo, g, p), e = g.P.est[p];
    for (let i = 0; i < 4; i++) e[i] = clamp(e[i] + clamp(t[i] - e[i], -5, 5), 0, 100);
    if (e[0] < 20 && int(g.rng, 100) < 12) {
      removeTroops(g, p, Math.floor(g.P.troops[p] * 30 / 100)); g.P.loyal[p] = Math.max(0, g.P.loyal[p] - 20); e[0] += 15;
      emit(g, {t:'jacquerie', f, p});
    }
    if (e[2] < 20 && g.F.capital[f] !== p && int(g.rng, 100) < 8) {
      revolt(geo, g, p, 'nobles'); continue;
    }
  }
  // facciones, estabilidad, corona e infamia
  for (let f = 0; f < nf; f++) {
    if (!g.F.alive[f]) continue;
    const fac = g.F.fac[f];
    for (let i = 0; i < 3; i++) fac[i] = clamp(fac[i] + clamp(estAvg(g, f, FACTIONS[i].estate) - fac[i], -3, 3), 0, 100);
    const army = 55 + (law(g, f, 'leva') === 1 ? 15 : law(g, f, 'leva') === 2 ? -15 : 0) - Math.floor(g.F.weary[f] / 4) + Math.floor((g.F.morale[f] - 100) / 3);
    fac[3] = clamp(fac[3] + clamp(army - fac[3], -3, 3), 0, 100);
    // la estabilidad tiende a un nivel según la corte, la religión, la regencia y el cansancio
    const target = 50 + (fac.every(x => x >= 40) ? 20 : 0) - (fac.some(x => x < 25) ? 25 : 0) + (law(g, f, 'religion') === 1 ? 10 : 0)
      - (g.F.ruler[f].regent ? 10 : 0) - Math.floor(g.F.weary[f] / 10) - Math.floor(g.F.inf[f] / 10);
    g.F.stab[f] = clamp(g.F.stab[f] + Math.sign(target - g.F.stab[f]), 0, 100);
    const pw = facPower(g, f);
    for (let i = 0; i < 4; i++) if (fac[i] < 12 && pw[i] >= 25 && provincesOf(g, f).length > 2 && int(g.rng, 100) < 6) { civilWar(geo, g, f, i); break; }
    crown(geo, g, f);
    g.F.inf[f] = Math.max(0, g.F.inf[f] - (knows(g, f, 'tratados') ? 2 : 1));
  }
  // la infamia alta enfría a los vecinos
  for (let f = 0; f < nf; f++) if (g.F.alive[f] && g.F.inf[f] >= 40) for (let x = 0; x < nf; x++) if (x !== f && g.F.alive[x]) relAdd(g, f, x, -1);
  // puntuación de guerra: se enfría en paz
  for (const k of Object.keys(g.ws)) { const [a, b] = k.split('-').map(Number); if (g.st[a]?.[b] !== WAR) delete g.ws[k]; }
  g.access = g.access.filter(x => x.until > g.turn);
  goals(geo, g);
}
/** Una provincia se subleva (a los rebeldes). @param {Geo} geo @param {Game} g @param {number} p @param {string} who */
function revolt(geo, g, p, who) {
  const f = g.P.owner[p], R = rebels(g);
  g.P.owner[p] = R; g.P.u[p] = [Math.max(4, Math.floor(g.P.troops[p] * 60 / 100)) + 2, 0, 0, 0]; sync(g, p);
  g.P.loyal[p] = 50; g.P.queue[p] = []; g.gens = g.gens.filter(x => x.p !== p);
  emit(g, {t:'revolt', p, from:f, to:R, who});
  if (g.F.capital[f] === p) g.F.capital[f] = -1;
  if (!g.P.owner.includes(f)) eliminate(g, f, R);
}
/** Guerra civil: una facción muy descontenta se lleva las provincias menos leales. @param {Geo} geo @param {Game} g @param {number} f @param {number} i */
function civilWar(geo, g, f, i) {
  const ps = provincesOf(g, f).filter(p => p !== g.F.capital[f]).sort((a, b) => g.P.loyal[a] - g.P.loyal[b] || a - b);
  const take = ps.slice(0, Math.max(1, Math.floor(ps.length / 4)));
  for (const p of take) revolt(geo, g, p, FACTIONS[i].k);
  g.F.stab[f] = clamp(g.F.stab[f] - 20, 0, 100); g.F.fac[f][i] = clamp(g.F.fac[f][i] + 30, 0, 100);
  emit(g, {t:'guerracivil', f, k:FACTIONS[i].k, n:take.length});
}
/** El rey envejece, tiene hijos, muere y se sucede. @param {Geo} geo @param {Game} g @param {number} f */
function crown(geo, g, f) {
  const r = g.F.ruler[f];
  if (g.turn % 12 !== 0) return;
  r.age++; if (r.heir) r.heir.age++;
  if (r.regent && r.age >= 16) { r.regent = false; emit(g, {t:'mayoria', f, name:r.name}); }
  if (r.wed && !r.heir && r.age < 50 && int(g.rng, 100) < 35) { r.heir = {name:person(g.rng), age:0}; emit(g, {t:'heredero', f, name:r.heir.name}); }
  const chance = r.age < 40 ? 2 : r.age < 55 ? 5 : r.age < 65 ? 12 : 25;
  if (int(g.rng, 100) >= chance) return;
  const old = r.name;
  if (r.heir) {
    const h = r.heir, regent = h.age < 16;
    g.F.ruler[f] = {name:h.name, age:h.age, wed:h.age >= 18 && int(g.rng, 2) === 0, regent, heir:null};
    g.F.trait[f] = /** @type {any} */ (Object.keys(TRAITS)[int(g.rng, Object.keys(TRAITS).length)]);
    g.F.stab[f] = clamp(g.F.stab[f] - (regent ? 10 : 5), 0, 100);
    if (regent) g.F.fac[f][0] = clamp(g.F.fac[f][0] - 10, 0, 100);
    emit(g, {t:'sucesion', f, old, name:h.name, regent});
    return;
  }
  // sin heredero: crisis. Si hay boda con un bando más fuerte, puede acabar en unión dinástica
  const wed = g.weds.find(w => w.a === f || w.b === f), other = wed ? (wed.a === f ? wed.b : wed.a) : -1;
  if (other >= 0 && g.F.alive[other] && provincesOf(g, other).length > provincesOf(g, f).length && int(g.rng, 100) < 40) {
    g.F.lord[f] = other;
    emit(g, {t:'union', f, lord:other, old});
  }
  g.F.ruler[f] = {name:person(g.rng), age:20 + int(g.rng, 20), wed:false, regent:false, heir:null};
  g.F.trait[f] = /** @type {any} */ (Object.keys(TRAITS)[int(g.rng, Object.keys(TRAITS).length)]);
  g.F.stab[f] = clamp(g.F.stab[f] - 25, 0, 100); g.F.fac[f][0] = clamp(g.F.fac[f][0] - 20, 0, 100);
  emit(g, {t:'crisis', f, old, name:g.F.ruler[f].name});
  if (int(g.rng, 100) < 50 && provincesOf(g, f).length > 2) civilWar(geo, g, f, 0);
}
/** Los gobernadores gastan su parte del tesoro en su región según su política. @param {Geo} geo @param {Game} g @param {number} f */
function governors(geo, g, f) {
  for (const r of g.regions) {
    if (r.f !== f || !r.gov || !r.gov.budget) continue;
    let left = Math.floor(g.F.gold[f] * r.gov.budget / 100);
    const front = r.ps.filter(p => geo.adj[p].some(q => g.P.owner[q] !== f && g.P.owner[q] >= 0));
    const try1 = (/** @type {any} */ a) => { try { const before = g.F.gold[f]; govAct(geo, g, a); left -= before - g.F.gold[f]; return true; } catch (e) { return false; } };
    for (let i = 0; i < 6 && left > 0; i++) {
      let done = false;
      if (r.gov.policy === 'economica') {
        for (const p of r.ps) for (const b of ['mercado', 'granja', 'mina', 'puerto', 'caminos', 'universidad']) if (!done && left >= 30) done = try1({type:'build', f, p, b});
      } else if (r.gov.policy === 'militar') {
        for (const p of front.length ? front : r.ps) if (!done && left >= unitCost(geo, g, f, p, INF) * 4) done = try1({type:'recruit', f, p, n:Math.min(8, Math.floor(left / unitCost(geo, g, f, p, INF))), t:INF});
      } else {
        for (const p of front.length ? front : r.ps) for (const b of ['fortaleza', 'muralla', 'torre']) if (!done && left >= 40) done = try1({type:'build', f, p, b});
        if (!done) for (const p of front) if (!done && left >= 10) done = try1({type:'recruit', f, p, n:Math.min(6, Math.floor(left / 2)), t:MIL});
      }
      if (!done) break;
    }
  }
}
/** Orden de un gobernador (la ejecuta el motor normal; se registra al cargar el motor). @param {Geo} geo @param {Game} g @param {any} a */
function govAct(geo, g, a) { return /** @type {any} */ (govAct).fn(geo, g, a); }
/** El motor registra cómo se ejecutan las órdenes (evita la dependencia circular). @param {(geo:Geo, g:Game, a:any) => void} fn */
export function setActor(fn) { /** @type {any} */ (govAct).fn = fn; }
/** Órdenes permanentes: reclutar hasta un objetivo y mandar lo que sobra al punto de reunión. @param {Geo} geo @param {Game} g @param {number} f */
function orders(geo, g, f) {
  for (let p = 0; p < geo.n; p++) {
    if (g.P.owner[p] !== f || !g.P.auto[p] || g.P.troops[p] >= g.P.auto[p]) continue;
    const n = Math.min(6, g.P.auto[p] - g.P.troops[p], Math.floor((g.F.gold[f] - 20) / Math.max(1, unitCost(geo, g, f, p, INF))));
    if (n > 0) try { govAct(geo, g, {type:'recruit', f, p, n, t:INF}); } catch (e) { /* sin oro o sin sitio */ }
  }
  const rally = g.F.rally[f];
  if (rally < 0 || g.P.owner[rally] !== f) return;
  // camino más corto por territorio propio hacia el punto de reunión
  const next = new Map([[rally, rally]]), q = [rally];
  while (q.length) { const p = /** @type {number} */ (q.shift()); for (const r of geo.adj[p]) if (!next.has(r) && g.P.owner[r] === f) { next.set(r, p); q.push(r); } }
  const hostile = (/** @type {number} */ p) => geo.adj[p].some(q2 => { const o = g.P.owner[q2]; return o >= 0 && o !== f && (o === rebels(g) || g.st[f][o] === WAR); });
  for (let p = 0; p < geo.n; p++) {
    if (p === rally || g.P.owner[p] !== f || !next.has(p) || hostile(p) || g.sieges.some(s => s.p === p)) continue;
    const keep = Math.max(3, Math.floor(freeGarrison(geo.tier[p]) / 2)), spare = Math.min(8, g.P.ready[p], g.P.u[p][INF] + g.P.u[p][CAB] + g.P.u[p][ART] - keep);
    if (spare <= 0) continue;
    const to = /** @type {number} */ (next.get(p)), v = [0, 0, 0, 0];
    let left = spare; for (const t of [INF, CAB, ART]) { const x = Math.min(left, g.P.u[p][t]); v[t] = x; left -= x; }
    for (let t = 0; t < 4; t++) g.P.u[p][t] -= v[t];
    sync(g, p); putUnits(g, to, v); g.P.ready[p] = Math.max(0, g.P.ready[p] - spare);
  }
}
/** Obras en curso: avanzan un turno y, al acabar, el edificio sube de nivel. @param {Geo} geo @param {Game} g */
function buildQueues(geo, g) {
  for (let p = 0; p < geo.n; p++) {
    const q = g.P.queue[p]; if (!q || !q.length) continue;
    const job = q[0];
    if (job.f !== g.P.owner[p]) { g.P.queue[p] = []; continue; }
    job.left--;
    if (job.left > 0) continue;
    q.shift();
    if (job.b === '*') { g.P.wonder[p] = job.w || ''; emit(g, {t:'wonder', f:job.f, p, w:job.w}); continue; }
    g.P.bld[p] = {...g.P.bld[p], [job.b]:job.lvl};
    emit(g, {t:'built', f:job.f, p, b:job.b, lvl:job.lvl});
  }
}
/** Termina todas las obras en curso al momento (pruebas y escenarios). @param {Game} g */
export function finishQueues(g) {
  for (let p = 0; p < g.P.owner.length; p++) for (const job of g.P.queue?.[p] || []) {
    if (job.b === '*') g.P.wonder[p] = job.w || ''; else g.P.bld[p] = {...g.P.bld[p], [job.b]:job.lvl};
  }
  if (g.P.queue) g.P.queue = g.P.queue.map(() => []);
}
/** Oro para acabar una obra ya (la primera de la cola). @param {Game} g @param {number} p */
export const rushCost = (g, p) => { const j = g.P.queue?.[p]?.[0]; return j ? Math.max(10, Math.floor((j.gold || 30) * j.left * 40 / 100)) : 0; };
/** Objetivos cumplidos: se marcan y se cobra la recompensa. @param {Geo} geo @param {Game} g */
function goals(geo, g) {
  for (let f = 0; f < rebels(g); f++) {
    if (!g.F.alive[f]) continue;
    const mine = provincesOf(g, f);
    for (const x of g.F.goals[f]) {
      if (x.done) continue;
      let ok = false;
      if (x.k === 'unir') { const c = COMMUNITIES.find(c2 => c2.name === x.c); ok = !!c && c.ine.every(i => { const p = geo.ine.indexOf(i); return p < 0 || !g.P.active[p] || g.P.owner[p] === f; }); }
      else if (x.k === 'mar') ok = mine.some(p => geo.coast[p]);
      else if (x.k === 'region') ok = g.regions.some(r => r.f === f);
      else if (x.k === 'ley') ok = Object.keys(g.F.lawT[f]).length > 0;
      else if (x.k === 'reino') { const k = KINGDOMS.find(c2 => c2.name === x.c); const ps = k ? k.ine.map(i => geo.ine.indexOf(i)).filter(p => p >= 0 && g.P.active[p]) : []; ok = ps.length > 0 && ps.filter(p => g.P.owner[p] === f).length * 3 >= ps.length * 2; }
      else if (x.k === 'renac') ok = era(g, f) >= 1;
      else if (x.k === 'ejercito') ok = (g.armies || []).some(a => a.f === f && a.u[0] + a.u[1] + a.u[2] >= 30);
      else if (x.k === 'maravilla') ok = mine.some(p => g.P.wonder[p]);
      else if (x.k === 'imperio') ok = mine.length >= 15;
      else if (x.k === 'capital') {
        if (x.p == null || x.p < 0 || g.P.owner[x.p] === f && !g.F.capital.includes(x.p)) {
          // la capital enemiga vecina más fuerte (se elige al momento)
          const caps = g.F.capital.map((c, o) => o !== f && c >= 0 && g.F.alive[o] && mine.some(p => geo.adj[p].includes(c)) ? c : -1).filter(c => c >= 0);
          x.p = caps.sort((a, b) => geo.tier[b] - geo.tier[a] || a - b)[0] ?? -1;
        }
        ok = x.p != null && x.p >= 0 && g.P.owner[x.p] === f;
      }
      if (!ok) continue;
      x.done = true;
      if (x.k === 'unir') { g.F.stab[f] = clamp(g.F.stab[f] + 10, 0, 100); g.F.gold[f] += 50; }
      else if (x.k === 'mar') { g.F.gold[f] += 30; g.F.rp[f] += 15; }
      else if (x.k === 'region') g.F.bonus[f].adm += 2;
      else if (x.k === 'reino') g.F.bonus[f].gold += 10;
      else if (x.k === 'capital') g.F.morale[f] = clamp(g.F.morale[f] + 20, 50, 200);
      else if (x.k === 'imperio') g.F.bonus[f].adm += 3;
      else if (x.k === 'renac') g.F.rp[f] += 25;
      else if (x.k === 'ejercito') g.F.fac[f][3] = clamp(g.F.fac[f][3] + 20, 0, 100);
      else if (x.k === 'maravilla') g.F.stab[f] = clamp(g.F.stab[f] + 15, 0, 100);
      else if (x.k === 'ley') g.F.fac[f] = g.F.fac[f].map(v => clamp(v + 10, 0, 100));
      emit(g, {t:'goal', f, k:x.k});
    }
  }
}
/** Texto de un objetivo. @param {Geo} geo @param {Game} g @param {{k:string, c?:string, p?:number}} x @param {(p:number) => string} pname */
export function goalText(geo, g, x, pname) {
  const info = /** @type {Record<string, {name:string, reward:string}>} */ (GOAL_INFO)[x.k];
  return info.name.replace('{C}', x.c || '').replace('{K}', x.c || '').replace('{P}', x.p != null && x.p >= 0 ? pname(x.p) : 'una capital vecina');
}

/* ======================= Infamia y guerra ======================= */
/** Clave de la puntuación de guerra. @param {number} a @param {number} b */
const wsKey = (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`;
/** Puntuación de guerra de a contra b (−100..100). @param {Game} g @param {number} a @param {number} b */
export const warScore = (g, a, b) => { const v = g.ws?.[wsKey(a, b)] || 0; return a < b ? v : -v; };
/** @param {Game} g @param {number} a @param {number} b @param {number} d puntos para a */
export function addWarScore(g, a, b, d) {
  if (!g.ws || a === b || a >= rebels(g) || b >= rebels(g)) return;
  const k = wsKey(a, b);
  g.ws[k] = clamp((g.ws[k] || 0) + (a < b ? d : -d), -100, 100);
}
/** @param {Game} g @param {number} f @param {number} d */
export function addInfamy(g, f, d) { if (g.F.inf && f >= 0 && f < rebels(g)) g.F.inf[f] = clamp(g.F.inf[f] + d, 0, 100); }

/* ======================= IA ======================= */
/** Lo que hace un bot con su reino. @param {Geo} geo @param {Game} g @param {number} f */
export function realmAI(geo, g, f) {
  if (!g.F.res) return;
  const act = (/** @type {any} */ a) => { try { govAct(geo, g, a); return true; } catch (e) { return false; } };
  // regiones en cuanto se pueda
  for (const ps of unifyCandidates(geo, g, f)) if (g.F.gold[f] >= unifyCost(ps) + 30) act({type:'unify', f, ps});
  if (!g.F.ruler[f].wed && g.F.gold[f] >= 80) act({type:'casar', f});
  // mercado: vende el grano que sobra y compra caballos o hierro si le faltan y le sobra oro
  const res = g.F.res[f];
  if (canTrade(g, f)) {
    if (res.grano > 80) act({type:'trade', f, k:'grano', n:-20});
    if (res.caballos < 3 && g.F.gold[f] > 150) act({type:'trade', f, k:'caballos', n:4});
    if (res.hierro < 4 && g.F.gold[f] > 150) act({type:'trade', f, k:'hierro', n:5});
    if (res.madera < 6 && g.F.gold[f] > 120) act({type:'trade', f, k:'madera', n:6});
    if (res.grano < 5 && g.F.gold[f] > 60) act({type:'trade', f, k:'grano', n:15});
  }
  // leyes: si una facción poderosa está muy molesta, intenta contentarla
  if (g.turn % 7 === f % 7 && g.F.gold[f] >= 90) {
    const pw = facPower(g, f);
    const worst = [0, 1, 2, 3].sort((a, b) => g.F.fac[f][a] - g.F.fac[f][b])[0];
    if (g.F.fac[f][worst] < 35 && pw[worst] >= 20) {
      for (const k of LAW_KEYS) {
        const o = LAWS[k].opts.findIndex(x => x.likes.includes(worst));
        if (o >= 0 && law(g, f, k) !== o && lawSupport(g, f, k, o) >= 40 && act({type:'law', f, k, opt:o})) break;
      }
    }
  }
}

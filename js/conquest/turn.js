// @ts-check
// Fin de turno: actúan los bots (según la dificultad) y luego el mantenimiento: oro (provincias, comercio,
// tributos y ejército), crecimiento, lealtad, cultura, revueltas, asedios, cansancio de guerra, generales,
// misiones, decisiones, eventos, catástrofes y estaciones. Determinista.
import {int} from '../engine/rng.js';
import {
  WAR, PEACE, PACT, ALLY, FED, COST, TECHS, INF, CAB, ART, MIL, BUILDINGS, DECISIONS, GEN_RETIRE, UNITS,
  clone, counts, rebels, strength, supplied, treasury, growth, cap, odds, battleOdds, autoMix, attackers, lvl, buildingsAt, slots,
  doAction, declareWar, setStatus, relAdd, emit, clamp, eliminate, encode, checkVictory, wouldAccept, generalsOf, generalAt,
  buildCost, unitCost, techCost, shipCost, season, effectOn, provincesOf, RuleError, era, hasWonder, minister, fortified,
  addUnits, removeTroops, applyDecision, friendly, allied, seaReach, maxGenerals, upkeepOf,
} from './engine.js';
import {WONDERS} from './rules.js';

/** @typedef {import('./engine.js').Game} Game */
/** @typedef {import('./engine.js').Geo} Geo */

/** Umbral de probabilidad para que un bot ataque. */
const THRESHOLD = {facil:62, normal:55, dificil:48};
const MAX_ATTACKS = 10;

/**
 * Termina el turno: bots, mantenimiento y paso al siguiente.
 * @param {Geo} geo @param {Game} g0 @returns {{g:Game, ev:any[]}}
 */
export function endTurn(geo, g0) {
  const g = clone(g0); g.log = [];
  runTurn(geo, g);
  return {g, ev:g.log};
}
/** Bots y mantenimiento sobre la partida (sin copiarla). @param {Geo} geo @param {Game} g */
export function runTurn(geo, g) {
  if (g.over) return;
  const R = rebels(g), order = [];
  for (let i = 0; i < R; i++) order.push((i + g.turn * 7) % R);
  for (const f of order) if (g.F.alive[f] && !g.humans.includes(f) && !g.over) aiTurn(geo, g, f);
  if (!g.over) upkeep(geo, g);
}

/* ======================= Multijugador ======================= */
/**
 * Resuelve un turno con las órdenes de todos los humanos: se aplican por jugador, en un orden que rota cada
 * turno; la orden que ya no vale (la provincia cambió de manos, faltan tropas…) se anula y queda apuntada.
 * Luego juegan los bots y llega el mantenimiento. Todos los móviles calculan lo mismo.
 * @param {Geo} geo @param {Game} g0 @param {Record<number, any[]>} orders @param {number[]} [drop] humanos que pasan a ser bots
 * @returns {{g:Game, ev:any[]}}
 */
export function resolveTurn(geo, g0, orders, drop = []) {
  const g = clone(g0); g.log = [];
  if (g.over) return {g, ev:[]};
  if (drop.length) g.humans = g.humans.filter(h => !drop.includes(h));
  const hs = g.humans.filter(f => g.F.alive[f]).sort((a, b) => a - b);
  const r = hs.length ? g.turn % hs.length : 0;
  for (const f of [...hs.slice(r), ...hs.slice(0, r)]) {
    for (const raw of Array.isArray(orders[f]) ? orders[f].slice(0, 300) : []) {
      if (g.over || !g.F.alive[f]) break;
      const a = cleanAction(raw, f);
      try { doAction(geo, g, a); } catch (e) { emit(g, {t:'cancel', f, a, why:e instanceof RuleError ? e.message : 'Orden no válida'}); }
    }
  }
  runTurn(geo, g);
  return {g, ev:g.log};
}
/** Copia limpia de una orden recibida por la red (solo campos conocidos y con su tipo). @param {any} a @param {number} f */
export function cleanAction(a, f) {
  /** @type {any} */ const o = {type:typeof a?.type === 'string' ? a.type.slice(0, 12) : '', f};
  for (const k of ['from', 'to', 'n', 'p', 'd', 'amount', 'i', 'q', 't', 'tac', 's', 'lvl', 'opt', 'id']) if (a?.[k] != null && Number.isFinite(+a[k])) o[k] = Math.floor(+a[k]);
  for (const k of ['b', 'k', 'skill', 'kind']) if (typeof a?.[k] === 'string') o[k] = a[k].slice(0, 16);
  for (const k of ['gen', 'accept']) if (a?.[k] != null) o[k] = !!a[k];
  if (Array.isArray(a?.x) && a.x.length === 2) o.x = [Math.floor(+a.x[0]), Math.floor(+a.x[1])];
  if (Array.isArray(a?.u) && a.u.length === 4) o.u = a.u.map((/** @type {any} */ v) => Math.max(0, Math.floor(+v) || 0));
  return o;
}

/* ======================= IA ======================= */
/** @param {Geo} geo @param {Game} g @param {any} a */
function tryAct(geo, g, a) { try { doAction(geo, g, a); return true; } catch (e) { return false; } }

/** Bandos con los que está en guerra (y los rebeldes). @param {Game} g @param {number} f */
function enemiesOf(g, f) {
  const R = rebels(g), out = new Set([R]);
  for (let x = 0; x < R; x++) if (x !== f && g.F.alive[x] && g.st[f][x] === WAR) out.add(x);
  return out;
}
/** Vecinos (bandos con frontera común). @param {Geo} geo @param {Game} g @param {number} f */
function neighbours(geo, g, f) {
  const s = new Set();
  for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f) for (const q of geo.adj[p]) { const o = g.P.owner[q]; if (o >= 0 && o !== f && o !== rebels(g)) s.add(o); }
  return [...s].sort((a, b) => a - b);
}

/** @param {Geo} geo @param {Game} g @param {number} f */
export function aiTurn(geo, g, f) {
  const diff = g.rules.difficulty;
  aiDiplomacy(geo, g, f, diff);
  aiGovern(geo, g, f, diff);
  aiEconomy(geo, g, f, diff);
  aiAttacks(geo, g, f, diff);
  if (!g.over) aiMoves(geo, g, f);
}

/** @param {Geo} geo @param {Game} g @param {number} f @param {string} diff */
function aiDiplomacy(geo, g, f, diff) {
  const R = rebels(g), act = g.P.active.filter(Boolean).length, c = counts(g.P.owner, R + 1);
  const me = strength(g, f), nb = neighbours(geo, g, f);
  const offered = (/** @type {number} */ to, /** @type {string} */ kind) => g.offers.some(o => o.from === f && o.to === to && o.kind === kind);
  const offer = (/** @type {number} */ to, /** @type {string} */ kind) => { if (!offered(to, kind)) { g.offers.push({from:f, to, kind, turn:g.turn}); emit(g, {t:'offer', a:f, b:to, kind}); } };
  // vasallo que ya es fuerte: se independiza
  const lord = g.F.lord[f];
  if (lord >= 0 && me * 100 > strength(g, lord) * 120 && int(g.rng, 100) < 20) tryAct(geo, g, {type:'diplo', f, d:lord, kind:'independencia'});
  // pedir la paz cuando va perdiendo o está cansado de la guerra
  for (let e = 0; e < R; e++) {
    if (e === f || !g.F.alive[e] || g.st[f][e] !== WAR) continue;
    const losing = me * 100 < strength(g, e) * 70 || g.F.weary[f] >= 60;
    if (!losing && diff === 'dificil') continue;
    if (!losing && !(diff === 'facil' && g.humans.includes(e) && g.rel[f][e] > -60)) continue;
    if (g.humans.includes(e)) { if (int(g.rng, 100) < 35) offer(e, 'paz'); }
    else if (wouldAccept(geo, g, f, e, 'paz').ok) { setStatus(g, f, e, PEACE); emit(g, {t:'accept', a:e, b:f, kind:'paz'}); }
  }
  if (diff === 'facil') return;
  // líder del mapa: coalición
  let leader = -1;
  for (let x = 0; x < R; x++) if (g.F.alive[x] && c[x] * 100 >= act * (diff === 'dificil' ? 30 : 35) && (leader < 0 || c[x] > c[leader])) leader = x;
  if (leader >= 0 && leader !== f && nb.includes(leader) && g.st[f][leader] !== WAR && g.F.lord[f] !== leader && int(g.rng, 100) < 25) declareWar(g, f, leader, 'coalicion');
  if (leader >= 0 && leader !== f && diff === 'dificil') {
    // en guerra total, los que rodean al líder hacen las paces entre sí
    for (const x of nb) if (x !== leader && g.st[f][x] === WAR && g.st[x][leader] === WAR && !g.humans.includes(x) && int(g.rng, 100) < 20) { setStatus(g, f, x, PEACE); emit(g, {t:'accept', a:x, b:f, kind:'paz'}); }
  }
  // vasallos: el fuerte somete al vecino débil (entre bots)
  for (const x of nb) if (!g.humans.includes(x) && g.F.lord[x] < 0 && int(g.rng, 100) < 10 && wouldAccept(geo, g, f, x, 'vasallaje').ok) tryAct(geo, g, {type:'diplo', f, d:x, kind:'vasallaje'});
  // guerras de oportunidad contra vecinos débiles (en difícil, casi cada turno)
  if (int(g.rng, 100) < (diff === 'dificil' ? 30 : 12)) {
    for (const x of nb) {
      if (g.st[f][x] !== PEACE || g.F.lord[x] === f || g.F.lord[f] === x) continue;
      const weak = strength(g, x) * 100 < me * (diff === 'dificil' ? 90 : 60);
      const big = g.humans.includes(x) && c[x] * 100 >= act * 25;
      if ((weak || big) && g.rel[f][x] < 10) { declareWar(g, f, x, weak ? 'debil' : 'amenaza'); break; }
    }
  }
  // embargo al enemigo que más le preocupa
  for (const x of nb) if (g.st[f][x] === WAR && !g.embargo.some(e => e.a === f && e.b === x) && int(g.rng, 100) < 5) tryAct(geo, g, {type:'diplo', f, d:x, kind:'embargo'});
  if (diff !== 'normal') return;
  // pactos con vecinos fuertes, bodas y alianzas con quien comparte enemigo
  for (const x of nb) {
    if (g.st[f][x] !== PEACE || g.rel[f][x] < 0) continue;
    if (strength(g, x) * 100 > me * 130 && int(g.rng, 100) < 15) {
      if (g.humans.includes(x)) offer(x, 'pacto');
      else if (wouldAccept(geo, g, f, x, 'pacto').ok) { setStatus(g, f, x, PACT, g.turn + 10); emit(g, {t:'accept', a:x, b:f, kind:'pacto'}); }
    } else if (g.rel[f][x] >= 25 && int(g.rng, 100) < 4) {
      if (g.humans.includes(x)) offer(x, 'boda'); else tryAct(geo, g, {type:'diplo', f, d:x, kind:'boda'});
    }
  }
  for (let x = 0; x < R; x++) {
    if (x === f || !g.F.alive[x] || g.humans.includes(x) || g.st[f][x] === WAR) continue;
    if (g.st[f][x] === ALLY) { if (int(g.rng, 100) < 4 && wouldAccept(geo, g, f, x, 'federacion').ok) tryAct(geo, g, {type:'diplo', f, d:x, kind:'federacion'}); continue; }
    if (g.st[f][x] === FED) continue;
    if (wouldAccept(geo, g, f, x, 'alianza').ok && int(g.rng, 100) < 20) { setStatus(g, f, x, ALLY); emit(g, {t:'accept', a:x, b:f, kind:'alianza'}); }
  }
  // exigir tributo o vasallaje a un humano débil y vecino
  for (const h of g.humans) if (nb.includes(h) && g.F.alive[h] && g.st[f][h] === PEACE && me >= 3 * strength(g, h) && int(g.rng, 100) < 8) offer(h, int(g.rng, 3) === 0 ? 'vasallaje' : 'tributo');
}

/** Impuestos, posturas y ministros. @param {Geo} geo @param {Game} g @param {number} f @param {string} diff */
function aiGovern(geo, g, f, diff) {
  const hostile = enemiesOf(g, f);
  for (const p of provincesOf(g, f)) {
    const front = geo.adj[p].some(q => g.P.owner[q] >= 0 && g.P.owner[q] !== f && hostile.has(g.P.owner[q]));
    // impuestos: altos en el interior leal, bajos donde la lealtad flojea
    const tax = g.P.loyal[p] < 45 ? 0 : !front && g.P.loyal[p] >= 85 && diff !== 'facil' ? 2 : 1;
    if (g.P.tax[p] !== tax) tryAct(geo, g, {type:'tax', f, p, lvl:tax});
    // postura: según lo que tiene enfrente
    if (front && (g.turn + p) % 4 === 0) {
      let cab = 0, art = 0, tot = 0;
      for (const q of geo.adj[p]) if (hostile.has(g.P.owner[q]) && g.P.owner[q] >= 0) { const u = g.P.u[q]; cab += u[CAB]; art += u[ART]; tot += u[0] + u[1] + u[2]; }
      const s = art * 4 >= tot && art > 0 ? 3 : cab * 3 >= tot && cab > 0 ? 2 : 1 + int(g.rng, 3);
      if (g.P.stance[p] !== s) tryAct(geo, g, {type:'stance', f, p, s});
    }
  }
  // un ministro que no sirve se cambia de vez en cuando
  if (g.F.gold[f] > 160 && int(g.rng, 100) < 3) tryAct(geo, g, {type:'minister', f, k:['guerra', 'hacienda', 'diplomacia'][int(g.rng, 3)]});
}

/** Qué construir en una provincia (por orden de preferencia). @param {Geo} geo @param {Game} g @param {number} f @param {number} p @param {boolean} front */
function wants(geo, g, f, p, front) {
  const out = /** @type {string[]} */ ([]), capital = g.F.capital[f] === p;
  if (capital) out.push('cuartel', 'mercado');
  if (front) out.push(capital ? 'muralla' : 'fortaleza', 'torre');
  if (g.P.loyal[p] < 50) out.push('catedral');
  if (geo.coast[p]) out.push('puerto');
  if (geo.coast[p] && era(g, f) >= 1 && geo.tier[p] >= 3 && !provincesOf(g, f).some(q => lvl(g, q, 'astillero') > 0)) out.push('astillero');
  if (geo.terrain[p] !== 'l') out.push('mina');
  if (geo.tier[p] >= 4) out.push('mercado');
  out.push('granja');
  if (capital && era(g, f) >= 1) out.push('universidad');
  if (front && era(g, f) >= 2) out.push('hospital');
  if (geo.coast[p] && era(g, f) >= 1 && geo.tier[p] >= 3) out.push('astillero');
  out.push('caminos', 'mercado');
  return out;
}
/** @param {Geo} geo @param {Game} g @param {number} f @param {string} diff */
function aiEconomy(geo, g, f, diff) {
  const mine = provincesOf(g, f), capital = g.F.capital[f];
  const hostile = enemiesOf(g, f);
  const threat = (/** @type {number} */ p) => geo.adj[p].reduce((s, q) => s + (g.P.owner[q] >= 0 && g.P.owner[q] !== f && (hostile.has(g.P.owner[q]) || diff !== 'facil') ? g.P.troops[q] : 0), 0);
  const isFront = (/** @type {number} */ p) => geo.adj[p].some(q => g.P.owner[q] >= 0 && g.P.owner[q] !== f && hostile.has(g.P.owner[q]));
  const gross = treasury(geo, g, f), upk = gross.upkeep;
  const canPay = (/** @type {number} */ extra) => upk + extra <= Math.max(4, Math.floor((gross.provinces + gross.trade + gross.tribute) * 60 / 100));
  // mejoras
  if (diff !== 'facil') {
    const order = [1, 0, 3, 2];
    for (const k of order) { const lv = g.F.tech[f][k]; if (lv < 3 && g.F.gold[f] >= techCost(g, f, lv) + 40) { tryAct(geo, g, {type:'research', f, k:TECHS[k]}); break; } }
  }
  // maravilla: si tiene el sitio y le sobra el oro
  if (diff !== 'facil') for (const p of mine) {
    const w = geo.wonderSite[p];
    if (w && !g.P.wonder[p] && g.F.gold[f] >= /** @type {Record<string, {cost:number}>} */ (WONDERS)[w].cost + 60) { tryAct(geo, g, {type:'wonder', f, p}); break; }
  }
  // edificios: uno o dos por turno, donde más rinden
  let built = 0;
  const front = mine.filter(p => threat(p) > 0).sort((a, b) => threat(b) - threat(a));
  const plan = [...(capital >= 0 ? [capital] : []), ...front.slice(0, 2), ...mine.slice().sort((a, b) => geo.tier[b] - geo.tier[a])];
  for (const p of plan) {
    if (built >= (diff === 'dificil' ? 2 : 1)) break;
    for (const b of wants(geo, g, f, p, isFront(p))) {
      const info = BUILDINGS[/** @type {import('./rules.js').Building} */ (b)];
      if (lvl(g, p, b) >= info.max) continue;
      if (lvl(g, p, b) === 0 && buildingsAt(g, p).length >= slots(geo, g, p)) continue;
      if (g.F.gold[f] < buildCost(geo, g, f, p, b) + 15) continue;
      if (tryAct(geo, g, {type:'build', f, p, b})) { built++; break; }
    }
  }
  // generales (difícil)
  if (diff === 'dificil' && generalsOf(g, f).length < Math.min(2, maxGenerals(g, f)) && g.F.gold[f] >= COST.general + 30 && front[0] !== undefined)
    tryAct(geo, g, {type:'hire', f, p:front[0], skill:'asedio'});
  // flota: con astillero y oro de sobra
  if (era(g, f) >= 1 && g.F.ships[f] < 8 && g.F.gold[f] >= shipCost(g, f) * 2 + 40) {
    const yard = mine.find(p => lvl(g, p, 'astillero') > 0);
    if (yard !== undefined && canPay(2)) tryAct(geo, g, {type:'ships', f, p:yard, n:2});
  }
  const sup = supplied(geo, g, f);
  const room = (/** @type {number} */ p) => Math.max(0, 2 * cap(geo, g, p) - g.P.troops[p]);
  // preparar un ataque: reclutar junto al objetivo más débil con el que está en guerra, con la tropa que conviene
  if (diff !== 'facil' || [...hostile].some(h => g.humans.includes(h))) {
    let best = null, bestR = 0;
    for (const p of mine) {
      if (!sup[p]) continue;
      for (const q of geo.adj[p]) {
        const d = g.P.owner[q];
        if (d < 0 || d === f || !hostile.has(d) || !g.P.active[q]) continue;
        const ratio = g.P.troops[p] * 100 / Math.max(1, g.P.troops[q]);
        if (ratio > bestR) { bestR = ratio; best = {p, q}; }
      }
    }
    if (best && canPay(2)) {
      const u = g.P.u[best.p], atk = u[INF] + u[CAB] + u[ART];
      const special = fortified(g, best.q) && era(g, f) >= 1 ? ART : geo.terrain[best.q] === 'l' ? CAB : -1;
      const t = special >= 0 && u[special] * 3 < atk + 3 ? special : INF;
      const price = unitCost(geo, g, f, best.p, t);
      const need = Math.ceil(g.P.troops[best.q] * 13 / 10) - atk + 2;
      const n = Math.min(COST.maxRecruit, room(best.p), Math.floor((g.F.gold[f] - 5) / price), Math.max(t === INF ? 0 : 3, need));
      if (n > 0) tryAct(geo, g, {type:'recruit', f, p:best.p, n, t});
    }
  }
  // defender los dos frentes más amenazados si están en clara desventaja: milicia si el mantenimiento aprieta
  for (const p of front.slice(0, 2)) {
    if (g.F.gold[f] < 14 || !sup[p]) continue;
    const top = geo.adj[p].reduce((m, q) => Math.max(m, g.P.owner[q] >= 0 && hostile.has(g.P.owner[q]) ? g.P.troops[q] : 0), 0);
    if (g.P.troops[p] * 10 >= top * 8) continue;
    const t = canPay(2) ? INF : MIL, price = unitCost(geo, g, f, p, t);
    const n = Math.min(6, room(p), Math.floor((g.F.gold[f] - 10) / price), top - g.P.troops[p] + 2);
    if (n > 0) tryAct(geo, g, {type:'recruit', f, p, n, t});
  }
}

/** @param {Geo} geo @param {Game} g @param {number} f @param {string} diff */
function aiAttacks(geo, g, f, diff) {
  const th = THRESHOLD[/** @type {'facil'} */ (diff)] / 100;
  const c = counts(g.P.owner, rebels(g) + 1);
  const known = (/** @type {number} */ p) => g.intel.some(i => i.f === f && i.p === p && i.until >= g.turn);
  for (let k = 0; k < MAX_ATTACKS && !g.over; k++) {
    const hostile = enemiesOf(g, f);
    let best = null, bestV = 0;
    for (let from = 0; from < geo.n; from++) {
      if (g.P.owner[from] !== f || g.P.ready[from] < 3) continue;
      for (const to of geo.adj[from]) {
        const d = g.P.owner[to];
        if (d < 0 || d === f || !g.P.active[to] || !hostile.has(d)) continue;
        // reserva: la mitad del vecino hostil más fuerte (aparte del objetivo)
        const other = geo.adj[from].reduce((m, q) => Math.max(m, q !== to && g.P.owner[q] >= 0 && hostile.has(g.P.owner[q]) ? g.P.troops[q] : 0), 0);
        const keep = Math.max(1, Math.floor(other / (diff === 'dificil' ? 3 : 2)));
        const n = Math.min(g.P.ready[from], attackers(g, from), g.P.troops[from] - keep);
        if (n < 2) continue;
        const vec = autoMix(geo, g, from, to, n);
        // la táctica: la mejor sin saber la postura (salvo que la haya espiado)
        const stance = g.P.stance[to];
        if (!known(to)) g.P.stance[to] = 0;
        let bt = 0, bp = -1;
        for (let tac = 0; tac < 3; tac++) { const o = battleOdds(geo, g, f, from, to, vec, {tac}); if (o.p > bp) { bp = o.p; bt = tac; } }
        g.P.stance[to] = stance;
        if (bp < th) {
          // murallas: mejor asediar
          if (lvl(g, to, 'muralla') > 0 && attackers(g, from) >= 5 && !g.sieges.some(s => s.f === f && s.p === to) && int(g.rng, 100) < 40) tryAct(geo, g, {type:'siege', f, from, to});
          continue;
        }
        let v = bp * (1 + geo.tier[to] / 6);
        if (d >= 0 && g.F.capital[d] === to) v *= 1.6;
        if (d >= 0 && c[d] === 1) v *= 1.3;
        if (v > bestV) { bestV = v; best = {from, to, u:vec, tac:bt}; }
      }
    }
    if (!best) break;
    if (!tryAct(geo, g, {type:'attack', f, from:best.from, to:best.to, u:best.u, tac:best.tac})) break;
  }
  // desembarcos: con barcos, contra una costa enemiga débil
  if (g.F.ships[f] >= 2 && !g.over && int(g.rng, 100) < 40) {
    const hostile = enemiesOf(g, f);
    for (const from of provincesOf(g, f)) {
      if (!(lvl(g, from, 'puerto') > 0 || lvl(g, from, 'astillero') > 0) || g.P.ready[from] < 4) continue;
      for (let to = 0; to < geo.n; to++) {
        const d = g.P.owner[to];
        if (d < 0 || d === f || !hostile.has(d) || !g.P.active[to] || !seaReach(geo, from, to)) continue;
        const n = Math.min(g.F.ships[f] * 5, g.P.ready[from], attackers(g, from), g.P.troops[from] - 2);
        if (n < 3) continue;
        const o = battleOdds(geo, g, f, from, to, autoMix(geo, g, from, to, n), {naval:true});
        if (o.p >= th + .1) { tryAct(geo, g, {type:'naval', f, from, to, n}); return; }
      }
    }
  }
}

/** Mueve tropas del interior hacia el frente (un paso). @param {Geo} geo @param {Game} g @param {number} f */
function aiMoves(geo, g, f) {
  const hostile = enemiesOf(g, f);
  const isFront = (/** @type {number} */ p) => geo.adj[p].some(q => g.P.owner[q] >= 0 && g.P.owner[q] !== f && (hostile.has(g.P.owner[q]) || g.st[f][g.P.owner[q]] === PEACE));
  // distancia al frente por territorio propio
  const dist = new Array(geo.n).fill(Infinity), q = [];
  for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f && isFront(p)) { dist[p] = 0; q.push(p); }
  while (q.length) { const p = /** @type {number} */ (q.shift()); for (const r of geo.adj[p]) if (g.P.owner[r] === f && dist[r] === Infinity) { dist[r] = dist[p] + 1; q.push(r); } }
  for (let p = 0; p < geo.n; p++) {
    if (g.P.owner[p] !== f || dist[p] === 0 || dist[p] === Infinity) continue;
    const n = Math.min(g.P.ready[p], g.P.troops[p] - 1);
    if (n < 2) continue;
    const to = geo.adj[p].filter(r => g.P.owner[r] === f && dist[r] < dist[p]).sort((a, b) => dist[a] - dist[b] || a - b)[0];
    if (to !== undefined) tryAct(geo, g, {type:'move', f, from:p, to, n, gen:true});
  }
}

/* ======================= Mantenimiento ======================= */
/** Sucesos aleatorios: [clave, estación preferida o -1, peso]. */
/** @type {[string, number, number][]} */
const EVENTS = [['sequia', 1, 3], ['revuelta', -1, 2], ['fiestas', -1, 2], ['plaga', -1, 1], ['desertores', -1, 1], ['mercaderes', -1, 2], ['voluntarios', -1, 2], ['nevada', 3, 3]];
/** Catástrofes regionales: las provincias que pueden sufrirlas (por INE). */
const CATASTROPHES = {
  riada:['26', '31', '50', '09', '43', '44', '22'],
  sequia:['02', '13', '16', '19', '45'],
  incendio:[],
  terremoto:['18', '30', '04', '29'],
};

/** @param {Geo} geo @param {Game} g */
function upkeep(geo, g) {
  const R = rebels(g), nf = R;
  // decisiones sin contestar: la opción por defecto
  for (const d of g.decisions.filter(x => x.until <= g.turn)) { g.decisions = g.decisions.filter(x => x !== d); applyDecision(geo, g, d, 99, g.rng); }
  // pactos y bodas que vencen
  for (let a = 0; a < nf; a++) for (let b = a + 1; b < nf; b++) if (g.st[a][b] === PACT && g.until[a][b] <= g.turn) { setStatus(g, a, b, PEACE); emit(g, {t:'pactend', a, b}); }
  g.weds = g.weds.filter(w => w.until > g.turn);
  // oro: provincias, comercio, tributos y mantenimiento; si no llega, desertan tropas
  const books = [];
  for (let f = 0; f < nf; f++) books.push(g.F.alive[f] ? treasury(geo, g, f).total : 0);
  for (let f = 0; f < nf; f++) {
    if (!g.F.alive[f]) continue;
    g.F.gold[f] += books[f];
    if (g.F.gold[f] < 0) {
      g.F.gold[f] = 0;
      const ps = provincesOf(g, f).sort((a, b) => g.P.troops[b] - g.P.troops[a] || a - b).slice(0, 3);
      let lost = 0;
      for (const p of ps) { const v = Math.max(1, Math.floor(g.P.troops[p] * 15 / 100)); if (g.P.troops[p] > v) { removeTroops(g, p, v); lost += v; } }
      if (lost) emit(g, {t:'bancarrota', f, v:lost});
    }
  }
  // crecimiento (infantería)
  const sup = new Map();
  for (let p = 0; p < geo.n; p++) {
    const f = g.P.owner[p]; if (f < 0) continue;
    if (f === R) { if (g.P.troops[p] < 8) addUnits(g, p, INF, 1); continue; }
    if (!sup.has(f)) sup.set(f, supplied(geo, g, f));
    const gr = growth(geo, g, p, sup.get(f)), top = cap(geo, g, p);
    if (g.P.troops[p] < top) addUnits(g, p, INF, Math.min(gr, top - g.P.troops[p]));
  }
  // lealtad, cultura y revueltas
  for (let p = 0; p < geo.n; p++) {
    const f = g.P.owner[p]; if (f < 0 || f === R) continue;
    const foreign = g.P.cult[p] !== g.F.cult[f];
    let up = 5 + (g.P.troops[p] >= 5 ? 5 : 0) + (g.F.trait[f] === 'guardian' ? 5 : 0) + 5 * lvl(g, p, 'catedral') + (hasWonder(g, f, 'mezquita') ? 3 : 0);
    up += /** @type {number} */ ([4, 0, minister(g, f, 'hacienda', 'austero') ? -3 : -6][g.P.tax[p] ?? 1]);
    up -= (foreign ? 3 : 0) + Math.floor(g.F.weary[f] / 25);
    if (g.gens.some(x => x.f === f && x.skills.includes('carisma') && (x.p === p || geo.adj[p].includes(x.p)))) up += 10;
    g.P.loyal[p] = clamp(g.P.loyal[p] + up, 0, 100);
    if (foreign) {
      g.P.assim[p] += hasWonder(g, f, 'mezquita') ? 2 : 1;
      if (g.P.assim[p] >= 24) { g.P.cult[p] = g.F.cult[f]; g.P.assim[p] = 0; emit(g, {t:'assim', f, p}); }
    } else g.P.assim[p] = 0;
    const calm = lvl(g, p, 'catedral') >= 2 || hasWonder(g, f, 'merida');
    if (!calm && g.F.capital[f] !== p && g.P.loyal[p] < 20 && g.P.troops[p] < 3 && int(g.rng, 100) < 30) {
      const o = g.P.origin[p], to = o >= 0 && o !== f && g.F.alive[o] ? o : R;
      g.P.owner[p] = to; g.P.u[p] = [4, 0, 0, 0]; g.P.troops[p] = 4; g.P.loyal[p] = 50; g.P.stance[p] = 0; g.P.tax[p] = 1;
      g.gens = g.gens.filter(x => x.p !== p);
      emit(g, {t:'revolt', p, from:f, to});
      if (g.F.capital[f] === p) g.F.capital[f] = -1;
      if (!g.P.owner.includes(f)) eliminate(g, f, to);
    }
  }
  // asedios: brecha en las murallas y hambre dentro
  g.sieges = g.sieges.filter(s => g.P.owner[s.from] === s.f && attackers(g, s.from) >= 5 && g.P.owner[s.p] >= 0 && g.P.owner[s.p] !== s.f && (g.P.owner[s.p] === R || g.st[s.f][g.P.owner[s.p]] === WAR));
  for (const s of g.sieges) {
    s.breach += 1 + (g.P.u[s.from][ART] >= 3 ? 1 : 0) + (minister(g, s.f, 'guerra', 'ingeniero') ? 1 : 0);
    const v = Math.max(g.P.troops[s.p] > 1 ? 1 : 0, Math.floor(g.P.troops[s.p] * 10 / 100));
    if (v) removeTroops(g, s.p, v);
    g.P.loyal[s.p] = Math.max(0, g.P.loyal[s.p] - 10);
    emit(g, {t:'siegeup', f:s.f, p:s.p, breach:s.breach, v});
  }
  // cansancio de guerra
  for (let f = 0; f < nf; f++) {
    if (!g.F.alive[f]) continue;
    let wars = 0; for (let x = 0; x < nf; x++) if (x !== f && g.F.alive[x] && g.st[f][x] === WAR) wars++;
    g.F.weary[f] = clamp(g.F.weary[f] + (wars ? 2 * Math.min(3, wars) : -4), 0, 100);
  }
  // relaciones
  for (let a = 0; a < nf; a++) for (let b = a + 1; b < nf; b++) {
    if (!g.F.alive[a] || !g.F.alive[b]) continue;
    const s = g.st[a][b];
    let d = g.rel[a][b] > 0 ? -1 : g.rel[a][b] < 0 ? 1 : 0;
    if (s === WAR) d = -1; else if (allied(s) || g.weds.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a))) d = 1;
    relAdd(g, a, b, d);
  }
  // generales: envejecen y se retiran
  for (const x of [...g.gens]) { x.age++; if (x.age >= GEN_RETIRE) { g.gens = g.gens.filter(y => y !== x); emit(g, {t:'retire', f:x.f, id:x.id, name:x.name}); } }
  // eventos, catástrofes y decisiones
  if (g.rules.events && int(g.rng, 100) < 35) randomEvent(geo, g);
  if (g.rules.events && int(g.rng, 100) < 6) catastrophe(geo, g);
  if (g.rules.events) for (const h of g.humans) if (g.F.alive[h] && !g.decisions.some(x => x.f === h) && int(g.rng, 100) < 22) newDecision(geo, g, h);
  missions(geo, g);
  g.fx = g.fx.filter(e => e.until > g.turn);
  g.intel = g.intel.filter(e => e.until > g.turn);
  g.offers = g.offers.filter(o => o.turn >= g.turn - 1);
  // siguiente turno
  const s0 = season(g);
  g.turn++;
  g.P.ready = [...g.P.troops];
  if (g.rules.seasons && season(g) !== s0) emit(g, {t:'season', s:season(g)});
  const c = counts(g.P.owner, R + 1);
  for (let f = 0; f < nf; f++) g.stats.peak[f] = Math.max(g.stats.peak[f], c[f]);
  g.hist.push(encode(g));
  checkVictory(geo, g);
}

/** @param {Geo} geo @param {Game} g */
function randomEvent(geo, g) {
  const R = rebels(g), s = season(g);
  const pool = EVENTS.filter(([, se]) => se < 0 || !g.rules.seasons || se === s);
  const total = pool.reduce((t, e) => t + /** @type {number} */ (e[2]), 0);
  let r = int(g.rng, total), kind = /** @type {string} */ (pool[0][0]);
  for (const [k, , w] of pool) { if (r < /** @type {number} */ (w)) { kind = /** @type {string} */ (k); break; } r -= /** @type {number} */ (w); }
  const owned = [];
  for (let p = 0; p < geo.n; p++) if (g.P.owner[p] >= 0 && g.P.owner[p] !== R) owned.push(p);
  const alive = []; for (let f = 0; f < R; f++) if (g.F.alive[f]) alive.push(f);
  if (!owned.length || !alive.length) return;
  const pick = (/** @type {number[]} */ arr) => arr[int(g.rng, arr.length)];
  switch (kind) {
    case 'sequia': { const p = pick(owned); g.fx.push({kind, p, f:g.P.owner[p], until:g.turn + 2}); emit(g, {t:'event', kind, p, f:g.P.owner[p]}); break; }
    case 'revuelta': {
      const cand = owned.filter(p => g.P.loyal[p] < 70 && g.F.capital[g.P.owner[p]] !== p); if (!cand.length) return;
      const p = pick(cand); g.P.loyal[p] = Math.max(0, g.P.loyal[p] - 30); emit(g, {t:'event', kind, p, f:g.P.owner[p]}); break;
    }
    case 'fiestas': { const f = pick(alive); g.F.morale[f] = clamp(g.F.morale[f] + 5, 50, 200); emit(g, {t:'event', kind, f}); break; }
    case 'plaga': {
      const cand = owned.filter(p => g.P.troops[p] >= 8); if (!cand.length) return;
      const p = pick(cand), v = Math.floor(g.P.troops[p] * 30 / 100); removeTroops(g, p, v); g.P.ready[p] = Math.min(g.P.ready[p], g.P.troops[p]);
      emit(g, {t:'event', kind, p, f:g.P.owner[p], v}); break;
    }
    case 'desertores': {
      const f = pick(alive), ps = provincesOf(g, f); if (!ps.length) return;
      const p = ps.reduce((a, b) => g.P.troops[b] > g.P.troops[a] ? b : a), v = Math.floor(g.P.troops[p] * 20 / 100);
      removeTroops(g, p, v); g.P.ready[p] = Math.min(g.P.ready[p], g.P.troops[p]); emit(g, {t:'event', kind, p, f, v}); break;
    }
    case 'mercaderes': { const f = pick(alive); g.F.gold[f] += 30; emit(g, {t:'event', kind, f, v:30}); break; }
    case 'voluntarios': { const p = pick(owned); addUnits(g, p, MIL, 5); emit(g, {t:'event', kind, p, f:g.P.owner[p], v:5}); break; }
    case 'nevada': {
      const cand = owned.filter(p => geo.terrain[p] === 'm'); if (!cand.length) return;
      const p = pick(cand); g.fx.push({kind, p, f:g.P.owner[p], until:g.turn + 1}); emit(g, {t:'event', kind, p, f:g.P.owner[p]}); break;
    }
  }
}

/** Catástrofe regional: riada del Ebro, sequía en La Mancha, incendio en la sierra o terremoto en el sureste. @param {Geo} geo @param {Game} g */
function catastrophe(geo, g) {
  const kinds = /** @type {(keyof typeof CATASTROPHES)[]} */ (Object.keys(CATASTROPHES)), kind = kinds[int(g.rng, kinds.length)];
  let ps = kind === 'incendio' ? [] : geo.ine.flatMap((i, p) => CATASTROPHES[kind].includes(i) && g.P.active[p] ? [p] : []);
  if (kind === 'incendio') { const c = geo.ine.flatMap((_, p) => geo.terrain[p] !== 'l' && g.P.active[p] && g.P.owner[p] >= 0 ? [p] : []); if (c.length) ps = [c[int(g.rng, c.length)]]; }
  if (!ps.length) return;
  const fxKind = kind === 'riada' ? 'riada' : kind === 'sequia' ? 'sequia' : kind;
  for (const p of ps) {
    g.fx.push({kind:fxKind, p, f:g.P.owner[p], until:g.turn + 2});
    if (kind === 'incendio' || kind === 'terremoto') {
      if (g.P.troops[p] > 2) removeTroops(g, p, Math.floor(g.P.troops[p] * (kind === 'incendio' ? 30 : 20) / 100));
      const bs = buildingsAt(g, p);
      if (bs.length && int(g.rng, 100) < 60) { const [b, l] = bs[int(g.rng, bs.length)]; g.P.bld[p] = {...g.P.bld[p], [b]:l - 1}; }
    }
  }
  emit(g, {t:'catastrofe', kind, p:ps[0], ps});
}

/** Una decisión para un humano. @param {Geo} geo @param {Game} g @param {number} f */
function newDecision(geo, g, f) {
  const own = provincesOf(g, f); if (!own.length) return;
  const kinds = /** @type {string[]} */ (Object.keys(DECISIONS)).filter(k => k !== 'plata' || own.some(p => geo.terrain[p] !== 'l'));
  const kind = kinds[int(g.rng, kinds.length)];
  const cand = kind === 'plata' ? own.filter(p => geo.terrain[p] !== 'l') : kind === 'revuelta' ? own.filter(p => g.F.capital[f] !== p) : own;
  const p = (cand.length ? cand : own)[int(g.rng, (cand.length ? cand : own).length)];
  const d = {id:++g.decSeq, f, kind, p, until:g.turn + 1};
  g.decisions.push(d);
  emit(g, {t:'decision', f, id:d.id, kind, p});
}

/** Misiones de los humanos: se comprueban y, si no hay ninguna, a veces llega otra. @param {Geo} geo @param {Game} g */
function missions(geo, g) {
  const built = (/** @type {number} */ f) => provincesOf(g, f).reduce((s, p) => s + buildingsAt(g, p).reduce((a, [, l]) => a + l, 0), 0);
  const friends = (/** @type {number} */ f) => g.st[f].filter((s, x) => x !== f && friendly(s)).length + g.weds.filter(w => w.a === f || w.b === f).length;
  const army = (/** @type {number} */ f) => provincesOf(g, f).reduce((s, p) => s + g.P.troops[p], 0);
  for (const m of [...g.missions]) {
    const f = m.f;
    const done = m.kind === 'conquistar' ? g.P.owner[m.p] === f : m.kind === 'construir' ? built(f) - m.base >= m.n
      : m.kind === 'pacto' ? friends(f) > m.base : m.kind === 'ejercito' ? army(f) >= m.n : g.F.gold[f] >= m.n;
    if (done) { g.F.gold[f] += m.reward; g.F.morale[f] = clamp(g.F.morale[f] + 3, 50, 200); g.missions = g.missions.filter(x => x !== m); emit(g, {t:'mission', f, kind:m.kind, ok:true, reward:m.reward}); }
    else if (g.turn >= m.until) { g.missions = g.missions.filter(x => x !== m); emit(g, {t:'mission', f, kind:m.kind, ok:false}); }
  }
  for (const f of g.humans) {
    if (!g.F.alive[f] || g.missions.some(m => m.f === f) || g.turn < 3 || int(g.rng, 100) >= 35) continue;
    const targets = provincesOf(g, f).flatMap(p => geo.adj[p].filter(q => g.P.active[q] && g.P.owner[q] >= 0 && g.P.owner[q] !== f)).sort((a, b) => a - b);
    const kinds = ['construir', 'ejercito', 'ahorro', ...(targets.length ? ['conquistar', 'conquistar'] : []), ...(friends(f) < 3 ? ['pacto'] : [])];
    const kind = kinds[int(g.rng, kinds.length)];
    const p = kind === 'conquistar' ? targets[int(g.rng, targets.length)] : -1;
    const n = kind === 'construir' ? 2 : kind === 'ejercito' ? Math.ceil(army(f) * 13 / 10 / 5) * 5 : kind === 'ahorro' ? Math.max(100, Math.ceil(g.F.gold[f] * 3 / 2 / 10) * 10) : 0;
    const base = kind === 'construir' ? built(f) : kind === 'pacto' ? friends(f) : 0;
    const reward = kind === 'conquistar' ? 40 + 10 * geo.tier[p] : kind === 'construir' ? 40 : kind === 'pacto' ? 35 : 30;
    g.missions.push({f, kind, p, n, base, until:g.turn + (kind === 'conquistar' ? 6 : 5), reward});
    emit(g, {t:'newmission', f, kind, p, n});
  }
}

export {enemiesOf, neighbours};
void UNITS; void effectOn; void PEACE;

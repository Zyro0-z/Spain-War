// @ts-check
// Fin de turno: actúan los bots (según la dificultad) y luego el mantenimiento: oro, crecimiento de tropas,
// lealtad y rebeliones, relaciones, eventos y estaciones. Determinista.
import {int} from '../engine/rng.js';
import {
  WAR, PEACE, PACT, ALLY, COST, TECHS, clone, counts, rebels, strength, supplied, income, growth, cap, odds,
  doAction, declareWar, setStatus, relAdd, emit, clamp, eliminate, encode, checkVictory, wouldAccept, generalsOf,
  buildCost, season, effectOn, provincesOf,
} from './engine.js';

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
  if (g.over) return {g, ev:[]};
  const R = rebels(g), order = [];
  for (let i = 0; i < R; i++) order.push((i + g.turn * 7) % R);
  for (const f of order) if (g.F.alive[f] && !g.humans.includes(f) && !g.over) aiTurn(geo, g, f);
  if (!g.over) upkeep(geo, g);
  return {g, ev:g.log};
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
  // pedir la paz cuando va perdiendo
  for (let e = 0; e < R; e++) {
    if (e === f || !g.F.alive[e] || g.st[f][e] !== WAR) continue;
    const losing = me * 100 < strength(g, e) * 70;
    if (!losing && diff === 'dificil') continue;
    if (!losing && !(diff === 'facil' && g.humans.includes(e) && g.rel[f][e] > -60)) continue;
    if (g.humans.includes(e)) { if (int(g.rng, 100) < 35) offer(e, 'paz'); }
    else if (wouldAccept(geo, g, f, e, 'paz').ok) { setStatus(g, f, e, PEACE); emit(g, {t:'accept', a:e, b:f, kind:'paz'}); }
  }
  if (diff === 'facil') return;
  // líder del mapa: coalición
  let leader = -1;
  for (let x = 0; x < R; x++) if (g.F.alive[x] && c[x] * 100 >= act * (diff === 'dificil' ? 30 : 35) && (leader < 0 || c[x] > c[leader])) leader = x;
  if (leader >= 0 && leader !== f && nb.includes(leader) && g.st[f][leader] !== WAR && int(g.rng, 100) < 25) declareWar(g, f, leader, 'coalicion');
  if (leader >= 0 && leader !== f && diff === 'dificil') {
    // en guerra total, los que rodean al líder hacen las paces entre sí
    for (const x of nb) if (x !== leader && g.st[f][x] === WAR && g.st[x][leader] === WAR && !g.humans.includes(x) && int(g.rng, 100) < 20) { setStatus(g, f, x, PEACE); emit(g, {t:'accept', a:x, b:f, kind:'paz'}); }
  }
  // guerras de oportunidad contra vecinos débiles (en difícil, casi cada turno)
  if (int(g.rng, 100) < (diff === 'dificil' ? 30 : 12)) {
    for (const x of nb) {
      if (g.st[f][x] !== PEACE) continue;
      const weak = strength(g, x) * 100 < me * (diff === 'dificil' ? 90 : 60);
      const big = g.humans.includes(x) && c[x] * 100 >= act * 25;
      if ((weak || big) && g.rel[f][x] < 10) { declareWar(g, f, x, weak ? 'debil' : 'amenaza'); break; }
    }
  }
  if (diff !== 'normal') return;
  // pactos con vecinos fuertes y alianzas con quien comparte enemigo
  for (const x of nb) {
    if (g.st[f][x] !== PEACE || g.rel[f][x] < 0) continue;
    if (strength(g, x) * 100 > me * 130 && int(g.rng, 100) < 15) {
      if (g.humans.includes(x)) offer(x, 'pacto');
      else if (wouldAccept(geo, g, f, x, 'pacto').ok) { setStatus(g, f, x, PACT, g.turn + 10); emit(g, {t:'accept', a:x, b:f, kind:'pacto'}); }
    }
  }
  for (let x = 0; x < R; x++) {
    if (x === f || !g.F.alive[x] || g.humans.includes(x) || g.st[f][x] === WAR || g.st[f][x] === ALLY) continue;
    if (wouldAccept(geo, g, f, x, 'alianza').ok && int(g.rng, 100) < 20) { setStatus(g, f, x, ALLY); emit(g, {t:'accept', a:x, b:f, kind:'alianza'}); }
  }
  // exigir tributo a un humano débil y vecino
  for (const h of g.humans) if (nb.includes(h) && g.F.alive[h] && g.st[f][h] === PEACE && me >= 3 * strength(g, h) && int(g.rng, 100) < 8) offer(h, 'tributo');
}

/** @param {Geo} geo @param {Game} g @param {number} f @param {string} diff */
function aiEconomy(geo, g, f, diff) {
  const mine = provincesOf(g, f), capital = g.F.capital[f];
  const hostile = enemiesOf(g, f);
  const threat = (/** @type {number} */ p) => geo.adj[p].reduce((s, q) => s + (g.P.owner[q] >= 0 && g.P.owner[q] !== f && (hostile.has(g.P.owner[q]) || diff !== 'facil') ? g.P.troops[q] : 0), 0);
  // mejoras
  if (diff !== 'facil') {
    const order = [1, 0, 3, 2];
    for (const k of order) { const lvl = g.F.tech[f][k]; if (lvl < 3 && g.F.gold[f] >= COST.tech[lvl] + 40) { tryAct(geo, g, {type:'research', f, k:TECHS[k]}); break; } }
  }
  // un edificio por turno
  const want = /** @type {[number, import('./engine.js').Building][]} */ ([]);
  if (capital >= 0 && !g.P.bld[capital]) want.push([capital, 'cuartel']);
  const front = mine.filter(p => threat(p) > 0).sort((a, b) => threat(b) - threat(a));
  if (front[0] !== undefined && !g.P.bld[front[0]] && threat(front[0]) > g.P.troops[front[0]]) want.push([front[0], 'fortaleza']);
  const rich = mine.filter(p => !g.P.bld[p]).sort((a, b) => geo.tier[b] - geo.tier[a])[0];
  if (rich !== undefined) want.push([rich, geo.coast[rich] ? 'puerto' : 'mercado']);
  for (const [p, b] of want) if (g.F.gold[f] >= buildCost(g, f, b) + 15) { if (tryAct(geo, g, {type:'build', f, p, b})) break; }
  // generales (difícil)
  if (diff === 'dificil' && generalsOf(g, f).length < 2 && g.F.gold[f] >= COST.general + 30 && front[0] !== undefined)
    tryAct(geo, g, {type:'hire', f, p:front[0], skill:'asedio'});
  const sup = supplied(geo, g, f);
  // preparar un ataque: reclutar junto al objetivo más débil con el que está en guerra
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
    if (best) {
      const price = g.P.bld[best.p] === 'cuartel' ? COST.recruitCuartel : COST.recruit;
      const need = Math.ceil(g.P.troops[best.q] * 13 / 10) - g.P.troops[best.p] + 2;
      const n = Math.min(COST.maxRecruit, Math.floor((g.F.gold[f] - 5) / price), Math.max(0, need));
      if (n > 0) tryAct(geo, g, {type:'recruit', f, p:best.p, n});
    }
  }
  // reclutar en el frente más amenazado
  for (const p of front) {
    if (g.F.gold[f] < 14) break;
    if (!sup[p]) continue;
    const price = g.P.bld[p] === 'cuartel' ? COST.recruitCuartel : COST.recruit;
    const n = Math.min(COST.maxRecruit, Math.floor((g.F.gold[f] - 10) / price), Math.max(0, threat(p) - g.P.troops[p] + 3));
    if (n > 0) tryAct(geo, g, {type:'recruit', f, p, n});
  }
}

/** @param {Geo} geo @param {Game} g @param {number} f @param {string} diff */
function aiAttacks(geo, g, f, diff) {
  const th = THRESHOLD[/** @type {'facil'} */ (diff)] / 100;
  const c = counts(g.P.owner, rebels(g) + 1);
  for (let k = 0; k < MAX_ATTACKS && !g.over; k++) {
    const hostile = enemiesOf(g, f);
    let best = null, bestV = 0;
    for (let from = 0; from < geo.n; from++) {
      if (g.P.owner[from] !== f || g.P.ready[from] < 3) continue;
      // tropas que deben quedarse por otros vecinos hostiles
      for (const to of geo.adj[from]) {
        const d = g.P.owner[to];
        if (d < 0 || d === f || !g.P.active[to] || !hostile.has(d)) continue;
        // reserva: la mitad del vecino hostil más fuerte (aparte del objetivo)
        const other = geo.adj[from].reduce((m, q) => Math.max(m, q !== to && g.P.owner[q] >= 0 && hostile.has(g.P.owner[q]) ? g.P.troops[q] : 0), 0);
        const keep = Math.max(1, Math.floor(other / (diff === 'dificil' ? 3 : 2)));
        const n = Math.min(g.P.ready[from], g.P.troops[from] - keep);
        if (n < 2) continue;
        const o = odds(geo, g, f, from, to, n);
        if (o.p < th) continue;
        let v = o.p * (1 + geo.tier[to] / 6);
        if (d >= 0 && g.F.capital[d] === to) v *= 1.6;
        if (d >= 0 && c[d] === 1) v *= 1.3;
        if (v > bestV) { bestV = v; best = {from, to, n}; }
      }
    }
    if (!best) break;
    if (!tryAct(geo, g, {type:'attack', f, from:best.from, to:best.to, n:best.n})) break;
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

/** @param {Geo} geo @param {Game} g */
function upkeep(geo, g) {
  const R = rebels(g), nf = R;
  // pactos que vencen
  for (let a = 0; a < nf; a++) for (let b = a + 1; b < nf; b++) if (g.st[a][b] === PACT && g.until[a][b] <= g.turn) { setStatus(g, a, b, PEACE); emit(g, {t:'pactend', a, b}); }
  // oro
  for (let f = 0; f < nf; f++) if (g.F.alive[f]) { const v = income(geo, g, f); g.F.gold[f] += v; }
  // crecimiento
  const sup = new Map();
  for (let p = 0; p < geo.n; p++) {
    const f = g.P.owner[p]; if (f < 0) continue;
    if (f === R) { if (g.P.troops[p] < 8) g.P.troops[p]++; continue; }
    if (!sup.has(f)) sup.set(f, supplied(geo, g, f));
    const gr = growth(geo, g, p, sup.get(f)), top = cap(geo, g, p);
    if (g.P.troops[p] < top) g.P.troops[p] = Math.min(top, g.P.troops[p] + gr);
  }
  // lealtad y rebeliones
  for (let p = 0; p < geo.n; p++) {
    const f = g.P.owner[p]; if (f < 0 || f === R) continue;
    let up = 5 + (g.P.troops[p] >= 5 ? 5 : 0) + (g.F.trait[f] === 'guardian' ? 5 : 0);
    if (g.gens.some(x => x.f === f && x.skill === 'carisma' && (x.p === p || geo.adj[p].includes(x.p)))) up += 10;
    g.P.loyal[p] = Math.min(100, g.P.loyal[p] + up);
    if (g.F.capital[f] !== p && g.P.loyal[p] < 20 && g.P.troops[p] < 3 && int(g.rng, 100) < 30) {
      const o = g.P.origin[p], to = o >= 0 && o !== f && g.F.alive[o] ? o : R;
      g.P.owner[p] = to; g.P.troops[p] = 4; g.P.loyal[p] = 50;
      g.gens = g.gens.filter(x => x.p !== p);
      emit(g, {t:'revolt', p, from:f, to});
      if (g.F.capital[f] === p) g.F.capital[f] = -1;
      if (!g.P.owner.includes(f)) eliminate(g, f, to);
    }
  }
  // relaciones
  for (let a = 0; a < nf; a++) for (let b = a + 1; b < nf; b++) {
    if (!g.F.alive[a] || !g.F.alive[b]) continue;
    const s = g.st[a][b];
    let d = g.rel[a][b] > 0 ? -1 : g.rel[a][b] < 0 ? 1 : 0;
    if (s === WAR) d = -1; else if (s === ALLY) d = 1;
    relAdd(g, a, b, d);
  }
  // eventos
  if (g.rules.events && int(g.rng, 100) < 35) randomEvent(geo, g);
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
      const p = pick(cand), v = Math.floor(g.P.troops[p] * 30 / 100); g.P.troops[p] -= v; g.P.ready[p] = Math.min(g.P.ready[p], g.P.troops[p]);
      emit(g, {t:'event', kind, p, f:g.P.owner[p], v}); break;
    }
    case 'desertores': {
      const f = pick(alive), ps = provincesOf(g, f); if (!ps.length) return;
      const p = ps.reduce((a, b) => g.P.troops[b] > g.P.troops[a] ? b : a), v = Math.floor(g.P.troops[p] * 20 / 100);
      g.P.troops[p] -= v; emit(g, {t:'event', kind, p, f, v}); break;
    }
    case 'mercaderes': { const f = pick(alive); g.F.gold[f] += 30; emit(g, {t:'event', kind, f, v:30}); break; }
    case 'voluntarios': { const p = pick(owned); g.P.troops[p] += 5; emit(g, {t:'event', kind, p, f:g.P.owner[p], v:5}); break; }
    case 'nevada': {
      const cand = owned.filter(p => geo.terrain[p] === 'm'); if (!cand.length) return;
      const p = pick(cand); g.fx.push({kind, p, f:g.P.owner[p], until:g.turn + 1}); emit(g, {t:'event', kind, p, f:g.P.owner[p]}); break;
    }
  }
}

export {enemiesOf, neighbours};
void WAR; void ALLY; void effectOn;

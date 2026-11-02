// @ts-check
// Ejércitos de campaña (v5): grupos con nombre, general, moral, experiencia y víveres que marchan varios turnos,
// se abastecen de grano en tierra propia y sufren desgaste fuera de ella, en invierno o a marchas forzadas.
// Las guarniciones siguen en cada provincia; el ejército se suma a la defensa de la provincia donde está.
import {int} from '../engine/rng.js';
import {GIVEN, EPITHET} from './data.js';
import {INF, CAB, ART, MIL, UNITS} from './rules.js';
import {
  emit, clamp, rebels, need, era, knows, moveRange, sync, generalAt, effectOn, season, supplied, friendly,
  removeTroops, putUnits,
} from './engine.js';
import {law} from './realm.js';

/** @typedef {import('./engine.js').Game} Game */
/** @typedef {import('./engine.js').Geo} Geo */
/** @typedef {{id:number, f:number, name:string, p:number, u:number[], morale:number, xp:number, food:number, dest:number, forced:boolean, ready:boolean, merc:boolean, gen:number}} Army */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export const MERC_COST = 50, MERC_UPKEEP = 4;
/** Máximo de ejércitos de campaña. @param {Game} g @param {number} f */
export const maxArmies = (g, f) => 2 + era(g, f) + (knows(g, f, 'academias') ? 1 : 0);
/** @param {number[]} u */
export const size = u => u[0] + u[1] + u[2] + u[3];
/** Ejércitos en una provincia (de un bando, o de cualquiera). @param {Game} g @param {number} p @param {number} [f] */
export const armiesAt = (g, p, f) => (g.armies || []).filter(a => a.p === p && (f == null || a.f === f));
/** Ejércitos de un bando. @param {Game} g @param {number} f */
export const armiesOf = (g, f) => (g.armies || []).filter(a => a.f === f);
/** @param {Game} g @param {number} id */
export const armyById = (g, id) => (g.armies || []).find(a => a.id === id);
/** Tropas que defienden una provincia: guarnición y ejércitos de su dueño. @param {Game} g @param {number} p */
export function defVec(g, p) {
  const v = [...g.P.u[p]], o = g.P.owner[p];
  for (const a of armiesAt(g, p, o)) for (let t = 0; t < 4; t++) v[t] += a.u[t];
  return v;
}
/** Factor de la moral sobre la fuerza (porcentaje: moral 100 → 100 %, moral 0 → 60 %). @param {number} m */
export const moraleMul = m => 60 + Math.floor(clamp(m, 0, 100) * 40 / 100);
/** Bonus de veteranía (porcentaje). @param {number} xp */
export const xpBonus = xp => xp >= 6 ? 10 : xp >= 3 ? 5 : 0;
/** Si un ejército puede pasar por una provincia. @param {Game} g @param {number} f @param {number} p */
export function passable(g, f, p) {
  const o = g.P.owner[p];
  if (o === f) return true;
  if (o < 0 || o >= rebels(g)) return false;
  return friendly(g.st[f][o]) || g.F.lord[o] === f || g.F.lord[f] === o || (g.access || []).some(x => (x.a === f && x.b === o) || (x.a === o && x.b === f));
}
/** Camino más corto hasta una provincia por tierra transitable (sin el origen). @param {Geo} geo @param {Game} g @param {number} f @param {number} from @param {number} to */
export function armyPath(geo, g, f, from, to) {
  const prev = new Map([[from, -1]]), q = [from];
  while (q.length) {
    const p = /** @type {number} */ (q.shift());
    if (p === to) break;
    for (const r of geo.adj[p]) if (!prev.has(r) && g.P.active[r] && passable(g, f, r)) { prev.set(r, p); q.push(r); }
  }
  if (!prev.has(to)) return [];
  const path = []; for (let p = to; p !== from; p = /** @type {number} */ (prev.get(p))) path.unshift(p);
  return path;
}
/** Provincias por las que avanza en un turno. @param {Game} g @param {Army} a */
export const armyRange = (g, a) => moveRange(g, a.f, a.p) + (a.forced ? 1 : 0);
/** Avanza un ejército por su camino (hasta su alcance). @param {Geo} geo @param {Game} g @param {Army} a */
function advance(geo, g, a) {
  if (a.dest < 0 || a.dest === a.p) { a.dest = -1; return 0; }
  const path = armyPath(geo, g, a.f, a.p, a.dest);
  if (!path.length) { emit(g, {t:'armystop', f:a.f, id:a.id, name:a.name}); a.dest = -1; return 0; }
  let steps = 0;
  for (const p of path.slice(0, armyRange(g, a))) {
    if (g.rules.seasons && effectOn(g, p, 'nevada') && steps > 0) break;
    a.p = p; steps++;
  }
  const gen = g.gens.find(x => x.id === a.gen); if (gen) gen.p = a.p;
  if (a.p === a.dest) a.dest = -1;
  return steps;
}

/* ======================= Acciones ======================= */
/**
 * Órdenes de los ejércitos. Devuelve false si no es suya (el ataque lo resuelve el motor).
 * @param {Geo} geo @param {Game} g @param {any} a
 */
export function armyAction(geo, g, a) {
  const f = a.f, P = g.P;
  switch (a.type) {
    case 'army_raise': {
      need(P.owner[a.p] === f, 'No es tuya');
      need(armiesOf(g, f).filter(x => !x.merc).length < maxArmies(g, f), `Máximo ${maxArmies(g, f)} ejércitos (más con la era)`);
      const v = Array.isArray(a.u) ? a.u.map((x) => Math.max(0, Math.floor(+x) || 0)) : [P.u[a.p][INF], P.u[a.p][CAB], P.u[a.p][ART], 0];
      v[MIL] = 0;
      const n = size(v);
      need(n >= 3 && v.every((x, t) => x <= P.u[a.p][t]) && n <= P.troops[a.p] - 1 && n <= P.ready[a.p], 'Hacen falta 3 tropas listas (y se queda al menos 1)');
      for (let t = 0; t < 4; t++) P.u[a.p][t] -= v[t];
      sync(g, a.p); P.ready[a.p] = Math.max(0, P.ready[a.p] - n);
      const n0 = armiesOf(g, f).filter(x => !x.merc).length;
      const gen = generalAt(g, a.p);
      const army = {id:++g.armySeq, f, name:`${ROMAN[n0] || n0 + 1} Ejército`, p:a.p, u:v, morale:80, xp:0, food:3, dest:-1, forced:false, ready:false, merc:false, gen:gen && gen.f === f && a.gen ? gen.id : -1};
      g.armies.push(army);
      emit(g, {t:'army', f, id:army.id, name:army.name, p:a.p, n});
      return true;
    }
    case 'army_move': {
      const A = armyById(g, a.id); need(!!A && A.f === f, 'Ejército no válido');
      const x = /** @type {Army} */ (A);
      need(x.ready, 'Este ejército ya ha actuado este turno');
      need(P.active[a.to] && passable(g, f, a.to) && a.to !== x.p, 'Solo por tierra propia, aliada o con paso');
      need(armyPath(geo, g, f, x.p, a.to).length > 0, 'No hay camino por tierra transitable');
      x.dest = a.to; x.forced = !!a.accept;
      const from = x.p, steps = advance(geo, g, x);
      x.ready = false;
      emit(g, {t:'armymove', f, id:x.id, from, to:x.p, dest:x.dest, steps});
      return true;
    }
    case 'army_join': {
      const x = /** @type {Army} */ (armyById(g, a.id)); need(!!x && x.f === f, 'Ejército no válido');
      need(P.owner[x.p] === f, 'Solo en una provincia tuya');
      const v = Array.isArray(a.u) ? a.u.map((y) => Math.max(0, Math.floor(+y) || 0)) : [0, 0, 0, 0]; v[MIL] = 0;
      need(size(v) >= 1 && v.every((y, t) => y <= P.u[x.p][t]) && size(v) <= P.troops[x.p] - 1, 'No hay tropas suficientes (se queda al menos 1)');
      for (let t = 0; t < 4; t++) { P.u[x.p][t] -= v[t]; x.u[t] += v[t]; }
      sync(g, x.p); P.ready[x.p] = Math.min(P.ready[x.p], P.troops[x.p]);
      emit(g, {t:'armyjoin', f, id:x.id, n:size(v)});
      return true;
    }
    case 'army_leave': {
      const x = /** @type {Army} */ (armyById(g, a.id)); need(!!x && x.f === f, 'Ejército no válido');
      need(P.owner[x.p] === f, 'Solo en una provincia tuya');
      const v = Array.isArray(a.u) ? a.u.map((y) => Math.max(0, Math.floor(+y) || 0)) : [...x.u];
      need(size(v) >= 1 && v.every((y, t) => y <= x.u[t]), 'No tiene esas tropas');
      for (let t = 0; t < 4; t++) x.u[t] -= v[t];
      putUnits(g, x.p, v);
      emit(g, {t:'armyleave', f, id:x.id, n:size(v)});
      if (size(x.u) === 0) disband(g, x);
      return true;
    }
    case 'army_disband': {
      const x = /** @type {Army} */ (armyById(g, a.id)); need(!!x && x.f === f, 'Ejército no válido');
      if (P.owner[x.p] === f && !x.merc) putUnits(g, x.p, x.u);
      disband(g, x);
      return true;
    }
    case 'mercs': {
      need(P.owner[a.p] === f, 'No es tuya');
      const cost = mercCost(g, f); need(g.F.gold[f] >= cost, 'No hay oro suficiente');
      need(armiesOf(g, f).filter(x => x.merc).length < 2, 'Como mucho 2 compañías a la vez');
      g.F.gold[f] -= cost;
      const rng = g.rng, captain = GIVEN[int(rng, GIVEN.length)] + ' ' + EPITHET[int(rng, EPITHET.length)];
      const u = era(g, f) >= 1 ? [6, 2, 2, 0] : [7, 3, 0, 0];
      const army = {id:++g.armySeq, f, name:'Compañía de ' + captain.split(' ')[0], p:a.p, u, morale:70, xp:3, food:3, dest:-1, forced:false, ready:false, merc:true, gen:-1};
      g.armies.push(army);
      emit(g, {t:'mercs', f, id:army.id, name:army.name, p:a.p});
      return true;
    }
  }
  return false;
}
/** Precio de una compañía de mercenarios. @param {Game} g @param {number} f */
export const mercCost = (g, f) => Math.floor(MERC_COST * (law(g, f, 'leva') === 2 ? 70 : 100) / 100);
/** @param {Game} g @param {Army} x */
export function disband(g, x) {
  g.armies = g.armies.filter(y => y !== x);
  emit(g, {t:'armyend', f:x.f, id:x.id, name:x.name});
}
/**
 * Bajas de los defensores: primero la guarnición y luego sus ejércitos, a partes iguales.
 * @param {Game} g @param {number} p @param {number} n
 */
export function hitDefenders(g, p, n) {
  const o = g.P.owner[p], here = armiesAt(g, p, o), gar = g.P.troops[p];
  const all = gar + here.reduce((s, a) => s + size(a.u), 0);
  if (!all || n <= 0) return;
  const fromGar = Math.min(gar, Math.round(n * gar / all));
  removeTroops(g, p, fromGar);
  let left = n - fromGar;
  for (const a of here) {
    if (left <= 0) break;
    const k = Math.min(size(a.u), left), v = shareOf(a.u, k);
    for (let t = 0; t < 4; t++) a.u[t] -= v[t];
    left -= k;
    if (size(a.u) === 0) disband(g, a);
  }
}
/** Reparte n entre los tipos de tropa (proporcional). @param {number[]} u @param {number} n */
export function shareOf(u, n) {
  const tot = size(u), v = [0, 0, 0, 0]; if (!tot || n <= 0) return v;
  let left = Math.min(n, tot);
  for (let t = 0; t < 4; t++) { v[t] = Math.min(u[t], Math.floor(u[t] * n / tot)); left -= v[t]; }
  for (let t = 0; t < 4 && left > 0; t++) { const x = Math.min(u[t] - v[t], left); v[t] += x; left -= x; }
  return v;
}
/** Cuando se pierde una provincia, sus ejércitos se retiran a una vecina propia (con bajas) o se dispersan. @param {Geo} geo @param {Game} g @param {number} p @param {number} o dueño anterior */
export function retreatArmies(geo, g, p, o) {
  for (const a of armiesAt(g, p, o)) {
    const to = geo.adj[p].find(q => g.P.owner[q] === o);
    if (to == null) { disband(g, a); continue; }
    const lost = shareOf(a.u, Math.ceil(size(a.u) * 30 / 100));
    for (let t = 0; t < 4; t++) a.u[t] -= lost[t];
    a.p = to; a.morale = Math.max(0, a.morale - 30); a.dest = -1;
    if (size(a.u) === 0) disband(g, a); else emit(g, {t:'retreat', f:o, id:a.id, name:a.name, to});
  }
}

/* ======================= Mantenimiento por turno ======================= */
/** Marcha, víveres, desgaste, moral y paga de los mercenarios. @param {Geo} geo @param {Game} g */
export function armyUpkeep(geo, g) {
  if (!g.armies) return;
  const sup = new Map();
  for (const a of [...g.armies]) {
    if (!g.F.alive[a.f]) { g.armies = g.armies.filter(x => x !== a); continue; }
    if (a.dest >= 0) advance(geo, g, a);
    if (!sup.has(a.f)) sup.set(a.f, supplied(geo, g, a.f));
    const home = g.P.owner[a.p] === a.f && sup.get(a.f)[a.p];
    const n = size(a.u);
    let attr = 0;
    if (home) {
      a.food = 3 + (knows(g, a.f, 'intendencia') ? 1 : 0);
      a.morale = Math.min(100, a.morale + 10);
    } else {
      a.food--;
      if (a.food <= 0) { attr += 10; a.morale = Math.max(0, a.morale - 15); }
    }
    if (g.F.res && g.F.res[a.f].grano <= 0) { attr += 3; a.morale = Math.max(0, a.morale - 10); }
    if (g.rules.seasons && season(g) === 3 && geo.terrain[a.p] !== 'l' && !knows(g, a.f, 'intendencia')) attr += 5;
    if (a.forced) { attr += 3; a.morale = Math.max(0, a.morale - 10); a.forced = a.dest >= 0; }
    if (attr && n) {
      const v = shareOf(a.u, Math.max(1, Math.floor(n * attr / 100)));
      for (let t = 0; t < 4; t++) a.u[t] -= v[t];
      emit(g, {t:'desgaste', f:a.f, id:a.id, name:a.name, n:size(v)});
    }
    if (a.merc) {
      if (g.F.gold[a.f] >= MERC_UPKEEP) g.F.gold[a.f] -= MERC_UPKEEP;
      else { emit(g, {t:'mercsgo', f:a.f, name:a.name}); disband(g, a); continue; }
    }
    if (size(a.u) === 0) { disband(g, a); continue; }
    a.ready = true;
  }
}
/** Mantenimiento en oro de los ejércitos (no mercenarios): como la tropa de guarnición. @param {Game} g @param {number} f */
export function armyGoldUpkeep(g, f) {
  let w = 0;
  for (const a of armiesOf(g, f)) if (!a.merc) w += a.u[INF] * UNITS[INF].up + a.u[CAB] * UNITS[CAB].up + a.u[ART] * UNITS[ART].up;
  return w;
}

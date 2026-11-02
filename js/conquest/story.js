// @ts-check
// Historia en marcha (v5): cadenas de sucesos que duran varios turnos (peste negra, Comuneros, la Mesta, las Indias,
// hambrunas, censura de la imprenta) con decisiones, y tratados de paz con cláusulas según la puntuación de guerra.
import {int} from '../engine/rng.js';
import {COMMUNITIES, SEA} from './data.js';
import {
  emit, clamp, rebels, provincesOf, effectOn, season, lvl, knows, era, removeTroops, sync, eliminate, WAR, PEACE,
} from './engine.js';
import {law, estAvg, quote, warScore, addInfamy} from './realm.js';

/** @typedef {import('./engine.js').Game} Game */
/** @typedef {import('./engine.js').Geo} Geo */

/** Decisiones de las cadenas (la última opción es la que se toma si no se contesta). */
export const STORY = {
  peste:{title:'La peste llega a {P}', text:'La muerte negra entra por el puerto y avanza de provincia en provincia.',
    opts:['Procesiones y rogativas (la Iglesia lo agradece, pero se contagia más)', 'Cuarentena (sin oro en las provincias enfermas, la peste no sale de ellas)']},
  comuneros:{title:'Revuelta de las Comunidades', text:'Las ciudades se alzan contra el poder del rey y piden Cortes y respeto a sus fueros.',
    opts:['Negociar: Cortes, fueros y 50 de oro', 'Reprimir: tres ciudades se sublevan']},
  mesta:{title:'Pleito de la Mesta', text:'Los ganaderos de la Mesta y los labradores se disputan los pastos.',
    opts:['Dar la razón a los labradores (ley de Agricultura)', 'Mantener los privilegios (+40 de oro; campesinos −10)']},
  indias:{title:'Un marino pide naves para cruzar el océano', text:'Promete una ruta nueva y riquezas al otro lado del mar.',
    opts:['Financiar la expedición (150 de oro)', 'No arriesgar']},
  hambruna:{title:'Hambruna en {C}', text:'La cosecha se ha perdido y no hay grano en los mercados.',
    opts:['Importar grano (30 unidades a precio de mercado)', 'Requisar a los campesinos (+20 de grano; campesinos −15)']},
  censura:{title:'La imprenta inquieta a los inquisidores', text:'Circulan libros nuevos en las universidades.',
    opts:['Dejar publicar (Burguesía +10, Iglesia −15, +20 de saber)', 'Censurar (Iglesia +10, −20 de saber)']},
};
/** @param {Game} g @param {number} f @param {string} k */
const done = (g, f, k) => g.F.chains?.[f]?.includes(k);
/** @param {Game} g @param {number} f @param {string} k */
const mark = (g, f, k) => { if (g.F.chains && !done(g, f, k)) g.F.chains[f].push(k); };
/**
 * Pide una decisión a un humano o la toma el bot.
 * @param {Geo} geo @param {Game} g @param {number} f @param {string} kind @param {number} p @param {number} aiOpt
 */
function ask(geo, g, f, kind, p, aiOpt) {
  if (g.humans.includes(f)) {
    if (g.decisions.some(x => x.f === f && x.kind === kind)) return;
    g.decisions.push({id:++g.decSeq, f, kind, p, until:g.turn + 1});
    emit(g, {t:'decision', f, kind, p});
  } else storyDecision(geo, g, {id:0, f, kind, p}, aiOpt);
}

/** Cada turno: avanzan las cadenas y empiezan otras. @param {Geo} geo @param {Game} g */
export function storyUpkeep(geo, g) {
  if (!g.chainsOn || !g.rules.events) return;
  const R = rebels(g);
  // peste: se extiende a las vecinas; los enfermos mueren
  const sick = [];
  for (let p = 0; p < geo.n; p++) if (effectOn(g, p, 'peste')) sick.push(p);
  for (const p of sick) {
    const f = g.P.owner[p];
    if (g.P.troops[p] > 2) removeTroops(g, p, Math.max(1, Math.floor(g.P.troops[p] * 5 / 100)));
    if (effectOn(g, p, 'cuarentena')) continue;
    const odds = f >= 0 && f < R && g.F.chains[f].includes('procesiones') ? 50 : 28;
    for (const q of geo.adj[p]) {
      if (!g.P.active[q] || effectOn(g, q, 'peste') || g.chainsOn.every(c => c.k !== 'peste')) continue;
      if (int(g.rng, 100) < odds) {
        g.fx.push({kind:'peste', p:q, f:g.P.owner[q], until:g.turn + 3});
        const o = g.P.owner[q];
        if (o >= 0 && o < R && !done(g, o, 'peste')) { mark(g, o, 'peste'); ask(geo, g, o, 'peste', q, 1); }
      }
    }
  }
  g.chainsOn = g.chainsOn.filter(c => {
    if (c.k === 'indias' && g.turn >= c.until) { g.F.indias[c.f] = 1; emit(g, {t:'indias', f:c.f}); return false; }
    return g.turn < c.until;
  });
  // empieza la peste (una vez por partida)
  if (g.turn >= 20 && !g.chainsOn.some(c => c.k === 'peste') && !(g.F.chains[R] || []).includes('peste') && int(g.rng, 1000) < 15) {
    const ports = [];
    for (let p = 0; p < geo.n; p++) if (g.P.active[p] && geo.coast[p] && g.P.owner[p] >= 0) ports.push(p);
    if (ports.length) {
      const p = ports[int(g.rng, ports.length)], f = g.P.owner[p];
      g.fx.push({kind:'peste', p, f, until:g.turn + 3});
      g.chainsOn.push({k:'peste', f:-1, p, stage:0, until:g.turn + 12});
      if (g.F.chains[R]) g.F.chains[R].push('peste');
      emit(g, {t:'peste', p, f});
      if (f >= 0 && f < R) { mark(g, f, 'peste'); ask(geo, g, f, 'peste', p, 1); }
    }
  }
  // galeones: sin flota, los piratas se llevan el oro de las Indias
  for (let f = 0; f < R; f++) if (g.F.alive[f] && g.F.indias[f] > 0 && g.F.ships[f] < 5 && int(g.rng, 100) < 5) {
    g.F.gold[f] = Math.max(0, g.F.gold[f] - 25); emit(g, {t:'piratas', f});
  }
  // hambruna regional en otoño
  if (g.rules.seasons && season(g) === 2 && int(g.rng, 100) < 3) {
    const com = COMMUNITIES[int(g.rng, COMMUNITIES.length)];
    const ps = com.ine.map(i => geo.ine.indexOf(i)).filter(p => p >= 0 && g.P.active[p]);
    for (const p of ps) g.fx.push({kind:'hambruna', p, f:g.P.owner[p], until:g.turn + 3});
    if (ps.length) {
      emit(g, {t:'hambruna', c:com.name, p:ps[0]});
      const hit = new Set(ps.map(p => g.P.owner[p]).filter(o => o >= 0 && o < R));
      for (const f of hit) ask(geo, g, f, 'hambruna', ps.find(p => g.P.owner[p] === f) ?? ps[0], 0);
    }
  }
  // cadenas que dependen de cada bando
  for (let f = 0; f < R; f++) {
    if (!g.F.alive[f]) continue;
    const mine = provincesOf(g, f), cap = g.F.capital[f];
    if (!done(g, f, 'comuneros') && mine.length >= 4 && (law(g, f, 'cortes') === 0 || law(g, f, 'fueros') === 1) && estAvg(g, f, 1) < 38 && int(g.rng, 100) < 20) {
      mark(g, f, 'comuneros'); ask(geo, g, f, 'comuneros', cap, 0);
    }
    if (!done(g, f, 'mesta') && law(g, f, 'mesta') === 0 && estAvg(g, f, 0) < 40 && int(g.rng, 100) < 10) { mark(g, f, 'mesta'); ask(geo, g, f, 'mesta', cap, 0); }
    if (!done(g, f, 'indias') && era(g, f) >= 1 && knows(g, f, 'navegacion')) {
      const port = mine.find(p => lvl(g, p, 'puerto') > 0 && (/** @type {Record<string, string[]>} */ (SEA)[geo.ine[p]] || []).some(s => s === 'atln' || s === 'atls'));
      if (port != null) { mark(g, f, 'indias'); ask(geo, g, f, 'indias', port, g.F.gold[f] >= 250 ? 0 : 1); }
    }
    if (!done(g, f, 'censura') && law(g, f, 'religion') === 1 && mine.some(p => lvl(g, p, 'universidad') > 0) && int(g.rng, 100) < 15) {
      mark(g, f, 'censura'); ask(geo, g, f, 'censura', cap, 1);
    }
  }
}
/**
 * Aplica una decisión de las cadenas. Devuelve false si no es de las suyas.
 * @param {Geo} geo @param {Game} g @param {{id:number, f:number, kind:string, p:number}} d @param {number} opt
 */
export function storyDecision(geo, g, d, opt) {
  const info = /** @type {Record<string, {opts:string[]}>} */ (STORY)[d.kind]; if (!info) return false;
  if (!(opt >= 0 && opt < info.opts.length)) opt = info.opts.length - 1;
  const f = d.f, fac = g.F.fac[f], R = rebels(g);
  switch (d.kind) {
    case 'peste':
      if (opt === 0) { mark(g, f, 'procesiones'); fac[1] = clamp(fac[1] + 10, 0, 100); }
      else for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f && effectOn(g, p, 'peste')) g.fx.push({kind:'cuarentena', p, f, until:g.turn + 3});
      break;
    case 'comuneros':
      if (opt === 0) { g.F.laws[f].cortes = 1; g.F.laws[f].fueros = 0; g.F.gold[f] = Math.max(0, g.F.gold[f] - 50); fac[2] = clamp(fac[2] + 20, 0, 100); g.F.stab[f] = clamp(g.F.stab[f] + 5, 0, 100); }
      else {
        const ps = provincesOf(g, f).filter(p => p !== g.F.capital[f]).sort((a, b) => g.P.est[a][1] - g.P.est[b][1] || a - b).slice(0, 3);
        for (const p of ps) { g.P.owner[p] = R; g.P.u[p] = [8, 0, 0, 0]; sync(g, p); g.P.loyal[p] = 50; g.P.queue[p] = []; emit(g, {t:'revolt', p, from:f, to:R, who:'comuneros'}); }
        g.F.stab[f] = clamp(g.F.stab[f] - 5, 0, 100);
        if (!g.P.owner.includes(f)) eliminate(g, f, R);
      }
      break;
    case 'mesta':
      if (opt === 0) { g.F.laws[f].mesta = 1; fac[0] = clamp(fac[0] - 15, 0, 100); }
      else { g.F.gold[f] += 40; for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f) g.P.est[p][0] = clamp(g.P.est[p][0] - 10, 0, 100); }
      break;
    case 'indias':
      if (opt === 0 && g.F.gold[f] >= 150) { g.F.gold[f] -= 150; g.chainsOn.push({k:'indias', f, p:d.p, stage:1, until:g.turn + 4}); emit(g, {t:'expedicion', f}); }
      break;
    case 'hambruna':
      if (opt === 0) { const c = quote(g, 'grano', 30).buy; if (g.F.gold[f] >= c) { g.F.gold[f] -= c; g.F.res[f].grano += 30; } }
      else { g.F.res[f].grano += 20; for (let p = 0; p < geo.n; p++) if (g.P.owner[p] === f) g.P.est[p][0] = clamp(g.P.est[p][0] - 15, 0, 100); }
      break;
    case 'censura':
      if (opt === 0) { fac[2] = clamp(fac[2] + 10, 0, 100); fac[1] = clamp(fac[1] - 15, 0, 100); g.F.rp[f] += 20; }
      else { fac[1] = clamp(fac[1] + 10, 0, 100); g.F.rp[f] = Math.max(0, g.F.rp[f] - 20); }
      break;
  }
  emit(g, {t:'storydone', f, kind:d.kind, opt});
  return true;
}

/* ======================= Tratados ======================= */
/** Valor de lo que se pide en un tratado. @param {Geo} geo @param {{ps?:number[], amount?:number, vas?:boolean}} c */
export const treatyDemand = (geo, c) => (c.ps || []).reduce((s, p) => s + 6 + 3 * geo.tier[p], 0) + Math.floor((c.amount || 0) / 5) + (c.vas ? 30 : 0);
/** Lo que el perdedor está dispuesto a dar. @param {Game} g @param {number} f @param {number} d */
export const treatyRoom = (g, f, d) => Math.max(0, warScore(g, f, d)) + Math.floor(g.F.weary[d] / 4);
/**
 * Si d aceptaría la paz con estas cláusulas.
 * @param {Geo} geo @param {Game} g @param {number} f @param {number} d @param {{ps?:number[], amount?:number, vas?:boolean}} c
 */
export function treatyOk(geo, g, f, d, c) {
  if (g.st[f][d] !== WAR) return {ok:false, why:'No estáis en guerra'};
  const ps = c.ps || [];
  if (ps.some(p => g.P.owner[p] !== d)) return {ok:false, why:'Solo puedes pedir provincias suyas'};
  if (ps.includes(g.F.capital[d]) && warScore(g, f, d) < 60) return {ok:false, why:'Su capital, solo con una victoria aplastante (60)'};
  if (ps.length >= provincesOf(g, d).length) return {ok:false, why:'No se rinde del todo: deja al menos una provincia'};
  const want = treatyDemand(geo, c), room = treatyRoom(g, f, d);
  return want <= room ? {ok:true, why:`Pides ${want} y puede dar ${room}`} : {ok:false, why:`Pides ${want} y la guerra solo da para ${room}`};
}
/** Firma un tratado: paz, provincias, oro y vasallaje. @param {Geo} geo @param {Game} g @param {number} f @param {number} d @param {{ps?:number[], amount?:number, vas?:boolean}} c @param {(g:Game, p:number, to:number, keep:boolean) => void} transfer */
export function signTreaty(geo, g, f, d, c, transfer) {
  g.st[f][d] = g.st[d][f] = PEACE;
  for (const p of c.ps || []) if (g.P.owner[p] === d) { transfer(g, p, f, false); addInfamy(g, f, 1 + geo.tier[p]); }
  const gold = Math.min(c.amount || 0, g.F.gold[d]); g.F.gold[d] -= gold; g.F.gold[f] += gold;
  if (c.vas && g.F.lord[d] < 0) g.F.lord[d] = f;
  emit(g, {t:'treaty', a:f, b:d, ps:c.ps || [], gold, vas:!!c.vas});
}

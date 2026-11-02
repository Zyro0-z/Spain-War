// @ts-check
// Hojas de la conquista (v3): reclutar por tipo de tropa, construir con niveles y maravillas, gobernar una
// provincia (impuestos, postura, barcos), espionaje, diplomacia ampliada, tesoro, gobierno (diplomacia,
// consejo, misión y poder), decisiones y habilidades de los generales. Reciben la partida en curso (Conquest).
import * as E from '../conquest/engine.js';
import {TERRAIN_NAME} from '../conquest/data.js';
import {icon} from '../icons.js';
import {buildArt} from './buildart.js';
import {courtBody, courtMount, goalsBody, marketSheet, treatySheet, popBlock, regionsSheet, rico} from './realmsheets.js';
import {sound} from '../fx.js';
import {esc, fmt, toast, openSheet, closeSheet} from './dom.js';
import {BUILDING_ICON} from './overlay.js';
import {UNIT_ICON, SPEC_ICON, WONDER_ICON, glyph} from './glyphs.js';

/** @typedef {import('./conquest.js').Conquest} Conquest */
const STATUS_CLS = ['peace', 'war', 'pact', 'ally', 'ally'];
/** @param {string} b */
export const bico = b => glyph(BUILDING_ICON[/** @type {'puerto'} */ (b)] || '', 'bld');
/** @param {number} t */
export const uico = t => glyph(UNIT_ICON[t], 'unit u' + t);
/** @param {string} s */
export const sico = s => glyph(SPEC_ICON[/** @type {'vino'} */ (s)] || '', 'spec');
export const wico = () => glyph(WONDER_ICON, 'wonder');
/** Puntos de nivel. @param {number} l @param {number} max */
const pips = (l, max) => `<span class="pips">${Array.from({length:max}, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</span>`;
/** @param {HTMLElement} el @param {string} sel @param {(b:HTMLElement) => void} fn */
const each = (el, sel, fn) => el.querySelectorAll(sel).forEach(b => { /** @type {HTMLElement} */ (b).onclick = () => { sound('tap'); fn(/** @type {HTMLElement} */ (b)); }; });

/* ======================= Reclutar ======================= */
/** @param {Conquest} c @param {number} p */
export function recruitSheet(c, p) {
  const g = c.g, f = c.me, geo = c.geo;
  const room = Math.max(0, 2 * E.cap(geo, g, p) - g.P.troops[p]);
  const canGen = !E.generalAt(g, p) && E.generalsOf(g, f).length < E.maxGenerals(g, f);
  let t = 0, n = 1;
  const merc = E.law(g, f, 'leva') === 2;
  const maxFor = (/** @type {number} */ tt) => {
    let m = Math.min(E.COST.maxRecruit, room, Math.floor(g.F.gold[f] / E.unitCost(geo, g, f, p, tt)));
    if (tt !== E.MIL && !merc) m = Math.min(m, Math.max(0, g.P.pop[p] - 5));
    for (const [r, v] of Object.entries(E.unitRes(tt))) m = Math.min(m, Math.floor((g.F.res[f][r] || 0) / v));
    return m;
  };
  const ready = Math.min(g.P.ready[p], g.P.troops[p] - 1) - g.P.u[p][E.MIL];
  const armies = E.armiesOf(g, f).filter(x => !x.merc).length, canArmy = armies < E.maxArmies(g, f) && ready >= 3;
  const locked = (/** @type {number} */ tt) => !!E.UNITS[tt].era && E.era(g, f) < /** @type {number} */ (E.UNITS[tt].era);
  openSheet({title:'Reclutar', body:`
    <p class="note" style="margin:0 4px 10px">${esc(c.pname(p))} · tienes ${g.F.gold[f]} de oro · caben ${room} tropas más. El mantenimiento sube con las tropas que pasan de la guarnición gratuita.</p>
    <div class="units" role="radiogroup" aria-label="Tipo de tropa">${E.UNITS.map((u, i) => `<button role="radio" aria-checked="${i === t}" data-t="${i}" ${locked(i) ? 'disabled' : ''}>${uico(i)}<b>${u.name}</b><small>${locked(i) ? 'Renacimiento' : `${E.unitCost(geo, g, f, p, i)} de oro`}</small></button>`).join('')}</div>
    <p class="note udesc" id="rD"></p>
    <p class="note need" id="rN"></p>
    <div class="stepper"><button class="icb glass" id="rMin" aria-label="Menos">−</button><input type="range" id="rR" min="1" max="1" value="1" aria-label="Tropas"><button class="icb glass" id="rMax" aria-label="Más">+</button><b class="num" id="rV">1</b></div>
    <button class="btn" id="rGo">${icon('users')}Reclutar por <span class="num" id="rC">0</span> de oro</button>
    ${canGen ? `<div class="glabel">General (${E.COST.general} de oro)</div><div class="grp">${Object.entries(E.SKILLS).slice(0, 4).map(([k, v]) => `<button class="rowi" data-sk="${k}" ${g.F.gold[f] >= E.COST.general ? '' : 'disabled'}>★<div class="l">${v.name}<small>${v.desc}</small></div></button>`).join('')}</div>
      <p class="note">Va con las tropas que salen de su provincia y gana habilidades al subir de nivel. Puede caer en batalla. Máximo ${E.maxGenerals(g, f)}.</p>` : ''}
    <div class="glabel">Ejército de campaña (${armies}/${E.maxArmies(g, f)})</div>
    <div class="grp">
      <button class="rowi" id="rArmy" ${canArmy ? '' : 'disabled'}>${icon('flag')}<div class="l">Formar un ejército aquí<small>${canArmy ? `Con las ${ready} tropas listas (sin la milicia). Marcha varios turnos, lleva víveres y suma moral y experiencia.` : armies >= E.maxArmies(g, f) ? 'Ya tienes el máximo (más con la era)' : 'Hacen falta 3 tropas listas'}</small></div></button>
      <button class="rowi" id="rMerc" ${g.F.gold[f] >= E.mercCost(g, f) ? '' : 'disabled'}>${icon('swords')}<div class="l">Contratar mercenarios<small>${E.era(g, f) >= 1 ? '6 infantes, 2 jinetes y 2 cañones' : '7 infantes y 3 jinetes'} sin gastar población ni recursos · ${E.MERC_UPKEEP} de oro por turno; si no cobran, se van</small></div><b class="num cost">${E.mercCost(g, f)}</b></button>
    </div>`,
    mount:el => {
      const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (el.querySelector(s));
      const r = /** @type {HTMLInputElement} */ (q('#rR'));
      const draw = () => {
        const max = maxFor(t);
        n = Math.max(1, Math.min(n, max));
        r.max = String(Math.max(1, max)); r.value = String(n); r.disabled = max < 1;
        q('#rV').textContent = String(max < 1 ? 0 : n); q('#rC').textContent = String(n * E.unitCost(geo, g, f, p, t));
        q('#rD').textContent = E.UNITS[t].desc + (E.UNITS[t].up === 0 ? '.' : `. Mantenimiento ${E.UNITS[t].up === 2 ? 'doble' : 'normal'}.`);
        const res = Object.entries(E.unitRes(t)).map(([r2, v]) => `${v} de ${E.RES_INFO[/** @type {E.Res} */ (r2)].name.toLowerCase()} (tienes ${g.F.res[f][r2]})`).join(' y ');
        q('#rN').textContent = `Población ${g.P.pop[p]} mil${t === E.MIL || merc ? ' (no se gasta)' : ' · cada tropa gasta mil'}${res ? ' · cada una pide ' + res : ''}.`;
        /** @type {HTMLButtonElement} */ (q('#rGo')).disabled = max < 1;
        el.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-checked', String(+(/** @type {HTMLElement} */ (b).dataset.t || 0) === t)));
      };
      r.oninput = () => { n = +r.value; draw(); };
      q('#rMin').onclick = () => { n--; draw(); };
      q('#rMax').onclick = () => { n++; draw(); };
      each(el, '[data-t]', b => { t = +(b.dataset.t || 0); draw(); });
      const ra = el.querySelector('#rArmy'); if (ra) /** @type {HTMLElement} */ (ra).onclick = () => { const ev = c.act({type:'army_raise', f, p, gen:true}); if (ev) { sound('conquer'); closeSheet(); toast(`${ev.find(e => e.t === 'army')?.name || 'Ejército'} formado en ${c.pname(p)}`); c.afterAction(ev); c.card(p); } };
      const rm = el.querySelector('#rMerc'); if (rm) /** @type {HTMLElement} */ (rm).onclick = () => { const ev = c.act({type:'mercs', f, p}); if (ev) { sound('coin'); closeSheet(); toast(`${ev.find(e => e.t === 'mercs')?.name || 'Mercenarios'} a tu servicio`); c.afterAction(ev); c.card(p); } };
      q('#rGo').onclick = () => {
        if (c.act({type:'recruit', f, p, n, t}, true)) { sound('coin'); closeSheet(); c.refresh(); c.card(p); c.feedback(p, `+${n} ${E.UNITS[t].name.toLowerCase()}`, 'gain'); }
      };
      each(el, '[data-sk]', b => {
        const ev = c.act({type:'hire', f, p, skill:/** @type {any} */ (b.dataset.sk)}, true);
        if (ev) { const h = c.g.gens.find(x => x.p === p); sound('conquer'); closeSheet(); toast(`${h ? h.name : 'Un general'} se une a tu ejército`); c.refresh(); c.card(p); c.feedback(p, '★ General', 'info', true); }
      });
      draw();
    }});
}

/* ======================= Construir ======================= */
/** @param {Conquest} c @param {number} p */
export function buildSheet(c, p) {
  const g = c.g, f = c.me, geo = c.geo, q = g.P.queue[p] || [], used = E.buildingsAt(g, p).length + q.filter(j => j.lvl === 1 && j.b !== '*').length, total = E.slots(geo, g, p);
  const site = geo.wonderSite[p], wonder = site ? /** @type {Record<string, {name:string, cost:number, desc:string}>} */ (E.WONDERS)[site] : null;
  const rows = E.BUILDING_KEYS.map(k => {
    const b = E.BUILDINGS[k], l = E.lvl(g, p, k) + E.queuedLv(g, p, k), cost = E.buildCost(geo, g, f, p, k), mat = E.materials(k, l + 1);
    let why = '';
    if (b.region && E.regionOf(g, p)?.seat !== p) return null;
    if (l >= b.max) why = E.queuedLv(g, p, k) ? 'En obras hasta el máximo' : 'Al máximo';
    else if (q.length >= 2) why = 'Ya hay dos obras en marcha';
    else if (!E.hasRes(g, f, mat)) why = `Faltan ${E.missingRes(g, f, mat)}`;
    else if (b.coast && !geo.coast[p]) why = 'Necesita costa';
    else if (b.hills && geo.terrain[p] === 'l') why = 'Necesita montaña o sierra';
    else if (b.era && E.era(g, f) < b.era) why = b.era === 2 ? 'Era Moderna' : 'Renacimiento';
    else if (!l && used >= total) why = 'Sin huecos';
    return {k, b, l, cost, why, ok:!why && g.F.gold[f] >= cost, mat};
  }).filter(x => !!x).map(x => /** @type {NonNullable<typeof x>} */ (x)).sort((a, b) => Number(!!a.why) - Number(!!b.why) || b.l - a.l);
  openSheet({title:'Construir', body:`
    <p class="note" style="margin:0 4px 10px">${esc(c.pname(p))} · ${used} de ${total} huecos · ${g.F.gold[f]} de oro, ${g.F.res[f].madera} de madera y ${g.F.res[f].hierro} de hierro. Las obras tardan turnos (hasta dos a la vez); mejorar no ocupa hueco nuevo.</p>
    ${wonder && !g.P.wonder[p] ? `<div class="grp wonder-row"><button class="rowi" id="bW" ${g.F.gold[f] >= wonder.cost ? '' : 'disabled'}>${buildArt('maravilla', 'sm')}<div class="l">${esc(wonder.name)}<small>Maravilla única · ${esc(wonder.desc)}</small></div><b class="num cost">${wonder.cost}</b></button></div>` : ''}
    <div class="grp">${rows.map(x => `<button class="rowi bl" data-b="${x.k}" ${x.ok ? '' : 'disabled'}>${buildArt(x.k, 'sm', x.l)}<div class="l">${x.b.name} ${pips(x.l, x.b.max)}<small>${x.why ? esc(x.why) : (x.l ? 'Nivel ' + (x.l + 1) + ': ' : '') + esc(x.b.desc[Math.min(x.l, x.b.max - 1)]) + ` · ${x.l + 1} turno${x.l ? 's' : ''} · ${x.mat.madera} de madera${x.mat.hierro ? ` y ${x.mat.hierro} de hierro` : ''}`}</small></div>${x.why ? '' : `<b class="num cost">${x.cost}</b>`}</button>`).join('')}</div>`,
    mount:el => {
      each(el, '[data-b]', b => {
        const k = /** @type {E.Building} */ (b.dataset.b);
        if (c.act({type:'build', f, p, b:k}, true)) { sound('build'); closeSheet(); c.refresh(); c.card(p); c.feedback(p, `En obras: ${E.BUILDINGS[k].name}`, 'gain', true); }
      });
      const w = el.querySelector('#bW');
      if (w) /** @type {HTMLElement} */ (w).onclick = () => {
        if (c.act({type:'wonder', f, p}, true)) { sound('victory'); closeSheet(); c.refresh(); c.card(p); c.feedback(p, wonder?.name || 'Maravilla', 'info', true); c.banner(`${wonder?.name}: ${wonder?.desc}`); }
      };
    }});
}

/* ======================= Gobernar la provincia ======================= */
/** @param {Conquest} c @param {number} p */
export function governSheet(c, p) {
  const g = c.g, f = c.me, geo = c.geo, yard = E.lvl(g, p, 'astillero');
  const ship = E.shipCost(g, f) * (geo.spec[p] === 'madera' ? 70 : 100) / 100;
  openSheet({title:'Gobernar ' + c.pname(p), body:`
    <div class="glabel">Impuestos</div>
    <div class="seg" role="group" aria-label="Impuestos">${E.TAXES.map((t, i) => `<button data-tax="${i}" aria-pressed="${(g.P.tax[p] ?? 1) === i}">${t.name}</button>`).join('')}</div>
    <p class="note" style="margin:6px 4px 0">${E.TAXES.map(t => `${t.name}: ${t.gold} % de oro, ${t.loyal > 0 ? '+' : ''}${t.loyal} de lealtad`).join(' · ')}</p>
    <div class="glabel">Postura de defensa</div>
    <div class="grp">${E.STANCES.map((s, i) => `<button class="rowi" role="radio" aria-checked="${(g.P.stance[p] || 0) === i}" data-st="${i}"><div class="l">${s.name}<small>${s.desc}</small></div>${(g.P.stance[p] || 0) === i ? icon('check') : ''}</button>`).join('')}</div>
    <p class="note">El enemigo no ve tu postura salvo que te espíe o tenga una torre de vigía cerca.</p>
    <div class="glabel">Órdenes permanentes</div>
    <div class="grp">
      <div class="rowi"><div class="l">Reclutar solo hasta ${g.P.auto[p] || 'no'}<div class="chips">${[0, 10, 20, 30, 50].map(v => `<button class="chip ${g.P.auto[p] === v ? 'on' : ''}" data-auto="${v}">${v || 'Nada'}</button>`).join('')}</div><small>Cada turno recluta infantería hasta ese número si hay oro (deja 20 de reserva).</small></div></div>
      <button class="rowi" role="switch" aria-checked="${g.F.rally[f] === p}" id="gRally"><div class="l">Punto de reunión<small>Las provincias de retaguardia mandan aquí lo que les sobra, un paso por turno.</small></div><span class="switch"></span></button>
      <button class="rowi" id="gReg">${icon('crown')}<div class="l">${E.regionOf(g, p) ? 'Región ' + esc(/** @type {any} */ (E.regionOf(g, p)).name) : 'Regiones y administración'}<small>Administración ${E.adminUse(g, f)}/${E.adminCap(g, f)}${E.regionOf(g, p) ? '' : g.P.loyal[p] >= 90 ? ' · esta provincia ya puede unificarse' : ` · para unificar hace falta lealtad 90 (tiene ${g.P.loyal[p]})`}</small></div>${icon('chev')}</button>
    </div>
    ${yard ? `<div class="glabel">Astillero</div><div class="grp"><div class="rowi">${glyph(UNIT_ICON[0], 'unit')}<div class="l">Tienes ${g.F.ships[f]} barcos<small>Cada barco lleva ${E.shipCap(g, f)} tropas; 1 de oro por turno y 2 de madera al construirlo</small></div></div>
      ${[1, 2 * yard].filter((v, i, a) => a.indexOf(v) === i).map(n => `<button class="rowi" data-sh="${n}" ${g.F.gold[f] >= ship * n ? '' : 'disabled'}><div class="l">Construir ${n} ${n === 1 ? 'barco' : 'barcos'}</div><b class="num cost">${Math.floor(ship * n)}</b></button>`).join('')}</div>` : ''}`,
    mount:el => {
      each(el, '[data-tax]', b => { if (c.act({type:'tax', f, p, lvl:+(b.dataset.tax || 0)}, true)) { closeSheet(); c.refresh(); c.card(p); } });
      each(el, '[data-st]', b => { if (c.act({type:'stance', f, p, s:+(b.dataset.st || 0)}, true)) { closeSheet(); c.refresh(); c.card(p); toast(`Postura: ${E.STANCES[+(b.dataset.st || 0)].name}`); } });
      each(el, '[data-auto]', b => { if (c.act({type:'autorecruit', f, p, n:+(b.dataset.auto || 0)})) { closeSheet(); setTimeout(() => governSheet(c, p), 300); } });
      const gr = el.querySelector('#gRally'); if (gr) /** @type {HTMLElement} */ (gr).onclick = () => { if (c.act({type:'rally', f, p:g.F.rally[f] === p ? -1 : p})) { toast(g.F.rally[f] === p ? `Las tropas sobrantes irán a ${c.pname(p)}` : 'Sin punto de reunión'); closeSheet(); setTimeout(() => governSheet(c, p), 300); } };
      const rg = el.querySelector('#gReg'); if (rg) /** @type {HTMLElement} */ (rg).onclick = () => { closeSheet(); setTimeout(() => regionsSheet(c), 300); };
      each(el, '[data-sh]', b => { const n = +(b.dataset.sh || 1); if (c.act({type:'ships', f, p, n}, true)) { sound('build'); closeSheet(); c.refresh(); c.card(p); c.feedback(p, `+${n} ${n === 1 ? 'barco' : 'barcos'}`, 'gain', true); } });
    }});
}

/* ======================= Espionaje ======================= */
/** @param {Conquest} c @param {number} p */
export function spySheet(c, p) {
  const g = c.g, f = c.me, d = g.P.owner[p];
  const rows = Object.entries(E.SPY_KINDS).map(([k, v]) => {
    const cost = E.spyCost(g, f, k, p);
    let why = '';
    if (k === 'sabotear' && !E.buildingsAt(g, p).length) why = 'No tiene edificios';
    if (k === 'asesinar' && !E.generalAt(g, p)) why = 'No hay general';
    if (k === 'robar' && (d >= E.rebels(g) || !E.stealable(g, f, d).length)) why = 'No sabe nada que tú puedas aprender';
    if (k === 'sobornar' && (g.P.loyal[p] >= 40 || g.F.capital[d] === p)) why = `Lealtad ${g.P.loyal[p]}: hace falta menos de 40`;
    return {k, v, cost, why, ok:!why && g.F.gold[f] >= cost, ch:E.spyChance(g, f, k)};
  });
  openSheet({title:'Espionaje', body:`
    <p class="note" style="margin:0 4px 10px">${esc(c.pname(p))}. Si falla, la relación empeora (mucho si es un asesinato o un soborno).</p>
    <div class="grp">${rows.map(x => `<button class="rowi" data-k="${x.k}" ${x.ok ? '' : 'disabled'}>${icon('target')}<div class="l">${x.v.name}<small>${x.why ? esc(x.why) : `${esc(x.v.desc)} · ${x.ch} % de éxito`}</small></div><b class="num cost">${x.cost}</b></button>`).join('')}</div>`,
    mount:el => each(el, '[data-k]', b => {
      const ev = c.act({type:'spy', f, p, kind:/** @type {any} */ (b.dataset.k)});
      if (!ev) return;
      const e = ev.find(x => x.t === 'spy');
      closeSheet(); sound(e.ok ? 'lock' : 'defend'); toast(e.ok ? 'Misión cumplida' : 'Tu espía ha sido descubierto');
      c.afterAction(ev); if (c.sel >= 0) c.card(c.sel);
    })});
}

/* ======================= Diplomacia ======================= */
/** Lista de bandos (pestaña del gobierno). @param {Conquest} c */
function diplomacyBody(c) {
  const g = c.g, me = c.me, R = E.rebels(g);
  const near = new Set();
  for (let p = 0; p < c.geo.n; p++) if (g.P.owner[p] === me) for (const q of c.geo.adj[p]) { const o = g.P.owner[q]; if (o >= 0 && o !== me && o < R) near.add(o); }
  const list = [];
  for (let f = 0; f < R; f++) if (f !== me && g.F.alive[f]) list.push(f);
  list.sort((a, b) => Number(near.has(b)) - Number(near.has(a)) || Number(g.st[me][b] === E.WAR) - Number(g.st[me][a] === E.WAR) || g.rel[me][b] - g.rel[me][a]);
  const tag = (/** @type {number} */ f) => g.F.lord[f] === me ? 'Tu vasallo' : g.F.lord[me] === f ? 'Tu señor' : c.playerName(f) || (near.has(f) ? 'Vecino' : '');
  return `<p class="note" style="margin:0 4px 10px">Primero tus vecinos. Toca un bando para proponerle algo.</p>
    <div class="grp dlist">${list.map(f => `<button class="rowi" data-f="${f}">${c.flagOf(f)}<div class="l">${esc(g.F.name[f])}${tag(f) ? ` <em class="you ext">${esc(tag(f))}</em>` : ''}<small><span class="rel"><i style="--v:${(g.rel[me][f] + 100) / 2}%"></i></span> ${g.rel[me][f]}</small></div><span class="chip ${STATUS_CLS[g.st[me][f]]}">${E.STATUS_NAME[g.st[me][f]]}</span></button>`).join('')}</div>`;
}
/** Propuestas a un bando. @param {Conquest} c @param {number} d */
export function factionSheet(c, d) {
  const g = c.g, me = c.me, geo = c.geo, st = g.st[me][d];
  const wed = g.weds.some(w => (w.a === me && w.b === d) || (w.a === d && w.b === me));
  const emb = g.embargo.some(e => e.a === me && e.b === d);
  const opts = /** @type {[string, string, string][]} */ ([]);
  if (g.F.lord[me] === d) opts.push(['independencia', 'Declarar la independencia', 'Dejas de pagarle; si es mucho más fuerte, guerra']);
  if (st === E.WAR) opts.push(['tratado', 'Tratado de paz con condiciones', `Puntuación de guerra ${E.warScore(g, me, d)}: pide provincias, oro o vasallaje`], ['paz', 'Paz sin condiciones', '']);
  if (st !== E.WAR) opts.push(['paso', 'Pedir paso militar', 'Tus ejércitos podrán cruzar su tierra 20 turnos']);
  if (st === E.PEACE) opts.push(['pacto', 'Pacto de no agresión', `${E.PACT_TURNS} turnos sin atacaros`]);
  if (st !== E.WAR && !E.allied(st)) opts.push(['alianza', 'Proponer alianza', 'Os defendéis mutuamente']);
  if (st === E.ALLY) opts.push(['federacion', 'Federación', 'Compartís suministro y vista']);
  if (st !== E.WAR && !wed) opts.push(['boda', 'Boda entre casas', '+30 de relación y pacto de 20 turnos']);
  opts.push(['regalo', `Regalar ${E.COST.gift[0]} de oro`, '+10 de relación'], ['regalo2', `Regalar ${E.COST.gift[1]} de oro`, '+25 de relación']);
  if (!E.allied(st) && g.F.lord[d] !== me) opts.push(['tributo', 'Exigir tributo', 'Si te teme, te paga el 20 % de su oro']);
  if (g.F.lord[d] < 0 && g.F.lord[me] !== d) opts.push(['vasallaje', 'Exigir vasallaje', 'Te paga el 25 % de su oro y te sigue en tus guerras']);
  opts.push(['ultimatum', 'Ultimátum: exigir una provincia', 'Si no te teme y te odia, te declara la guerra']);
  opts.push(['comprar', 'Comprar una provincia', 'Una que toque con lo tuyo']);
  opts.push(['anexion', 'Anexión pacífica', 'Se une a ti con todas sus provincias']);
  opts.push(['embargo', emb ? 'Levantar el embargo' : 'Embargo comercial', emb ? 'Volvéis a comerciar' : 'Sin rutas comerciales entre vosotros; −15 de relación']);
  if (st !== E.WAR && g.F.lord[me] !== d && g.F.lord[d] !== me) opts.push(['guerra', 'Declarar la guerra', E.friendly(st) || wed ? 'Rompe vuestro acuerdo: traición' : '']);
  const cnt = E.counts(g.P.owner, E.rebels(g) + 1);
  const chips = [g.F.inf[d] >= 40 ? `Infamia ${g.F.inf[d]}` : '', g.F.lord[d] === me ? 'Tu vasallo' : '', g.F.lord[me] === d ? 'Tu señor' : '', wed ? 'Boda' : '', emb ? 'Embargo' : '', `Era ${E.ERAS[E.era(g, d)].name.toLowerCase()}`].filter(Boolean);
  openSheet({title:g.F.name[d], body:`
    <div class="fhead">${c.flagOf(d, 'md')}<div><span class="chip ${STATUS_CLS[st]}">${E.STATUS_NAME[st]}${st === E.PACT ? ' · hasta el turno ' + g.until[me][d] : ''}</span>
      <p class="note">${cnt[d]} provincias · fuerza ${E.strength(g, d)} (tú ${E.strength(g, me)}) · relación ${g.rel[me][d]}${chips.length ? ' · ' + chips.join(' · ') : ''}</p></div></div>
    <div class="grp">${opts.map(([k, n, sub]) => {
      const pick = k === 'ultimatum' || k === 'comprar' || k === 'tratado';
      const w = k.startsWith('regalo') || k === 'guerra' || k === 'embargo' || pick ? null : E.wouldAccept(geo, g, me, d, k);
      return `<button class="rowi" data-k="${k}">${icon(k === 'guerra' ? 'swords' : 'flag')}<div class="l">${n}<small>${w ? `<b class="${w.ok ? 'ok' : 'no'}">${w.ok ? 'Aceptará' : 'Rechazará'}</b> · ${esc(w.why)}` : esc(sub)}</small></div>${pick ? icon('chev') : ''}</button>`;
    }).join('')}</div>`,
    mount:el => each(el, '[data-k]', b => {
      const k = b.dataset.k || '';
      if (k === 'ultimatum' || k === 'comprar') { closeSheet(); setTimeout(() => provincePicker(c, d, k), 300); return; }
      if (k === 'tratado') { closeSheet(); setTimeout(() => treatySheet(c, d), 300); return; }
      const a = k.startsWith('regalo') ? {type:'diplo', f:me, d, kind:'regalo', amount:k === 'regalo2' ? E.COST.gift[1] : E.COST.gift[0]} : {type:'diplo', f:me, d, kind:k};
      send(c, a, d, k);
    })});
}
/** Elegir la provincia que se exige o se compra. @param {Conquest} c @param {number} d @param {string} kind */
function provincePicker(c, d, kind) {
  const g = c.g, me = c.me, geo = c.geo;
  const ps = E.provincesOf(g, d).filter(p => geo.adj[p].some(q => g.P.owner[q] === me) && g.F.capital[d] !== p);
  openSheet({title:kind === 'comprar' ? 'Comprar una provincia' : 'Ultimátum', body:ps.length ? `
    <p class="note" style="margin:0 4px 10px">Solo las que tocan con lo tuyo y no son su capital.</p>
    <div class="grp">${ps.map(p => {
      const w = E.wouldAccept(geo, g, me, d, kind, p), price = E.provincePrice(geo, g, me, p);
      return `<button class="rowi" data-p="${p}"><div class="l">${esc(c.pname(p))}<small><b class="${w.ok ? 'ok' : 'no'}">${w.ok ? 'Aceptará' : 'Rechazará'}</b> · ${esc(w.why)}</small></div>${kind === 'comprar' ? `<b class="num cost">${price}</b>` : ''}</button>`;
    }).join('')}</div>` : '<p class="note">No hay ninguna provincia suya que toque con las tuyas.</p>',
    mount:el => each(el, '[data-p]', b => send(c, {type:'diplo', f:me, d, kind, p:+(b.dataset.p || 0)}, d, kind))});
}
/** @param {Conquest} c @param {any} a @param {number} d @param {string} k */
function send(c, a, d, k) {
  const g = c.g, ev = c.act(a); if (!ev) return;
  closeSheet();
  const acc = ev.find(e => e.t === 'accept'), rej = ev.find(e => e.t === 'reject');
  if (acc) { sound('conquer'); toast(`${g.F.name[d]} acepta`); }
  else if (rej) { sound('defend'); toast(`${g.F.name[d]} rechaza: ${rej.why || ''}`); }
  else if (k === 'guerra') { sound('impact'); toast(`Guerra contra ${g.F.name[d]}`); }
  else if (ev.some(e => e.t === 'offer')) { sound('lock'); toast('Propuesta enviada'); }
  else sound('lock');
  c.afterAction(ev);
  if (c.sel >= 0) c.card(c.sel);
}

/* ======================= Tesoro ======================= */
/** @param {Conquest} c */
export function economySheet(c) {
  c.hooks.onEvent?.('economy');
  const g = c.g, me = c.me, geo = c.geo, sup = E.supplied(geo, g, me), tr = E.treasury(geo, g, me), er = E.era(g, me);
  const rows = E.provincesOf(g, me).map(p => ({p, v:E.provinceIncome(geo, g, p, sup), gr:E.growth(geo, g, p, sup)})).sort((a, b) => b.v - a.v);
  const line = (/** @type {string} */ n, /** @type {number} */ v, /** @type {string} */ sub = '') => `<div class="rowi"><div class="l">${n}${sub ? `<small>${sub}</small>` : ''}</div><b class="num ${v < 0 ? 'neg' : ''}">${v >= 0 ? '+' : '−'}${Math.abs(v)}</b></div>`;
  openSheet({title:'Tesoro', body:`
    <div class="grp ledger">
      ${line('Provincias', tr.provinces, `×${fmt(E.incomeMul(g, me) / 100, 2)} por líder, era, maravillas, ministros y cansancio`)}
      ${tr.routes.length ? line('Comercio', tr.trade, tr.routes.map(x => g.F.name[x]).join(', ')) : ''}
      ${tr.tribute ? line('Tributo de tus vasallos', tr.tribute) : ''}
      ${tr.paid ? line('Tributo a tu señor', -tr.paid) : ''}
      ${tr.indias ? line('Flota de Indias', tr.indias, 'Cuidado con los piratas si tienes menos de 5 barcos') : ''}
      ${line('Mantenimiento del ejército', -tr.upkeep, `${g.F.ships[me]} barcos · la guarnición de cada provincia es gratis`)}
      ${tr.mercs ? line('Mercenarios', -tr.mercs) : ''}
      <div class="rowi total"><div class="l"><b>Por turno</b></div><b class="num ${tr.total < 0 ? 'neg' : ''}">${tr.total >= 0 ? '+' : '−'}${Math.abs(tr.total)}</b></div>
    </div>
    ${g.F.weary[me] ? `<p class="note">Cansancio de guerra ${g.F.weary[me]} %: menos oro, ataque y lealtad. Baja en paz.</p>` : ''}
    <div class="glabel">Recursos</div>
    <div class="grp"><button class="rowi" id="eMkt"><div class="l"><div class="chips res-row">${E.RES.map(r => `<span class="chip ro">${rico(r)}<b class="num">${g.F.res[me][r]}</b></span>`).join('')}</div><small>Mercado: comprar y vender, producción y consumo</small></div>${icon('chev')}</button></div>
    <div class="glabel">Era y saberes</div>
    <div class="grp"><button class="rowi" id="eSab">${glyph(SAB_ICON.libro, 'sab s4')}<div class="l">${E.ERAS[er].name} · ${g.F.know[me].length} saberes<small>Saber ${g.F.rp[me]} (+${E.saberGain(geo, g, me)} por turno). Abre el árbol de saberes.</small></div>${icon('chev')}</button></div>
    <div class="glabel">Provincias</div>
    <div class="grp">${rows.map(r => `<div class="rowi">${sico(geo.spec[r.p])}<div class="l">${esc(c.pname(r.p))}<small>${E.SPECIALTIES[/** @type {'vino'} */ (geo.spec[r.p])].name} · ${E.TAXES[g.P.tax[r.p] ?? 1].name.toLowerCase()} · ${r.gr ? '+' + r.gr + ' tropas/turno' : 'no crece'}${!sup[r.p] ? ' · sin suministro' : ''}${g.P.loyal[r.p] < 30 ? ' · poco leal' : ''}${g.P.cult[r.p] !== g.F.cult[me] ? ' · otra cultura' : ''}</small></div><b class="num">+${r.v}</b></div>`).join('')}</div>`,
    mount:el => {
      const b = el.querySelector('#eSab'); if (b) /** @type {HTMLElement} */ (b).onclick = () => { closeSheet(); setTimeout(() => saberSheet(c), 300); };
      const m = el.querySelector('#eMkt'); if (m) /** @type {HTMLElement} */ (m).onclick = () => { closeSheet(); setTimeout(() => marketSheet(c), 300); };
    }});
}

/* ======================= Informe de provincia ======================= */
/**
 * Por qué una provincia da lo que da: oro, tropas por turno, lealtad, defensa, cultura y edificios.
 * @param {Conquest} c @param {number} p
 */
export function reportSheet(c, p) {
  const g = c.g, geo = c.geo, o = g.P.owner[p], me = c.me, mine = o === me;
  const sup = o >= 0 && o < E.rebels(g) ? E.supplied(geo, g, o) : [];
  const block = (/** @type {string} */ title, /** @type {E.Parts} */ x, /** @type {string} */ total, /** @type {string} */ note = '') => `<div class="glabel">${title}</div>
    <div class="grp ledger rep">${x.lines.map(([n, v]) => `<div class="rowi"><div class="l">${esc(n)}</div><b class="num ${v.startsWith('−') ? 'neg' : ''}">${esc(v)}</b></div>`).join('')}
    <div class="rowi total"><div class="l"><b>${total.split('|')[0]}</b>${note ? `<small>${esc(note)}</small>` : ''}</div><b class="num">${total.split('|')[1]}</b></div></div>`;
  const inc = E.incomeParts(geo, g, p, sup), gr = E.growthParts(geo, g, p, sup), loy = E.loyaltyParts(geo, g, p), def = E.defenseParts(geo, g, p);
  const bs = E.buildingsAt(g, p);
  openSheet({title:'Informe de ' + c.pname(p), body:`
    <p class="note">${esc(TERRAIN_NAME[geo.terrain[p]])} · población de nivel ${geo.tier[p]} · ${E.SPECIALTIES[/** @type {'vino'} */ (geo.spec[p])].name.toLowerCase()} · cultura ${esc(g.P.cult[p])}${geo.coast[p] ? ' · costa' : ''}</p>
    ${mine ? block('Oro por turno', inc, `Oro de la provincia|+${inc.total}`, `Luego se multiplica por ×${fmt(E.incomeMul(g, me) / 100, 2)} (líder, era, saberes, maravillas, ministros y cansancio)`) : ''}
    ${mine ? block('Tropas por turno', gr, `Crecimiento|+${gr.total}`, `Tope ${E.cap(geo, g, p)} tropas`) : ''}
    ${mine ? block('Lealtad', loy, `Cada turno|${loy.total >= 0 ? '+' : '−'}${Math.abs(loy.total)}`, `Ahora ${g.P.loyal[p]} de 100. Por debajo de 30 rinde la mitad; por debajo de 20 puede rebelarse.`) : ''}
    ${block('Defensa', def, `Multiplicador|×${fmt(def.total / 100, 2)}`, 'Se aplica a cada tropa (infantería 100 %, caballería 90 %, artillería 70 %, milicia 95 %) más la postura.')}
    ${mine ? popBlock(c, p) : ''}
    ${g.P.cult[p] !== (o >= 0 ? g.F.cult[o] : g.P.cult[p]) ? `<div class="glabel">Cultura</div><div class="grp"><div class="rowi"><div class="l">Asimilando · ${g.P.assim[p]} de 24 turnos<small>Mientras tanto: −20 % de oro y −3 de lealtad por turno</small></div></div></div>` : ''}
    ${bs.length && (mine || c.visibleSet().has(p)) ? `<div class="glabel">Edificios</div><div class="grp">${bs.map(([b, l]) => { const info = E.BUILDINGS[/** @type {E.Building} */ (b)]; return `<div class="rowi bl">${buildArt(b, 'sm', l)}<div class="l">${info.name} · nivel ${l}<small>${esc(info.desc[l - 1])}</small></div></div>`; }).join('')}</div>` : ''}`});
}

/* ======================= Saberes ======================= */
/** Pictogramas de las ramas (caja de 16×16). */
const SAB_ICON = {
  camino:'M-2-6.5-5.5 6.5M2-6.5 5.5 6.5M0-5.5v2M0-1.5v2.4M0 3v3',
  espada:'M0-7V3M-1.6-5.4 0-7 1.6-5.4V3M-3.6 3h7.2M0 3v2.6M-1.3 6.4h2.6',
  sello:'M-5-6h10v9l-5 3.5L-5 3Z M-2-2h4M-2 1h4',
  ojo:'M-6.5 0c3-4.6 10-4.6 13 0-3 4.6-10 4.6-13 0Z M-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  libro:'M-6.5-5h5c1.2 0 1.5 1 1.5 1v10s-.3-1-1.5-1h-5Z M6.5-5h-5C.3-5 0-4 0-4v10s.3-1 1.5-1h5Z',
};
const BR_ICON = [SAB_ICON.camino, SAB_ICON.espada, SAB_ICON.sello, SAB_ICON.ojo];
/**
 * Árbol de saberes por eras: lo aprendido, lo que se puede aprender (con saber u oro) y lo bloqueado.
 * @param {Conquest} c
 */
export function saberSheet(c) {
  c.hooks.onEvent?.('saberes');
  const g = c.g, me = c.me, geo = c.geo, er = E.era(g, me), n = g.F.know[me].length, next = E.ERAS[er + 1];
  const gain = E.saberGain(geo, g, me), rp = g.F.rp[me];
  const node = (/** @type {E.Saber} */ x) => {
    const known = E.knows(g, me, x.k), o = E.saberOpen(g, me, x.k), cost = E.saberCost(g, me, x.k), gold = E.saberGold(g, me, x.k);
    const st = known ? 'known' : o.ok ? 'open' : 'lock', canPay = o.ok && g.F.gold[me] >= gold;
    const turns = o.ok && rp < cost ? Math.ceil((cost - rp) / Math.max(1, gain)) : 0;
    return `<button class="sab-n ${st}" data-k="${x.k}" ${o.ok && canPay ? '' : 'disabled'} aria-label="${esc(x.name)}">
      ${glyph(x.br >= 0 ? BR_ICON[x.br] : SAB_ICON.libro, 'sab s' + (x.br >= 0 ? x.br : 4))}
      <span class="t"><b>${esc(x.name)}</b><small>${esc(x.desc)}</small>
      <em>${known ? 'Aprendido' : !o.ok ? esc(o.why) : gold ? `${cost} de saber · ahora ${gold} de oro${turns ? ` o en ${turns} t` : ''}` : `${cost} de saber · ¡listo!`}</em></span>
    </button>`;
  };
  openSheet({title:'Saberes', body:`
    <div class="sab-head"><div><span>Saber</span><b class="num">${rp}</b><em class="num">+${gain} por turno</em></div>
      <div class="sab-era"><span>${E.ERAS[er].name}</span><div class="pbar"><i style="width:${next ? Math.min(100, Math.round(n * 100 / next.at)) : 100}%"></i></div><small>${next ? `${n} de ${next.at} saberes para el ${next.name}` : 'Última era'}</small></div></div>
    <p class="note">El saber se gana cada turno (provincias, universidades, imprenta). Lo que falte se paga a ${E.GOLD_PER_SABER} de oro por punto.</p>
    ${E.ERAS.map((era, i) => `<div class="glabel">${era.name}${i > er ? ` · con ${era.at} saberes` : ''}</div><p class="note era-d">${esc(era.desc)}</p>
      <div class="sab-g">${E.SABERES.filter(x => x.era === i).map(node).join('')}</div>`).join('')}`,
    mount:el => each(el, '[data-k]', b => {
      const k = b.dataset.k || '', x = E.SABER[k];
      if (c.act({type:'research', f:me, k}, true)) {
        sound('conquer'); closeSheet(); c.refresh();
        const cap = c.g.F.capital[me];
        if (cap >= 0) c.feedback(cap, x.name, 'info', true);
        const nowEra = E.era(c.g, me);
        c.banner(nowEra > er ? `¡Llega el ${E.ERAS[nowEra].name}!` : `${x.name}: ${x.desc}`);
      }
    })});
}

/* ======================= Gobierno: diplomacia, consejo y poder ======================= */
/** Consejos de los ministros (lo más útil ahora). @param {Conquest} c @returns {Record<string, string>} */
function advice(c) {
  const g = c.g, me = c.me, geo = c.geo, mine = E.provincesOf(g, me), tr = E.treasury(geo, g, me);
  const hostile = new Set(); for (let x = 0; x < E.rebels(g); x++) if (x !== me && g.st[me][x] === E.WAR) hostile.add(x);
  // guerra: el vecino enemigo más débil o la frontera más expuesta
  let war = 'Tus fronteras están tranquilas. Es buen momento para construir.';
  let weak = null, wv = 1e9, risk = null, rv = 0;
  for (const p of mine) for (const q of geo.adj[p]) {
    const o = g.P.owner[q]; if (!hostile.has(o)) continue;
    if (g.P.troops[q] < wv) { wv = g.P.troops[q]; weak = q; }
    const r = g.P.troops[q] - g.P.troops[p]; if (r > rv) { rv = r; risk = p; }
  }
  if (risk != null) war = `${c.pname(risk)} está expuesta: ${rv} tropas de diferencia. Refuérzala o cambia su postura.`;
  else if (weak != null) war = `${c.pname(weak)} solo tiene ${wv} tropas. Es una buena presa.`;
  // hacienda
  let money = `Ganas ${tr.total} de oro por turno.`;
  if (tr.total < 0) money = 'Gastas más de lo que ingresas: el ejército desertará. Baja tropas o sube impuestos.';
  else if (g.F.gold[me] > 150) {
    const free = mine.find(p => E.buildingsAt(g, p).length < E.slots(geo, g, p));
    money = free != null ? `Tienes ${g.F.gold[me]} de oro guardado. Construye en ${c.pname(free)}: quedan huecos.` : `Tienes ${g.F.gold[me]} de oro: mejora tus edificios o investiga.`;
  } else if (!tr.routes.length) money = 'Sin rutas comerciales. Un pacto con un vecino da oro a los dos.';
  // diplomacia
  let dip = 'Nadie te teme ni te quiere demasiado. Los regalos abren puertas.';
  for (let x = 0; x < E.rebels(g); x++) {
    if (x === me || !g.F.alive[x]) continue;
    if (E.wouldAccept(geo, g, me, x, 'vasallaje').ok && g.F.lord[x] < 0) { dip = `${g.F.name[x]} te teme: exígele vasallaje.`; break; }
    if (g.st[me][x] === E.PEACE && E.wouldAccept(geo, g, me, x, 'pacto').ok && g.P.owner.some((o, p) => o === me && geo.adj[p].some(q => g.P.owner[q] === x))) dip = `${g.F.name[x]} firmaría un pacto: tendrías una ruta comercial.`;
  }
  return {guerra:war, hacienda:money, diplomacia:dip};
}
/** Ranking de poder. @param {Conquest} c */
function powerBody(c) {
  const g = c.g, me = c.me, geo = c.geo, R = E.rebels(g), cnt = E.counts(g.P.owner, R + 1);
  const rows = [];
  for (let f = 0; f < R; f++) if (g.F.alive[f]) {
    const tr = E.treasury(geo, g, f);
    rows.push({f, prov:cnt[f], troops:E.provincesOf(g, f).reduce((s, p) => s + g.P.troops[p], 0), gold:tr.total, era:E.era(g, f), score:E.score(g, f)});
  }
  rows.sort((a, b) => b.score - a.score);
  const top = Math.max(1, ...rows.map(r => r.score));
  return `<div class="grp power2">${rows.slice(0, 12).map((r, i) => `<div class="rowi${r.f === me ? ' me' : ''}"><span class="bpos num">${i + 1}</span>${c.flagOf(r.f)}<div class="l">${esc(g.F.name[r.f])}${r.f === me ? ' (tú)' : ''}<small>${r.prov} prov. · ${r.troops} tropas · ${r.gold >= 0 ? '+' : ''}${r.gold} oro · ${E.ERAS[r.era].name}</small><span class="bar"><i style="width:${(r.score * 100 / top).toFixed(1)}%;background:${g.F.color[r.f]}"></i></span></div><b class="num">${r.score}</b></div>`).join('')}</div>
    ${c.powerChart()}`;
}
/**
 * Gobierno: diplomacia, consejo (ministros, misión) y poder (ranking).
 * @param {Conquest} c @param {'dip'|'council'|'power'|'corte'|'goals'} [tab]
 */
export function govSheet(c, tab = 'dip') {
  c.hooks.onEvent?.('diplomacy');
  const g = c.g, me = c.me;
  const adv = advice(c), mis = g.missions.find(m => m.f === me);
  const misText = mis ? `${c.missionText(mis)} antes del turno ${mis.until} · +${mis.reward} de oro` : 'Ahora no tienes ninguna. Llegan de vez en cuando.';
  const body = tab === 'dip' ? diplomacyBody(c) : tab === 'power' ? powerBody(c) : tab === 'corte' ? courtBody(c) : tab === 'goals' ? goalsBody(c) : `
    <div class="glabel">Misión</div><div class="grp"><div class="rowi">${icon('target')}<div class="l">${mis ? 'En curso' : 'Sin misión'}<small>${esc(misText)}</small></div></div></div>
    <div class="glabel">Consejo de ministros</div>
    <div class="grp council">${Object.entries(E.MINISTER_ROLES).map(([k, n]) => {
      const m = g.F.min[me][k], trait = /** @type {Record<string, string>} */ (/** @type {any} */ (E.MINISTERS)[k])[m.k];
      return `<div class="rowi min"><span class="bust" aria-hidden="true">${esc(m.name.split(' ')[1]?.[0] || 'M')}</span><div class="l">${esc(m.name)} · ${n}<small>${esc(trait)}</small><em class="adv">«${esc(adv[k])}»</em></div><button class="btn sm ghost" data-min="${k}" ${g.F.gold[me] >= E.MINISTER_COST ? '' : 'disabled'}>Cambiar · ${E.MINISTER_COST}</button></div>`;
    }).join('')}</div>`;
  openSheet({title:'Gobierno', body:`
    <div class="seg tabs t5" role="tablist">${[['corte', 'Corte'], ['dip', 'Diplomacia'], ['council', 'Consejo'], ['goals', 'Objetivos'], ['power', 'Poder']].map(([k, n]) => `<button role="tab" data-tab="${k}" aria-pressed="${tab === k}">${n}</button>`).join('')}</div>
    <div class="tabb">${body}</div>`,
    mount:el => {
      if (tab === 'corte') courtMount(c, el, () => govSheet(c, 'corte'));
      each(el, '[data-tab]', b => { sound('tap'); govSheet(c, /** @type {any} */ (b.dataset.tab)); });
      each(el, '[data-f]', b => { closeSheet(); setTimeout(() => factionSheet(c, +(b.dataset.f || 0)), 300); });
      each(el, '[data-min]', b => { const k = b.dataset.min || ''; if (c.act({type:'minister', f:me, k})) { sound('lock'); closeSheet(); toast(`Nuevo ministro de ${/** @type {Record<string, string>} */ (E.MINISTER_ROLES)[k]}: ${c.g.F.min[me][k].name}`); setTimeout(() => govSheet(c, 'council'), 300); } });
    }});
}

/* ======================= Decisiones y habilidades ======================= */
/**
 * Una decisión pendiente: se elige una opción.
 * @param {Conquest} c @param {{id:number, kind:string, p:number}} d @returns {Promise<number|null>}
 */
export function decisionSheet(c, d) {
  const info = /** @type {Record<string, {title:string, text:string, opts:string[]}>} */ ({...E.DECISIONS, ...E.STORY})[d.kind];
  if (!info) return Promise.resolve(null);
  return new Promise(res => openSheet({title:'Decisión', close:() => res(null), body:`
    <h4 class="brief-t">${esc(info.title.replace('{P}', d.p >= 0 ? c.pname(d.p) : '').replace('{C}', E.communityOf(c.geo.ine[d.p] || '')?.name || 'la región'))}</h4>
    <p class="brief-p">${esc(info.text)}</p>
    <div class="grp">${info.opts.map((o, i) => `<button class="rowi" data-o="${i}"><div class="l">${esc(o)}</div>${icon('chev')}</button>`).join('')}</div>
    <p class="note">Si no decides, al terminar el turno se toma la última opción.</p>`,
    mount:el => each(el, '[data-o]', b => { res(+(b.dataset.o || 0)); closeSheet(); })}));
}
/**
 * Habilidad nueva para un general que ha subido de nivel.
 * @param {Conquest} c @param {E.General} gen @returns {Promise<string|null>}
 */
export function skillSheet(c, gen) {
  const left = Object.entries(E.SKILLS).filter(([k]) => !gen.skills.includes(/** @type {any} */ (k)));
  return new Promise(res => openSheet({title:'Nueva habilidad', close:() => res(null), body:`
    <p class="brief-p">${esc(gen.name)} sube a nivel ${gen.lvl} en ${esc(c.pname(gen.p))}. Elige qué aprende.</p>
    <div class="grp">${left.map(([k, v]) => `<button class="rowi" data-s="${k}">★<div class="l">${v.name}<small>${v.desc}</small></div></button>`).join('')}</div>`,
    mount:el => each(el, '[data-s]', b => { res(b.dataset.s || null); closeSheet(); })}));
}

/* ======================= Detalles de la ficha ======================= */
/**
 * Fila de edificios (huecos con su nivel) y chips de la provincia.
 * @param {Conquest} c @param {number} p @param {boolean} vis
 */
export function provinceDetail(c, p, vis) {
  const g = c.g, geo = c.geo, o = g.P.owner[p], me = c.me;
  const bs = E.buildingsAt(g, p), total = E.slots(geo, g, p);
  const slots = vis ? `<div class="slots" aria-label="Edificios">${bs.map(([b, l]) => `<span class="slot" title="${E.BUILDINGS[/** @type {E.Building} */ (b)].name} ${l}">${buildArt(b, 'slot', l)}${pips(l, E.BUILDINGS[/** @type {E.Building} */ (b)].max)}</span>`).join('')}${Array.from({length:Math.max(0, total - bs.length)}, () => '<span class="slot empty"></span>').join('')}</div>` : '';
  const known = o === me || g.intel.some(i => i.f === me && i.p === p) || E.provincesOf(g, me).some(q => E.lvl(g, q, 'torre') > 0 && (q === p || geo.adj[q].includes(p) || geo.adj[q].some(r => geo.adj[r].includes(p))));
  const u = g.P.u[p];
  const chips = [
    `<span class="tag2">${sico(geo.spec[p])}${E.SPECIALTIES[/** @type {'vino'} */ (geo.spec[p])].name}</span>`,
    g.P.wonder[p] ? `<span class="tag2 gold">${wico()}${esc(/** @type {Record<string, {name:string}>} */ (E.WONDERS)[g.P.wonder[p]].name)}</span>` : geo.wonderSite[p] && o === me ? `<span class="tag2">${wico()}Sitio de maravilla</span>` : '',
    o >= 0 && o < E.rebels(g) && g.P.cult[p] !== g.F.cult[o] ? `<span class="tag2 bad">Cultura ${esc(g.P.cult[p])} · ${g.P.assim[p]}/24</span>` : '',
    known && o !== me && g.P.stance[p] ? `<span class="tag2">Postura: ${E.STANCES[g.P.stance[p]].name}</span>` : '',
    o === me && g.P.stance[p] ? `<span class="tag2">Postura: ${E.STANCES[g.P.stance[p]].name}</span>` : '',
    g.sieges.filter(s => s.p === p).map(s => `<span class="tag2 bad">Asedio de ${esc(g.F.name[s.f])} · brecha ${s.breach}/${E.lvl(g, p, 'muralla')}</span>`).join(''),
    E.effectOn(g, p, 'bloqueo') ? '<span class="tag2 bad">Bloqueo naval</span>' : '',
    vis && (u[1] || u[2] || u[3]) ? `<span class="tag2 mix">${[0, 1, 2, 3].filter(t => u[t]).map(t => `${uico(t)}${u[t]}`).join(' ')}</span>` : '',
  ].filter(Boolean).join('');
  return {slots, chips, terrain:TERRAIN_NAME[geo.terrain[p]]};
}

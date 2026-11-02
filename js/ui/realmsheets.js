// @ts-check
// Hojas del reino (v5): corte (rey, heredero, estabilidad, facciones y leyes), objetivos, regiones y gobernadores,
// mercado de recursos, tratados de paz con cláusulas, población y estamentos, y obras en curso.
import * as E from '../conquest/engine.js';
import {icon} from '../icons.js';
import {sound} from '../fx.js';
import {esc, toast, openSheet, closeSheet} from './dom.js';
import {glyph, RES_ICON} from './glyphs.js';
import {portrait} from './portraits.js';
import {buildArt} from './buildart.js';

/** @typedef {import('./conquest.js').Conquest} Conquest */
/** @param {HTMLElement} el @param {string} sel @param {(b:HTMLElement) => void} fn */
const each = (el, sel, fn) => el.querySelectorAll(sel).forEach(b => { /** @type {HTMLElement} */ (b).onclick = () => { sound('tap'); fn(/** @type {HTMLElement} */ (b)); }; });
/** Barra de 0 a 100. @param {number} v @param {string} [cls] */
const bar = (v, cls = '') => `<span class="bar ${cls} ${v < 30 ? 'low' : v >= 70 ? 'high' : ''}"><i style="width:${Math.max(2, Math.min(100, v))}%"></i></span>`;
/** @param {string} r */
export const rico = r => glyph(/** @type {Record<string, string>} */ (RES_ICON)[r], 'res r-' + r);
/** Precio en oro con un decimal. @param {number} d décimas */
const money = d => (d / 10).toFixed(1).replace('.', ',');

/* ======================= Corte ======================= */
/** @param {Conquest} c */
export function courtBody(c) {
  const g = c.g, me = c.me, r = g.F.ruler[me], col = g.F.color[me];
  const tr = /** @type {Record<string, {name:string, desc:string}>} */ (E.TRAITS)[g.F.trait[me]];
  const pw = E.facPower(g, me);
  const effects = [
    'Nobleza por debajo de 30: −1 tropa por turno en cada provincia',
    'Iglesia por debajo de 30: −2 de lealtad en todas partes',
    'Burguesía por debajo de 30: comercio a la mitad; por encima de 70: +10 % de oro',
    'Ejército por debajo de 30: −10 % de ataque',
  ];
  const laws = E.LAW_KEYS.map(k => {
    const L = E.LAWS[k], cur = E.law(g, me, k), last = g.F.lawT[me][k] ?? -99, wait = E.LAW_COOLDOWN - (g.turn - last);
    return `<div class="law"><div class="lh"><b>${L.name}</b>${wait > 0 ? `<small>Podrás cambiarla en ${wait} t</small>` : `<small>Cambiar cuesta ${E.LAW_COST} de oro</small>`}</div>
      <div class="lopts">${L.opts.map((o, i) => {
        const sup = i === cur ? 100 : E.lawSupport(g, me, k, i);
        return `<button class="lopt ${i === cur ? 'on' : ''}" data-law="${k}" data-opt="${i}" ${i === cur || wait > 0 ? 'disabled' : ''}><b>${esc(o.name)}</b><small>${esc(o.desc)}</small>${i === cur ? '<em>En vigor</em>' : `<em class="${sup >= 40 ? 'ok' : 'no'}">Apoyo ${sup} %${sup < 40 ? ' · habría que imponerla' : ''}</em>`}</button>`;
      }).join('')}</div></div>`;
  }).join('');
  return `
    <div class="court-head">${portrait(r.name, {role:r.regent ? 'regente' : 'rey', color:col, age:r.age, size:76})}
      <div class="l"><b>${esc(r.name)}</b><small>${r.age} años · ${esc(tr?.name || '')}${r.regent ? ' · bajo regencia' : ''}${r.wed ? ' · casado' : ' · soltero'}</small><small class="tdesc">${esc(tr?.desc || '')}</small>
      ${r.wed ? '' : `<button class="btn sm ghost" id="cCasar" ${g.F.gold[me] >= 30 ? '' : 'disabled'}>Buscar esposa · 30</button>`}</div></div>
    <div class="grp"><div class="rowi">${r.heir ? portrait(r.heir.name, {role:'heredero', color:col, age:r.heir.age + 20, size:40}) : icon('users')}<div class="l">${r.heir ? `Heredero: ${esc(r.heir.name)}` : 'Sin heredero'}<small>${r.heir ? `${r.heir.age} años${r.heir.age < 16 ? ' · si hereda ahora, habrá regencia' : ''}` : r.wed ? 'Puede nacer cada año (35 %)' : 'Sin boda no habrá heredero: si el rey muere, crisis de sucesión'}</small></div></div></div>
    <div class="glabel">Estabilidad · ${g.F.stab[me]}</div>
    <div class="grp"><div class="rowi"><div class="l">${bar(g.F.stab[me], 'wide')}<small>Suma lealtad (${Math.floor((g.F.stab[me] - 50) / 10) >= 0 ? '+' : ''}${Math.floor((g.F.stab[me] - 50) / 10)} por turno). Por debajo de 30, −10 % de oro. Sube con las facciones contentas; baja con regencias, cansancio, infamia y leyes impuestas.</small></div></div></div>
    <div class="glabel">Facciones de la corte</div>
    <div class="grp facs">${E.FACTIONS.map((x, i) => `<div class="rowi"><div class="l"><span class="fn">${x.name} <em>poder ${pw[i]} %</em></span>${bar(g.F.fac[me][i])}<small>${esc(x.desc)} · apoyo ${g.F.fac[me][i]}. ${esc(effects[i])}</small></div></div>`).join('')}</div>
    <p class="note">Si una facción con poder cae por debajo de 12 puede estallar una guerra civil: se lleva las provincias menos leales.</p>
    <div class="glabel">Leyes</div>
    <div class="laws">${laws}</div>`;
}
/** @param {Conquest} c @param {HTMLElement} el @param {() => void} again */
export function courtMount(c, el, again) {
  const me = c.me;
  const cb = el.querySelector('#cCasar'); if (cb) /** @type {HTMLElement} */ (cb).onclick = () => { if (c.act({type:'casar', f:me})) { sound('conquer'); toast('Boda real: ya puede nacer un heredero'); again(); } };
  each(el, '[data-law]', b => {
    const k = /** @type {E.LawKey} */ (b.dataset.law), opt = +(b.dataset.opt || 0), sup = E.lawSupport(c.g, me, k, opt);
    if (sup < 40 && !confirm(`Solo la apoya el ${sup} % del poder. ¿Imponerla? Estabilidad −15 y las facciones contrarias se enfadan.`)) return;
    if (c.act({type:'law', f:me, k, opt, accept:sup < 40})) { sound('lock'); toast(`Nueva ley: ${E.LAWS[k].opts[opt].name}`); again(); }
  });
}

/* ======================= Objetivos ======================= */
/** @param {Conquest} c */
export function goalsBody(c) {
  const g = c.g, me = c.me, goals = g.F.goals[me] || [];
  const done = goals.filter(x => x.done).length;
  return `<p class="note">Objetivos propios de tu bando, según tu tierra. Cumplidos ${done} de ${goals.length}.</p>
    <div class="grp goals">${goals.map(x => `<div class="rowi ${x.done ? 'done' : ''}">${x.done ? '<span class="ok-dot">✓</span>' : icon('target')}<div class="l">${esc(E.goalText(c.geo, g, x, p => c.pname(p)))}<small>${esc(/** @type {Record<string, {reward:string}>} */ (E.GOAL_INFO)[x.k].reward)}</small></div></div>`).join('')}</div>`;
}

/* ======================= Regiones ======================= */
/** @param {Conquest} c */
export function regionsSheet(c) {
  const g = c.g, me = c.me, geo = c.geo;
  const use = E.adminUse(g, me), cap = E.adminCap(g, me), over = E.adminOver(g, me);
  const regs = g.regions.filter(r => r.f === me), cands = E.unifyCandidates(geo, g, me);
  const pol = Object.entries(E.POLICIES);
  const body = `
    <div class="adm ${over ? 'bad' : ''}"><b class="num">${use}<small>/${cap}</small></b><div><span>Administración</span>${bar(Math.min(100, Math.floor(use * 100 / Math.max(1, cap))), over ? 'warn' : '')}<small>${over ? `Desbordada en ${over}: −${Math.min(50, 5 * over)} % de oro y −${Math.ceil(over / 2)} de lealtad por turno.` : 'Cada provincia suelta cuesta 1; cada región, 2 (tenga las que tenga).'} La capacidad crece con la era, las audiencias y algunas leyes.</small></div></div>
    ${cands.length ? `<div class="glabel">Se pueden unificar</div><div class="grp">${cands.map((ps, i) => `<button class="rowi" data-u="${i}" ${g.F.gold[me] >= E.unifyCost(ps) ? '' : 'disabled'}>${icon('crown')}<div class="l">${ps.length} provincias<small>${esc(ps.map(p => c.pname(p)).join(', '))}</small></div><b class="num cost">${E.unifyCost(ps)}</b></button>`).join('')}</div>`
      : '<p class="note">Para fundar una región hacen falta al menos 2 provincias tuyas que se toquen, fuera de otras regiones y con lealtad 90 o más.</p>'}
    ${regs.map(r => {
      const add = E.provincesOf(g, me).filter(p => !E.regionOf(g, p) && g.P.loyal[p] >= 90 && geo.adj[p].some(q => r.ps.includes(q)));
      const troops = r.ps.reduce((s, p) => s + g.P.troops[p], 0);
      return `<div class="glabel">${esc(r.name)} · ${r.ps.length} provincias</div>
      <div class="grp region">
        <div class="rowi"><div class="l">Sede en ${esc(c.pname(r.seat))} · ${troops} tropas<small>${esc(r.ps.map(p => c.pname(p)).join(', '))}. Dentro se mueve sin límite de alcance y la lealtad sube 2 por turno.</small></div></div>
        ${r.gov ? `<div class="rowi gov">${portrait(r.gov.name, {role:'gobernador', color:g.F.color[me], size:44})}<div class="l">${esc(r.gov.name)}<small>${esc(/** @type {Record<string, string>} */ (E.GOV_TRAITS)[r.gov.trait])}</small></div></div>
          <div class="rowi"><div class="l">Política<div class="chips">${pol.map(([k, v]) => `<button class="chip ${r.gov && r.gov.policy === k ? 'on' : ''}" data-gp="${r.id}:${k}">${v.name}</button>`).join('')}</div><small>${esc(/** @type {Record<string, {desc:string}>} */ (E.POLICIES)[r.gov.policy].desc)}</small></div></div>
          <div class="rowi"><div class="l">Presupuesto: ${r.gov.budget} % de tu oro cada turno<div class="chips">${[0, 10, 20, 30].map(v => `<button class="chip ${r.gov && r.gov.budget === v ? 'on' : ''}" data-gb="${r.id}:${v}">${v} %</button>`).join('')}</div></div></div>`
        : `<button class="rowi" data-gov="${r.id}" ${g.F.gold[me] >= E.GOV_COST ? '' : 'disabled'}>${icon('users')}<div class="l">Nombrar gobernador<small>Gestiona la región solo, con la política y el presupuesto que elijas</small></div><b class="num cost">${E.GOV_COST}</b></button>`}
        <div class="rowi"><div class="l">Impuestos de toda la región<div class="chips">${E.TAXES.map((t, i) => `<button class="chip" data-rt="${r.id}:${i}">${t.name}</button>`).join('')}</div></div></div>
        ${add.map(p => `<button class="rowi" data-ra="${r.id}:${p}" ${g.F.gold[me] >= 15 ? '' : 'disabled'}><span class="plus" aria-hidden="true">+</span><div class="l">Añadir ${esc(c.pname(p))}<small>Lealtad ${g.P.loyal[p]}</small></div><b class="num cost">15</b></button>`).join('')}
        ${E.lvl(g, r.seat, 'audiencia') ? '' : `<div class="rowi">${buildArt('audiencia', 'sm')}<div class="l">Audiencia en la sede<small>+3 de administración y +2 de lealtad en la región (en Construir)</small></div></div>`}
        <button class="rowi danger" data-rx="${r.id}">${icon('close')}<div class="l">Disolver la región</div></button>
      </div>`;
    }).join('')}`;
  openSheet({title:'Regiones', body, mount:el => {
    const again = () => { closeSheet(); setTimeout(() => regionsSheet(c), 300); };
    each(el, '[data-u]', b => { const ps = cands[+(b.dataset.u || 0)]; if (c.act({type:'unify', f:me, ps})) { sound('conquer'); toast('Nueva región'); c.refresh(); again(); } });
    each(el, '[data-gov]', b => { if (c.act({type:'governor', f:me, id:+(b.dataset.gov || 0), k:'economica', n:10})) { sound('lock'); again(); } });
    each(el, '[data-gp]', b => { const [id, k] = (b.dataset.gp || '').split(':'); const r = g.regions.find(x => x.id === +id); if (c.act({type:'governor', f:me, id:+id, k, n:r?.gov?.budget ?? 10})) again(); });
    each(el, '[data-gb]', b => { const [id, v] = (b.dataset.gb || '').split(':').map(Number); const r = g.regions.find(x => x.id === id); if (c.act({type:'governor', f:me, id, k:r?.gov?.policy || 'economica', n:v})) again(); });
    each(el, '[data-rt]', b => { const [id, v] = (b.dataset.rt || '').split(':').map(Number); if (c.act({type:'region_set', f:me, id, lvl:v, s:-1})) { toast('Impuestos cambiados en toda la región'); again(); } });
    each(el, '[data-ra]', b => { const [id, p] = (b.dataset.ra || '').split(':').map(Number); if (c.act({type:'region_add', f:me, id, p})) { sound('lock'); c.refresh(); again(); } });
    each(el, '[data-rx]', b => { if (confirm('¿Disolver la región? Sus provincias volverán a contar 1 cada una.') && c.act({type:'region_split', f:me, id:+(b.dataset.rx || 0)})) { c.refresh(); again(); } });
  }});
}

/* ======================= Mercado ======================= */
/** @param {Conquest} c */
export function marketSheet(c) {
  const g = c.g, me = c.me, book = E.resBook(c.geo, g, me), can = E.canTrade(g, me);
  const body = `
    <p class="note">${can ? 'Compras al precio del mercado y vendes al 70 %. Los precios suben si muchos compran y bajan si venden; las Indias traen inflación.' : 'Para comerciar hace falta un mercado o un puerto (o comerciar desde la capital).'}</p>
    <div class="grp market">${E.RES.map(r => {
      const info = E.RES_INFO[r], net = book.prod[r] - book.use[r], q10 = E.quote(g, r, 10);
      return `<div class="rowi mk">${rico(r)}<div class="l">${info.name} · <span class="num">${g.F.res[me][r]}</span><small class="num">${net >= 0 ? '+' : '−'}${Math.abs(net)} por turno · ${money(g.market.price[r])} de oro cada uno · tope ${book.cap}</small><small>${esc(info.desc)}</small></div>
        <div class="mkb"><button class="btn sm" data-buy="${r}" ${can && g.F.gold[me] >= q10.buy ? '' : 'disabled'}>+10 · ${q10.buy}</button><button class="btn sm ghost" data-sell="${r}" ${can && g.F.res[me][r] >= 10 ? '' : 'disabled'}>−10 · ${q10.sell}</button></div></div>`;
    }).join('')}</div>`;
  openSheet({title:'Mercado', body, mount:el => {
    const again = () => { c.refresh(); marketSheet(c); };
    each(el, '[data-buy]', b => { if (c.act({type:'trade', f:me, k:b.dataset.buy, n:10})) { sound('coin'); again(); } });
    each(el, '[data-sell]', b => { if (c.act({type:'trade', f:me, k:b.dataset.sell, n:-10})) { sound('coin'); again(); } });
  }});
}

/* ======================= Tratados ======================= */
/** @param {Conquest} c @param {number} d */
export function treatySheet(c, d) {
  const g = c.g, me = c.me, geo = c.geo;
  const theirs = E.provincesOf(g, d).sort((a, b) => (geo.adj[b].some(q => g.P.owner[q] === me) ? 1 : 0) - (geo.adj[a].some(q => g.P.owner[q] === me) ? 1 : 0) || geo.tier[b] - geo.tier[a]);
  /** @type {{ps:number[], amount:number, vas:boolean}} */
  const cl = {ps:[], amount:0, vas:false};
  const draw = (/** @type {HTMLElement} */ el) => {
    const w = E.treatyOk(geo, g, me, d, cl), want = E.treatyDemand(geo, cl), room = E.treatyRoom(g, me, d);
    /** @type {HTMLElement} */ (el.querySelector('#tSum')).innerHTML = `<b class="${w.ok ? 'ok' : 'no'}">${w.ok ? 'Aceptará' : 'Rechazará'}</b> · ${esc(w.why)}<div class="pbar tbar"><i style="width:${Math.min(100, Math.floor(want * 100 / Math.max(1, room)))}%"></i></div>`;
    el.querySelectorAll('[data-tp]').forEach(b => b.setAttribute('aria-checked', String(cl.ps.includes(+(/** @type {HTMLElement} */ (b).dataset.tp || 0)))));
    el.querySelectorAll('[data-ta]').forEach(b => b.classList.toggle('on', +(/** @type {HTMLElement} */ (b).dataset.ta || 0) === cl.amount));
    /** @type {HTMLElement} */ (el.querySelector('#tVas')).setAttribute('aria-checked', String(cl.vas));
  };
  openSheet({title:'Tratado de paz', body:`
    <div class="fhead">${c.flagOf(d, 'md')}<div><b class="disp" style="font:800 22px/1 var(--display)">${esc(g.F.name[d])}</b><p class="note">Puntuación de guerra ${E.warScore(g, me, d)} · su cansancio ${g.F.weary[d]} %. Cuanto mejor te va, más puedes pedir.</p></div></div>
    <div id="tSum" class="tsum"></div>
    <div class="glabel">Provincias que pides</div>
    <div class="grp">${theirs.map(p => `<button class="rowi" role="switch" aria-checked="false" data-tp="${p}"><div class="l">${esc(c.pname(p))}${g.F.capital[d] === p ? ' · capital' : ''}<small>Vale ${6 + 3 * geo.tier[p]}${geo.adj[p].some(q => g.P.owner[q] === me) ? ' · en tu frontera' : ''}</small></div><span class="switch"></span></button>`).join('')}</div>
    <div class="glabel">Oro</div><div class="chips">${[0, 50, 100, 200].map(v => `<button class="chip" data-ta="${v}">${v ? v + ' de oro' : 'Nada'}</button>`).join('')}</div>
    <div class="grp"><button class="rowi" role="switch" aria-checked="false" id="tVas"><div class="l">Que sea tu vasallo<small>Vale 30</small></div><span class="switch"></span></button></div>
    <div class="row2"><button class="btn sm ghost" id="tNo">Cancelar</button><button class="btn sm" id="tGo">Proponer la paz</button></div>`,
    mount:el => {
      draw(el);
      each(el, '[data-tp]', b => { const p = +(b.dataset.tp || 0); cl.ps = cl.ps.includes(p) ? cl.ps.filter(x => x !== p) : [...cl.ps, p]; draw(el); });
      each(el, '[data-ta]', b => { cl.amount = +(b.dataset.ta || 0); draw(el); });
      /** @type {HTMLElement} */ (el.querySelector('#tVas')).onclick = () => { cl.vas = !cl.vas; draw(el); };
      /** @type {HTMLElement} */ (el.querySelector('#tNo')).onclick = () => closeSheet();
      /** @type {HTMLElement} */ (el.querySelector('#tGo')).onclick = () => {
        const ev = c.act({type:'diplo', f:me, d, kind:'tratado', ps:cl.ps, amount:cl.amount, vas:cl.vas});
        if (!ev) return;
        closeSheet();
        if (ev.some(e => e.t === 'treaty')) { sound('conquer'); toast(`Paz firmada con ${g.F.name[d]}`); }
        else if (ev.some(e => e.t === 'offer')) toast('Propuesta enviada');
        else { sound('defend'); toast(`${g.F.name[d]} rechaza el tratado`); }
        c.afterAction(ev);
      };
    }});
}

/* ======================= Población y obras ======================= */
/** Bloque de población, estamentos y producción para el informe. @param {Conquest} c @param {number} p */
export function popBlock(c, p) {
  const g = c.g, geo = c.geo, est = g.P.est[p], pr = E.production(geo, g, p), top = Math.floor(E.pop0(geo.ine[p]) * (150 + 8 * E.buildingsAt(g, p).reduce((s, [, l]) => s + l, 0)) / 100);
  const target = E.estTarget(geo, g, p);
  return `<div class="glabel">Población · ${g.P.pop[p]} mil</div>
    <div class="grp"><div class="rowi"><div class="l">${bar(Math.floor(g.P.pop[p] * 100 / Math.max(1, top)), 'wide')}<small>Máximo ${top} mil (crece con los edificios). Reclutar gasta población; la granja, el hospital y unos campesinos contentos la hacen crecer.</small></div></div></div>
    <div class="glabel">Estamentos</div>
    <div class="grp ests">${E.ESTATES.map((n, i) => `<div class="rowi"><div class="l"><span class="fn">${n} <em>${est[i]}${target[i] > est[i] ? ' ↑' : target[i] < est[i] ? ' ↓' : ''}</em></span>${bar(est[i])}</div></div>`).join('')}</div>
    <p class="note">Campesinos por debajo de 20: revueltas. Burgueses: huelga (oro a la mitad). Nobles: levantamiento. Clero: −5 de lealtad.</p>
    <div class="glabel">Produce cada turno</div>
    <div class="chips res-row">${E.RES.map(r => `<span class="chip ro">${rico(r)}<b class="num">${pr[r]}</b></span>`).join('')}</div>`;
}
/** Obras en curso de una provincia (para la ficha). @param {Conquest} c @param {number} p */
export function queueBlock(c, p) {
  const g = c.g, q = g.P.queue[p] || [];
  if (!q.length) return '';
  return `<div class="queue">${q.map((j, i) => {
    const name = j.b === '*' ? /** @type {Record<string, {name:string}>} */ (E.WONDERS)[j.w || '']?.name || 'Maravilla' : E.BUILDINGS[/** @type {E.Building} */ (j.b)].name;
    return `<div class="qj">${buildArt(j.b === '*' ? 'maravilla' : j.b, 'q obras', j.lvl)}<div class="l"><b>${esc(name)}${j.b === '*' ? '' : ' · nivel ' + j.lvl}</b><small>${i === 0 ? `En obras: ${j.left} turno${j.left === 1 ? '' : 's'}` : 'En cola'}</small></div>${i === 0 && g.P.owner[p] === c.me ? `<button class="btn sm ghost" id="qRush" ${g.F.gold[c.me] >= E.rushCost(g, p) ? '' : 'disabled'}>Acelerar · ${E.rushCost(g, p)}</button>` : ''}</div>`;
  }).join('')}</div>`;
}

// @ts-check
// Preparar una conquista: escenario, tu bando (tocando el mapa o en la lista), dificultad y, plegado,
// todo lo personalizable: bando propio con bandera, líder, tropas, oro y reglas.
import {S, save} from '../store.js';
import {DIFFICULTY, TRAITS} from '../conquest/engine.js';
import {SCENARIOS, scenario, needsPortugal} from '../conquest/scenarios.js';
import {flag} from '../flags.js';
import {bannerFlag, bannerColor, cleanFlag, DEFAULT_FLAG} from '../flagmaker.js';
import {icon} from '../icons.js';
import {sound, announce} from '../fx.js';
import {$, esc} from './dom.js';
import {enableGestures} from './gestures.js';
import {flagEditor} from './flageditor.js';

/** Tipos de victoria. */
export const VICTORY = [['dominacion', 'Dominación total'], ['capitales', 'Capitales (la mitad)'], ['diplomatica', 'Diplomática'], ['puntos', 'Puntos al turno 60']];
const TROOPS = [[3, 'Pocas'], [6, 'Normal'], [10, 'Muchas']];
const GOLD = [[75, 'Escaso'], [100, 'Normal'], [150, 'Abundante']];

/**
 * @param {import('./play.js').World} W
 * @param {{onBack:() => void, onStart:(o:any) => void}} hooks
 */
export function showWarSetup(W, hooks) {
  const el = $('#setup'), view = W.view;
  let sc = S.war.scenario in SCENARIOS ? S.war.scenario : 'las47';
  let diff = /** @type {import('../conquest/engine.js').Difficulty} */ (S.war.diff in DIFFICULTY ? S.war.diff : 'facil');
  const rules = {fog:false, events:true, seasons:true, victory:'dominacion', trait:'', troops:6, gold:100, ...(S.war.rules || {})};
  const custom = {on:false, name:'', ...(S.war.custom || {}), flag:cleanFlag(S.war.custom?.flag || DEFAULT_FLAG)};
  const madrid = W.map.provinces.findIndex(p => p.ine === '28');
  const sc0 = S.war.center ?? -1;
  let center = sc0 >= 0 && sc0 < 47 ? sc0 : madrid;
  let adv = false;
  const isCenter = () => !!(/** @type {any} */ (SCENARIOS[/** @type {'las47'} */ (sc)])).center;
  const mapOf = () => needsPortugal(sc) && W.map48 ? W.map48 : W.map;
  let spec = scenario(mapOf(), sc, W.colors, center);
  let me = isCenter() ? 0 : Math.min(S.war.me >= 0 ? S.war.me : 0, spec.factions.length - 1);
  const owner = () => { const o = new Array(mapOf().provinces.length).fill(-1); spec.factions.forEach((f, i) => f.provinces.forEach(p => { o[p] = i; })); return o; };
  const colors = () => spec.factions.map((f, i) => i === me && custom.on ? bannerColor(custom.flag) : f.color);
  const sw = (/** @type {string} */ k, /** @type {string} */ n, /** @type {string} */ sub, /** @type {boolean} */ on) => `<button class="rowi" role="switch" aria-checked="${on}" data-rule="${k}"><div class="l">${n}<small>${sub}</small></div><span class="switch"></span></button>`;
  const seg = (/** @type {string} */ k, /** @type {(number|string)[][]} */ opts, /** @type {number} */ v) => `<div class="seg" role="group" data-seg="${k}">${opts.map(([x, n]) => `<button data-v="${x}" aria-pressed="${x === v}">${n}</button>`).join('')}</div>`;
  el.hidden = false;
  const render = () => {
    const f = spec.factions[me], scroll = $('#setup .panel')?.scrollTop || 0;
    const name = custom.on && custom.name ? custom.name : f.name;
    const fl = custom.on ? bannerFlag(custom.flag, {cls:'md'}) : f.banner ? bannerFlag(f.banner, {cls:'md'}) : flag(f.flag, {cls:'md'});
    const order = isCenter()
      ? W.map.provinces.map(p => ({i:p.i, n:p.name, v:p.i})).sort((a, b) => a.n.localeCompare(b.n, 'es'))
      : spec.factions.map((x, i) => ({i, n:x.name, v:i})).sort((a, b) => a.n.localeCompare(b.n, 'es'));
    const sel = isCenter() ? center : me;
    const trait = TRAITS[/** @type {'mercader'} */ (rules.trait)];
    el.innerHTML = `
      <header class="top"><button class="icb glass" id="wsBack" aria-label="Volver al menú">${icon('back')}</button><div class="ttl glass"><span>Conquista</span><b>Elige tu bando</b></div></header>
      <div class="dock"><div class="panel glass su">
        <div class="chips sc" role="group" aria-label="Escenario">${Object.entries(SCENARIOS).map(([k, v]) => `<button data-sc="${k}" aria-pressed="${k === sc}">${v.name}</button>`).join('')}</div>
        <p class="hint sch">${esc(SCENARIOS[/** @type {'las47'} */ (sc)].desc)}</p>
        <div class="pick">${fl}<div class="pn"><b>${esc(name)}</b><small>${f.provinces.length} ${f.provinces.length === 1 ? 'provincia' : 'provincias'} · ${spec.factions.length} bandos</small></div>
          <label class="sel"><span class="sr">${isCenter() ? 'Provincia' : 'Bando'}</span><select id="wsSel">${order.map(o => `<option value="${o.v}"${o.v === sel ? ' selected' : ''}>${esc(o.n)}</option>`).join('')}</select>${icon('chev')}</label></div>
        <div class="glabel">Dificultad</div>
        <div class="levels" role="radiogroup" aria-label="Dificultad">${Object.entries(DIFFICULTY).map(([k, v]) => `<button role="radio" data-d="${k}" aria-checked="${k === diff}"><b>${v.name}</b><small><em>${v.sub}.</em> ${v.desc}</small></button>`).join('')}</div>
        <details class="adv"${adv ? ' open' : ''}><summary>Personalizar</summary>
          <div class="grp rulesrow">
            <div class="rowi">${bannerFlag(custom.flag)}<div class="l">Bando propio<small>${custom.on ? esc(custom.name || 'Sin nombre') + ' · en lugar de ' + esc(f.name) : 'Tu nombre y tu bandera'}</small></div><button class="btn sm ghost" id="wsEdit">Editar</button><button class="switch-b" role="switch" aria-checked="${custom.on}" aria-label="Usar bando propio" id="wsOwn"><span class="switch"></span></button></div>
            <div class="rowi"><div class="l">Líder<small>${trait ? esc(trait.desc) : 'Un rasgo al azar'}</small></div><select id="wsTrait" aria-label="Rasgo del líder"><option value="">Al azar</option>${Object.entries(TRAITS).map(([k, v]) => `<option value="${k}"${rules.trait === k ? ' selected' : ''}>${v.name}</option>`).join('')}</select></div>
            <div class="rowi col"><div class="l">Tropas al empezar</div>${seg('troops', TROOPS, rules.troops)}</div>
            <div class="rowi col"><div class="l">Oro</div>${seg('gold', GOLD, rules.gold)}</div>
            ${sw('fog', 'Niebla de guerra', 'Solo ves las tropas cerca de tus fronteras', rules.fog)}
            ${sw('events', 'Eventos', 'Sequías, revueltas, fiestas, plagas…', rules.events)}
            ${sw('seasons', 'Estaciones', 'El invierno frena los ataques en la montaña', rules.seasons)}
            <div class="rowi"><div class="l">Victoria</div><select id="wsVic" aria-label="Tipo de victoria">${VICTORY.map(([k, n]) => `<option value="${k}"${rules.victory === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
          </div></details>
        <button class="btn" id="wsGo">${icon('swords')}A la guerra</button>
      </div></div>`;
    const panel = /** @type {HTMLElement} */ ($('#setup .panel')); panel.scrollTop = scroll;
    $('#wsBack').onclick = () => { sound('tap'); close(); hooks.onBack(); };
    $('#wsGo').onclick = () => {
      sound('lock');
      S.war = {scenario:sc, me, diff, rules, center, custom};
      save(); close();
      hooks.onStart({sc, me, diff, rules, center, custom:custom.on ? {name:custom.name, flag:custom.flag} : null});
    };
    /** @type {HTMLDetailsElement} */ (el.querySelector('details.adv')).ontoggle = e => { adv = /** @type {HTMLDetailsElement} */ (e.target).open; requestAnimationFrame(layout); };
    el.querySelectorAll('[data-rule]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
      const k = /** @type {'fog'} */ (/** @type {HTMLElement} */ (b).dataset.rule); rules[k] = !rules[k]; b.setAttribute('aria-checked', String(rules[k])); sound('tap');
    });
    el.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
      const k = /** @type {'troops'} */ (/** @type {HTMLElement} */ (g).dataset.seg); rules[k] = +(b.dataset.v || 0); sound('tap');
      g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    }));
    /** @type {HTMLSelectElement} */ ($('#wsVic')).onchange = e => { rules.victory = /** @type {HTMLSelectElement} */ (e.target).value; };
    /** @type {HTMLSelectElement} */ ($('#wsTrait')).onchange = e => { rules.trait = /** @type {HTMLSelectElement} */ (e.target).value; sound('tap'); render(); };
    /** @type {HTMLSelectElement} */ ($('#wsSel')).onchange = e => { const v = +(/** @type {HTMLSelectElement} */ (e.target)).value; if (isCenter()) recenter(v); else pick(v); };
    $('#wsOwn').onclick = () => {
      sound('tap');
      if (!custom.on && !custom.name) return edit();
      custom.on = !custom.on; paint(); render();
    };
    $('#wsEdit').onclick = () => { sound('tap'); edit(); };
    el.querySelectorAll('[data-sc]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
      const prev = spec.factions[me].capital;
      sc = /** @type {HTMLElement} */ (b).dataset.sc || 'las47'; sound('tap');
      spec = scenario(mapOf(), sc, W.colors, center);
      me = isCenter() ? 0 : Math.max(0, spec.factions.findIndex(x => x.provinces.includes(prev)));
      paint(); render(); frame();
    });
    el.querySelectorAll('[data-d]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
      diff = /** @type {any} */ (/** @type {HTMLElement} */ (b).dataset.d); sound('tap');
      el.querySelectorAll('[data-d]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    });
    requestAnimationFrame(layout);
  };
  const edit = () => flagEditor({name:custom.name || spec.factions[me].name, flag:custom.flag}, v => { custom.name = v.name; custom.flag = v.flag; custom.on = true; paint(); render(); });
  let lastBottom = -1;
  const layout = () => {
    const top = $('#setup .top')?.getBoundingClientRect(), dock = $('#setup .dock')?.getBoundingClientRect();
    if (!top || !dock) return;
    const bottom = innerHeight - dock.top + 4;
    view.setInsets({top:top.bottom + 4, bottom, left:0, right:0});
    if (Math.abs(bottom - lastBottom) > 2) { lastBottom = bottom; frame(); }
  };
  const frame = () => {
    const act = spec.factions.flatMap(f => f.provinces);
    view.moveTo(isCenter() ? view.frameOf(act, 2.4) : view.overview(), 250);
  };
  const paint = () => {
    view.setMap(mapOf());
    view.setColors(colors());
    view.setOwners(owner(), spec.factions.map(() => false));
    view.me = me; view.rebuild(); view.invalidate();
  };
  const pick = (/** @type {number} */ f) => {
    me = f; sound('tap');
    announce(`${spec.factions[f].name}, ${spec.factions[f].provinces.length} provincias.`);
    paint(); render();
  };
  const recenter = (/** @type {number} */ p) => {
    center = p; sound('tap');
    spec = scenario(mapOf(), sc, W.colors, center); me = 0;
    announce(`${spec.factions[0].name} contra ${spec.factions.length - 1} vecinos.`);
    paint(); render(); frame();
  };
  const off = enableGestures(view, /** @type {HTMLElement} */ ($('#map')), {onTap:(x, y) => {
    const p = view.hit(x, y); if (p < 0) return;
    if (isCenter()) { if (p < 47) recenter(p); return; }
    const o = owner()[p]; if (o >= 0) pick(o);
  }});
  const close = () => { off(); el.hidden = true; el.innerHTML = ''; view.me = -1; view.setColors(W.colors); };
  view.labels = S.settings.labels;
  paint(); render();
}

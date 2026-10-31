// @ts-check
// Preparar una conquista: escenario, tu bando (tocando el mapa o en la lista) y dificultad.
import {S, save} from '../store.js';
import {DIFFICULTY} from '../conquest/engine.js';
import {SCENARIOS, scenario} from '../conquest/scenarios.js';
import {flag} from '../flags.js';
import {icon} from '../icons.js';
import {sound, announce} from '../fx.js';
import {$, esc} from './dom.js';
import {enableGestures} from './gestures.js';

/**
 * @param {import('./play.js').World} W
 * @param {{onBack:() => void, onStart:(sc:string, me:number, diff:import('../conquest/engine.js').Difficulty) => void}} hooks
 */
export function showWarSetup(W, hooks) {
  const el = $('#setup'), view = W.view;
  let sc = S.war.scenario in SCENARIOS ? S.war.scenario : 'las47';
  let diff = /** @type {import('../conquest/engine.js').Difficulty} */ (S.war.diff in DIFFICULTY ? S.war.diff : 'facil');
  let spec = scenario(W.map, sc, W.colors), me = Math.min(S.war.me >= 0 ? S.war.me : 0, spec.factions.length - 1);
  const owner = () => { const o = new Array(W.map.provinces.length).fill(-1); spec.factions.forEach((f, i) => f.provinces.forEach(p => { o[p] = i; })); return o; };
  el.hidden = false;
  const render = () => {
    const f = spec.factions[me];
    el.innerHTML = `
      <header class="top"><button class="icb glass" id="wsBack" aria-label="Volver al menú">${icon('back')}</button><div class="ttl glass"><span>Conquista</span><b>Elige tu bando</b></div></header>
      <div class="dock"><div class="panel glass su">
        <div class="seg sc" role="group" aria-label="Escenario">${Object.entries(SCENARIOS).map(([k, v]) => `<button data-sc="${k}" aria-pressed="${k === sc}">${v.name}</button>`).join('')}</div>
        <div class="pick">${flag(f.flag, {cls:'md'})}<div class="pn"><b>${esc(f.name)}</b><small>${f.provinces.length} ${f.provinces.length === 1 ? 'provincia' : 'provincias'} · capital ${esc(W.names[f.capital])}</small></div>
          <label class="sel"><span class="sr">Bando</span><select id="wsSel">${spec.factions.map((x, i) => ({x, i})).sort((a, b) => a.x.name.localeCompare(b.x.name, 'es')).map(({x, i}) => `<option value="${i}"${i === me ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>${icon('chev')}</label></div>
        <p class="hint">Toca el mapa o elige en la lista.</p>
        <div class="glabel">Dificultad</div>
        <div class="levels" role="radiogroup" aria-label="Dificultad">${Object.entries(DIFFICULTY).map(([k, v]) => `<button role="radio" data-d="${k}" aria-checked="${k === diff}"><b>${v.name}</b><small><em>${v.sub}.</em> ${v.desc}</small></button>`).join('')}</div>
        <button class="btn" id="wsGo">${icon('swords')}A la guerra</button>
      </div></div>`;
    $('#wsBack').onclick = () => { sound('tap'); close(); hooks.onBack(); };
    $('#wsGo').onclick = () => { sound('lock'); S.war = {scenario:sc, me, diff}; save(); close(); hooks.onStart(sc, me, diff); };
    /** @type {HTMLSelectElement} */ ($('#wsSel')).onchange = e => pick(+(/** @type {HTMLSelectElement} */ (e.target)).value);
    el.querySelectorAll('[data-sc]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
      sc = /** @type {HTMLElement} */ (b).dataset.sc || 'las47'; sound('tap');
      spec = scenario(W.map, sc, W.colors); me = 0; paint(); render();
    });
    el.querySelectorAll('[data-d]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
      diff = /** @type {any} */ (/** @type {HTMLElement} */ (b).dataset.d); sound('tap');
      el.querySelectorAll('[data-d]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    });
    requestAnimationFrame(layout);
  };
  const layout = () => {
    const top = $('#setup .top')?.getBoundingClientRect(), dock = $('#setup .dock')?.getBoundingClientRect();
    if (!top || !dock) return;
    view.setInsets({top:top.bottom + 4, bottom:innerHeight - dock.top + 4, left:0, right:0});
    view.moveTo(view.overview(), 250);
  };
  const paint = () => {
    view.setColors(spec.factions.map(f => f.color));
    view.setOwners(owner(), spec.factions.map(() => false));
    view.me = me; view.rebuild(); view.invalidate();
  };
  const pick = (/** @type {number} */ f) => {
    me = f; sound('tap');
    announce(`${spec.factions[f].name}, ${spec.factions[f].provinces.length} provincias.`);
    paint(); render();
  };
  const off = enableGestures(view, /** @type {HTMLElement} */ ($('#map')), {onTap:(x, y) => { const p = view.hit(x, y); if (p >= 0) { const o = owner()[p]; if (o >= 0) pick(o); } }});
  const close = () => { off(); el.hidden = true; el.innerHTML = ''; view.me = -1; view.setColors(W.colors); };
  view.labels = S.settings.labels;
  paint(); render();
}

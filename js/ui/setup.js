// @ts-check
// Un jugador: eliges tu provincia (tocando el mapa o en la lista) y el nivel de los bots.
import {S, save} from '../store.js';
import {LEVELS, level as toLevel} from '../engine/bots.js';
import {flag} from '../flags.js';
import {icon} from '../icons.js';
import {sound, announce} from '../fx.js';
import {$, esc} from './dom.js';

/**
 * @param {import('./play.js').World} W
 * @param {{onStart:(me:number, level:import('../engine/bots.js').Level) => void, onBack:() => void}} hooks
 */
export function showSetup(W, hooks) {
  const el = $('#setup'), view = W.view;
  let me = S.solo.me >= 0 ? S.solo.me : W.map.provinces.findIndex(p => p.name === 'Madrid');
  let lv = toLevel(S.solo.level);
  const order = W.map.provinces.map(p => p.i).sort((a, b) => W.names[a].localeCompare(W.names[b], 'es'));
  el.hidden = false;
  el.innerHTML = `
    <header class="top"><button class="icb glass" id="suBack" aria-label="Volver al menú">${icon('back')}</button><div class="ttl glass"><span>Un jugador</span><b>Elige tu provincia</b></div></header>
    <div class="dock"><div class="panel glass su" aria-label="Preparar partida">
      <div class="pick"><span id="suFlag"></span><div class="pn"><b id="suName"></b><small id="suInfo"></small></div>
        <label class="sel"><span class="sr">Provincia</span><select id="suSel">${order.map(i => `<option value="${i}">${esc(W.names[i])}</option>`).join('')}</select>${icon('chev')}</label></div>
      <p class="hint">Toca una provincia en el mapa o elígela en la lista.</p>
      <div class="glabel">Bots</div>
      <div class="levels" role="radiogroup" aria-label="Nivel de los bots">${Object.entries(LEVELS).map(([k, v]) => `<button role="radio" data-lv="${k}" aria-checked="${k === lv}"><b>${v.name}</b><small>${v.desc}</small></button>`).join('')}</div>
      <button class="btn" id="suGo">${icon('swords')}A la guerra</button>
    </div></div>`;
  const layout = () => {
    const top = $('#setup .top').getBoundingClientRect(), dock = $('#setup .dock').getBoundingClientRect();
    view.setInsets({top:top.bottom + 4, bottom:innerHeight - dock.top + 4, left:0, right:0});
    view.moveTo(view.overview(), 300);
  };
  const select = (/** @type {number} */ f, /** @type {boolean} */ say) => {
    me = f;
    $('#suFlag').innerHTML = flag(f, {cls:'md'});
    $('#suName').textContent = W.names[f];
    const n = W.map.provinces[f].adj.length;
    $('#suInfo').textContent = `${n} provincias vecinas · poder 100`;
    /** @type {HTMLSelectElement} */ ($('#suSel')).value = String(f);
    view.me = f; view.focus([f], [], 260); view.rebuild(); view.invalidate();
    if (say) { sound('tap'); announce(`Elegida ${W.names[f]}, ${n} provincias vecinas.`); }
  };
  W.onTap = (x, y) => { const p = view.hit(x, y); if (p >= 0) select(p, true); };
  /** @type {HTMLSelectElement} */ ($('#suSel')).onchange = e => select(+(/** @type {HTMLSelectElement} */ (e.target)).value, true);
  el.querySelectorAll('[data-lv]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
    lv = toLevel(/** @type {HTMLElement} */ (b).dataset.lv); sound('tap');
    el.querySelectorAll('[data-lv]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  });
  const close = () => { W.onTap = null; el.hidden = true; el.innerHTML = ''; view.me = -1; view.focus([], [], 0); };
  $('#suBack').onclick = () => { sound('tap'); close(); hooks.onBack(); };
  $('#suGo').onclick = () => { sound('lock'); S.solo = {me, level:lv}; save(); close(); hooks.onStart(me, lv); };
  select(me, false);
  requestAnimationFrame(layout);
}

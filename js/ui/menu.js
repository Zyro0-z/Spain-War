// @ts-check
// Menú principal: continuar, conquista, multijugador, espectador, partidas guardadas, semilla y ajustes.
import {S, save} from '../store.js';
import {swords, diceArt, marshalArt, onlineArt} from '../art.js';
import {DIFFICULTY} from '../conquest/engine.js';
import {SCENARIOS} from '../conquest/scenarios.js';
import {icon} from '../icons.js';
import {sound} from '../fx.js';
import {cleanSeed, newSeed} from '../engine/rng.js';
import {$, esc, openSheet, closeSheet, toast} from './dom.js';
import {settingsSheet} from './settings.js';

/**
 * @param {{colors:string[], map:{provinces:{name:string}[]}}} world
 * @param {{onNormal:(seed?:string)=>void, onLook:()=>void, onWar:()=>void, onLoad:(id:string)=>void, onOnline:()=>void, onRoom:()=>void}} hooks
 */
export function renderMenu(world, hooks) {
  const m = $('#menu'), last = S.saves.find(x => !x.over);
  m.hidden = false;
  m.innerHTML = `<div class="menu-in">
    <div class="title">
      ${swords('emb')}
      <div class="kicker">Estrategia por turnos</div>
      <h1 class="logo">España<small>en guerra</small></h1>
      <p class="tagline">Elige tu provincia, haz la guerra o la paz y conquista la península.</p>
    </div>
    ${S.online ? `<button class="btn" id="mRoom">${icon('users')}Volver a la sala ${S.online.code}</button>` : ''}
    ${last ? `<button class="btn${S.online ? ' ghost' : ''}" id="mCont">${icon('play')}Continuar · ${esc(last.name)} · turno ${last.game.turn}</button>` : ''}
    <button class="mode glass" id="mWar" style="--mc:rgba(242,201,76,.2)">
      <span class="art">${marshalArt()}</span>
      <span><h3>Conquista</h3><p>Tu bando contra el resto: tropas, oro, diplomacia y guerra.</p><span class="pill">Fácil · Normal · Difícil</span></span>
      <span class="go">${icon('play')}</span>
    </button>
    <button class="mode glass" id="mOnline" style="--mc:rgba(127,216,232,.16)">
      <span class="art">${onlineArt([world.colors[0], world.colors[27], world.colors[40]])}</span>
      <span><h3>Multijugador</h3><p>De 2 a 8 móviles en la misma partida, con código o QR.</p><span class="pill">${icon('wifi')}Necesita internet</span></span>
      <span class="go">${icon('play')}</span>
    </button>
    <button class="mode glass" id="mNormal" style="--mc:rgba(88,166,255,.16)">
      <span class="art">${diceArt()}</span>
      <span><h3>Espectador</h3><p>Mira cómo luchan solas las 47 provincias, con ruleta y dados.</p></span>
      <span class="go">${icon('play')}</span>
    </button>
    <div class="row3">
      <button class="btn ghost sm" id="mSaves">${icon('map')}Partidas</button>
      <button class="btn ghost sm" id="mSeed">${icon('seed')}Semilla</button>
      <button class="btn ghost sm" id="mSet">${icon('gear')}Ajustes</button>
    </div>
    <p class="credits">Conquista y Espectador funcionan sin conexión.<br>Mapa: © Instituto Geográfico Nacional (CC BY 4.0) · Natural Earth</p>
  </div>`;
  $('#mWar').onclick = () => { sound('tap'); hooks.onWar(); };
  $('#mNormal').onclick = () => { sound('tap'); hooks.onNormal(); };
  $('#mOnline').onclick = () => { sound('tap'); hooks.onOnline(); };
  const c = $('#mCont'); if (c && last) c.onclick = () => { sound('tap'); hooks.onLoad(last.id); };
  const rm = $('#mRoom'); if (rm) rm.onclick = () => { sound('tap'); hooks.onRoom(); };
  $('#mSet').onclick = () => { sound('tap'); settingsSheet(hooks.onLook); };
  $('#mSaves').onclick = () => { sound('tap'); savesSheet(hooks); };
  $('#mSeed').onclick = () => {
    sound('tap');
    openSheet({title:'Semilla', body:`
      <p class="note" style="margin:0 4px 10px">Para el modo espectador: la semilla decide todas las tiradas y la partida se repite igual en cualquier móvil.</p>
      <input class="field" id="sdIn" maxlength="16" placeholder="${esc(newSeed())}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Semilla">
      <div style="height:12px"></div>
      <button class="btn" id="sdGo">${icon('play')}Mirar con esta semilla</button>`,
      mount:el => {
        const inp = /** @type {HTMLInputElement} */ (el.querySelector('#sdIn'));
        /** @type {HTMLElement} */ (el.querySelector('#sdGo')).onclick = () => {
          const s = cleanSeed(inp.value) || cleanSeed(inp.placeholder);
          closeSheet(); hooks.onNormal(s);
        };
      }});
  };
}
/** Partidas de conquista guardadas. @param {{onLoad:(id:string)=>void}} hooks */
function savesSheet(hooks) {
  const list = S.saves;
  openSheet({title:'Partidas', body:list.length ? `
    <p class="note" style="margin:0 4px 10px">Se guardan solas. Hasta 5 partidas.</p>
    <div class="grp">${list.map(x => `<div class="rowi">${icon('map')}<button class="l lbtn" data-id="${x.id}">${esc(x.name)}<small>${SCENARIOS[/** @type {'las47'} */ (x.scenario)]?.name || ''} · ${DIFFICULTY[/** @type {'facil'} */ (x.diff)]?.name || ''} · turno ${x.game.turn}${x.over ? ' · terminada' : ''}</small></button><button class="icb" data-del="${x.id}" aria-label="Borrar ${esc(x.name)}">${icon('close')}</button></div>`).join('')}</div>`
    : '<p class="note">Aún no hay partidas. Empieza una conquista.</p>',
    mount:el => {
      el.querySelectorAll('[data-id]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { closeSheet(); hooks.onLoad(/** @type {HTMLElement} */ (b).dataset.id || ''); });
      el.querySelectorAll('[data-del]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
        S.saves = S.saves.filter(x => x.id !== /** @type {HTMLElement} */ (b).dataset.del); save(); sound('tap');
        closeSheet(); toast('Partida borrada');
      });
    }});
}
export function hideMenu() { const m = $('#menu'); m.hidden = true; m.innerHTML = ''; }

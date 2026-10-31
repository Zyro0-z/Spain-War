// @ts-check
// Menú principal: título, modos de juego, semilla, continuar y ajustes.
import {S} from '../store.js';
import {swords, diceArt, marshalArt, onlineArt} from '../art.js';
import {icon} from '../icons.js';
import {sound} from '../fx.js';
import {cleanSeed, newSeed} from '../engine/rng.js';
import {$, esc, openSheet, closeSheet, toast} from './dom.js';
import {settingsSheet} from './settings.js';

/**
 * @param {{colors:string[], map:{provinces:{name:string}[]}}} world
 * @param {{onNormal:(seed?:string)=>void, onResume:()=>void, onLook:()=>void}} hooks
 */
export function renderMenu(world, hooks) {
  const m = $('#menu'), cur = S.current;
  m.hidden = false;
  m.innerHTML = `<div class="menu-in">
    <div class="title">
      ${swords('emb')}
      <div class="kicker">Estrategia por turnos</div>
      <h1 class="logo">España<small>en guerra</small></h1>
      <p class="tagline">47 provincias. Una ruleta, tres dados y solo un bando en pie.</p>
    </div>
    ${cur ? `<button class="btn" id="mResume">${icon('play')}Continuar · ronda ${cur.game.round}</button>` : ''}
    <button class="mode glass" id="mNormal" style="--mc:rgba(242,201,76,.18)">
      <span class="art">${diceArt()}</span>
      <span><h3>Normal</h3><p>Simulación automática. Mira cómo luchan las 47 provincias hasta que solo quede una.</p></span>
      <span class="go">${icon('play')}</span>
    </button>
    <button class="mode glass locked" id="mSolo" style="--mc:rgba(88,166,255,.18)" aria-disabled="true">
      <span class="art">${marshalArt()}</span>
      <span><h3>Un jugador</h3><p>Elige tu provincia y conquista España contra los bots.</p><span class="pill">${icon('lock')}Muy pronto</span></span>
      <span class="go">${icon('lock')}</span>
    </button>
    <button class="mode glass locked" id="mOnline" style="--mc:rgba(127,216,232,.16)" aria-disabled="true">
      <span class="art">${onlineArt([world.colors[0], world.colors[27], world.colors[40]])}</span>
      <span><h3>Multijugador</h3><p>De 2 a 8 móviles en la misma partida.</p><span class="pill">${icon('wifi')}Necesita internet · Muy pronto</span></span>
      <span class="go">${icon('lock')}</span>
    </button>
    <div class="row2">
      <button class="btn ghost sm" id="mSeed">${icon('seed')}Semilla</button>
      <button class="btn ghost sm" id="mSet">${icon('gear')}Ajustes</button>
    </div>
    <p class="credits">Los modos normal y un jugador funcionan sin conexión.<br>Mapa: © Instituto Geográfico Nacional (CC BY 4.0) · Natural Earth</p>
  </div>`;
  $('#mNormal').onclick = () => { sound('tap'); hooks.onNormal(); };
  const r = $('#mResume'); if (r) r.onclick = () => { sound('tap'); hooks.onResume(); };
  $('#mSolo').onclick = () => { sound('tap'); toast('El modo un jugador llega en la siguiente fase'); };
  $('#mOnline').onclick = () => { sound('tap'); toast('El multijugador llega en la última fase'); };
  $('#mSet').onclick = () => { sound('tap'); settingsSheet(hooks.onLook); };
  $('#mSeed').onclick = () => {
    sound('tap');
    openSheet({title:'Semilla', body:`
      <p class="note" style="margin:0 4px 10px">La semilla decide todas las tiradas. Con la misma semilla, la partida se repite igual en cualquier móvil.</p>
      <input class="field" id="sdIn" maxlength="16" placeholder="${esc(newSeed())}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Semilla">
      <div style="height:12px"></div>
      <button class="btn" id="sdGo">${icon('play')}Jugar con esta semilla</button>`,
      mount:el => {
        const inp = /** @type {HTMLInputElement} */ (el.querySelector('#sdIn'));
        /** @type {HTMLElement} */ (el.querySelector('#sdGo')).onclick = () => {
          const s = cleanSeed(inp.value) || cleanSeed(inp.placeholder);
          closeSheet(); hooks.onNormal(s);
        };
      }});
  };
}
export function hideMenu() { const m = $('#menu'); m.hidden = true; m.innerHTML = ''; }

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
import {MISSIONS, unlocked, today} from '../conquest/campaign.js';
import {medalsSheet} from './medals.js';
import {MEDALS} from '../conquest/medals.js';
import {starSvg} from './conquest.js';
import {fillBoard} from './board.js';

/** Arte de las losetas del menú (trazo dorado). */
const TILE = {
  camp:'<svg viewBox="0 0 40 40" class="tart" aria-hidden="true"><path d="M10 35V5" stroke-width="2.4"/><path d="M10 6h20l-5 6 5 6H10" fill="rgba(242,201,76,.25)"/><path d="M19 9.2l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.2 1.2.4-2.5-1.8-1.7 2.5-.3Z" fill="currentColor" stroke="none"/></svg>',
  daily:'<svg viewBox="0 0 40 40" class="tart" aria-hidden="true"><rect x="6" y="9" width="28" height="25" rx="4" fill="rgba(242,201,76,.18)"/><path d="M6 16h28M13 5v7M27 5v7"/><circle cx="20" cy="25" r="4"/><path d="M20 18.5v1.5M20 30v1.5M13.5 25H15M25 25h1.5"/></svg>',
  tut:'<svg viewBox="0 0 40 40" class="tart" aria-hidden="true"><circle cx="20" cy="20" r="14" fill="rgba(242,201,76,.16)"/><path d="M20 9v3M20 28v3M9 20h3M28 20h3"/><path d="M24.5 15.5 21.5 21.5 15.5 24.5 18.5 18.5Z" fill="currentColor"/></svg>',
};

/**
 * @param {{colors:string[], map:{provinces:{name:string}[]}}} world
 * @param {{onNormal:(seed?:string)=>void, onLook:()=>void, onWar:()=>void, onLoad:(id:string)=>void, onOnline:()=>void, onRoom:()=>void,
 *   onMission:(id:string)=>void, onDaily:()=>void, onTutorial:()=>void}} hooks
 */
export function renderMenu(world, hooks) {
  const m = $('#menu'), last = S.saves.find(x => !x.over);
  const stars = MISSIONS.reduce((a, x) => a + (S.campaign[x.id] || 0), 0), cur = MISSIONS.findIndex((x, i) => unlocked(S.campaign, i) && !S.campaign[x.id]);
  const day = today(), best = S.daily.day === day && S.daily.best >= 0 ? S.daily.best : -1;
  const medals = Object.keys(S.medals).filter(k => MEDALS[k]).length;
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
    <div class="tiles">
      <button class="tile glass" id="mCamp">${TILE.camp}<b>Campaña</b><small><span class="num">${stars}/${MISSIONS.length * 3}</span> ${starSvg(true)}</small></button>
      <button class="tile glass" id="mDaily">${TILE.daily}<b>Desafío</b><small>${best >= 0 ? `Hoy: <span class="num">${best}</span>` : 'El de hoy'}</small></button>
      <button class="tile glass${S.tutorial ? '' : ' hot'}" id="mTut">${TILE.tut}<b>Tutorial</b><small>${S.tutorial ? 'Repasar' : 'Empieza aquí'}</small></button>
    </div>
    <button class="mode glass" id="mOnline" style="--mc:rgba(127,216,232,.16)">
      <span class="art">${onlineArt([world.colors[0], world.colors[27], world.colors[40]])}</span>
      <span><h3>Multijugador</h3><p>De 2 a 8 móviles en la misma conquista, con turnos a la vez.</p><span class="pill">${icon('wifi')}Necesita internet</span></span>
      <span class="go">${icon('play')}</span>
    </button>
    <button class="mode glass" id="mNormal" style="--mc:rgba(88,166,255,.16)">
      <span class="art">${diceArt()}</span>
      <span><h3>Espectador</h3><p>Mira cómo luchan solas las 47 provincias, con ruleta y dados.</p></span>
      <span class="go">${icon('play')}</span>
    </button>
    <div class="row3">
      <button class="btn ghost sm" id="mSaves">${icon('map')}Partidas</button>
      <button class="btn ghost sm" id="mMedals">${icon('crown')}Logros <span class="num">${medals}</span></button>
      <button class="btn ghost sm" id="mSet">${icon('gear')}Ajustes</button>
    </div>
    <p class="credits">Conquista y Espectador funcionan sin conexión.<br>Mapa: © Instituto Geográfico Nacional (CC BY 4.0) · Natural Earth</p>
  </div>`;
  $('#mWar').onclick = () => { sound('tap'); hooks.onWar(); };
  $('#mNormal').onclick = () => { sound('tap'); hooks.onNormal(); };
  $('#mOnline').onclick = () => { sound('tap'); hooks.onOnline(); };
  const c = $('#mCont'); if (c && last) c.onclick = () => { sound('tap'); hooks.onLoad(last.id); };
  const rm = $('#mRoom'); if (rm) rm.onclick = () => { sound('tap'); hooks.onRoom(); };
  $('#mSet').onclick = () => { sound('tap'); settingsSheet(hooks.onLook, () => seedSheet(hooks)); };
  $('#mMedals').onclick = () => { sound('tap'); medalsSheet(); };
  $('#mCamp').onclick = () => { sound('tap'); campaignSheet(hooks, cur); };
  $('#mDaily').onclick = () => { sound('tap'); dailySheet(hooks); };
  $('#mTut').onclick = () => { sound('tap'); hooks.onTutorial(); };
  $('#mSaves').onclick = () => { sound('tap'); savesSheet(hooks); };
}
/** Semilla para el modo espectador. @param {{onNormal:(seed?:string)=>void}} hooks */
function seedSheet(hooks) {
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
}
/** Campaña: misiones con estrellas. @param {{onMission:(id:string)=>void}} hooks @param {number} cur */
function campaignSheet(hooks, cur) {
  openSheet({title:'Campaña', body:`
    <p class="note" style="margin:0 4px 10px">Ocho misiones encadenadas. Gana deprisa para llevarte las tres estrellas.</p>
    <div class="grp">${MISSIONS.map((x, i) => {
      const open = unlocked(S.campaign, i), st = S.campaign[x.id] || 0;
      return `<button class="rowi mis${i === cur ? ' cur' : ''}" data-m="${i}" ${open ? '' : 'disabled'}><span class="mn num">${i + 1}</span><div class="l">${esc(x.name)}<small>${open ? esc(SCENARIOS[/** @type {'las47'} */ (x.sc)].title) + ' · ' + esc(DIFFICULTY[x.diff].name) : 'Gana la misión anterior'}</small></div><span class="st3">${[0, 1, 2].map(k => starSvg(k < st)).join('')}</span></button>`;
    }).join('')}</div>`,
    mount:el => el.querySelectorAll('[data-m]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
      const i = +(/** @type {HTMLElement} */ (b).dataset.m || 0); sound('tap'); closeSheet();
      setTimeout(() => briefSheet(hooks, i), 300);
    })});
}
/** @param {{onMission:(id:string)=>void}} hooks @param {number} i */
function briefSheet(hooks, i) {
  const x = MISSIONS[i], vic = {dominacion:'Conquista todas las provincias en juego', capitales:'Toma la mitad de las capitales', diplomatica:'30 % del mapa y pacto o alianza con todos', puntos:'La mejor puntuación'};
  openSheet({title:`Misión ${i + 1}`, body:`
    <h4 class="brief-t">${esc(x.name)}</h4>
    <p class="brief-p">${esc(x.brief)}</p>
    <div class="grp">
      <div class="rowi">${icon('map')}<div class="l">Escenario<small>${esc(SCENARIOS[/** @type {'las47'} */ (x.sc)].title)} · ${esc(DIFFICULTY[x.diff].name)}</small></div></div>
      <div class="rowi">${icon('flag')}<div class="l">Objetivo<small>${vic[/** @type {'puntos'} */ (x.victory)]}</small></div></div>
      <div class="rowi">${starSvg(true)}<div class="l">Estrellas<small>Tres en ${x.stars[0]} turnos o menos, dos en ${x.stars[1]}</small></div></div>
    </div>
    <button class="btn" id="bGo">${icon('swords')}Empezar la misión</button>`,
    mount:el => { /** @type {HTMLElement} */ (el.querySelector('#bGo')).onclick = () => { sound('lock'); closeSheet(); hooks.onMission(x.id); }; }});
}
/** Desafío diario con la clasificación del día. @param {{onDaily:()=>void}} hooks */
function dailySheet(hooks) {
  const day = today(), best = S.daily.day === day && S.daily.best >= 0 ? S.daily.best : -1;
  openSheet({title:'Desafío del día', body:`
    <p class="brief-p">Cada día, la misma partida para todo el mundo: mismo escenario, mismo bando y mismos dados. Tienes 30 turnos para sumar todos los puntos que puedas.</p>
    <div class="grp">
      <div class="rowi">${icon('target')}<div class="l">Puntos<small>10 por provincia, 25 por capital, más tropas y oro</small></div></div>
      <div class="rowi">${icon('crown')}<div class="l">Tu mejor marca de hoy<small>${best >= 0 ? best + ' puntos' : 'Aún no has jugado'}</small></div></div>
    </div>
    <div class="glabel">Tu nombre en la tabla</div>
    <input class="field nm" id="dName" maxlength="16" placeholder="Nombre" autocomplete="nickname" value="${esc(S.profile.name)}" aria-label="Tu nombre en la clasificación">
    <div class="glabel">Clasificación de hoy</div>
    <div class="grp board" id="dBoard"></div>
    <button class="btn" id="dGo">${icon('swords')}Jugar el desafío</button>
    <p class="note">La tabla usa el servicio público ntfy.sh: solo viajan tu nombre, el bando y los puntos.</p>`,
    mount:el => {
      fillBoard(/** @type {HTMLElement} */ (el.querySelector('#dBoard')), day);
      /** @type {HTMLElement} */ (el.querySelector('#dGo')).onclick = () => {
        const n = (/** @type {HTMLInputElement} */ (el.querySelector('#dName'))).value.trim().slice(0, 16);
        if (n) { S.profile.name = n; save(); }
        sound('lock'); closeSheet(); hooks.onDaily();
      };
    }});
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

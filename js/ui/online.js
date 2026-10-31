// @ts-check
// Multijugador: crear o unirse a una sala, sala de espera con código, enlace y QR, y la partida online.
// La red va por ntfy.sh (como la mesa compartida del sushi). Con ?red=local se usa el navegador (pruebas).
import {S, save} from '../store.js';
import {LEVELS, level as toLevel} from '../engine/bots.js';
import {Host, Guest, newCode, cleanCode, MAX_PLAYERS} from '../net/room.js';
import {NtfyTransport, LocalTransport, topicOf} from '../net/transport.js';
import {flag} from '../flags.js';
import {icon} from '../icons.js';
import {qrSVG} from '../qr.js';
import {sound, announce} from '../fx.js';
import {$, esc, toast, openSheet, closeSheet} from './dom.js';
import {HostDriver, GuestDriver} from './drivers.js';
import {Match} from './play.js';
import {hideMenu} from './menu.js';

/** @typedef {import('./play.js').World} World */
/** @typedef {{onExit:() => void, onLook?:() => void}} OnlineHooks */

const LOCAL = () => new URLSearchParams(location.search).get('red') === 'local';
/** @param {string} code */
const transportFor = code => LOCAL() ? new LocalTransport(topicOf(code)) : new NtfyTransport(topicOf(code));
/** Id del jugador. En pruebas locales (varias pestañas del mismo navegador) cada pestaña tiene el suyo. */
function myId() {
  if (!LOCAL()) return S.profile.id;
  try { let v = sessionStorage.getItem('eeg-tab'); if (!v) { v = Math.random().toString(36).slice(2, 12); sessionStorage.setItem('eeg-tab', v); } return v; } catch (e) { return S.profile.id; }
}
/** @param {string} code */
export const roomLink = code => location.origin + location.pathname + '?sala=' + code + (LOCAL() ? '&red=local' : '');

/** @type {Host|Guest|null} */
let room = null;
/** @type {Match|null} */
let match = null;
/** @type {any} */
let lock = null;
/** Partida online en curso (para pruebas). */
export const onlineMatch = () => match;
/** Sala en curso (para pruebas). */
export const onlineRoom = () => room;

/* ---------- Pantalla encendida en el anfitrión ---------- */
async function wake() { try { lock = await /** @type {any} */ (navigator).wakeLock?.request('screen'); } catch (e) { lock = null; } }
function unwake() { try { lock?.release(); } catch (e) {} lock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !room) return;
  if (room instanceof Host && room.phase === 'play') wake();
  room.resync().catch(() => {}); // al volver: lo perdido con poll since y escucha de nuevo
});

/** Guarda la sala para poder volver si se cierra Safari. */
function persist() {
  if (!room) return;
  S.online = {kind:room instanceof Host ? 'host' : 'guest', code:room.code, at:Date.now(), data:room.toJSON(), view:match ? match.game : (S.online?.view || null)};
  save();
}
function leaveRoom() { if (room) { if (room instanceof Guest && room.phase !== 'play') room.leave(); room.close(); } room = null; match = null; unwake(); }

/* ---------- Entrada ---------- */
/** @param {World} W @param {OnlineHooks} hooks @param {string} [code] código del enlace */
export function onlineSheet(W, hooks, code = '') {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  openSheet({title:'Multijugador', body:`
    <p class="note" style="margin:0 4px 12px">${icon('wifi', 'inl')} La partida online necesita internet. Los modos normal y un jugador funcionan sin conexión.</p>
    ${offline ? `<p class="warn">Ahora mismo no hay conexión a internet.</p>` : ''}
    <div class="glabel">Tu nombre</div>
    <input class="field nm" id="onName" maxlength="16" placeholder="Nombre" autocomplete="nickname" value="${esc(S.profile.name)}" aria-label="Tu nombre">
    ${code ? '' : `<div style="height:12px"></div><button class="btn" id="onNew">${icon('users')}Crear sala</button>`}
    <div class="glabel">${code ? 'Sala' : 'Unirse con un código'}</div>
    <input class="field" id="onCode" maxlength="6" placeholder="ABC123" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(code)}" aria-label="Código de sala">
    <div class="grp" style="margin-top:10px"><button class="rowi" role="switch" aria-checked="false" id="onSpec">${icon('user')}<div class="l">Solo mirar<small>Entras como espectador, sin bando</small></div><span class="switch"></span></button></div>
    <button class="btn ${code ? '' : 'ghost'}" id="onJoin">${icon('play')}Unirse</button>
    <p class="note">De 2 a ${MAX_PLAYERS} móviles. Cada persona controla un bando y el resto son bots. Se usa el servicio público ntfy.sh: solo viajan nombres, provincias y tiradas.</p>`,
    mount(el) {
      const nameOf = () => { const n = /** @type {HTMLInputElement} */ (el.querySelector('#onName')).value.trim().slice(0, 16); if (!n) { toast('Escribe tu nombre'); return ''; } S.profile.name = n; save(); return n; };
      const spec = /** @type {HTMLElement} */ (el.querySelector('#onSpec'));
      spec.onclick = () => { spec.setAttribute('aria-checked', String(spec.getAttribute('aria-checked') !== 'true')); sound('tap'); };
      const nw = /** @type {HTMLElement|null} */ (el.querySelector('#onNew'));
      if (nw) nw.onclick = () => { const n = nameOf(); if (!n) return; closeSheet(); createRoom(W, hooks, n); };
      /** @type {HTMLElement} */ (el.querySelector('#onJoin')).onclick = () => {
        const n = nameOf(); if (!n) return;
        const c = cleanCode(/** @type {HTMLInputElement} */ (el.querySelector('#onCode')).value);
        if (c.length !== 6) { toast('El código tiene 6 letras o números'); return; }
        closeSheet(); joinRoom(W, hooks, c, n, spec.getAttribute('aria-checked') === 'true' ? 'spectator' : 'player');
      };
    }});
}

/** @param {World} W @param {OnlineHooks} hooks @param {string} name */
async function createRoom(W, hooks, name) {
  hideMenu();
  const code = newCode();
  const host = new Host({transport:transportFor(code), graph:W.graph, id:myId(), name, code, level:S.solo.level, onChange:() => { persist(); renderLobby(W, hooks); }});
  room = host;
  renderLobby(W, hooks);
  try { await host.open(); } catch (e) { toast('No se pudo abrir la sala. ¿Hay internet?'); }
  sound('lock'); announce(`Sala ${code} creada.`);
  persist();
}
/** @param {World} W @param {OnlineHooks} hooks @param {string} code @param {string} name @param {'player'|'spectator'} role */
async function joinRoom(W, hooks, code, name, role) {
  hideMenu();
  const g = new Guest({transport:transportFor(code), graph:W.graph, id:myId(), name, code, role,
    onChange:() => { persist(); if (!match) renderLobby(W, hooks); }, onStart:() => setTimeout(() => startGuest(W, hooks), 0)});
  room = g;
  renderLobby(W, hooks);
  try { await g.join(); } catch (e) { toast('No se pudo entrar en la sala. ¿Hay internet?'); }
  persist();
  if (g.phase === 'play' && !match) startGuest(W, hooks);
}

/** Vuelve a la sala guardada (al abrir de nuevo la app). @param {World} W @param {OnlineHooks} hooks */
export async function resumeOnline(W, hooks) {
  const o = S.online; if (!o) return false;
  hideMenu();
  if (o.kind === 'host') {
    const h = new Host({transport:transportFor(o.code), graph:W.graph, id:o.data.id, name:S.profile.name, code:o.code, onChange:() => { persist(); if (!match) renderLobby(W, hooks); }});
    h.restore(o.data); room = h;
    try { await h.open(h.lastId); } catch (e) {}
    if (h.phase === 'play') startHost(W, hooks, true); else renderLobby(W, hooks);
  } else {
    const g = new Guest({transport:transportFor(o.code), graph:W.graph, id:o.data.id, name:o.data.name, code:o.code, role:o.data.role,
      onChange:() => { persist(); if (!match) renderLobby(W, hooks); }, onStart:() => setTimeout(() => startGuest(W, hooks), 0)});
    g.restore(o.data); room = g;
    try { await g.join(g.lastId || 'all'); } catch (e) {}
    if (g.phase === 'play') startGuest(W, hooks, o.view || null); else renderLobby(W, hooks);
  }
  return true;
}

/* ---------- Sala de espera ---------- */
/** @param {World} W @param {OnlineHooks} hooks */
function renderLobby(W, hooks) {
  if (!room || match) return;
  const el = $('#lobby'), isHost = room instanceof Host, code = room.code;
  const players = room.players, mine = players.find(p => p.id === room?.id);
  const taken = new Set(players.filter(p => p !== mine).map(p => p.f));
  const order = W.map.provinces.map(p => p.i).sort((a, b) => W.names[a].localeCompare(W.names[b], 'es'));
  const level = room.level, sp = room.sp;
  const spectator = room instanceof Guest && room.role === 'spectator';
  const focusEl = document.activeElement?.id;
  el.hidden = false;
  el.innerHTML = `
    <header class="top"><button class="icb glass" id="lbBack" aria-label="Salir de la sala">${icon('back')}</button><div class="ttl glass"><span>Multijugador</span><b>${isHost ? 'Tu sala' : spectator ? 'Mirando' : 'Sala'}</b></div></header>
    <div class="lb glass">
      <div class="code-row">
        <div class="code-box"><span>Código</span><b class="num">${code}</b><button class="btn sm" id="lbShare">${icon('share')}Invitar</button></div>
        <div class="qr-box">${qrSVG(roomLink(code))}</div>
      </div>
      <div class="glabel">Jugadores <span class="num">${players.length}/${MAX_PLAYERS}</span></div>
      <div class="grp players" role="list">${players.length ? players.map(p => `
        <div class="rowi" role="listitem">${p.f >= 0 ? flag(p.f) : `<span class="flag empty"></span>`}<div class="l"><b>${esc(p.name)}${p.id === room?.id ? ' (tú)' : ''}</b><small>${p.f >= 0 ? esc(W.names[p.f]) : 'Eligiendo provincia…'}</small></div>${p.host ? '<span class="badge">Anfitrión</span>' : ''}</div>`).join('') : '<div class="rowi"><div class="l"><small>Conectando con la sala…</small></div></div>'}</div>
      ${mine ? `<div class="glabel">Tu provincia</div>
        <label class="sel wide"><span class="sr">Tu provincia</span><select id="lbSel"><option value="-1">Elige…</option>${order.map(i => `<option value="${i}"${mine.f === i ? ' selected' : ''}${taken.has(i) ? ' disabled' : ''}>${esc(W.names[i])}${taken.has(i) ? ' (ocupada)' : ''}</option>`).join('')}</select>${icon('chev')}</label>` : ''}
      ${isHost ? `<div class="glabel">Bots</div>
        <div class="seg lv" role="group" aria-label="Nivel de los bots">${Object.entries(LEVELS).map(([k, v]) => `<button data-lv="${k}" aria-pressed="${k === level}">${v.name}</button>`).join('')}</div>
        <div class="glabel">Velocidad</div>
        <div class="seg" role="group" aria-label="Velocidad">${[1, 2].map(v => `<button data-sp="${v}" aria-pressed="${sp === v}">x${v}</button>`).join('')}</div>
        <button class="btn" id="lbStart" ${/** @type {Host} */ (room).canStart() ? '' : 'disabled'}>${icon('swords')}Empezar</button>
        <p class="note">${/** @type {Host} */ (room).canStart() ? 'Todos listos.' : 'Hacen falta al menos 2 jugadores y que todos elijan provincia.'}</p>`
      : `<p class="note wait">${spectator ? 'Verás la partida en cuanto el anfitrión empiece.' : 'Esperando a que el anfitrión empiece…'} Bots: ${LEVELS[toLevel(level)].name} · x${sp}</p>`}
      <p class="note">${icon('wifi', 'inl')} La partida online necesita internet. Los modos normal y un jugador funcionan sin conexión.</p>
    </div>`;
  W.view.setInsets({top:0, bottom:innerHeight * .55, left:0, right:0});
  const picked = players.filter(p => p.f >= 0).map(p => p.f);
  W.view.focus(picked, [], 300);
  $('#lbBack').onclick = () => { sound('tap'); leaveRoom(); S.online = null; save(); el.hidden = true; el.innerHTML = ''; W.view.focus([], [], 0); hooks.onExit(); };
  $('#lbShare').onclick = () => {
    const url = roomLink(code), text = `Únete a mi partida de España en Guerra: sala ${code}`;
    if (navigator.share) navigator.share({title:'España en Guerra', text, url}).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado'), () => toast(code));
  };
  const sel = /** @type {HTMLSelectElement|null} */ ($('#lbSel'));
  if (sel) sel.onchange = () => {
    const f = +sel.value; sound('tap');
    if (room instanceof Host) { if (!room.pick(f)) toast('Esa provincia ya está cogida'); }
    else room?.pick(f).catch(() => toast('Sin conexión'));
  };
  el.querySelectorAll('[data-lv]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { sound('tap'); /** @type {Host} */ (room).configure({level:/** @type {HTMLElement} */ (b).dataset.lv}); });
  el.querySelectorAll('[data-sp]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { sound('tap'); /** @type {Host} */ (room).configure({sp:+(/** @type {HTMLElement} */ (b).dataset.sp || 1)}); });
  const st = $('#lbStart');
  if (st) st.onclick = async () => {
    sound('lock');
    try { await /** @type {Host} */ (room).start(); startHost(W, hooks); } catch (e) { toast('No se pudo empezar: ' + /** @type {Error} */ (e).message); }
  };
  if (focusEl) document.getElementById(focusEl)?.focus();
}

/* ---------- Partida ---------- */
/** @param {World} W @param {OnlineHooks} hooks @param {boolean} [resumed] */
async function startHost(W, hooks, resumed = false) {
  const host = /** @type {Host} */ (room);
  $('#lobby').hidden = true; $('#lobby').innerHTML = '';
  const driver = new HostDriver(host);
  const game = /** @type {import('../engine/game.js').Game} */ (resumed ? host.game : host.game);
  if (!resumed) await driver.init();
  wake();
  run(W, hooks, resumed ? /** @type {any} */ (host.game) : game, driver, host.sp);
}
/** @param {World} W @param {OnlineHooks} hooks @param {import('../engine/game.js').Game|null} [view] */
function startGuest(W, hooks, view = null) {
  if (match || !(room instanceof Guest)) return;
  const g = room;
  $('#lobby').hidden = true; $('#lobby').innerHTML = '';
  const driver = new GuestDriver(g);
  run(W, hooks, view && view.seed === g.seed ? view : g.initial(), driver, g.sp);
}
/**
 * @param {World} W @param {OnlineHooks} hooks @param {import('../engine/game.js').Game} game
 * @param {import('./drivers.js').Driver} driver @param {number} sp
 */
function run(W, hooks, game, driver, sp) {
  const isHost = driver.kind === 'host';
  match = new Match(W, game, driver, {
    onExit:() => { leaveRoom(); hooks.onExit(); },
    save:() => persist(),
    onEnd:() => { S.online = null; save(); unwake(); },
    info:() => `<div class="glabel">Sala</div><div class="grp"><div class="rowi">${icon('users')}<div class="l"><b class="disp" style="font:800 24px/1 var(--display);letter-spacing:.14em">${room?.code || ''}</b><small>${(room?.players || []).map(p => esc(p.name) + (p.f >= 0 ? ' · ' + esc(W.names[p.f]) : '')).join(', ')}</small></div></div>
      <button class="rowi" id="olLeave">${icon('close')}<div class="l">Abandonar la sala<small>${isHost ? 'La partida se para para todos' : 'Tu bando pasa a ser un bot'}</small></div></button></div>`,
  }, {speeds:isHost ? [1, 2] : [sp], pause:isHost, speed:sp});
  match.mount();
  // «Abandonar la sala» dentro de la hoja de partida
  document.addEventListener('click', function leave(e) {
    const b = /** @type {HTMLElement} */ (e.target).closest?.('#olLeave');
    if (!b) return;
    document.removeEventListener('click', leave, true);
    if (room instanceof Guest) room.leave();
    closeSheet(); S.online = null; save();
    match?.unmount(); leaveRoom(); hooks.onExit();
  }, true);
}

// @ts-check
// Multijugador de la conquista: crear o unirse a una sala, sala de espera (código, enlace, QR, escenario,
// dificultad, reglas y bando de cada uno) y la partida con turnos simultáneos. La red va por ntfy.sh;
// con ?red=local se usa el propio navegador (varias pestañas, para probar sin internet).
import {S, save} from '../store.js';
import * as E from '../conquest/engine.js';
import {SCENARIOS, scenario, needsPortugal} from '../conquest/scenarios.js';
import {newConquest} from '../conquest/newgame.js';
import {WarHost, WarGuest, newCode, cleanCode, MAX_PLAYERS, DEFAULT_CFG} from '../net/warroom.js';
import {NtfyTransport, LocalTransport, topicOf} from '../net/transport.js';
import {bannerFlag, bannerColor, cleanFlag} from '../flagmaker.js';
import {flag} from '../flags.js';
import {icon} from '../icons.js';
import {qrSVG} from '../qr.js';
import {sound, announce} from '../fx.js';
import {$, esc, toast, openSheet, closeSheet} from './dom.js';
import {hideMenu} from './menu.js';
import {Conquest} from './conquest.js';
import {VICTORY} from './warsetup.js';

/** @typedef {import('./play.js').World} World */
/** @typedef {{onExit:() => void}} OnlineHooks */
/** Escenarios que se pueden jugar en red. */
const NET_SC = ['comunidades', 'reinos', 'peninsula', 'las47'];
const TIMERS = [[0, 'Sin límite'], [120, '2 min'], [300, '5 min']];

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

/** @type {WarHost|WarGuest|null} */
let peer = null;
/** @type {Conquest|null} */
let war = null;
/** @type {any} */
let lock = null;
/** @type {World|null} */
let world = null;
/** @type {OnlineHooks|null} */
let hk = null;
/** El jugador ha vuelto al menú con la sala abierta (la sala sigue escuchando). */
let away = false;
/** Sala en curso (para pruebas). */
export const onlineRoom = () => peer;
/** Partida en curso (para pruebas). */
export const onlineWar = () => war;

/* ---------- Pantalla encendida y vuelta de segundo plano ---------- */
async function wake() { try { lock = await /** @type {any} */ (navigator).wakeLock?.request('screen'); } catch (e) { lock = null; } }
function unwake() { try { lock?.release(); } catch (e) {} lock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !peer) return;
  if (peer instanceof WarHost && peer.phase === 'play') wake();
  peer.resync().catch(() => {});
});

/** Guarda la sala (y las órdenes del turno) para volver si se cierra Safari. */
function persist() {
  if (!peer) return;
  S.online = {v:2, kind:peer instanceof WarHost ? 'host' : 'guest', code:peer.code, at:Date.now(), data:peer.toJSON(), plan:war ? war.plan : (S.online?.plan || []), sent:war ? war.sent : !!S.online?.sent};
  save();
}
function leaveRoom() { if (peer) peer.close(); peer = null; war = null; unwake(); }

/** Partida inicial a partir del mensaje de inicio (la misma en todos los móviles). @param {World} W */
const builder = W => (/** @type {{seed:string, players:any[], cfg:any}} */ st) => newConquest(W, {sc:st.cfg.sc, seed:st.seed, diff:st.cfg.diff, rules:st.cfg.rules,
  humans:st.players.filter(p => p.f >= 0).map(p => ({f:p.f, custom:p.custom || null}))}).g;
/** @param {World} W */
const geoFor = W => (/** @type {string} */ sc) => E.geoOf(needsPortugal(sc) && W.map48 ? W.map48 : W.map);

/**
 * @param {World} W @param {OnlineHooks} hooks
 * @param {{code:string, id:string, name:string, host?:boolean, role?:'player'|'spectator', cfg?:any}} o
 */
function makePeer(W, hooks, o) {
  const common = {transport:transportFor(o.code), id:o.id, name:o.name, code:o.code, build:builder(W), geo:geoFor(W),
    onChange:() => { persist(); if (war) war.roomChanged(); else renderLobby(W, hooks); },
    onTurn:(/** @type {E.Game} */ a, /** @type {E.Game} */ b, /** @type {any[]} */ ev) => { war?.resolved(a, b, ev); persist(); },
    onChat:(/** @type {{f:number, name:string, text:string}} */ m) => { if (war) war.chatIn(m); else toast(`${m.name}: ${m.text}`); },
    onStart:() => setTimeout(() => startGame(W, hooks), 0),
    onDesync:() => toast('Tu partida no coincide con la del anfitrión. Sal y vuelve a entrar en la sala.')};
  return o.host ? new WarHost({...common, cfg:o.cfg}) : new WarGuest({...common, role:o.role});
}

/* ---------- Entrada ---------- */
/** @param {World} W @param {OnlineHooks} hooks @param {string} [code] código del enlace */
export function onlineSheet(W, hooks, code = '') {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  openSheet({title:'Multijugador', body:`
    <p class="note" style="margin:0 4px 12px">${icon('wifi', 'inl')} De 2 a ${MAX_PLAYERS} móviles en la misma conquista. Todos dais las órdenes a la vez y el turno se resuelve cuando terminan todos.</p>
    ${offline ? `<p class="warn">Ahora mismo no hay conexión a internet.</p>` : ''}
    <div class="glabel">Tu nombre</div>
    <input class="field nm" id="onName" maxlength="16" placeholder="Nombre" autocomplete="nickname" value="${esc(S.profile.name)}" aria-label="Tu nombre">
    ${code ? '' : `<div style="height:12px"></div><button class="btn" id="onNew">${icon('users')}Crear sala</button>`}
    <div class="glabel">${code ? 'Sala' : 'Unirse con un código'}</div>
    <input class="field" id="onCode" maxlength="6" placeholder="ABC123" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(code)}" aria-label="Código de sala">
    <div class="grp" style="margin-top:10px"><button class="rowi" role="switch" aria-checked="false" id="onSpec">${icon('user')}<div class="l">Solo mirar<small>Entras como espectador, sin bando</small></div><span class="switch"></span></button></div>
    <button class="btn ${code ? '' : 'ghost'}" id="onJoin">${icon('play')}Unirse</button>
    <p class="note">Se usa el servicio público ntfy.sh: solo viajan nombres, bandos y órdenes. Los demás modos funcionan sin conexión.</p>`,
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
  hideMenu(); world = W; hk = hooks; away = false;
  const code = newCode();
  const cfg = {...DEFAULT_CFG, sc:NET_SC.includes(S.war.scenario) ? S.war.scenario : 'comunidades', diff:/** @type {any} */ (S.war.diff in E.DIFFICULTY ? S.war.diff : 'normal')};
  peer = makePeer(W, hooks, {code, id:myId(), name, host:true, cfg});
  renderLobby(W, hooks);
  try { await /** @type {WarHost} */ (peer).open(); } catch (e) { toast('No se pudo abrir la sala. ¿Hay internet?'); }
  sound('lock'); announce(`Sala ${code} creada.`);
  persist();
}
/** @param {World} W @param {OnlineHooks} hooks @param {string} code @param {string} name @param {'player'|'spectator'} role */
async function joinRoom(W, hooks, code, name, role) {
  hideMenu(); world = W; hk = hooks; away = false;
  const g = /** @type {WarGuest} */ (makePeer(W, hooks, {code, id:myId(), name, role}));
  peer = g;
  renderLobby(W, hooks);
  try { await g.join(); } catch (e) { toast('No se pudo entrar en la sala. ¿Hay internet?'); }
  persist();
}

/** Vuelve a la sala guardada (al abrir de nuevo la app). @param {World} W @param {OnlineHooks} hooks */
export async function resumeOnline(W, hooks) {
  const o = S.online; if (!o || o.v !== 2) return false;
  hideMenu(); world = W; hk = hooks; away = false;
  if (peer && peer.code === o.code) { // la sala sigue abierta: solo se vuelve a la pantalla
    if (peer.phase === 'play') startGame(W, hooks, o.plan || [], !!o.sent); else renderLobby(W, hooks);
    return true;
  }
  const p = makePeer(W, hooks, {code:o.code, id:o.data.id, name:o.data.name || S.profile.name, host:o.kind === 'host', role:o.data.role});
  if (p instanceof WarHost) p.restore(o.data); else p.restore(o.data);
  peer = p;
  try { if (p instanceof WarHost) await p.open(p.lastId); else await p.join(p.lastId || 'all'); } catch (e) {}
  if (p.phase === 'play' && !war) startGame(W, hooks, o.plan || [], !!o.sent); else if (!war) renderLobby(W, hooks);
  return true;
}

/* ---------- Sala de espera ---------- */
/** @param {World} W @param {OnlineHooks} hooks */
function renderLobby(W, hooks) {
  if (!peer || war || away) return;
  const el = $('#lobby'), isHost = peer instanceof WarHost, code = peer.code, cfg = peer.cfg;
  const players = peer.players, mine = players.find(p => p.id === peer?.id);
  const map = needsPortugal(cfg.sc) && W.map48 ? W.map48 : W.map;
  const spec = scenario(map, cfg.sc, W.colors);
  const taken = new Set(players.filter(p => p !== mine).map(p => p.f));
  const order = spec.factions.map((f, i) => ({i, n:f.name})).sort((a, b) => a.n.localeCompare(b.n, 'es'));
  const spectator = peer instanceof WarGuest && peer.role === 'spectator';
  const own = S.war.custom && S.war.custom.name ? S.war.custom : null;
  const fl = (/** @type {any} */ p) => p.f < 0 || !spec.factions[p.f] ? '<span class="flag empty"></span>' : p.custom?.flag ? bannerFlag(cleanFlag(p.custom.flag)) : spec.factions[p.f].banner ? bannerFlag(spec.factions[p.f].banner) : flag(spec.factions[p.f].flag);
  const focusEl = document.activeElement?.id;
  const sw = (/** @type {string} */ k, /** @type {string} */ n, /** @type {boolean} */ on) => `<button class="rowi" role="switch" aria-checked="${on}" data-rule="${k}"><div class="l">${n}</div><span class="switch"></span></button>`;
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
        <div class="rowi" role="listitem">${fl(p)}<div class="l"><b>${esc(p.name)}${p.id === peer?.id ? ' (tú)' : ''}</b><small>${p.f >= 0 && spec.factions[p.f] ? esc(p.custom?.name || spec.factions[p.f].name) : 'Eligiendo bando…'}</small></div>${p.host ? '<span class="badge">Anfitrión</span>' : ''}</div>`).join('') : '<div class="rowi"><div class="l"><small>Conectando con la sala…</small></div></div>'}</div>
      ${mine ? `<div class="glabel">Tu bando · ${esc(SCENARIOS[/** @type {'las47'} */ (cfg.sc)].title)}</div>
        <label class="sel wide"><span class="sr">Tu bando</span><select id="lbSel"><option value="-1">Elige…</option>${order.map(o => `<option value="${o.i}"${mine.f === o.i ? ' selected' : ''}${taken.has(o.i) ? ' disabled' : ''}>${esc(o.n)}${taken.has(o.i) ? ' (ocupado)' : ''}</option>`).join('')}</select>${icon('chev')}</label>
        ${own ? `<div class="grp" style="margin-top:8px"><button class="rowi" role="switch" aria-checked="${!!mine.custom}" id="lbOwn">${bannerFlag(cleanFlag(own.flag))}<div class="l">Usar mi bando propio<small>${esc(own.name)}</small></div><span class="switch"></span></button></div>` : ''}` : ''}
      ${isHost ? `<div class="glabel">Escenario</div>
        <div class="chips sc" role="group" aria-label="Escenario">${NET_SC.map(k => `<button data-sc="${k}" aria-pressed="${k === cfg.sc}">${SCENARIOS[/** @type {'las47'} */ (k)].name}</button>`).join('')}</div>
        <div class="glabel">Dificultad de los bots</div>
        <div class="seg" role="group" aria-label="Dificultad">${Object.entries(E.DIFFICULTY).map(([k, v]) => `<button data-d="${k}" aria-pressed="${k === cfg.diff}">${v.name}</button>`).join('')}</div>
        <div class="glabel">Tiempo por turno</div>
        <div class="seg" role="group" aria-label="Tiempo por turno">${TIMERS.map(([v, n]) => `<button data-tm="${v}" aria-pressed="${cfg.timer === v}">${n}</button>`).join('')}</div>
        <div class="grp rulesrow" style="margin-top:10px">
          ${sw('fog', 'Niebla de guerra', cfg.rules.fog)}${sw('events', 'Eventos', cfg.rules.events)}
          <div class="rowi"><div class="l">Victoria</div><select id="lbVic" aria-label="Tipo de victoria">${VICTORY.filter(([k]) => k !== 'supervivencia').map(([k, n]) => `<option value="${k}"${cfg.rules.victory === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        </div>
        <button class="btn" id="lbStart" ${/** @type {WarHost} */ (peer).canStart() ? '' : 'disabled'}>${icon('swords')}Empezar</button>
        <p class="note">${/** @type {WarHost} */ (peer).canStart() ? 'Todos listos. Los bandos sin jugador los llevan los bots.' : 'Hacen falta al menos 2 jugadores y que todos elijan bando.'}</p>`
      : `<p class="note wait">${spectator ? 'Verás la partida en cuanto el anfitrión empiece.' : 'Esperando a que el anfitrión empiece…'} ${esc(SCENARIOS[/** @type {'las47'} */ (cfg.sc)].title)} · ${E.DIFFICULTY[cfg.diff].name}${cfg.timer ? ` · ${cfg.timer / 60} min por turno` : ''}</p>`}
    </div>`;
  // el mapa de fondo con los bandos del escenario y los elegidos resaltados
  const view = W.view;
  view.setMap(map);
  view.setColors(spec.factions.map((f, i) => { const p = players.find(x => x.f === i && x.custom); return p ? p.custom?.color || (p.custom?.flag ? bannerColor(cleanFlag(p.custom.flag)) : f.color) : f.color; }));
  const owner = new Array(map.provinces.length).fill(-1); spec.factions.forEach((f, i) => f.provinces.forEach(p => { owner[p] = i; }));
  view.setOwners(owner, spec.factions.map(() => false));
  view.setInsets({top:0, bottom:innerHeight * .55, left:0, right:0});
  view.focus(players.filter(p => p.f >= 0 && spec.factions[p.f]).flatMap(p => spec.factions[p.f].provinces), [], 300);
  $('#lbBack').onclick = () => { sound('tap'); if (peer instanceof WarGuest) peer.leave(); leaveRoom(); S.online = null; save(); el.hidden = true; el.innerHTML = ''; view.focus([], [], 0); hooks.onExit(); };
  $('#lbShare').onclick = () => {
    const url = roomLink(code), text = `Únete a mi conquista en España en Guerra: sala ${code}`;
    if (navigator.share) navigator.share({title:'España en Guerra', text, url}).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado'), () => toast(code));
  };
  const choose = (/** @type {number} */ f, /** @type {boolean} */ useOwn) => {
    const custom = useOwn && own ? {name:own.name, flag:own.flag, color:own.color || '', motto:own.motto || ''} : null;
    if (peer instanceof WarHost) { if (!peer.pick(f, custom)) toast('Ese bando ya está cogido'); }
    else peer?.pick(f, custom).catch(() => toast('Sin conexión'));
  };
  const sel = /** @type {HTMLSelectElement|null} */ ($('#lbSel'));
  if (sel) sel.onchange = () => { sound('tap'); choose(+sel.value, !!mine?.custom); };
  const ob = $('#lbOwn'); if (ob && mine) ob.onclick = () => { sound('tap'); if (mine.f < 0) { toast('Elige antes un bando'); return; } choose(mine.f, !mine.custom); };
  if (peer instanceof WarHost) {
    const h = peer;
    el.querySelectorAll('[data-sc]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { sound('tap'); h.configure({sc:/** @type {HTMLElement} */ (b).dataset.sc}); });
    el.querySelectorAll('[data-d]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { sound('tap'); h.configure({diff:/** @type {any} */ (/** @type {HTMLElement} */ (b).dataset.d)}); });
    el.querySelectorAll('[data-tm]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { sound('tap'); h.configure({timer:+(/** @type {HTMLElement} */ (b).dataset.tm || 0)}); });
    el.querySelectorAll('[data-rule]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { sound('tap'); const k = /** @type {'fog'} */ (/** @type {HTMLElement} */ (b).dataset.rule); h.configure({rules:{...h.cfg.rules, [k]:!h.cfg.rules[k]}}); });
    /** @type {HTMLSelectElement} */ ($('#lbVic')).onchange = e => h.configure({rules:{...h.cfg.rules, victory:/** @type {HTMLSelectElement} */ (e.target).value}});
    const st = $('#lbStart');
    if (st) st.onclick = async () => {
      sound('lock');
      try { await h.start(Math.random().toString(36).slice(2, 10).toUpperCase()); } catch (e) { toast('No se pudo empezar: ' + /** @type {Error} */ (e).message); }
    };
  }
  if (focusEl) document.getElementById(focusEl)?.focus();
}

/* ---------- Partida ---------- */
/**
 * Monta la conquista en red (tras el inicio o al volver a la app).
 * @param {World} W @param {OnlineHooks} hooks @param {any[]} [plan] órdenes ya dadas @param {boolean} [sent]
 */
function startGame(W, hooks, plan = [], sent = false) {
  if (war || !peer || !peer.game) return;
  const p = peer, me = p.me, g0 = peer.game, geo = geoFor(W)(g0.scenario);
  $('#lobby').hidden = true; $('#lobby').innerHTML = '';
  W.view.focus([], [], 0);
  // la partida tal como la ve este jugador: lo confirmado más sus órdenes del turno
  let g = g0;
  if (me >= 0) for (const a of plan) { try { g = E.apply(geo, g, a).g; } catch (e) {} }
  const c = new Conquest(W, geo, g, me, {
    onExit:() => { persist(); war = null; away = true; hooks.onExit(); },
    save:() => persist(),
    online:{peer:p, plan:me >= 0 ? plan : [], onLeave:() => { if (p instanceof WarGuest) p.leave(); leaveRoom(); S.online = null; save(); hooks.onExit(); }},
  });
  war = c;
  if (sent && me >= 0) { c.sent = true; if (!p.hasOrders(g0.turn, me)) p.sendOrders(c.plan).catch(() => {}); }
  if (p instanceof WarHost) wake();
  c.mount();
  if (c.sent || c.watching) c.waitBar();
  persist();
}

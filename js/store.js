// @ts-check
// Estado guardado en el dispositivo (localStorage) y migraciones entre versiones.

export const KEY = 'espana-en-guerra.v1';
export const VERSION = 1;

/**
 * @typedef {object} Settings
 * @property {boolean} sound
 * @property {'marina'|'atlas'|'pergamino'|'tactico'|'minimal'} theme
 * @property {boolean} music música en la conquista
 * @property {'full'|'reduced'} motion
 * @property {boolean} contrast
 * @property {'auto'|number} textSize
 * @property {1|2|5} speed
 * @property {boolean} labels nombres de provincia en el mapa
 * @property {boolean} fps contador de fotogramas (para medir)
 */
/**
 * @typedef {object} Saved partida en curso (normal o un jugador)
 * @property {'normal'|'solo'} mode
 * @property {import('./engine/game.js').Game} game
 * @property {number} at
 * @property {number} [me] mi bando (un jugador)
 * @property {string} [level] nivel de los bots
 */
/**
 * @typedef {object} Online sala multijugador en curso (para volver a entrar)
 * @property {'host'|'guest'} kind
 * @property {string} code
 * @property {number} at
 * @property {any} data estado del anfitrión o del invitado
 * @property {import('./engine/game.js').Game|null} [view] partida tal como se veía
 */
/**
 * @typedef {object} State
 * @property {number} v
 * @property {Settings} settings
 * @property {{games:number, finished:number, rounds:number}} stats
 * @property {Saved|null} current
 * @property {{seed:string, winner:number, rounds:number, at:number}[]} history
 * @property {{id:string, name:string}} profile
 * @property {Online|null} online
 * @property {{me:number, level:string}} solo últimas elecciones del modo un jugador
 * @property {{scenario:string, me:number, diff:string, rules?:any, center?:number, custom?:{on:boolean, name:string, flag:any}}} war últimas elecciones del modo conquista
 * @property {WarSave[]} saves partidas de conquista guardadas (máximo 5)
 * @property {Record<string, number>} medals logros ganados (fecha)
 * @property {Record<string, number>} campaign estrellas por misión
 * @property {{day:string, best:number, plays:number}} daily mejor puntuación del desafío de hoy
 * @property {boolean} tutorial ya se ha visto el tutorial
 */
/**
 * @typedef {object} WarSave
 * @property {string} id
 * @property {number} at
 * @property {string} scenario
 * @property {number} me
 * @property {string} diff
 * @property {string} name nombre del bando
 * @property {number} turn
 * @property {boolean} over
 * @property {import('./conquest/engine.js').Game} game
 */

/** @returns {State} */
export function fresh() {
  return {
    v:VERSION,
    settings:{sound:true, music:true, theme:'marina', motion:'full', contrast:false, textSize:'auto', speed:1, labels:true, fps:false},
    stats:{games:0, finished:0, rounds:0},
    current:null,
    history:[],
    profile:{id:Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8), name:''},
    online:null,
    solo:{me:-1, level:'estratega'},
    war:{scenario:'las47', me:-1, diff:'facil'},
    saves:[],
    medals:{}, campaign:{}, daily:{day:'', best:-1, plays:0}, tutorial:false,
  };
}

/** Objeto de números (logros, estrellas). @param {any} o @returns {Record<string, number>} */
const obj = o => o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number')) : {};
/** Completa lo que falte y corrige valores fuera de rango. @param {any} s @returns {State} */
export function migrate(s) {
  const f = fresh();
  if (!s || typeof s !== 'object') return f;
  const st = {...f.settings, ...(s.settings || {})};
  if (![1, 2, 5].includes(st.speed)) st.speed = 1;
  if (!['marina', 'atlas', 'pergamino', 'tactico', 'minimal'].includes(st.theme)) st.theme = 'marina';
  if (!['full', 'reduced'].includes(st.motion)) st.motion = 'full';
  if (st.textSize !== 'auto' && !(+st.textSize >= .8 && +st.textSize <= 1.6)) st.textSize = 'auto';
  const cur = s.current && s.current.game && Array.isArray(s.current.game.owner) ? s.current : null;
  if (cur && cur.mode !== 'solo') cur.mode = 'normal';
  const on = s.online && s.online.code && s.online.data && Date.now() - (+s.online.at || 0) < 12 * 3600e3 ? s.online : null;
  return {
    v:VERSION, settings:st,
    stats:{...f.stats, ...(s.stats || {})},
    current:cur,
    history:Array.isArray(s.history) ? s.history.slice(0, 30) : [],
    profile:{...f.profile, ...(s.profile && typeof s.profile.id === 'string' ? s.profile : {})},
    online:on,
    solo:{...f.solo, ...(s.solo || {})},
    war:{...f.war, ...(s.war || {})},
    saves:Array.isArray(s.saves) ? s.saves.filter((/** @type {any} */ x) => x && x.game && x.game.v === 2 && Array.isArray(x.game.P?.owner)).slice(0, 5) : [],
    medals:obj(s.medals), campaign:obj(s.campaign),
    daily:s.daily && typeof s.daily.day === 'string' ? {day:s.daily.day, best:+s.daily.best || 0, plays:+s.daily.plays || 0} : f.daily,
    tutorial:!!s.tutorial,
  };
}

const hasLS = () => { try { return typeof localStorage !== 'undefined'; } catch (e) { return false; } };
export function load() {
  try { if (hasLS()) { const raw = localStorage.getItem(KEY); if (raw) return migrate(JSON.parse(raw)); } } catch (e) {}
  return fresh();
}

/** @type {State} */
export let S = load();
/** Sustituye el estado entero (pruebas, restablecer). @param {State} v */
export function setState(v) { S = v; }

/** @type {ReturnType<typeof setTimeout>|undefined} */
let saveT;
export function save() { clearTimeout(saveT); saveT = setTimeout(saveNow, 200); }
export function saveNow() { try { if (hasLS()) localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

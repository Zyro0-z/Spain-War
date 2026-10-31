// @ts-check
// Estado guardado en el dispositivo (localStorage) y migraciones entre versiones.

export const KEY = 'espana-en-guerra.v1';
export const VERSION = 1;

/**
 * @typedef {object} Settings
 * @property {boolean} sound
 * @property {'marina'|'atlas'} theme
 * @property {'full'|'reduced'} motion
 * @property {boolean} contrast
 * @property {'auto'|number} textSize
 * @property {1|2|5} speed
 * @property {boolean} labels nombres de provincia en el mapa
 * @property {boolean} fps contador de fotogramas (para medir)
 */
/**
 * @typedef {object} Saved partida en curso
 * @property {'normal'} mode
 * @property {import('./engine/game.js').Game} game
 * @property {number} at
 */
/**
 * @typedef {object} State
 * @property {number} v
 * @property {Settings} settings
 * @property {{games:number, finished:number, rounds:number}} stats
 * @property {Saved|null} current
 * @property {{seed:string, winner:number, rounds:number, at:number}[]} history
 */

/** @returns {State} */
export function fresh() {
  return {
    v:VERSION,
    settings:{sound:true, theme:'marina', motion:'full', contrast:false, textSize:'auto', speed:1, labels:true, fps:false},
    stats:{games:0, finished:0, rounds:0},
    current:null,
    history:[],
  };
}

/** Completa lo que falte y corrige valores fuera de rango. @param {any} s @returns {State} */
export function migrate(s) {
  const f = fresh();
  if (!s || typeof s !== 'object') return f;
  const st = {...f.settings, ...(s.settings || {})};
  if (![1, 2, 5].includes(st.speed)) st.speed = 1;
  if (!['marina', 'atlas'].includes(st.theme)) st.theme = 'marina';
  if (!['full', 'reduced'].includes(st.motion)) st.motion = 'full';
  if (st.textSize !== 'auto' && !(+st.textSize >= .8 && +st.textSize <= 1.6)) st.textSize = 'auto';
  const cur = s.current && s.current.game && Array.isArray(s.current.game.owner) ? s.current : null;
  return {
    v:VERSION, settings:st,
    stats:{...f.stats, ...(s.stats || {})},
    current:cur,
    history:Array.isArray(s.history) ? s.history.slice(0, 30) : [],
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

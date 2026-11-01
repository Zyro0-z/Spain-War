// @ts-check
// Clasificación del desafío diario: cada partida terminada publica su puntuación en un canal de ntfy del día
// y la tabla se lee con poll (ntfy guarda los mensajes unas horas). Se queda la mejor marca de cada jugador.
import {NtfyTransport, LocalTransport, PREFIX} from './transport.js';

/** @param {string} day AAAA-MM-DD */
export const boardTopic = day => PREFIX + 'diario-' + day.replace(/-/g, '');
/** @param {string} day */
export const boardTransport = day => typeof location !== 'undefined' && new URLSearchParams(location.search).get('red') === 'local'
  ? new LocalTransport(boardTopic(day)) : new NtfyTransport(boardTopic(day));

/** @typedef {{id:string, name:string, pts:number, f:string}} Score */

/**
 * Publica una puntuación.
 * @param {import('./transport.js').Transport} t @param {Score} s
 */
export function postScore(t, s) {
  return t.publish({v:2, t:'score', id:String(s.id).slice(0, 24), name:String(s.name).replace(/[<>&"]/g, '').slice(0, 16), pts:Math.max(0, Math.floor(+s.pts) || 0), f:String(s.f).slice(0, 24)});
}
/**
 * Tabla ordenada (mejor marca por jugador).
 * @param {{body:any}[]} msgs @returns {Score[]}
 */
export function table(msgs) {
  /** @type {Map<string, Score>} */ const best = new Map();
  for (const m of msgs) {
    const b = m.body; if (!b || b.v !== 2 || b.t !== 'score' || typeof b.id !== 'string' || !Number.isFinite(b.pts)) continue;
    const prev = best.get(b.id);
    if (!prev || b.pts > prev.pts) best.set(b.id, {id:b.id, name:String(b.name || 'Jugador').slice(0, 16), pts:Math.max(0, Math.floor(b.pts)), f:String(b.f || '').slice(0, 24)});
  }
  return [...best.values()].sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name, 'es'));
}
/** Lee la tabla del día. @param {import('./transport.js').Transport} t */
export async function readBoard(t) { return table(await t.poll('all')); }

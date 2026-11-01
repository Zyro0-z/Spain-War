// @ts-check
// Tabla del desafío diario: se carga en un hueco de la hoja o del final de partida.
import {S} from '../store.js';
import {boardTransport, readBoard, postScore} from '../net/board.js';
import {esc} from './dom.js';

/**
 * Pinta la clasificación del día en `el` (cargando, vacía, sin conexión o las 10 primeras y tu puesto).
 * @param {HTMLElement} el @param {string} day @param {{post?:{pts:number, f:string}}} [o] publica antes tu marca
 */
export async function fillBoard(el, day, o = {}) {
  el.innerHTML = '<div class="rowi"><div class="l"><small>Cargando la clasificación…</small></div></div>';
  const t = boardTransport(day);
  try {
    if (o.post && S.profile.name) await postScore(t, {id:S.profile.id, name:S.profile.name, pts:o.post.pts, f:o.post.f});
    const list = await readBoard(t);
    const mine = list.findIndex(x => x.id === S.profile.id);
    if (!list.length) { el.innerHTML = '<div class="rowi"><div class="l"><small>Aún no hay nadie. ¡Sé el primero!</small></div></div>'; return; }
    const row = (/** @type {import('../net/board.js').Score} */ x, /** @type {number} */ i) => `<div class="rowi brow${x.id === S.profile.id ? ' me' : ''}"><span class="bpos num">${i + 1}</span><div class="l">${esc(x.name)}<small>${esc(x.f)}</small></div><b class="num">${x.pts}</b></div>`;
    el.innerHTML = list.slice(0, 10).map(row).join('') + (mine >= 10 ? row(list[mine], mine) : '') +
      (!S.profile.name ? '<div class="rowi"><div class="l"><small>Pon tu nombre para salir en la tabla.</small></div></div>' : '');
  } catch (e) {
    el.innerHTML = '<div class="rowi"><div class="l"><small>Sin conexión: la clasificación necesita internet.</small></div></div>';
  } finally { t.close(); }
}

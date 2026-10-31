// @ts-check
// Banderas de las provincias. Si la bandera está descargada (data/flags/<INE>.png, ver scripts/fetch-flags.mjs)
// se usa; si no, una tela provisional con el color del bando y la matrícula.
import {darken, inkOn} from './art.js';

/** @type {Record<string, {file:string, license:string, artist:string, source:string}>} */
let manifest = {};
/** @typedef {{map:{provinces:{ine:string, plate:string, name:string}[]}, colors:string[]}} FlagWorld */
/** @type {FlagWorld|null} */
let W = null;

/** @param {typeof manifest} m @param {FlagWorld} world */
export function initFlags(m, world) { manifest = m && typeof m === 'object' ? m : {}; W = world; }
/** @param {number} f */
export const hasFlag = f => !!(W && manifest[W.map.provinces[f].ine]);
export const flagCount = () => Object.keys(manifest).length;
/** Rutas de las banderas descargadas (para el modo sin conexión). */
export const flagFiles = () => Object.keys(manifest).map(ine => `data/flags/${ine}.png`);

/**
 * Bandera de un bando (la de su provincia de origen), con luz de tela.
 * @param {number} f @param {{cls?:string, title?:string}} [o]
 */
export function flag(f, o = {}) {
  if (!W) return '';
  const p = W.map.provinces[f], c = W.colors[f];
  const inner = manifest[p.ine]
    ? `<img src="data/flags/${p.ine}.png" alt="" decoding="async" draggable="false">`
    : `<svg viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true"><rect width="30" height="20" fill="${c}"/><rect y="14" width="30" height="6" fill="${darken(c, .28)}"/><text x="15" y="11.6" text-anchor="middle" font-family="'Barlow Condensed','Arial Narrow',sans-serif" font-weight="800" font-size="9.5" fill="${inkOn(c)}">${p.plate}</text></svg>`;
  return `<span class="flag ${o.cls || ''}" ${o.title ? `role="img" aria-label="${o.title}"` : 'aria-hidden="true"'}>${inner}</span>`;
}

// @ts-check
// Escenarios del modo conquista: quién empieza con qué provincias.
import {COMMUNITIES, KINGDOMS} from './data.js';

/** @typedef {import('./engine.js').ScenarioSpec} ScenarioSpec */
/** @typedef {{provinces:{i:number, ine:string, name:string, adj:number[]}[]}} MapLike */

export const SCENARIOS = {
  las47:{name:'Las 47 provincias', desc:'Cada provincia es un bando.'},
  comunidades:{name:'Comunidades autónomas', desc:'15 comunidades peninsulares.'},
  reinos:{name:'Reinos medievales', desc:'La península hacia el año 1200.'},
};

/** @param {MapLike} map @param {string} ine */
const byIne = (map, ine) => /** @type {number} */ (map.provinces.find(p => p.ine === ine)?.i);

/**
 * @param {MapLike} map @param {string} id @param {string[]} colors color de cada provincia
 * @returns {ScenarioSpec}
 */
export function scenario(map, id, colors) {
  if (id === 'comunidades') return {id, factions:COMMUNITIES.map(c => {
    const provinces = c.ine.map(i => byIne(map, i)), capital = byIne(map, c.cap);
    return {name:c.name, flag:capital, color:colors[capital], provinces, capital};
  })};
  if (id === 'reinos') return {id, factions:KINGDOMS.map(k => {
    const provinces = k.ine.map(i => byIne(map, i)), capital = byIne(map, k.cap);
    return {name:k.name, flag:capital, color:k.color, provinces, capital};
  })};
  return {id:'las47', factions:map.provinces.map(p => ({name:p.name, flag:p.i, color:colors[p.i], provinces:[p.i], capital:p.i}))};
}

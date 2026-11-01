// @ts-check
// Escenarios del modo conquista: quién empieza con qué provincias. Los parciales (tu región, tu provincia)
// dejan fuera de juego el resto del mapa; el de la península añade Portugal como provincia extra.
import {COMMUNITIES, KINGDOMS} from './data.js';

/** @typedef {import('./engine.js').ScenarioSpec} ScenarioSpec */
/** @typedef {{provinces:{i:number, ine:string, name:string, adj:number[]}[]}} MapLike */

export const SCENARIOS = {
  las47:{name:'Las 47', title:'Las 47 provincias', desc:'Cada provincia es un bando.'},
  comunidades:{name:'Comunidades', title:'Comunidades autónomas', desc:'Las 15 comunidades peninsulares.'},
  reinos:{name:'Reinos', title:'Reinos medievales', desc:'La península hacia el año 1200.'},
  peninsula:{name:'Península', title:'La península', desc:'Las comunidades y Portugal.'},
  region:{name:'Tu región', title:'Tu región', desc:'Tu comunidad contra las vecinas. Toca el mapa para elegirla.', center:true},
  vecinas:{name:'Tu provincia', title:'Tu provincia', desc:'Tu provincia contra sus vecinas. Toca el mapa para elegirla.', center:true},
};
/** Bandera de Portugal (dibujada). */
export const PT_FLAG = {layout:'portugal', c:['#046A38', '#DA291C', '#FFE900'], sym:'ninguno', sc:'#FFE900'};

/** @param {MapLike} map @param {string} ine */
const byIne = (map, ine) => /** @type {number} */ (map.provinces.find(p => p.ine === ine)?.i);

/**
 * Mapa con Portugal como provincia 47 (solo para el escenario de la península).
 * @template {{provinces:any[], borders:Record<string, string>, outer:string[], land:string, neutral:string, pt?:any}} M
 * @param {M} m @returns {M}
 */
export function withPortugal(m) {
  const pt = m.pt; if (!pt) return m;
  const n = m.provinces.length;
  const provinces = m.provinces.map(p => pt.province.adj.includes(p.i) ? {...p, adj:[...p.adj, n].sort((a, b) => a - b)} : p);
  provinces.push({...pt.province, i:n});
  const outer = [...m.outer.map((d, i) => pt.outer[i] ?? d), pt.outer[n] || ''];
  return {...m, provinces, borders:{...m.borders, ...pt.borders}, outer, land:pt.land, neutral:pt.neutral, pt:undefined, full:true};
}
/** Mapa que usa un escenario. @param {string} id */
export const needsPortugal = id => id === 'peninsula';

/**
 * @param {MapLike} map @param {string} id @param {string[]} colors color de cada provincia @param {number} [center] provincia elegida (escenarios parciales)
 * @returns {ScenarioSpec}
 */
export function scenario(map, id, colors, center = -1) {
  const comm = (/** @type {typeof COMMUNITIES[number]} */ c) => {
    const provinces = c.ine.map(i => byIne(map, i)), capital = byIne(map, c.cap);
    return {name:c.name, flag:capital, color:colors[capital], provinces, capital};
  };
  if (id === 'comunidades') return {id, factions:COMMUNITIES.map(comm)};
  if (id === 'peninsula') {
    const pt = byIne(map, 'PT');
    const fs = COMMUNITIES.map(comm);
    if (pt >= 0) fs.push({name:'Portugal', flag:-1, color:'#1F7A4A', provinces:[pt], capital:pt, banner:PT_FLAG});
    return {id, factions:fs};
  }
  if (id === 'reinos') return {id, factions:KINGDOMS.map(k => {
    const provinces = k.ine.map(i => byIne(map, i)), capital = byIne(map, k.cap);
    return {name:k.name, flag:capital, color:k.color, provinces, capital};
  })};
  const c = center >= 0 && center < map.provinces.length ? center : byIne(map, '28');
  if (id === 'region') {
    const ine = map.provinces[c].ine, own = COMMUNITIES.find(x => x.ine.includes(ine)) || COMMUNITIES[10];
    const set = new Set(own.ine.map(i => byIne(map, i)));
    const near = COMMUNITIES.filter(x => x !== own && x.ine.some(i => map.provinces[byIne(map, i)].adj.some(q => set.has(q))));
    return {id, center:c, factions:[own, ...near].map(comm)};
  }
  if (id === 'vecinas') {
    const ps = [c, ...map.provinces[c].adj.filter(q => q < 47)];
    return {id, center:c, factions:ps.map(p => ({name:map.provinces[p].name, flag:p, color:colors[p], provinces:[p], capital:p}))};
  }
  return {id:'las47', factions:map.provinces.filter(p => p.i < 47).map(p => ({name:p.name, flag:p.i, color:colors[p.i], provinces:[p.i], capital:p.i}))};
}

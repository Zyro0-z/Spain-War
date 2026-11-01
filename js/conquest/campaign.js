// @ts-check
// Campaña (misiones encadenadas con estrellas) y desafío diario (la misma partida para todos cada día).
import {seedState, int} from '../engine/rng.js';

/**
 * @typedef {object} Mission
 * @property {string} id
 * @property {string} name
 * @property {string} brief
 * @property {string} sc escenario
 * @property {string} [center] INE de la provincia elegida (escenarios parciales)
 * @property {string} [me] nombre del bando
 * @property {import('./engine.js').Difficulty} diff
 * @property {string} victory
 * @property {[number, number]} stars turnos máximos para 3 y 2 estrellas
 * @property {{troops?:number, gold?:number}} [rules]
 */
/** @type {Mission[]} */
export const MISSIONS = [
  {id:'m1', name:'El primer paso', sc:'vecinas', center:'42', diff:'facil', victory:'dominacion', stars:[14, 22],
    brief:'Soria es la provincia más pequeña de España. Sus vecinas la miran por encima del hombro. Demuéstrales lo contrario: nadie te atacará si no atacas tú.'},
  {id:'m2', name:'Tierra de frontera', sc:'vecinas', center:'44', diff:'normal', victory:'dominacion', stars:[16, 26],
    brief:'Teruel existe, y ahora quiere más. Sus vecinas se pelean entre ellas: aprovecha cada guerra ajena.'},
  {id:'m3', name:'La corona de Aragón', sc:'region', center:'50', diff:'normal', victory:'dominacion', stars:[26, 40],
    brief:'Aragón contra todas las comunidades que lo rodean. Usa la diplomacia para no luchar en todos los frentes a la vez.'},
  {id:'m4', name:'Los cinco reinos', sc:'reinos', me:'Reino de Navarra', diff:'normal', victory:'capitales', stars:[30, 46],
    brief:'Navarra, encajada entre gigantes, hacia el año 1200. Toma la mitad de las capitales de la península para imponer tu ley.'},
  {id:'m5', name:'La pluma y la espada', sc:'comunidades', me:'Madrid', diff:'normal', victory:'diplomatica', stars:[30, 46],
    brief:'Madrid quiere liderar sin arrasar. Controla el 30 % de las provincias y ten pacto o alianza con todos los que sigan en pie.'},
  {id:'m6', name:'El último reino', sc:'reinos', me:'Taifa de Granada', diff:'dificil', victory:'dominacion', stars:[45, 70],
    brief:'Granada resiste sola frente a los reinos del norte. En Difícil todos luchan contra todos: fortifica, espera y golpea.'},
  {id:'m7', name:'Iberia', sc:'peninsula', me:'Portugal', diff:'normal', victory:'dominacion', stars:[50, 80],
    brief:'Lisboa mira al este. Una sola provincia enorme y rica contra quince comunidades. Une la península bajo tu bandera.'},
  {id:'m8', name:'Las 47', sc:'las47', center:'42', me:'Soria', diff:'dificil', victory:'capitales', stars:[50, 80],
    brief:'La prueba final: Soria contra las otras 46 provincias en guerra total. Toma la mitad de las capitales.'},
];
/** Estrellas según los turnos que tardas. @param {Mission} m @param {number} turns */
export const starsFor = (m, turns) => turns <= m.stars[0] ? 3 : turns <= m.stars[1] ? 2 : 1;
/** Una misión está abierta si la anterior tiene al menos una estrella. @param {Record<string, number>} done @param {number} i */
export const unlocked = (done, i) => i === 0 || (done[MISSIONS[i - 1].id] || 0) > 0;

/** Fecha local como AAAA-MM-DD. @param {Date} [d] */
export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/**
 * El desafío del día: mismo escenario, bando, dificultad y semilla para todos.
 * @param {string} day AAAA-MM-DD
 * @param {{provinces:{i:number, ine:string, name:string, adj:number[]}[]}} map
 */
export function daily(day, map) {
  const r = seedState('diario:' + day);
  const kinds = ['vecinas', 'region', 'comunidades', 'reinos', 'las47'];
  const sc = kinds[int(r, kinds.length)];
  const center = map.provinces[int(r, 47)].ine;
  const diff = /** @type {import('./engine.js').Difficulty} */ (['normal', 'normal', 'dificil'][int(r, 3)]);
  const seed = ('D' + day.replace(/-/g, '')).slice(0, 16);
  return {sc, center, pick:int(r, 1000), diff, seed, turns:30};
}

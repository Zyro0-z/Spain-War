// @ts-check
// Partida nueva de conquista a partir de lo elegido (escenario, bandos humanos con su bando propio, reglas).
// La usan la partida de un jugador, la campaña, el desafío y el multijugador (igual en todos los móviles).
import {createGame, geoOf} from './engine.js';
import {scenario, needsPortugal, withRivals} from './scenarios.js';
import {bannerColor, cleanFlag} from '../flagmaker.js';

/**
 * @typedef {object} NewGame
 * @property {string} sc
 * @property {number} [center]
 * @property {string} seed
 * @property {import('./engine.js').Difficulty} diff
 * @property {{fog?:boolean, events?:boolean, seasons?:boolean, victory?:string, turns?:number, trait?:string, troops?:number, gold?:number, rivals?:number}} [rules]
 * @property {{f:number, custom?:{name:string, flag:any, color?:string, motto?:string}|null}[]} humans
 */
/**
 * @param {{map:any, map48?:any, colors:string[]}} W @param {NewGame} o
 * @returns {{g:import('./engine.js').Game, humans:number[]}} humans: bandos humanos (cambian si hay menos rivales)
 */
export function newConquest(W, o) {
  const map = needsPortugal(o.sc) && W.map48 ? W.map48 : W.map, r = o.rules || {};
  let spec = scenario(map, o.sc, W.colors, o.center);
  for (const h of o.humans) {
    const c = h.custom, f = spec.factions[h.f];
    if (!c || !f) continue;
    const flag = c.flag ? cleanFlag(c.flag) : null;
    spec.factions[h.f] = {...f, name:c.name || f.name, banner:flag || f.banner, color:c.color || (flag ? bannerColor(flag) : f.color), motto:c.motto || ''};
  }
  let humans = o.humans.map(h => h.f);
  if (r.rivals && humans.length === 1) { const x = withRivals(spec, humans[0], r.rivals, o.seed); spec = x.spec; humans = [x.me]; }
  const nf = spec.factions.length, vt = /** @type {any} */ (r.victory || 'dominacion');
  const victory = vt === 'capitales' ? {type:vt, n:Math.max(2, Math.ceil(nf / 2))} : vt === 'puntos' || vt === 'supervivencia' ? {type:vt, turns:r.turns || 60} : {type:vt};
  const g = createGame(geoOf(map), spec, {seed:o.seed, humans:[...humans].sort((a, b) => a - b),
    rules:{difficulty:o.diff, fog:!!r.fog, events:r.events !== false, seasons:r.seasons !== false, victory, startTroops:r.troops || 6, incomeMul:r.gold || 100},
    traits:r.trait && humans.length === 1 ? {[humans[0]]:r.trait} : undefined});
  return {g, humans};
}

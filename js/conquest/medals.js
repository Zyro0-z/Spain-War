// @ts-check
// Logros: qué medallas se ganan con el estado de una partida. Puro (sin DOM); la interfaz guarda las ganadas.
import {ALLY, FED, TECHS, rebels, buildingsAt} from './engine.js';

/** @typedef {'bronce'|'plata'|'oro'} Metal */
/** @typedef {{name:string, desc:string, metal:Metal, sym:string}} Medal */

/** @type {Record<string, Medal>} */
export const MEDALS = {
  sangre:{name:'Primera sangre', desc:'Conquista tu primera provincia', metal:'bronce', sym:'espadas'},
  capital:{name:'Corazón del enemigo', desc:'Toma una capital enemiga', metal:'bronce', sym:'corona'},
  tesoro:{name:'Arcas llenas', desc:'Reúne 300 de oro', metal:'bronce', sym:'sol'},
  obras:{name:'Gran constructor', desc:'Ten 8 edificios a la vez', metal:'bronce', sym:'castillo'},
  maravilla:{name:'Maravilla', desc:'Construye una maravilla', metal:'plata', sym:'castillo'},
  almirante:{name:'Almirante', desc:'Ten 8 barcos', metal:'plata', sym:'ancla'},
  senor:{name:'Señor feudal', desc:'Ten un vasallo', metal:'plata', sym:'corona'},
  renacimiento:{name:'Hombre del Renacimiento', desc:'Llega a la era Moderna', metal:'oro', sym:'sol'},
  erudito:{name:'Erudito', desc:'Completa una rama de mejoras', metal:'bronce', sym:'estrella'},
  facil:{name:'Primera victoria', desc:'Gana una partida', metal:'bronce', sym:'flor'},
  diario:{name:'Al día', desc:'Termina un desafío diario', metal:'bronce', sym:'sol'},
  conquistador:{name:'Conquistador', desc:'10 conquistas en una partida', metal:'plata', sym:'espadas'},
  veterano:{name:'General veterano', desc:'Sube un general a nivel 2', metal:'plata', sym:'estrella'},
  aliados:{name:'Buenos amigos', desc:'Dos alianzas a la vez', metal:'plata', sym:'cruz'},
  normal:{name:'Estratega', desc:'Gana en Normal o Difícil', metal:'plata', sym:'torre'},
  palabra:{name:'Hombre de palabra', desc:'Gana sin romper ningún pacto', metal:'plata', sym:'ancla'},
  diplomacia:{name:'La pluma y la espada', desc:'Gana por diplomacia', metal:'plata', sym:'luna'},
  aguante:{name:'Superviviente', desc:'Sigue en pie en el turno 100', metal:'plata', sym:'arbol'},
  dificil:{name:'Mariscal', desc:'Gana en Difícil', metal:'oro', sym:'corona'},
  relampago:{name:'Guerra relámpago', desc:'Gana en menos de 40 turnos', metal:'oro', sym:'sol'},
  david:{name:'David contra Goliat', desc:'Gana empezando con una provincia, en Normal o Difícil', metal:'oro', sym:'torre'},
  sabio:{name:'Siglo de Oro', desc:'Todas las mejoras al máximo', metal:'oro', sym:'estrella'},
  iberia:{name:'Iberia', desc:'Gana el escenario de la península', metal:'oro', sym:'castillo'},
  campana:{name:'Leyenda', desc:'Completa la campaña', metal:'oro', sym:'flor'},
};

/**
 * Medallas que cumple el estado actual de la partida para el bando `me`.
 * @param {import('./engine.js').Game} g @param {number} me
 * @returns {string[]}
 */
export function medalsFor(g, me) {
  const out = [], P = g.P, won = g.over && g.winner === me;
  if (me < 0 || me >= rebels(g)) return out;
  if (g.stats.conq[me] >= 1) out.push('sangre');
  if (g.stats.caps[me] >= 1) out.push('capital');
  if (g.F.gold[me] >= 300) out.push('tesoro');
  if (P.owner.reduce((s, o, p) => s + (o === me ? buildingsAt(g, p).length : 0), 0) >= 8) out.push('obras');
  if (P.wonder.some((w, p) => w && P.owner[p] === me)) out.push('maravilla');
  if (g.F.ships[me] >= 8) out.push('almirante');
  if (g.F.lord.some((l, x) => l === me && g.F.alive[x])) out.push('senor');
  if (g.F.tech[me].reduce((a, b) => a + b, 0) >= 8) out.push('renacimiento');
  if (g.F.tech[me].some(l => l >= 3)) out.push('erudito');
  if (g.F.tech[me].every(l => l >= 3) && g.F.tech[me].length === TECHS.length) out.push('sabio');
  if (g.stats.conq[me] >= 10) out.push('conquistador');
  if (g.gens.some(x => x.f === me && x.lvl >= 2)) out.push('veterano');
  if (g.st[me].filter((s, x) => (s === ALLY || s === FED) && x !== me && g.F.alive[x]).length >= 2) out.push('aliados');
  if (g.turn >= 100 && g.F.alive[me]) out.push('aguante');
  if (won) {
    const d = g.rules.difficulty;
    out.push('facil');
    if (d !== 'facil') out.push('normal');
    if (d === 'dificil') out.push('dificil');
    if (g.turn < 40) out.push('relampago');
    if (g.stats.betrayals[me] === 0) out.push('palabra');
    if (g.rules.victory.type === 'diplomatica') out.push('diplomacia');
    if (g.scenario === 'peninsula') out.push('iberia');
    if (d !== 'facil' && P.origin.filter(o => o === me).length === 1) out.push('david');
  }
  return out;
}

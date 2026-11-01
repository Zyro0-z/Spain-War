// @ts-check
// La crónica de la partida como un periódico: cabecera, titular del suceso más importante del periodo,
// noticias breves y el reparto del poder. Sale sola al empezar cada año y desde el menú de la partida.
import * as E from '../conquest/engine.js';
import {esc, openSheet} from './dom.js';

/** @typedef {NonNullable<E.Game['chron']>[number]} News */

const WEIGHT = {victory:100, elim:80, cap:60, betray:50, anexion:60, alianza:35, war:30, paz:25, tributo:25, pacto:20, revolt:15};

/**
 * Titular, entradilla y peso de una noticia.
 * @param {News} n @param {E.Game} g @param {(p:number) => string} pn @param {number} me
 */
function story(n, g, pn, me) {
  const N = (/** @type {number|undefined} */ f) => f == null || f < 0 ? 'nadie' : g.F.name[f] || 'los rebeldes';
  const A = N(n.a), B = N(n.b), P = n.p != null ? pn(n.p) : '';
  const mine = n.a === me || n.b === me ? 25 : 0;
  const k = n.t === 'accept' ? n.k || '' : n.t;
  const w = (WEIGHT[/** @type {'war'} */ (k)] || 10) + mine;
  const pick = (/** @type {string[]} */ xs) => xs[(n.n * 7 + (n.a || 0) * 13 + (n.b || 0) * 3) % xs.length];
  switch (n.t) {
    case 'victory': return {w, h:`${A} domina la península`, l:`Tras ${n.n} turnos de guerra y diplomacia, ${A} se impone sobre todos sus rivales.`};
    case 'elim': {
      const by = n.b != null && n.b >= 0;
      return {w, h:pick(by ? [`${A} desaparece del mapa`, `Cae ${A}`, `${B} acaba con ${A}`, `Fin de ${A}`, `${A} se rinde ante ${B}`] : [`${A} desaparece del mapa`, `Fin de ${A}`]),
        l:by ? pick([`Las tropas de ${B} toman su último reducto.`, `Ondean las banderas de ${B} sobre sus tierras.`, `${B} entra sin resistencia en su última ciudad.`]) : 'Deja de existir como bando.'};
    }
    case 'cap': return {w, h:pick([`${A} toma ${P}`, `${P} cae en manos de ${A}`, `Asalto a ${P}: vence ${A}`]), l:pick([`Cae la capital de ${B}. Su gobierno huye a otra ciudad.`, `${B} pierde su capital y la moral de sus tropas se hunde.`])};
    case 'betray': return {w, h:`Traición: ${A} rompe su pacto con ${B}`, l:'Toda la península toma nota. Nadie volverá a fiarse tan fácilmente.'};
    case 'war': return {w, h:pick([`${A} declara la guerra a ${B}`, `Guerra entre ${A} y ${B}`, `${A} se lanza contra ${B}`]), l:n.k === 'alianza' ? `${A} cumple su palabra y entra en la guerra junto a su aliado.` : n.k === 'ataque' ? 'Las tropas cruzaron la frontera sin previo aviso.' : 'Los embajadores abandonan las capitales.'};
    case 'revolt': return {w, h:`${P} se alza contra ${A}`, l:'La provincia, cansada de la ocupación, expulsa a las tropas.'};
    case 'accept': {
      if (k === 'alianza') return {w, h:`${A} y ${B} sellan una alianza`, l:'Se defenderán mutuamente ante cualquier ataque.'};
      if (k === 'pacto') return {w, h:pick([`Pacto de no agresión entre ${A} y ${B}`, `${A} y ${B} firman la paz armada`]), l:'Ninguno atacará al otro durante una temporada.'};
      if (k === 'paz') return {w, h:pick([`Paz entre ${A} y ${B}`, `Callan las armas entre ${A} y ${B}`]), l:'Los soldados vuelven a casa.'};
      if (k === 'tributo') return {w, h:`${A} paga tributo a ${B}`, l:'El miedo vacía las arcas.'};
      if (k === 'anexion') return {w, h:`${A} se une a ${B}`, l:'Sin disparar un tiro, sus provincias cambian de bandera.'};
      return {w, h:`Acuerdo entre ${A} y ${B}`, l:''};
    }
    default: return {w:0, h:'', l:''};
  }
}

/** Noticias de un periodo, de más a menos importante y sin repetir titular. @param {E.Game} g @param {number} me @param {(p:number) => string} pn @param {number} from @param {number} to */
export function stories(g, me, pn, from, to) {
  const items = (g.chron || []).filter(n => n.n >= from && n.n <= to).map(n => ({n, ...story(n, g, pn, me)})).filter(x => x.h);
  items.sort((a, b) => b.w - a.w || b.n.n - a.n.n);
  const seen = new Set();
  return items.filter(x => !seen.has(x.h) && seen.add(x.h));
}
/**
 * Abre el periódico con lo sucedido entre dos turnos.
 * @param {E.Game} g @param {number} me @param {(p:number) => string} pn @param {number} from @param {number} to
 * @param {{title?:string, colors?:string[], onClose?:() => void}} [o]
 */
export function newspaper(g, me, pn, from, to, o = {}) {
  const list = stories(g, me, pn, from, to);
  const main = list[0], rest = list.slice(1, 7);
  const c = E.counts(g.P.owner, E.rebels(g) + 1), act = g.P.active.filter(Boolean).length;
  const top = c.map((v, f) => ({f, v})).filter(x => x.v > 0 && x.f < E.rebels(g)).sort((a, b) => b.v - a.v).slice(0, 5);
  const yr = E.year(g), date = `${E.SEASONS[E.season(g)]} del año ${yr}`;
  openSheet({title:o.title || 'Crónica', close:o.onClose, body:`<article class="paper">
    <header class="mast"><span class="m-l">Núm. ${g.turn}</span><h4>La Gaceta de la Península</h4><span class="m-r">Dos reales</span></header>
    <div class="dl">${esc(date)}</div>
    ${main ? `<h5 class="hl">${esc(main.h)}</h5><p class="lead">${esc(main.l)}</p>` : `<h5 class="hl">Tiempos tranquilos</h5><p class="lead">Ni guerras nuevas ni grandes batallas. Los ejércitos se rearman en silencio.</p>`}
    ${rest.length ? `<div class="cols">${rest.map(x => `<div class="brief"><b>${esc(x.h)}</b></div>`).join('')}</div>` : ''}
    <div class="power"><div class="pt">El reparto del poder</div>${top.map(x => `<div class="pr2"><span class="nm">${esc(g.F.name[x.f])}${x.f === me ? ' (tú)' : ''}</span><span class="bar"><i style="width:${(x.v * 100 / act).toFixed(1)}%;background:${g.F.color[x.f]}"></i></span><span class="num">${x.v}</span></div>`).join('')}</div>
  </article>`});
}

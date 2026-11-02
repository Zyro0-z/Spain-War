// @ts-check
// Vista de ciudad (panorama): cielo según la estación, relieve según el terreno, mar si hay costa, casas según la
// población, los edificios en sus solares (con andamios si están en obras y dañados si hay asedio), murallas,
// maravilla y barcos. Tocar un edificio o un solar abre Construir.
import * as E from '../conquest/engine.js';
import {esc, openSheet, closeSheet} from './dom.js';
import {buildArtRaw} from './buildart.js';
import {sound} from '../fx.js';

/** @typedef {import('./conquest.js').Conquest} Conquest */
const SKY = [['#8EC8F2', '#E6F3FF'], ['#5FB0EE', '#FFF1C4'], ['#E9A06A', '#FBE1C2'], ['#9FAEC0', '#E4E9EF']];
const GRASS = ['#7DB352', '#93B04A', '#A88B45', '#DDE3E8'];
const ROOF = ['#B4532F', '#A2462A', '#C0653A', '#93412A', '#8C5A3A'];

/** Número pseudoaleatorio estable. @param {number} i @param {number} seed */
const rnd = (i, seed) => { let h = (i * 2654435761 + seed * 97) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return (h % 1000) / 1000; };

/** @param {Conquest} c @param {number} p */
export function cityView(c, p) {
  const g = c.g, geo = c.geo, s = E.season(g), terr = geo.terrain[p], coast = geo.coast[p], seed = p * 31 + 7;
  const bs = E.buildingsAt(g, p), q = g.P.queue[p] || [], slots = E.slots(geo, g, p), siege = g.sieges.some(x => x.p === p);
  const W = 360, H = 220, sea = coast ? 260 : W;
  const sky = SKY[s], grass = GRASS[s];
  let svg = `<defs><linearGradient id="pvSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
    <linearGradient id="pvSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3C8AD0"/><stop offset="1" stop-color="#1F5C96"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#pvSky)"/>
    <circle cx="${s === 3 ? 70 : 300}" cy="38" r="16" fill="${s === 2 ? '#FFC27A' : '#FFF4B8'}" opacity=".9"/>`;
  for (let i = 0; i < 4; i++) { const x = 30 + rnd(i, seed) * 300, y = 22 + rnd(i + 9, seed) * 30; svg += `<g class="cloud" style="animation-delay:-${(rnd(i + 3, seed) * 40).toFixed(1)}s" opacity=".85"><ellipse cx="${x}" cy="${y}" rx="22" ry="7" fill="#fff"/><ellipse cx="${x + 12}" cy="${y - 5}" rx="12" ry="7" fill="#fff"/></g>`; }
  // relieve lejano
  if (terr === 'm') {
    let d = `M0 120`; for (let x = 0; x <= W; x += 30) d += `L${x + 15} ${62 + rnd(x, seed) * 30}L${x + 30} ${95 + rnd(x + 1, seed) * 20}`;
    svg += `<path d="${d}L${W} 140H0Z" fill="#7C8796"/><path d="${d}" fill="none" stroke="${s === 3 ? '#fff' : '#E8EEF4'}" stroke-width="${s === 3 ? 5 : 2}" stroke-linejoin="round" opacity=".8"/>`;
  } else if (terr === 's') {
    let d = `M0 112`; for (let x = 0; x <= W; x += 60) d += `Q${x + 30} ${86 + rnd(x, seed) * 18} ${x + 60} ${108 + rnd(x + 2, seed) * 8}`;
    svg += `<path d="${d}L${W} 140H0Z" fill="#8FA36A" opacity=".85"/>`;
  } else svg += `<path d="M0 118Q90 110 180 116T360 114V140H0Z" fill="#A9B77A" opacity=".8"/>`;
  // mar
  if (coast) svg += `<rect x="${sea}" y="126" width="${W - sea}" height="${H - 126}" fill="url(#pvSea)"/>${[0, 1, 2, 3].map(i => `<path class="wv" d="M${sea + 8 + i * 22} ${150 + i * 14}q5-3 10 0t10 0" stroke="#A8D4F5" stroke-width="1.4" fill="none"/>`).join('')}`;
  svg += `<path d="M0 132Q120 124 ${sea} 130V${H}H0Z" fill="${grass}"/>`;
  // casas según la población (en filas, al fondo)
  const n = Math.max(6, Math.min(34, Math.floor(g.P.pop[p] / 12)));
  for (let i = 0; i < n; i++) {
    const row = i % 3, x = 18 + rnd(i, seed) * (sea - 50), y = 128 + row * 7, w = 9 + rnd(i + 5, seed) * 6, h = 7 + rnd(i + 7, seed) * 5;
    svg += `<g><rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${i % 3 ? '#EEDFC2' : '#E2CFA9'}" stroke="#3B2410" stroke-width=".6"/><path d="M${x - 1} ${y - h}L${x + w / 2} ${y - h - w * .5}L${x + w + 1} ${y - h}Z" fill="${ROOF[i % ROOF.length]}" stroke="#3B2410" stroke-width=".6"/><rect x="${x + w / 2 - 1}" y="${y - 3}" width="2" height="3" fill="#4A2E14"/></g>`;
  }
  // maravilla al fondo, grande
  if (g.P.wonder[p]) svg += `<g transform="translate(${(sea / 2).toFixed(0)} 118) scale(1.25)">${buildArtRaw('maravilla', 1)}</g>`;
  // solares: edificios hechos, en obras y libres
  const lots = [...bs.map(([b, l]) => ({b, l, works:false})), ...q.filter(j => j.b !== '*' && !bs.some(([b]) => b === j.b)).map(j => ({b:j.b, l:j.lvl, works:true}))];
  const upg = new Set(q.filter(j => j.b !== '*').map(j => j.b));
  const total = Math.max(slots, lots.length), span = (sea - 40) / total;
  lots.forEach((x, i) => {
    const cx = 20 + span * (i + .5), st = x.works || upg.has(x.b) ? 'obras' : siege ? 'dañado' : '';
    svg += `<g class="lot" data-b="${x.b}" transform="translate(${cx.toFixed(1)} 170) scale(${Math.min(1.25, span / 58).toFixed(2)})">${buildArtRaw(x.b, x.l, st)}</g>`;
  });
  for (let i = lots.length; i < total; i++) {
    const cx = 20 + span * (i + .5);
    svg += `<g class="lot free" transform="translate(${cx.toFixed(1)} 182)"><ellipse rx="20" ry="6" fill="rgba(0,0,0,.12)" stroke="#5A4528" stroke-dasharray="3 3"/><text y="-8" text-anchor="middle">Solar libre</text></g>`;
  }
  // murallas delante
  const wall = E.lvl(g, p, 'muralla');
  if (wall) {
    let d = `M6 ${H - 8}V${H - 26}`; for (let x = 6; x < sea - 6; x += 10) d += `h5v4h5v-4`; d += `V${H - 8}Z`;
    svg += `<path d="${d}" fill="#C7AE7E" stroke="#3B2410" stroke-width="1"/>${[10, sea / 2, sea - 18].map(x => `<rect x="${x - 7}" y="${H - 40}" width="14" height="32" fill="#B89C6A" stroke="#3B2410" stroke-width="1"/>`).join('')}`;
  }
  if (coast && E.lvl(g, p, 'puerto')) svg += `<g class="boat" transform="translate(${sea + 40} 176)"><path d="M-14 0h28l-5 7h-18Z" fill="#7A4A26" stroke="#3B2410" stroke-width=".8"/><path d="M0 0v-22l12 18H0Z" fill="#F4EEDC" stroke="#3B2410" stroke-width=".8"/><path d="M0-20v-6" stroke="#3B2410"/><path d="M0-26h6l-2 2 2 2H0" fill="${g.F.color[g.P.owner[p]] || '#C23B32'}"/></g>`;
  if (s === 3) svg += `<rect width="${W}" height="${H}" fill="#fff" opacity=".08"/>`;
  if (siege) svg += `<g opacity=".6"><circle cx="${sea - 40}" cy="80" r="14" fill="#5A5550"/><circle cx="${sea - 30}" cy="64" r="10" fill="#6E6862"/><circle cx="${sea - 24}" cy="50" r="7" fill="#86807A"/></g>`;
  const legend = lots.map(x => `<button class="chip" data-lot="${x.b}">${esc(E.BUILDINGS[/** @type {E.Building} */ (x.b)]?.name || x.b)} ${x.l}${x.works || upg.has(x.b) ? ' · en obras' : ''}</button>`).join('');
  openSheet({title:c.pname(p), body:`
    <svg class="pano" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vista de ${esc(c.pname(p))}">${svg}</svg>
    <p class="note">${g.P.pop[p]} mil habitantes · ${E.SEASONS[s].toLowerCase()} · ${lots.length} de ${slots} solares${siege ? ' · bajo asedio' : ''}. Toca un edificio o un solar libre para construir.</p>
    <div class="chips">${legend}</div>`,
    mount:el => {
      const go = () => { sound('tap'); closeSheet(); if (g.P.owner[p] === c.me) setTimeout(() => c.buildSheet(p), 300); };
      el.querySelectorAll('.lot, [data-lot]').forEach(x => /** @type {HTMLElement} */ (x).addEventListener('click', go));
    }});
}

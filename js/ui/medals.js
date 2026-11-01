// @ts-check
// Medallas: dibujo (cinta y disco de metal con su símbolo en relieve), aviso al ganarlas y hoja con todas.
import {S, save} from '../store.js';
import {MEDALS} from '../conquest/medals.js';
import {SYMBOLS} from '../flagmaker.js';
import {sound, announce} from '../fx.js';
import {esc, openSheet} from './dom.js';

const METAL = {
  bronce:['#F3C08A', '#C47A3A', '#7A421A', '#5A2E10'],
  plata:['#FFFFFF', '#C9D2DE', '#7D8796', '#4E5866'],
  oro:['#FFF4C2', '#F2C94C', '#A9761A', '#6E4A08'],
};
let uid = 0;
/** @param {string} id @param {boolean} [got] */
export function medalArt(id, got = true) {
  const m = MEDALS[id]; if (!m) return '';
  const c = METAL[m.metal], k = 'md' + (++uid), sym = SYMBOLS[/** @type {'sol'} */ (m.sym)]?.d || '';
  return `<svg class="medal${got ? '' : ' off'}" viewBox="0 0 60 76" aria-hidden="true">
    <defs><radialGradient id="${k}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${c[0]}"/><stop offset=".45" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient></defs>
    <path d="M17 2h12l4 26H21Z" fill="#9E1B22"/><path d="M31 2h12l-4 26H27Z" fill="#C8102E"/><path d="M21 2h4l3 26h-3ZM35 2h4l-3 26h-3Z" fill="#F1BF00" opacity=".9"/>
    <circle cx="30" cy="48" r="22" fill="${c[3]}"/>
    <circle cx="30" cy="47" r="21" fill="url(#${k})"/>
    <circle cx="30" cy="47" r="16.5" fill="none" stroke="${c[3]}" stroke-opacity=".45" stroke-width="1.2"/>
    <g transform="translate(30 47) scale(1.12)"><path d="${sym}" fill="${c[3]}" fill-opacity=".85" fill-rule="evenodd" transform="translate(.5 .7)" opacity=".35"/><path d="${sym}" fill="${c[2]}" fill-rule="evenodd"/></g>
    <ellipse cx="23" cy="36" rx="8" ry="4" fill="#fff" opacity=".28" transform="rotate(-30 23 36)"/>
  </svg>`;
}

/** @type {string[]} */
let queue = [];
let showing = false;
/**
 * Guarda las medallas nuevas y las anuncia de una en una.
 * @param {string[]} ids
 */
export function award(ids) {
  const fresh = ids.filter(id => MEDALS[id] && !S.medals[id]);
  if (!fresh.length) return;
  for (const id of fresh) S.medals[id] = Date.now();
  save();
  queue.push(...fresh);
  if (!showing) next();
}
function next() {
  const id = queue.shift();
  if (!id) { showing = false; return; }
  showing = true;
  const m = MEDALS[id];
  let el = document.getElementById('medalToast');
  if (!el) { el = document.createElement('div'); el.id = 'medalToast'; el.className = 'mtoast glass'; el.setAttribute('role', 'status'); document.getElementById('app')?.appendChild(el); }
  el.innerHTML = `${medalArt(id)}<div><span>Nuevo logro</span><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></div>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  sound('conquer'); announce(`Nuevo logro: ${m.name}.`);
  setTimeout(() => { el?.classList.remove('show'); setTimeout(next, 450); }, 2800);
}

export function medalsSheet() {
  const ids = Object.keys(MEDALS), got = ids.filter(id => S.medals[id]).length;
  openSheet({title:'Logros', body:`
    <p class="note" style="margin:0 4px 12px">${got} de ${ids.length} medallas.</p>
    <div class="medals">${ids.map(id => {
      const m = MEDALS[id], on = !!S.medals[id];
      return `<div class="mcell${on ? '' : ' off'}">${medalArt(id, on)}<b>${esc(m.name)}</b><small>${esc(m.desc)}</small></div>`;
    }).join('')}</div>`});
}

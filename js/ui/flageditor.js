// @ts-check
// Hoja para crear tu bando: nombre, diseño de la bandera, colores y símbolo, con vista previa al momento.
import {FLAG_COLORS, LAYOUTS, SYMBOLS, flagSVG, bannerFlag, cleanFlag, bannerColor} from '../flagmaker.js';
import {sound} from '../fx.js';
import {icon} from '../icons.js';
import {esc, openSheet, closeSheet} from './dom.js';

/** Cuántos colores usa cada diseño. */
const USES = {liso:1, h2:2, v2:2, h3:3, v3:3, cruz:2, aspa:2, triangulo:3, cuarteles:2, banda:2};

/**
 * @param {{name:string, flag:import('../flagmaker.js').FlagDesign, color?:string, motto?:string}} init
 * @param {(v:{name:string, flag:import('../flagmaker.js').FlagDesign, color:string, motto:string}) => void} onSave
 */
export function flagEditor(init, onSave) {
  let f = cleanFlag(init.flag), slot = 0, color = /^#[0-9a-f]{6}$/i.test(init.color || '') ? /** @type {string} */ (init.color) : '';
  openSheet({title:'Tu bando', body:`
    <div class="fe-prev" id="feP"></div>
    <input class="field nm" id="feName" maxlength="22" placeholder="Nombre de tu bando" value="${esc(init.name)}" autocomplete="off" spellcheck="false" aria-label="Nombre de tu bando">
    <div style="height:8px"></div>
    <input class="field nm motto" id="feMotto" maxlength="40" placeholder="Lema (opcional)" value="${esc(init.motto || '')}" autocomplete="off" aria-label="Lema">
    <div class="glabel">Diseño</div>
    <div class="fe-grid" id="feL" role="radiogroup" aria-label="Diseño"></div>
    <div class="glabel">Colores</div>
    <div class="seg fe-slot" id="feSlot" role="group" aria-label="Qué color cambiar"></div>
    <div class="fe-sw" id="feC" role="radiogroup" aria-label="Color"></div>
    <div class="glabel">Símbolo</div>
    <div class="fe-grid syms" id="feS" role="radiogroup" aria-label="Símbolo"></div>
    <div class="glabel">Color en el mapa</div>
    <div class="fe-sw map" id="feM" role="radiogroup" aria-label="Color en el mapa"></div>
    <div style="height:14px"></div>
    <button class="btn" id="feOk">${icon('flag')}Usar este bando</button>`,
    mount:el => {
      const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (el.querySelector(s));
      const draw = () => {
        const n = USES[/** @type {'liso'} */ (f.layout)] || 3, hasSym = f.sym !== 'ninguno';
        if (slot >= n && slot < 3) slot = 0;
        if (slot === 3 && !hasSym) slot = 0;
        q('#feP').innerHTML = bannerFlag(f, {cls:'lg wave'});
        q('#feL').innerHTML = Object.entries(LAYOUTS).map(([k, v]) => `<button role="radio" aria-checked="${f.layout === k}" aria-label="${v}" data-l="${k}"><span class="flag">${flagSVG({...f, layout:k, sym:'ninguno'})}</span></button>`).join('');
        q('#feS').innerHTML = Object.entries(SYMBOLS).map(([k, v]) => `<button role="radio" aria-checked="${f.sym === k}" aria-label="${v.name}" data-s="${k}"><svg class="sym" viewBox="-11 -11 22 22" aria-hidden="true">${v.d ? `<path d="${v.d}" fill-rule="evenodd"/>` : '<circle r="7" fill="none" stroke-width="1.6"/><path d="M-5 5 5-5" fill="none" stroke-width="1.6"/>'}</svg></button>`).join('');
        const slots = [...Array.from({length:n}, (_, i) => `Color ${i + 1}`), ...(hasSym ? ['Símbolo'] : [])];
        q('#feSlot').innerHTML = slots.map((t, i) => { const k = i < n ? i : 3; return `<button data-k="${k}" aria-pressed="${slot === k}"><i class="dotc" style="background:${k < 3 ? f.c[k] : f.sc}"></i>${t}</button>`; }).join('');
        const cur = slot < 3 ? f.c[slot] : f.sc;
        q('#feC').innerHTML = FLAG_COLORS.map(c => `<button role="radio" aria-checked="${cur.toUpperCase() === c}" aria-label="Color ${c}" data-c="${c}" style="--c:${c}"></button>`).join('');
        const auto = bannerColor(f);
        q('#feM').innerHTML = `<button role="radio" aria-checked="${!color}" data-m="" class="auto" style="--c:${auto}" aria-label="Automático: el de la bandera">Auto</button>` +
          FLAG_COLORS.filter(c => c !== '#FFFFFF' && c !== '#1B1B1B').map(c => `<button role="radio" aria-checked="${color.toUpperCase() === c}" aria-label="Color ${c}" data-m="${c}" style="--c:${c}"></button>`).join('');
        el.querySelectorAll('[data-m]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { sound('tap'); color = /** @type {HTMLElement} */ (b).dataset.m || ''; draw(); });
        el.querySelectorAll('[data-l]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { sound('tap'); f = {...f, layout:/** @type {HTMLElement} */ (b).dataset.l || 'h3'}; draw(); });
        el.querySelectorAll('[data-s]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
          sound('tap'); f = {...f, sym:/** @type {HTMLElement} */ (b).dataset.s || 'ninguno'};
          if (f.sym !== 'ninguno' && f.sc.toUpperCase() === f.c[0].toUpperCase()) f.sc = f.c[0].toUpperCase() === '#FFFFFF' ? '#1B1B1B' : '#FFFFFF';
          draw();
        });
        el.querySelectorAll('[data-k]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { sound('tap'); slot = +(/** @type {HTMLElement} */ (b).dataset.k || 0); draw(); });
        el.querySelectorAll('[data-c]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
          sound('tap');
          const c = /** @type {HTMLElement} */ (b).dataset.c || '#FFFFFF';
          if (slot < 3) { const cc = [...f.c]; cc[slot] = c; f = {...f, c:cc}; } else f = {...f, sc:c};
          draw();
        });
      };
      draw();
      q('#feOk').onclick = () => {
        sound('lock');
        const name = (/** @type {HTMLInputElement} */ (q('#feName')).value || '').trim().replace(/\s+/g, ' ').slice(0, 22);
        const motto = (/** @type {HTMLInputElement} */ (q('#feMotto')).value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        closeSheet(); onSave({name, flag:f, color, motto});
      };
    }});
}

// @ts-check
// Utilidades de interfaz: selección, aspecto (tema, contraste, texto, movimiento), hoja inferior y avisos.
import {S} from '../store.js';
import {sound} from '../fx.js';

/** @param {string} s @param {ParentNode} [r] @returns {HTMLElement} */
export const $ = (s, r = document) => /** @type {HTMLElement} */ (r.querySelector(s));
/** @param {string} s @param {ParentNode} [r] @returns {HTMLElement[]} */
export const $$ = (s, r = document) => /** @type {HTMLElement[]} */ ([...r.querySelectorAll(s)]);
/** @param {unknown} s */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => /** @type {Record<string,string>} */ ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);
/** Número con coma decimal. @param {number} v @param {number} [d] */
export const fmt = (v, d = 0) => v.toLocaleString('es-ES', {minimumFractionDigits:d, maximumFractionDigits:d});
/** Porcentaje legible: nunca 0 % ni 100 % si no es seguro. @param {number} p */
export function pct(p) {
  const v = p * 100;
  if (v > 0 && v < 1) return '<1 %';
  if (v < 100 && v > 99) return '>99 %';
  return fmt(Math.round(v)) + ' %';
}

/* ---------- Aspecto ---------- */
let baseText = 1;
/** Tamaño de texto del sistema (Texto dinámico de iOS). */
export function measureText() {
  try {
    const s = document.createElement('span'); s.style.cssText = 'font:-apple-system-body;position:absolute;visibility:hidden'; s.textContent = 'x';
    document.body.appendChild(s); const px = parseFloat(getComputedStyle(s).fontSize); s.remove();
    baseText = px && px !== 17 ? Math.max(.9, Math.min(1.35, px / 17)) : 1;
  } catch (e) { baseText = 1; }
}
export function applyLook() {
  const r = document.documentElement, st = S.settings;
  r.setAttribute('data-theme', st.theme);
  r.toggleAttribute('data-light', ['atlas', 'pergamino', 'minimal'].includes(st.theme));
  r.toggleAttribute('data-contrast', !!st.contrast);
  r.toggleAttribute('data-reduced', st.motion === 'reduced');
  r.style.setProperty('--tz', String(st.textSize === 'auto' ? baseText : +st.textSize || 1));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', ({atlas:'#E6D8B8', pergamino:'#D8C49A', tactico:'#020806', minimal:'#EEF1F5'})[/** @type {'atlas'} */ (st.theme)] || '#071226');
}
/** Grano del fondo: una tesela de ruido generada una vez. */
export function makeGrain() {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 180;
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), img = x.createImageData(180, 180);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    document.documentElement.style.setProperty('--grain', `url(${c.toDataURL('image/png')})`);
  } catch (e) {}
}

/* ---------- Aviso breve ---------- */
/** @type {ReturnType<typeof setTimeout>|undefined} */
let toastT;
/** @param {string} msg */
export function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- Hoja inferior ---------- */
/** @type {(() => void)|null} */
let onClose = null;
/**
 * @param {{title:string, body:string, mount?:(el:HTMLElement)=>void, close?:()=>void}} o
 */
export function openSheet(o) {
  const sh = $('#sheet'), bd = $('#backdrop');
  sh.classList.remove('out');
  sh.innerHTML = `<div class="sh-in"><div class="sh-head"><h3>${esc(o.title)}</h3><button class="icb glass" data-x aria-label="Cerrar"><svg viewBox="0 0 24 24" class="ic"><path d="M7 7l10 10M17 7L7 17"/></svg></button></div>${o.body}</div>`;
  sh.setAttribute('aria-label', o.title);
  sh.hidden = false; bd.hidden = false;
  onClose = o.close || null;
  /** @type {HTMLElement} */ ($('[data-x]', sh)).onclick = () => { sound('tap'); closeSheet(); };
  bd.onclick = () => closeSheet();
  if (o.mount) o.mount(sh);
  sh.tabIndex = -1; setTimeout(() => sh.focus({preventScroll:true}), 50);
}
export function closeSheet() {
  const sh = $('#sheet'), bd = $('#backdrop');
  if (sh.hidden) return;
  sh.classList.add('out'); bd.hidden = true;
  setTimeout(() => { if (sh.classList.contains('out')) { sh.hidden = true; sh.innerHTML = ''; } }, 280);
  const f = onClose; onClose = null; if (f) f();
}

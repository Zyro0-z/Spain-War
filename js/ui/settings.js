// @ts-check
// Ajustes: sonido, tema, accesibilidad (menos animaciones, contraste alto, tamaño del texto) y créditos.
import {S, save} from '../store.js';
import {icon} from '../icons.js';
import {sound} from '../fx.js';
import {openSheet, closeSheet, applyLook} from './dom.js';

/** @param {string} id @param {string} ic @param {string} label @param {string} sub @param {boolean} on */
const sw = (id, ic, label, sub, on) => `<button class="rowi" role="switch" aria-checked="${on}" data-sw="${id}">${icon(ic)}<div class="l">${label}${sub ? `<small>${sub}</small>` : ''}</div><span class="switch"></span></button>`;
/** @param {string} id @param {[string, string][]} opts @param {string} cur */
const seg = (id, opts, cur) => `<div class="seg" role="group" data-seg="${id}">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;

/** Temas: nombre y muestra (mar, tierra, acento). */
const THEMES = [
  ['marina', 'Marina', ['#071226', '#3E6FB0', '#F2C94C']],
  ['atlas', 'Atlas', ['#E6D8B8', '#B9875A', '#7C5408']],
  ['pergamino', 'Pergamino', ['#D8C49A', '#9C3B2A', '#3B2A14']],
  ['tactico', 'Táctico', ['#020806', '#1FAE6B', '#7CFFB2']],
  ['minimal', 'Minimal', ['#EEF1F5', '#7C93B8', '#1A2230']],
];
/** @param {() => void} onLook se llama al cambiar algo que afecta al dibujo del mapa @param {() => void} [onSeed] espectador con semilla */
export function settingsSheet(onLook, onSeed) {
  const st = S.settings;
  openSheet({title:'Ajustes', body:`
    <div class="glabel">Sonido y aspecto</div>
    <div class="grp">
      ${sw('sound', 'soundOn', 'Sonido', 'Dados, impactos y fanfarrias', st.sound)}
      ${sw('music', 'soundOn', 'Música', 'Tranquila en paz, con tambores en guerra', st.music !== false)}
      <div class="rowi col">${icon('palette')}<div class="l">Tema</div></div>
      <div class="themes" role="radiogroup" aria-label="Tema">${THEMES.map(([k, n, c]) => `<button role="radio" aria-checked="${st.theme === k}" data-theme="${k}"><span class="sw" style="--a:${c[0]};--b:${c[1]};--c:${c[2]}"></span>${n}</button>`).join('')}</div>
      ${sw('labels', 'map', 'Nombres en el mapa', '', st.labels)}
    </div>
    <div class="glabel">Accesibilidad</div>
    <div class="grp">
      ${sw('motion', 'motion', 'Menos animaciones', 'Sin giros, temblores ni partículas; cortes directos', st.motion === 'reduced')}
      ${sw('contrast', 'contrast', 'Contraste alto', 'Paneles opacos, bordes y nombres más marcados', st.contrast)}
      <div class="rowi">${icon('text')}<div class="l">Texto</div>${seg('textSize', [['auto', 'Auto'], ['1', 'Normal'], ['1.15', 'Grande'], ['1.3', 'Enorme']], String(st.textSize))}</div>
    </div>
    <div class="glabel">Más</div>
    <div class="grp">${sw('fps', 'speed', 'Medidor de fotogramas', 'Muestra fps y tiempo por fotograma', st.fps)}
      ${onSeed ? `<button class="rowi" id="stSeed">${icon('seed')}<div class="l">Espectador con semilla<small>Repite una partida exacta de la ruleta</small></div></button>` : ''}</div>
    <p class="note">Mapa: © Instituto Geográfico Nacional de España (CC BY 4.0), vía es-atlas. Países vecinos: Natural Earth (dominio público). Tipografía Barlow Condensed (SIL OFL). Escudos, iconos y sonidos hechos para esta app.</p>`,
    mount(el) {
      el.querySelectorAll('[data-sw]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
        const k = /** @type {HTMLElement} */ (b).dataset.sw, on = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(on));
        if (k === 'sound') st.sound = on;
        if (k === 'music') st.music = on;
        if (k === 'labels') st.labels = on;
        if (k === 'motion') st.motion = on ? 'reduced' : 'full';
        if (k === 'contrast') st.contrast = on;
        if (k === 'fps') st.fps = on;
        save(); applyLook(); onLook(); sound('tap');
      });
      el.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
        const k = /** @type {HTMLElement} */ (g).dataset.seg, v = /** @type {string} */ (b.dataset.v);
        g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        if (k === 'textSize') st.textSize = v === 'auto' ? 'auto' : +v;
        save(); applyLook(); onLook(); sound('tap');
      }));
      el.querySelectorAll('[data-theme]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
        st.theme = /** @type {any} */ (/** @type {HTMLElement} */ (b).dataset.theme);
        el.querySelectorAll('[data-theme]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
        save(); applyLook(); onLook(); sound('tap');
      });
      const sd = el.querySelector('#stSeed'); if (sd && onSeed) /** @type {HTMLElement} */ (sd).onclick = () => { sound('tap'); closeSheet(); setTimeout(onSeed, 300); };
    }});
}

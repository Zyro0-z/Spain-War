// @ts-check
// Ajustes: sonido, tema, accesibilidad (menos animaciones, contraste alto, tamaño del texto) y créditos.
import {S, save} from '../store.js';
import {icon} from '../icons.js';
import {sound} from '../fx.js';
import {openSheet, applyLook} from './dom.js';

/** @param {string} id @param {string} ic @param {string} label @param {string} sub @param {boolean} on */
const sw = (id, ic, label, sub, on) => `<button class="rowi" role="switch" aria-checked="${on}" data-sw="${id}">${icon(ic)}<div class="l">${label}${sub ? `<small>${sub}</small>` : ''}</div><span class="switch"></span></button>`;
/** @param {string} id @param {[string, string][]} opts @param {string} cur */
const seg = (id, opts, cur) => `<div class="seg" role="group" data-seg="${id}">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;

/** @param {() => void} onLook se llama al cambiar algo que afecta al dibujo del mapa */
export function settingsSheet(onLook) {
  const st = S.settings;
  openSheet({title:'Ajustes', body:`
    <div class="glabel">Sonido y aspecto</div>
    <div class="grp">
      ${sw('sound', 'soundOn', 'Sonido', 'Dados, ruleta, impactos y fanfarrias', st.sound)}
      <div class="rowi">${icon('palette')}<div class="l">Tema</div>${seg('theme', [['marina', 'Marina'], ['atlas', 'Atlas']], st.theme)}</div>
      ${sw('labels', 'map', 'Nombres en el mapa', '', st.labels)}
    </div>
    <div class="glabel">Accesibilidad</div>
    <div class="grp">
      ${sw('motion', 'motion', 'Menos animaciones', 'Sin giros, temblores ni partículas; cortes directos', st.motion === 'reduced')}
      ${sw('contrast', 'contrast', 'Contraste alto', 'Paneles opacos, bordes y nombres más marcados', st.contrast)}
      <div class="rowi">${icon('text')}<div class="l">Texto</div>${seg('textSize', [['auto', 'Auto'], ['1', 'Normal'], ['1.15', 'Grande'], ['1.3', 'Enorme']], String(st.textSize))}</div>
    </div>
    <div class="glabel">Rendimiento</div>
    <div class="grp">${sw('fps', 'speed', 'Medidor de fotogramas', 'Muestra fps y tiempo por fotograma', st.fps)}</div>
    <p class="note">Mapa: © Instituto Geográfico Nacional de España (CC BY 4.0), vía es-atlas. Países vecinos: Natural Earth (dominio público). Tipografía Barlow Condensed (SIL OFL). Escudos, iconos y sonidos hechos para esta app.</p>`,
    mount(el) {
      el.querySelectorAll('[data-sw]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
        const k = /** @type {HTMLElement} */ (b).dataset.sw, on = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(on));
        if (k === 'sound') st.sound = on;
        if (k === 'labels') st.labels = on;
        if (k === 'motion') st.motion = on ? 'reduced' : 'full';
        if (k === 'contrast') st.contrast = on;
        if (k === 'fps') st.fps = on;
        save(); applyLook(); onLook(); sound('tap');
      });
      el.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
        const k = /** @type {HTMLElement} */ (g).dataset.seg, v = /** @type {string} */ (b.dataset.v);
        g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        if (k === 'theme') st.theme = /** @type {'marina'|'atlas'} */ (v);
        if (k === 'textSize') st.textSize = v === 'auto' ? 'auto' : +v;
        save(); applyLook(); onLook(); sound('tap');
      }));
    }});
}

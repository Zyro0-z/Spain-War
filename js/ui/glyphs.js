// @ts-check
// Pictogramas propios (trazo en una caja de 16×16 centrada): tipos de tropa, especialidades y maravillas.

/** Tropas: infantería, caballería, artillería, milicia. */
export const UNIT_ICON = [
  'M0-7V3 M-1.6-5.4 0-7 1.6-5.4V3 M-3.6 3h7.2 M0 3v2.6 M-1.3 6.4h2.6',
  'M-1 6.5V1.6L-4.6 2Q-6.2 1.8-5.8 0L-3.4-4.3 0.6-6.8 1.4-4.9Q5-3.2 5 1.5V6.5 M-2-2.4h.1 M1.4-4.9Q3.4-1.5 3.2 3',
  'M-6 .2 4.4-4.6 5.8-2 -4.8 2.8Z M-4.6 3.2a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0 M-6.5 6.3h13',
  'M0-1.5V6.5 M-3.5-6.5v3a3.5 3.5 0 0 0 7 0v-3 M0-6.5v5',
];
/** Especialidades. */
export const SPEC_ICON = {
  cereal:'M0 6.5V-2 M0-2c-2-1-3-3-2-5 2 1 2.5 3 2 5 M0 1c-2-1-3-3-2-5 M0 1c2-1 3-3 2-5 M0 4c2-1 3-3 2-5',
  vino:'M-3.5-6h7c0 4-1.5 6-3.5 6s-3.5-2-3.5-6Z M0 0v5 M-2.5 6h5',
  hierro:'M-6 1h9l3-3h-2l-1 1H-4 M-6 1v2.5h5V1 M-3 3.5 -4 6.5h5l-1-3',
  pesca:'M-6 0c3-4 7-4 10 0c-3 4-7 4-10 0Z M4 0 7-3v6Z M-2.5-.5h.1',
  huerta:'M0-1a4 4 0 1 0 0.1 0Z M0-1c0-2 1.5-4 4-5 M-1-2c-1.5-1-2-3-1-4',
  olivo:'M-3 6.5c0-4 1-7 3-10 M0-3.5c-3 0-5-2-5-3 2-1 4 0 5 3 M0-3.5c3 0 5-2 5-3-2-1-4 0-5 3 M2.5 1.5a1.5 1.5 0 1 0 0.1 0',
  ganado:'M-5-2c-2 0-2-3 0-3 M5-2c2 0 2-3 0-3 M-5-2h10v3c0 3-2 5-5 5s-5-2-5-5Z M-2 2h.1 M2 2h.1',
  industria:'M-6.5 6.5V-1l4-3v3l4-3v3l4-3V6.5Z M3.5-4V-7h2v3',
  comercio:'M-5-1h10l-1 7.5h-8Z M-2.5-1v-2a2.5 2.5 0 0 1 5 0v2',
  mineria:'M-6 6 2-2 M0-6c3 0 6 2 6 5-2-2-4-3-6-3 M-3-3 1 1',
  turismo:'M-1.5 6.5 1.5-6 M1.5-6c3 0 5 1.5 5.5 3.5-3-1-6-1-7 0 M1.5-6c-3 0-5 1.5-5.5 3.5 3-1 6-1 7 0 M-5 6.5h10',
  madera:'M0 6.5V2 M0-7 5 2h-10Z M0-4 3.5 1.5',
};
/** Maravilla (genérica): un edificio monumental con cúpula. */
export const WONDER_ICON = 'M-6.5 6.5h13 M-5.5 6.5v-6h11v6 M-6.5 0.5h13 M-4 0.5a4 4 0 0 1 8 0 M0-3.5V-6.5 M-3.5 6.5v-4 M0 6.5v-4 M3.5 6.5v-4';

/** Insignia redonda con un pictograma. @param {string} d @param {string} [cls] @param {string} [title] */
export const glyph = (d, cls = '', title = '') => `<svg class="gly ${cls}" viewBox="-8 -8 16 16" ${title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"'}><circle r="7.6"/><path d="${d}"/></svg>`;

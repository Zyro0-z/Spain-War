// @ts-check
// Iconos propios en dos tonos (24×24): trazo en el color del texto y relleno suave del mismo color.
// .ic-a es el relleno de acento (opacidad baja) y el resto es trazo, como en una familia duotono.

/** @type {Record<string, string>} */
export const ICONS = {
  play:'<path class="ic-a" d="M8 5.2v13.6a1 1 0 0 0 1.5.9l10.4-6.8a1 1 0 0 0 0-1.7L9.5 4.3A1 1 0 0 0 8 5.2z"/><path d="M8 5.2v13.6a1 1 0 0 0 1.5.9l10.4-6.8a1 1 0 0 0 0-1.7L9.5 4.3A1 1 0 0 0 8 5.2z"/>',
  pause:'<rect class="ic-a" x="6" y="4.5" width="4" height="15" rx="1.4"/><rect class="ic-a" x="14" y="4.5" width="4" height="15" rx="1.4"/><rect x="6" y="4.5" width="4" height="15" rx="1.4"/><rect x="14" y="4.5" width="4" height="15" rx="1.4"/>',
  soundOn:'<path class="ic-a" d="M4 9.5h3.2L12 5v14l-4.8-4.5H4z"/><path d="M4 9.5h3.2L12 5v14l-4.8-4.5H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.5 7.5 0 0 1 0 10.4"/>',
  soundOff:'<path class="ic-a" d="M4 9.5h3.2L12 5v14l-4.8-4.5H4z"/><path d="M4 9.5h3.2L12 5v14l-4.8-4.5H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>',
  gear:'<circle class="ic-a" cx="12" cy="12" r="7.2"/><path d="M12 3.2l1.4 2.3 2.6-.7.6 2.6 2.6.6-.7 2.6 2.3 1.4-2.3 1.4.7 2.6-2.6.6-.6 2.6-2.6-.7L12 20.8l-1.4-2.3-2.6.7-.6-2.6-2.6-.6.7-2.6L3.2 12l2.3-1.4-.7-2.6 2.6-.6.6-2.6 2.6.7z"/><circle cx="12" cy="12" r="2.8"/>',
  share:'<path class="ic-a" d="M6 10.5h12v8.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19z"/><path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8.5 10.5H7.5A1.5 1.5 0 0 0 6 12v7a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19v-7a1.5 1.5 0 0 0-1.5-1.5h-1"/>',
  close:'<circle class="ic-a" cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
  back:'<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  crown:'<path class="ic-a" d="M4 17.5L3 8l5 4 4-6.5 4 6.5 5-4-1 9.5z"/><path d="M4 17.5L3 8l5 4 4-6.5 4 6.5 5-4-1 9.5z"/><path d="M4.5 20.5h15"/>',
  swords:'<path class="ic-a" d="M14.5 4.5h5v5l-8 8-5-5z"/><path d="M19.5 4.5v4.2L9.8 18.4M19.5 4.5h-4.2L5.6 14.2"/><path d="M4.5 4.5v4.2l9.7 9.7M4.5 4.5h4.2l9.7 9.7"/><path d="M3.5 17.5l3 3M17.5 20.5l3-3M5.5 15.5l3 3M15.5 18.5l3-3"/>',
  dice:'<rect class="ic-a" x="4" y="4" width="16" height="16" rx="4"/><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="8.6" cy="8.6" r="1.25" fill="currentColor" stroke="none"/><circle cx="15.4" cy="15.4" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="15.4" cy="8.6" r="1.25" fill="currentColor" stroke="none"/><circle cx="8.6" cy="15.4" r="1.25" fill="currentColor" stroke="none"/>',
  user:'<circle class="ic-a" cx="12" cy="8.5" r="3.8"/><circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20c.9-4 3.7-6 7.2-6s6.3 2 7.2 6"/>',
  users:'<circle class="ic-a" cx="9" cy="8.5" r="3.2"/><circle cx="9" cy="8.5" r="3.2"/><circle cx="16.8" cy="9.6" r="2.5"/><path d="M3 19.5c.6-3.3 2.9-5.2 6-5.2s5.4 1.9 6 5.2M15.2 14.6c2.8-.4 5.2 1.1 5.9 4.6"/>',
  shield:'<path class="ic-a" d="M5 4.5h14V12c0 4.6-3 7.6-7 8.8-4-1.2-7-4.2-7-8.8z"/><path d="M5 4.5h14V12c0 4.6-3 7.6-7 8.8-4-1.2-7-4.2-7-8.8z"/>',
  lock:'<rect class="ic-a" x="5" y="10.5" width="14" height="10" rx="2.4"/><rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5"/>',
  replay:'<path class="ic-a" d="M12 4.5a7.5 7.5 0 1 1-7.3 9.2"/><path d="M4.5 4.8v4.7h4.7"/><path d="M4.9 9.3A7.5 7.5 0 1 1 4.7 13.7"/>',
  info:'<circle class="ic-a" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.3"/>',
  trophy:'<path class="ic-a" d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5a3 3 0 0 0 3.3 4M16.5 6h3a3 3 0 0 1-3.3 4M12 14v3.5M8 20.5h8M9.5 17.5h5"/>',
  wifi:'<path class="ic-a" d="M12 19.5l-3-3.2a4.2 4.2 0 0 1 6 0z"/><path d="M3 9.2a13 13 0 0 1 18 0M6 12.6a8.6 8.6 0 0 1 12 0M9 16.2a4.2 4.2 0 0 1 6 0"/><circle cx="12" cy="19" r=".9" fill="currentColor" stroke="none"/>',
  map:'<path class="ic-a" d="M9 4.5l6 2.5v12.5l-6-2.5z"/><path d="M3.5 6.5L9 4.5l6 2.5 5.5-2v12.5l-5.5 2-6-2.5-5.5 2z"/><path d="M9 4.5V17M15 7v12.5"/>',
  seed:'<path class="ic-a" d="M12 20.5c-4.1 0-6.5-2.6-6.5-6 0-4.3 3.4-7.6 6.5-10 3.1 2.4 6.5 5.7 6.5 10 0 3.4-2.4 6-6.5 6z"/><path d="M12 20.5c-4.1 0-6.5-2.6-6.5-6 0-4.3 3.4-7.6 6.5-10 3.1 2.4 6.5 5.7 6.5 10 0 3.4-2.4 6-6.5 6z"/><path d="M12 20.5v-7M12 15.5l-2.6-2.4M12 13.5l2.4-2.2"/>',
  contrast:'<circle cx="12" cy="12" r="8.5"/><path class="ic-a" d="M12 3.5a8.5 8.5 0 0 1 0 17z" style="fill-opacity:.9"/>',
  motion:'<circle class="ic-a" cx="15" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/><path d="M3 9h4.5M4 12h4M3 15h4.5"/>',
  text:'<path class="ic-a" d="M4 19.5L9 5h1.6l5 14.5"/><path d="M4 19.5L9.8 5h.6l5.8 14.5M6.3 14h7.6M17 19.5l2.2-6.5 2.3 6.5M17.7 17.5h3.1"/>',
  flag:'<path class="ic-a" d="M5.5 4.5h12l-2.5 4 2.5 4h-12z"/><path d="M5.5 21V4.5h12l-2.5 4 2.5 4h-12"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chev:'<path d="M9 5.5l6.5 6.5L9 18.5"/>',
  speed:'<path class="ic-a" d="M3.5 6.5v11l8-5.5zM12.5 6.5v11l8-5.5z"/><path d="M3.5 6.5v11l8-5.5zM12.5 6.5v11l8-5.5z"/>',
  skull:'<path class="ic-a" d="M5 11a7 7 0 0 1 14 0v3.5l-2 1.5v3H7v-3l-2-1.5z"/><path d="M5 11a7 7 0 0 1 14 0v3.5l-2 1.5v3H7v-3l-2-1.5z"/><circle cx="9.3" cy="11.5" r="1.6"/><circle cx="14.7" cy="11.5" r="1.6"/><path d="M10.5 19v-2M13.5 19v-2"/>',
  target:'<circle class="ic-a" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  copy:'<rect class="ic-a" x="8" y="8" width="12" height="12" rx="2.4"/><rect x="8" y="8" width="12" height="12" rx="2.4"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  palette:'<path class="ic-a" d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.6-2.1-.5-1.3.3-2.4 1.7-2.4h1.8a3.4 3.4 0 0 0 3.4-3.4C20.5 7.3 16.7 3.5 12 3.5z"/><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.6-2.1-.5-1.3.3-2.4 1.7-2.4h1.8a3.4 3.4 0 0 0 3.4-3.4C20.5 7.3 16.7 3.5 12 3.5z"/><circle cx="8" cy="11" r="1.2" fill="currentColor" stroke="none"/><circle cx="11" cy="7.6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.4" cy="8.4" r="1.2" fill="currentColor" stroke="none"/>',
};

/** @param {string} k @param {string} [cls] */
export const icon = (k, cls = '') => `<svg viewBox="0 0 24 24" class="ic ${cls}" aria-hidden="true">${ICONS[k] || ''}</svg>`;

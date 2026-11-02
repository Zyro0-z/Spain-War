// @ts-check
// Retratos por capas (SVG) a partir del nombre: fondo con el color del bando, ropa, cara, pelo, barba, edad y tocado
// según el papel (rey, regente, gobernador, general, ministro). Siempre el mismo retrato para el mismo nombre.

const SKIN = ['#F1D3B5', '#E5BF9A', '#D2A27A', '#B98257', '#8E5E3C'];
const HAIR = ['#2B1B10', '#4A2E1A', '#7A4B26', '#A8743A', '#1A1A1A', '#6B3A1E'];
const FEM = /a$|Leonor|Beatriz|Inés|Isabel|Mencía|Juana|Teresa|Urraca|Elvira|Berenguela/;
/** @param {string} s */
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/**
 * @param {string} name @param {{role?:'rey'|'regente'|'gobernador'|'general'|'ministro'|'heredero', color?:string, age?:number, size?:number, cls?:string}} [o]
 */
export function portrait(name, o = {}) {
  const h = hash(name), fem = FEM.test(name.split(' ')[0]), age = o.age ?? 30 + (h % 30);
  const skin = SKIN[h % SKIN.length], grey = age >= 55, hair = grey ? '#B9B4AC' : HAIR[(h >> 3) % HAIR.length];
  const col = o.color || '#7A3FA0', role = o.role || 'ministro', sz = o.size || 56;
  const style = (h >> 6) % 4, beard = !fem && ((h >> 9) % 3 !== 0) && age >= 18;
  const id = 'pt' + (h % 100000);
  // pelo de detrás (melena) y de delante
  const back = fem ? `<path d="M17 30c-2 12 2 22 6 26h18c4-4 8-14 6-26-2-10-28-10-30 0Z" fill="${hair}"/>` : style === 3 ? `<path d="M18 29c-1 8 1 14 4 17h20c3-3 5-9 4-17Z" fill="${hair}"/>` : '';
  const front = fem
    ? `<path d="M19 29c0-10 6-15 13-15s13 5 13 15c-4-5-8-7-13-7s-9 2-13 7Z" fill="${hair}"/>`
    : [`<path d="M19 29c0-10 6-14 13-14s13 4 13 14c-3-4-7-6-13-6s-10 2-13 6Z" fill="${hair}"/>`,
      `<path d="M19 28c1-9 6-13 13-13s12 4 13 13l-2-1c-2-5-6-7-11-7s-9 2-11 7Z" fill="${hair}"/>`,
      `<path d="M20 26c2-7 6-10 12-10s10 3 12 10c-4-2-8-3-12-3s-8 1-12 3Z" fill="${hair}"/>`,
      `<path d="M19 29c0-10 6-15 13-15s13 5 13 15c-3-6-7-8-13-8s-10 2-13 8Z" fill="${hair}"/>`][style];
  const beardP = beard ? [`<path d="M23 36c2 8 6 11 9 11s7-3 9-11c-2 3-5 5-9 5s-7-2-9-5Z" fill="${hair}"/>`,
    `<path d="M26 40c2 3 4 4 6 4s4-1 6-4c-2 1-4 1-6 1s-4 0-6-1Z" fill="${hair}"/><path d="M27 38c2-1 3-1 5-1s3 0 5 1" stroke="${hair}" stroke-width="1.6" fill="none"/>`][(h >> 12) % 2] : '';
  const wrinkles = age >= 50 ? `<path d="M24 31c1 .6 2 .6 3 0M37 31c1 .6 2 .6 3 0M27 40c1.5 1 3.5 1 5 0" stroke="rgba(80,40,20,.35)" stroke-width=".8" fill="none"/>` : '';
  const hat = role === 'rey' || role === 'regente' || role === 'heredero'
    ? `<path d="M20 22l2-9 5 5 5-8 5 8 5-5 2 9Z" fill="#F2C94C" stroke="#7A4E06" stroke-width="1"/><circle cx="32" cy="12" r="1.6" fill="#D63A3A"/><circle cx="23" cy="15" r="1.2" fill="#3E8EE0"/><circle cx="41" cy="15" r="1.2" fill="#3E8EE0"/>`
    : role === 'general' ? `<path d="M17 25c2-9 8-13 15-13s13 4 15 13Z" fill="#9AA3AD" stroke="#4A5058" stroke-width="1"/><path d="M14 25h36c-2 2-5 3-18 3s-16-1-18-3Z" fill="#B7C0C9" stroke="#4A5058" stroke-width="1"/><path d="M32 12c3-5 9-6 10-4-3 0-6 2-8 4Z" fill="#C23B32"/>`
    : role === 'gobernador' ? `<path d="M18 22c0-6 6-9 14-9s14 3 14 9c-4 1-9 2-14 2s-10-1-14-2Z" fill="#2B2B33"/><path d="M44 18c4 0 7 3 6 7-2-2-4-3-6-3Z" fill="#2B2B33"/>`
    : '';
  const collar = role === 'general' ? `<path d="M14 64c1-9 8-14 18-14s17 5 18 14Z" fill="#8C96A0" stroke="#4A5058" stroke-width="1"/><path d="M24 52h16l-2 4h-12Z" fill="#B7C0C9"/>`
    : `<path d="M13 64c1-9 9-14 19-14s18 5 19 14Z" fill="${col}"/><path d="M24 51c3 3 5 4 8 4s5-1 8-4l-2 6h-12Z" fill="#F4EEDF" opacity=".9"/>`;
  return `<svg class="portrait ${o.cls || ''}" viewBox="0 0 64 64" width="${sz}" height="${sz}" aria-hidden="true">
    <defs><radialGradient id="${id}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#FFF6DA"/><stop offset=".55" stop-color="${col}" stop-opacity=".55"/><stop offset="1" stop-color="#14121C"/></radialGradient>
    <clipPath id="${id}c"><circle cx="32" cy="32" r="31"/></clipPath></defs>
    <circle cx="32" cy="32" r="31" fill="url(#${id})"/>
    <g clip-path="url(#${id}c)">${back}${collar}<rect x="28" y="40" width="8" height="10" fill="${skin}"/>
    <ellipse cx="32" cy="32" rx="${fem ? 10.5 : 11}" ry="${fem ? 12.5 : 13}" fill="${skin}"/>
    <ellipse cx="21.5" cy="33" rx="1.8" ry="2.8" fill="${skin}"/><ellipse cx="42.5" cy="33" rx="1.8" ry="2.8" fill="${skin}"/>
    <path d="M26 30.5c1.2-.8 2.4-.8 3.6 0M34.4 30.5c1.2-.8 2.4-.8 3.6 0" stroke="${grey ? '#6E6A64' : hair}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <circle cx="27.8" cy="33" r="1.1" fill="#2A1A10"/><circle cx="36.2" cy="33" r="1.1" fill="#2A1A10"/>
    <path d="M32 33.5v4.2l-1.6 1" stroke="rgba(90,50,25,.55)" stroke-width="1" fill="none" stroke-linecap="round"/>
    <path d="M28.5 41.5c2 1.3 5 1.3 7 0" stroke="#8C3B2E" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    ${fem ? '<ellipse cx="26.5" cy="37" rx="2" ry="1.2" fill="#E88" opacity=".25"/><ellipse cx="37.5" cy="37" rx="2" ry="1.2" fill="#E88" opacity=".25"/>' : ''}
    ${wrinkles}${beardP}${front}${hat}</g>
    <circle cx="32" cy="32" r="31" fill="none" stroke="#F2C94C" stroke-width="1.6"/></svg>`;
}

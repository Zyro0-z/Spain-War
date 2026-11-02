// @ts-check
// Figuras pequeñas (SVG) para ejércitos y batallas: piquero, jinete, cañón y miliciano, con el color del bando.
// Caja de unos 16×18 con los pies en y = 0.

const INK = '#1E140A';
/** Una figura. @param {number} t tipo (0 inf, 1 cab, 2 art, 3 mil) @param {string} col @param {number} [x] @param {number} [y] @param {boolean} [flip] mirando a la izquierda */
export function figure(t, col, x = 0, y = 0, flip = false) {
  const tr = `translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}`;
  if (t === 1) return `<g transform="${tr}"><path d="M-7-6c0-2 2-3 4-3h7l3-3 2 1-1 4v3l-1 4h-1.6l.4-4-2-.4-1 4.4h-1.6l.2-4.6H-3l-.8 4.6H-5.4l.6-4.8c-1.6-.4-2.2-1-2.2-2Z" fill="#6B4A2E" stroke="${INK}" stroke-width=".7"/>
    <path d="M-1-9.5v-4.5h3.4v4.5Z" fill="${col}" stroke="${INK}" stroke-width=".6"/><circle cx=".7" cy="-15.6" r="1.7" fill="#E8C9A5" stroke="${INK}" stroke-width=".5"/><path d="M-.9-16.6h3.2" stroke="#9AA3AD" stroke-width="1.2"/>
    <path d="M3-15 9-21" stroke="#8A6A3A" stroke-width=".9"/><path d="M8.4-21.6 9.8-22.4 9.2-20.8Z" fill="#C9D3DC"/></g>`;
  if (t === 2) return `<g transform="${tr}"><path d="M-6-4.5 6-8.5 6.8-6.2-5.2-2.6Z" fill="#3A3A3E" stroke="${INK}" stroke-width=".6"/>
    <circle cx="-3" cy="-2.6" r="2.6" fill="none" stroke="#6B4A2E" stroke-width="1.2"/><path d="M-3-5.2v5.2M-5.6-2.6h5.2" stroke="#6B4A2E" stroke-width=".6"/>
    <path d="M-1-2.6 4-1.2" stroke="#6B4A2E" stroke-width="1.2"/><path d="M5-8.2h1.4" stroke="${col}" stroke-width="1.6"/></g>`;
  const pike = t === 3 ? `<path d="M2.6-13.5V-2" stroke="#8A6A3A" stroke-width=".8"/><path d="M1.6-14.5h2M2.6-15.5v2.2" stroke="#9AA3AD" stroke-width=".7"/>` : `<path d="M3-18V-1" stroke="#8A6A3A" stroke-width=".8"/><path d="M2.2-18 3-20.6 3.8-18Z" fill="#C9D3DC"/>`;
  return `<g transform="${tr}">${pike}<path d="M-2-10h4l.6 6.5H-2.6Z" fill="${t === 3 ? '#8C7A5B' : col}" stroke="${INK}" stroke-width=".6"/>
    <path d="M-2-3.5-2.4 0M1.8-3.5 2.2 0" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>
    <circle cy="-11.6" r="1.8" fill="#E8C9A5" stroke="${INK}" stroke-width=".5"/>${t === 3 ? '' : `<path d="M-2.2-12.4c.4-1.8 4-1.8 4.4 0Z" fill="#9AA3AD" stroke="${INK}" stroke-width=".4"/>`}
    ${t === 0 ? `<path d="M-3.8-9.2h1.8v4.6h-1.8Z" fill="#E9D8B4" stroke="${INK}" stroke-width=".5"/>` : ''}</g>`;
}
/**
 * Un grupo de figuras según la composición (hasta n), en filas.
 * @param {number[]} u tropas por tipo @param {string} col @param {number} n máximo de figuras @param {boolean} [flip]
 */
export function squad(u, col, n, flip = false) {
  const tot = u[0] + u[1] + u[2] + u[3]; if (!tot) return '';
  const k = [0, 1, 2, 3].map(t => u[t] ? Math.max(1, Math.round(u[t] * n / tot)) : 0);
  while (k.reduce((a, b) => a + b, 0) > n) { const i = k.indexOf(Math.max(...k)); k[i]--; }
  const order = [2, 0, 3, 1], out = [];
  let i = 0;
  for (const t of order) for (let j = 0; j < k[t]; j++, i++) {
    const row = i % 2, col2 = Math.floor(i / 2);
    out.push(figure(t, col, (flip ? -1 : 1) * col2 * 9 + row * (flip ? -4 : 4), row * 5, flip));
  }
  return out.join('');
}

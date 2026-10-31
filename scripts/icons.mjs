// @ts-check
// Genera apple-touch-icon.png (180) e icon-512.png a partir de un SVG: península con los colores de los bandos y espadas.
// Uso: node scripts/icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {assignColors, swords, lighten, darken} from '../js/art.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/map.json'), 'utf8'));
const colors = assignColors(map.provinces.map(p => p.adj));
const provs = map.provinces.map((p, i) => `<path d="${p.d}" fill="url(#g${i})" fill-rule="evenodd" stroke="#08101F" stroke-opacity=".7" stroke-width="2"/>`).join('');
const grads = map.provinces.map((p, i) => `<linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(colors[i], .15)}"/><stop offset="1" stop-color="${darken(colors[i], .2)}"/></linearGradient>`).join('');
const sw = swords().replace(/<ellipse[^>]*\/>/, "").replace('<svg viewBox="0 0 100 100" class="" aria-hidden="true">', '<svg x="232" y="190" width="560" height="560" viewBox="0 0 100 100">');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>${grads}
<radialGradient id="bg" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="#1B3A6E"/><stop offset=".55" stop-color="#0B1B3A"/><stop offset="1" stop-color="#040914"/></radialGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity=".6"/></filter>
<radialGradient id="lt" cx=".3" cy=".2" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient>
</defs>
<rect width="1024" height="1024" fill="url(#bg)"/>
<g transform="translate(92 150) scale(.84)" filter="url(#sh)">${provs}<path d="${map.land}" fill="url(#lt)"/><path d="${map.land}" fill="none" stroke="#E8F0FF" stroke-opacity=".6" stroke-width="3"/></g>
<rect width="1024" height="1024" fill="#040914" opacity=".28"/>
${sw}
</svg>`;
const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const b = await chromium.launch();
for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-512.png', 512]]) {
  const pg = await b.newPage({viewport:{width:size, height:size}});
  await pg.setContent(`<body style="margin:0">${svg.replace('width="1024" height="1024">', `width="${size}" height="${size}">`)}</body>`);
  await pg.screenshot({path:path.join(ROOT, file)});
  await pg.close();
  console.log(file);
}
await b.close();

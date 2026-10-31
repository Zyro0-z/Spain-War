// @ts-check
// Descarga la bandera de cada provincia desde Wikimedia Commons y la guarda en PNG (para que la app pese poco
// y funcione sin conexión). Solo acepta licencias libres (dominio público, CC0, CC BY, CC BY-SA) y escribe
// data/flags.json con el autor y la licencia de cada una, y la tabla de CREDITS.md.
//
// Uso: node scripts/fetch-flags.mjs   (necesita acceso a wikidata.org, commons.wikimedia.org y upload.wikimedia.org)
//
// Qué bandera: la propiedad «bandera» (P41) de Wikidata de la provincia, buscada por su código ISO 3166-2
// (ES-BU, ES-M…). En las comunidades uniprovinciales, si la provincia no tiene bandera propia, la de la comunidad.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/flags');
const UA = 'EspanaEnGuerra/1.0 (https://github.com/Zyro0-z/Spain-War)';
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/map.json'), 'utf8'));

/** Código ISO 3166-2 de cada provincia (igual que la matrícula salvo Ourense). */
const iso = (/** @type {{plate:string}} */ p) => 'ES-' + (p.plate === 'OU' ? 'OR' : p.plate);
/** Comunidad uniprovincial (ISO de la comunidad) por si la provincia no tiene bandera propia. */
const COMMUNITY = {'ES-M':'ES-MD', 'ES-O':'ES-AS', 'ES-S':'ES-CB', 'ES-LO':'ES-RI', 'ES-MU':'ES-MC', 'ES-NA':'ES-NC'};
const FREE = /public domain|^pd|cc0|cc[- ]by(-sa)?|cc-by|attribution/i;

/** @param {string} url */
async function json(url) {
  const r = await fetch(url, {headers:{'user-agent':UA, accept:'application/json'}});
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
/** Banderas de Wikidata por código ISO. */
async function wikidataFlags() {
  const q = `SELECT ?iso ?flag WHERE { ?item wdt:P300 ?iso; wdt:P41 ?flag. FILTER(STRSTARTS(?iso, "ES-")) }`;
  const d = await json('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q));
  /** @type {Record<string, string>} */
  const out = {};
  for (const b of d.results.bindings) {
    const file = decodeURIComponent(String(b.flag.value).split('/Special:FilePath/')[1] || '').replace(/_/g, ' ');
    if (file && !out[b.iso.value]) out[b.iso.value] = file;
  }
  return out;
}
/** Licencia, autor y URL del archivo en Commons. @param {string} file */
async function commonsInfo(file) {
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&titles=' + encodeURIComponent('File:' + file);
  const d = await json(u);
  const page = /** @type {any} */ (Object.values(d.query.pages)[0]);
  const ii = page.imageinfo?.[0];
  if (!ii) throw new Error('No está en Commons: ' + file);
  const m = ii.extmetadata || {}, strip = (/** @type {string} */ s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return {url:ii.url, page:ii.descriptionurl, license:strip(m.LicenseShortName?.value), artist:strip(m.Artist?.value).slice(0, 120)};
}

async function main() {
  fs.mkdirSync(OUT, {recursive:true});
  const flags = await wikidataFlags();
  const require = createRequire(import.meta.url);
  const {chromium} = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({viewport:{width:360, height:240}, deviceScaleFactor:1});
  /** @type {Record<string, {file:string, license:string, artist:string, source:string}>} */
  const manifest = {};
  const missing = [];
  for (const p of map.provinces) {
    const code = iso(p), file = flags[code] || flags[COMMUNITY[code]];
    if (!file) { missing.push(`${p.name} (sin bandera en Wikidata)`); continue; }
    let info;
    try { info = await commonsInfo(file); } catch (e) { missing.push(`${p.name}: ${e}`); continue; }
    if (!FREE.test(info.license)) { missing.push(`${p.name}: licencia «${info.license}»`); continue; }
    const r = await fetch(info.url, {headers:{'user-agent':UA}});
    if (!r.ok) { missing.push(`${p.name}: descarga ${r.status}`); continue; }
    const svg = await r.text();
    // Se rasteriza a 360×240 dentro de un contenedor 3:2 (la tela de la app recorta igual en todas)
    await page.setContent(`<body style="margin:0;background:transparent"><img id="f" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="width:360px;height:240px;object-fit:cover;display:block"></body>`);
    await page.waitForFunction(() => /** @type {HTMLImageElement} */ (document.getElementById('f')).complete);
    await page.screenshot({path:path.join(OUT, `${p.ine}.png`), omitBackground:true});
    manifest[p.ine] = {file, license:info.license, artist:info.artist, source:info.page};
    console.log(p.name, '→', file, '·', info.license);
  }
  await browser.close();
  fs.writeFileSync(path.join(ROOT, 'data/flags.json'), JSON.stringify(manifest, null, 1));
  // Tabla de créditos
  const rows = map.provinces.filter(p => manifest[p.ine]).map(p => { const m = manifest[p.ine]; return `| ${p.name} | [${m.file}](${m.source}) | ${m.artist || '—'} | ${m.license} |`; });
  const cred = path.join(ROOT, 'CREDITS.md'), txt = fs.readFileSync(cred, 'utf8').replace(/\n## Banderas[\s\S]*$/, '');
  fs.writeFileSync(cred, `${txt.trimEnd()}\n\n## Banderas\n\nDe Wikimedia Commons, rasterizadas a 360×240 con \`npm run flags\`.\n\n| Provincia | Archivo | Autor | Licencia |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n`);
  if (missing.length) console.log('\nSin bandera:\n- ' + missing.join('\n- '));
  console.log(`\n${Object.keys(manifest).length} de ${map.provinces.length} banderas`);
}
main().catch(e => { console.error(e); process.exit(1); });

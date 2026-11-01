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
/** Archivos conocidos que se prueban antes que Wikidata (donde Wikidata no tiene la bandera provincial). */
const OVERRIDE = {
  '03':['Bandera de la provincia de Alicante.svg', 'Flag of Alicante Province.svg'],
  '12':['Bandera de la provincia de Castellón.svg', 'Flag of the province of Castellón.svg', 'Bandera de la Provincia de Castellón.svg'],
  '15':['Bandeira da provincia da Coruña.svg', 'Flag of the province of A Coruña.svg', 'Bandera de la provincia de La Coruña.svg'],
  '49':['Bandera de la provincia de Zamora.svg', 'Flag of the province of Zamora.svg', 'Flag Zamora Province.svg'],
};
/** Nombres que delatan una bandera de otro sitio. */
const NOT_SPAIN = /(chinchipe|ecuador|argentin|m[eé]xico|colombia|venezuela|per[uú]|chile|filipinas|philippines|bolivia|cuba|honduras|municipi|ayuntamiento|concello|ajuntament)/i;

const sleep = (/** @type {number} */ ms) => new Promise(r => setTimeout(r, ms));
/**
 * Petición con reintentos: Wikimedia limita la frecuencia (429) y a veces falla (5xx); se espera cada vez más.
 * @param {string} url @param {'json'|'text'} as
 */
async function get(url, as) {
  for (let i = 0; i < 7; i++) {
    let r;
    try { r = await fetch(url, {headers:{'user-agent':UA, accept:as === 'json' ? 'application/json' : '*/*'}}); } catch (e) { await sleep(1500 * 2 ** i); continue; }
    if (r.ok) return as === 'json' ? r.json() : r.text();
    if (r.status === 429 || r.status >= 500) { const ra = +(r.headers.get('retry-after') || 0); await sleep(Math.max(ra * 1000, 1500 * 2 ** i)); continue; }
    throw new Error(`${url}: ${r.status}`);
  }
  throw new Error(`${url}: sin respuesta tras varios intentos`);
}
/** @param {string} url */
const json = url => get(url, 'json');
const norm = (/** @type {string} */ s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/**
 * Si Wikidata no la tiene: busca en Commons «Bandera/Flag … provincia de NOMBRE».
 * @param {string} name @returns {Promise<string>}
 */
/** Archivos de las categorías de banderas provinciales de Commons (se piden una vez). @type {string[]|null} */
let catFiles = null;
async function categoryFiles() {
  if (catFiles) return catFiles;
  catFiles = [];
  for (const cat of ['Flags of provinces of Spain', 'SVG flags of provinces of Spain', 'Flags of Galicia (provinces)', 'Flags of the Valencian Community', 'Flags of Castile and León']) {
    let cont = '';
    for (let i = 0; i < 5; i++) {
      const d = await json('https://commons.wikimedia.org/w/api.php?action=query&format=json&list=categorymembers&cmtype=file&cmlimit=500&cmtitle=' + encodeURIComponent('Category:' + cat) + (cont ? '&cmcontinue=' + encodeURIComponent(cont) : '')).catch(() => null);
      if (!d) break;
      catFiles.push(...(d.query?.categorymembers || []).map((/** @type {{title:string}} */ x) => x.title.replace(/^File:/, '')));
      cont = d.continue?.cmcontinue || ''; if (!cont) break;
      await sleep(500);
    }
  }
  return catFiles;
}
/** Otros nombres de la provincia que pueden salir en los archivos. */
const ALIAS = {'A Coruña':['Coruña', 'La Coruña', 'Corunna'], 'Castellón':['Castelló', 'Castellon'], 'Zamora':[]};
async function searchFlag(name) {
  const short = name.split('/')[0].trim();
  const names = [short, ...(/** @type {Record<string, string[]>} */ (ALIAS)[name] || [])];
  const flagLike = (/** @type {string} */ t) => /\.(svg|png)$/i.test(t) && /(flag|bandera|bandeira|bandiera)/i.test(t) && !NOT_SPAIN.test(t) && !/(coat|escudo|map|mapa|locator)/i.test(t);
  const inCat = (await categoryFiles()).filter(t => flagLike(t) && names.some(n => norm(t).includes(norm(n))))
    .sort((a, b) => (/provinc|diputaci|deputaci/i.test(b) ? 1 : 0) - (/provinc|diputaci|deputaci/i.test(a) ? 1 : 0) || (/\.svg$/i.test(b) ? 1 : 0) - (/\.svg$/i.test(a) ? 1 : 0));
  if (inCat[0]) return inCat[0];
  for (const q of names.flatMap(n => [`Flag of the province of ${n}`, `Bandera de la provincia de ${n}`, `Bandeira da provincia da ${n}`, `Bandera Diputación ${n}`])) {
    const d = await json('https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=12&srsearch=' + encodeURIComponent(q));
    const hit = (d.query?.search || []).map((/** @type {{title:string}} */ x) => x.title.replace(/^File:/, ''))
      .filter((/** @type {string} */ t) => /\.svg$/i.test(t) && /(flag|bandera|bandeira|bandiera)/i.test(t) && /(provinc|provínc|diputaci|deputaci)/i.test(t)
        && names.some(n => norm(t).includes(norm(n))) && !NOT_SPAIN.test(t) && !/(coat|escudo|map|mapa|locator|old|antigua|historic)/i.test(t))
      .sort((/** @type {string} */ a, /** @type {string} */ b) => (/(provinc)/i.test(b) ? 1 : 0) - (/(provinc)/i.test(a) ? 1 : 0))[0];
    if (hit) return hit;
    await sleep(800);
  }
  return '';
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
  // lo ya descargado se conserva (se puede relanzar las veces que haga falta)
  const mfile = path.join(ROOT, 'data/flags.json');
  /** @type {Record<string, {file:string, license:string, artist:string, source:string}>} */
  const manifest = fs.existsSync(mfile) ? JSON.parse(fs.readFileSync(mfile, 'utf8')) : {};
  const missing = [];
  for (const p of map.provinces) {
    if (manifest[p.ine] && fs.existsSync(path.join(OUT, `${p.ine}.png`))) continue;
    const code = iso(p);
    let file = flags[code] || flags[COMMUNITY[code]] || '';
    let info = null;
    for (const cand of [...(/** @type {Record<string, string[]>} */ (OVERRIDE)[p.ine] || []), file, ''].filter((x, i, a) => x || i === a.length - 1)) {
      try {
        const f = cand || await searchFlag(p.name);
        if (!f) break;
        const i = await commonsInfo(f);
        if (!FREE.test(i.license)) { missing.push(`${p.name}: licencia «${i.license}» (${f})`); if (cand) continue; break; }
        file = f; info = i; break;
      } catch (e) { missing.push(`${p.name}: ${e}`); if (!cand) break; }
    }
    if (!info) { if (!missing.some(m => m.startsWith(p.name))) missing.push(`${p.name}: sin bandera`); continue; }
    let svg;
    try { svg = await get(info.url, 'text'); } catch (e) { missing.push(`${p.name}: descarga ${e}`); continue; }
    await sleep(700);
    // Se rasteriza a 360×240 dentro de un contenedor 3:2 (la tela de la app recorta igual en todas)
    await page.setContent(`<body style="margin:0;background:transparent"><img id="f" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="width:360px;height:240px;object-fit:cover;display:block"></body>`);
    await page.waitForFunction(() => /** @type {HTMLImageElement} */ (document.getElementById('f')).complete);
    await page.screenshot({path:path.join(OUT, `${p.ine}.png`), omitBackground:true});
    manifest[p.ine] = {file, license:info.license, artist:info.artist, source:info.page};
    console.log(p.name, '→', file, '·', info.license);
  }
  await browser.close();
  fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1));
  // Tabla de créditos
  const rows = map.provinces.filter(p => manifest[p.ine]).map(p => { const m = manifest[p.ine]; return `| ${p.name} | [${m.file}](${m.source}) | ${m.artist || '—'} | ${m.license} |`; });
  const cred = path.join(ROOT, 'CREDITS.md'), txt = fs.readFileSync(cred, 'utf8').replace(/\n## Banderas[\s\S]*$/, '');
  fs.writeFileSync(cred, `${txt.trimEnd()}\n\n## Banderas\n\nDe Wikimedia Commons, rasterizadas a 360×240 con \`npm run flags\`.\n\n| Provincia | Archivo | Autor | Licencia |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n`);
  if (missing.length) console.log('\nSin bandera:\n- ' + missing.join('\n- '));
  console.log(`\n${Object.keys(manifest).length} de ${map.provinces.length} banderas`);
}
main().catch(e => { console.error(e); process.exit(1); });

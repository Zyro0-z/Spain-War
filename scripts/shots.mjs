// @ts-check
// Capturas de pantalla en tamaño iPhone 14 (390×844 a 3x) de menú, partida, combate, conquista y victoria.
// Uso: node scripts/shots.mjs [chromium|webkit] [carpeta]
// - chromium: Playwright con Chromium.
// - webkit: WebKitGTK por WebDriver (WebKitWebDriver), el mismo motor que Safari.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = process.argv[2] || 'chromium';
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'shots'));
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;
/** Escenas que usan la sala local del navegador (sin ntfy). */
const query = (/** @type {string} */ name) => (name === 'sala' || name === 'online' ? 'hq&red=local&' : 'hq&') + name;
const W = 390, H = 844, DPR = 3;
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.woff2':'font/woff2', '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json'};

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(new URL(q.url || '/', 'http://x').pathname);
      let f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (u === '/__host') { // marco de 390×844 para WebKit (su ventana mínima es más ancha)
        r.writeHead(200, {'content-type':'text/html'});
        r.end(`<!doctype html><body style="margin:0;background:#000"><iframe id="f" src="/?${query(new URL(q.url || '/', 'http://x').search.slice(1))}" style="border:0;width:${W}px;height:${H}px;display:block;margin:120px 0 0 0"></iframe></body>`);
        return;
      }
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, {'content-type':TYPES[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

/* ---------- Guion común (se ejecuta en la página) ---------- */
// Cada escena deja la app en un estado y congela el reloj de la partida.
const SCENES = {
  // Rendimiento: 15 s de partida a x1 midiendo el tiempo entre fotogramas (no hace captura útil)
  perf:`async () => { __eeg.start('PROVINCIA', {skip:60}); const d = []; let last = 0, run = true;
    const f = t => { if (last) d.push(t - last); last = t; if (run) requestAnimationFrame(f); }; requestAnimationFrame(f);
    await sleep(15000); run = false; const s = [...d].sort((a, b) => a - b), avg = d.reduce((a, b) => a + b, 0) / d.length;
    window.__perf = {frames:d.length, fps:+(1000 / avg).toFixed(1), avg:+avg.toFixed(1), p95:+s[Math.floor(s.length * .95)].toFixed(1), worst:+s[s.length - 1].toFixed(1), dpr:__eeg.W.view.dpr}; }`,
  menu:`async () => { await sleep(1400); }`,
  ajustes:`async () => { document.querySelector('#mSet').click(); await sleep(700); }`,
  ruleta:`async () => { await freezeAt('spin', 1500, 0, 2); }`,
  objetivo:`async () => { await freezeAt('target', 1350, 0, 2); }`,
  combate:`async () => { await freezeAt('roll', 520, 0, 1); }`,
  conquista:`async () => { await freezeAt('conquest', 260, 12, 1, 120000); }`,
  atlas:`async () => { __eeg.look({theme:'atlas'}); await freezeAt('roll', 900, 0, 2); }`,
  contraste:`async () => { __eeg.look({contrast:true, textSize:1.15}); await freezeAt('target', 1350, 0, 2); }`,
  'un-jugador':`async () => { document.querySelector('#mSolo').click(); await sleep(500);
    const sel = document.querySelector('#suSel'); sel.value = String(__eeg.W.map.provinces.find(p => p.name === 'Burgos').i); sel.dispatchEvent(new Event('change'));
    document.querySelector('[data-lv="mariscal"]').click(); await sleep(900); }`,
  'tu-turno':`async () => { let hit = false;
    __eeg.onPhase = (name, m) => { if (name === 'choose' && !hit) { hit = true; m.clock.pause(); } };
    __eeg.solo(22, 'estratega', 'CASTILLA', {skip:40}); __eeg.match.clock.speed = 2;
    await waitFor(() => hit, 90000); __eeg.match.clock.advance(3200); __eeg.match.view.invalidate(); await sleep(600); }`,
  sala:`async () => {
    document.querySelector('#mOnline').click(); await sleep(400);
    document.querySelector('#onName').value = 'Ana'; document.querySelector('#onNew').click();
    await waitFor(() => document.querySelector('.code-box b'));
    const code = document.querySelector('.code-box b').textContent;
    const {Guest} = await import('./js/net/room.js'); const {LocalTransport, topicOf} = await import('./js/net/transport.js');
    const P = n => __eeg.W.map.provinces.find(p => p.name === n).i;
    const sel = document.querySelector('#lbSel'); sel.value = String(P('Madrid')); sel.dispatchEvent(new Event('change'));
    for (const [id, name, prov] of [['g1', 'Luis', 'Sevilla'], ['g2', 'Marta', 'Valencia'], ['g3', 'Iker', 'Bizkaia']]) {
      const g = new Guest({transport:new LocalTransport(topicOf(code)), graph:__eeg.W.graph, id, name, code}); await g.join(); await sleep(300); await g.pick(P(prov)); }
    await sleep(2500); }`,
  online:`async () => {
    const {Host} = await import('./js/net/room.js'); const {LocalTransport, topicOf} = await import('./js/net/transport.js');
    const P = n => __eeg.W.map.provinces.find(p => p.name === n).i, code = 'K7QX2M';
    const host = new Host({transport:new LocalTransport(topicOf(code)), graph:__eeg.W.graph, id:'host1', name:'Ana', code, sp:2});
    await host.open(); host.pick(P('Madrid'));
    document.querySelector('#mOnline').click(); await sleep(400);
    document.querySelector('#onName').value = 'Luis'; document.querySelector('#onCode').value = code; document.querySelector('#onJoin').click();
    await waitFor(() => document.querySelector('#lbSel')); await sleep(800);
    const sel = document.querySelector('#lbSel'); sel.value = String(P('Sevilla')); sel.dispatchEvent(new Event('change'));
    await waitFor(() => host.canStart(), 15000);
    let hit = false;
    __eeg.onPhase = (name, m) => { if (name === 'choose' && !hit) { hit = true; m.clock.pause(); } };
    await host.start('SALA0'); await host.advance();
    await waitFor(() => hit, 90000); __eeg.match.clock.advance(2500); __eeg.match.view.invalidate(); await sleep(600); }`,
  // Conquista (etapas 1–3)
  guerra:`async () => { __eeg.startWar({sc:'las47', me:26, diff:'normal', seed:'GUERRA'}); await ff(8);
    const w = __eeg.war; w.select(w.g.P.owner.indexOf(w.me)); await sleep(1400); }`,
  peninsula:`async () => { document.querySelector('#mWar').click(); await sleep(700); document.querySelector('[data-sc="peninsula"]').click(); await sleep(400);
    const s = document.querySelector('#wsSel'); s.value = '15'; s.dispatchEvent(new Event('change')); await sleep(1200); }`,
  bandera:`async () => { document.querySelector('#mWar').click(); await sleep(700); document.querySelector('details.adv summary').click(); await sleep(300);
    document.querySelector('#wsEdit').click(); await sleep(500);
    for (const q of ['[data-l="cruz"]', '[data-k="1"]', '[data-c="#F1BF00"]', '[data-s="castillo"]']) { document.querySelector(q).click(); await sleep(80); }
    document.querySelector('#feName').value = 'Reino de Castilla'; await sleep(700); }`,
  cronica:`async () => { __eeg.startWar({sc:'las47', me:26, diff:'dificil', seed:'CRONICA'}); await sim(12);
    const w = __eeg.war; w.news(1, w.g.turn, 'Crónica del año 1'); await sleep(900); }`,
  final:`async () => { __eeg.startWar({sc:'vecinas', me:0, diff:'facil', seed:'FINAL', center:__eeg.W.map.provinces.find(p => p.name === 'Soria').i}); await sim(6);
    const w = __eeg.war, g = w.g, ch = String.fromCharCode(48 + w.me);
    for (let i = 0; i < g.P.owner.length; i++) if (g.P.active[i] && g.P.owner[i] !== w.me) {
      const h = g.hist[g.hist.length - 1].split(''); g.hist.push(h.join('')); g.hist.push(h.join('')); h[i] = ch; g.hist.push(h.join(''));
      g.P.owner[i] = w.me; g.stats.conq[w.me]++; g.stats.won[w.me]++; }
    g.turn = g.hist.length; g.stats.peak[w.me] = g.P.active.filter(Boolean).length; g.over = true; g.winner = w.me;
    w.view.setOwners(g.P.owner); w.end(); await sleep(3400); }`,
  campana:`async () => { Object.assign(__eeg.S.campaign, {m1:3, m2:2, m3:1}); __eeg.menu(); await sleep(500); document.querySelector('#mCamp').click(); await sleep(800); }`,
  logros:`async () => { for (const k of ['sangre', 'capital', 'tesoro', 'facil', 'conquistador', 'veterano', 'normal', 'dificil', 'iberia']) __eeg.S.medals[k] = 1; __eeg.menu(); await sleep(500);
    document.querySelector('#mMedals').click(); await sleep(800); }`,
  pergamino:`async () => { __eeg.look({theme:'pergamino'}); __eeg.startWar({sc:'reinos', me:1, diff:'facil', seed:'PERGAMINO'}); await sim(6);
    const w = __eeg.war; w.select(w.g.F.capital[w.me]); await sleep(1400); }`,
  tutorial:`async () => { document.querySelector('#mTut').click(); await sleep(1500); const w = __eeg.war; w.select(w.g.P.owner.indexOf(w.me)); await sleep(900); }`,
  victoria:`async () => { __eeg.start('PROVINCIA', {skip:520}); __eeg.match.clock.speed = 5;
    await waitFor(() => document.body.dataset.phase === 'victory', 180000); await sleep(2600); }`,
};
// Congela la partida en una fase exacta: pausa el reloj en el acto, avanza X ms de partida y N fotogramas de partículas.
const HELPERS = `window.sleep = ms => new Promise(r => setTimeout(r, ms));
window.waitFor = (f, t = 30000) => new Promise((res, rej) => { const t0 = Date.now(); const k = () => { try { if (f()) return res(true); } catch (e) {} if (Date.now() - t0 > t) return rej(new Error('timeout')); setTimeout(k, 50); }; k(); });
window.ff = async n => { const w = __eeg.war, m0 = __eeg.S.settings.motion; __eeg.look({motion:'reduced'}); w.speed = 5;
  const shut = setInterval(() => { const x = document.querySelector('#sheet:not([hidden]) [data-x]'); if (x) x.click(); }, 300);
  for (let i = 0; i < n && !w.g.over; i++) await w.endTurn();
  await sleep(900); clearInterval(shut); __eeg.look({motion:m0}); await sleep(300); };
window.sim = async n => { const {endTurn} = await import('./js/conquest/turn.js'); const w = __eeg.war;
  for (let i = 0; i < n && !w.g.over; i++) w.g = endTurn(w.geo, w.g).g;
  w.view.setOwners(w.g.P.owner, w.g.F.alive.map(a => !a)); w.refresh(); w.renderBar(); await sleep(400); };
window.freezeAt = async (phase, ms, fxFrames, speed, t = 60000) => {
  let hit = false;
  __eeg.onPhase = (name, m) => { if (name === phase && !hit) { hit = true; m.clock.pause(); __eeg.freezeFx(true); } };
  __eeg.start('PROVINCIA', {skip:60}); __eeg.match.clock.speed = speed;
  await waitFor(() => hit, t);
  const m = __eeg.match; m.clock.speed = 1;
  m.clock.advance(ms); __eeg.stepFx(fxFrames); m.view.invalidate();
  await sleep(500);
};`;

async function withChromium(base) {
  const require = createRequire(import.meta.url);
  const {chromium} = require('playwright');
  const b = await chromium.launch();
  for (const [name, fn] of Object.entries(SCENES)) {
    if (ONLY ? !ONLY.includes(name) : name === 'perf') continue;
    const ctx = await b.newContext({viewport:{width:W, height:H}, deviceScaleFactor:DPR, isMobile:true, hasTouch:true, reducedMotion:'no-preference'});
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e)));
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.goto(base + '/?' + query(name));
    await pg.waitForFunction(() => /** @type {any} */ (window).__eeg && document.querySelector('#menu .mode'));
    await pg.evaluate(HELPERS);
    await pg.evaluate(`(${fn})()`);
    if (name === 'perf') { console.log('perf', JSON.stringify(await pg.evaluate('window.__perf'))); await ctx.close(); continue; }
    await pg.screenshot({path:path.join(OUT, `${name}.png`)});
    console.log(name, errs.length ? 'ERRORES: ' + errs.join(' | ') : 'ok');
    await ctx.close();
  }
  await b.close();
}

/* ---------- WebKit por WebDriver ---------- */
/** Recorta el marco de la captura completa (escala real = alto de la imagen / alto de la ventana). */
function crop(src, dst, [x, y, w, h, , vh]) {
  const py = `from PIL import Image\nim=Image.open(${JSON.stringify(src)}); k=im.size[1]/${vh}\nim.crop((round(${x}*k),round(${y}*k),round(${x + w}*k),round(${y + h}*k))).resize((${W * DPR},${H * DPR})).save(${JSON.stringify(dst)})`;
  return new Promise((res, rej) => { const p = spawn('python3', ['-I', '-c', py], {stdio:'inherit'}); p.on('exit', c => c ? rej(new Error('crop')) : res(undefined)); });
}
async function wd(port, method, p, body) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, {method, headers:{'content-type':'application/json'}, body:body ? JSON.stringify(body) : undefined});
  const j = await r.json();
  if (j.value && j.value.error) throw new Error(j.value.error + ': ' + j.value.message);
  return j.value;
}
async function withWebKit(base) {
  const port = 4444 + Math.floor(Math.random() * 1000);
  const xvfb = spawn('Xvfb', [':77', '-screen', '0', '1800x4000x24'], {stdio:'ignore'});
  await new Promise(r => setTimeout(r, 800));
  const drv = spawn('WebKitWebDriver', [`--port=${port}`], {stdio:'ignore', env:{...process.env, DISPLAY:':77', GDK_SCALE:String(DPR), WEBKIT_DISABLE_COMPOSITING_MODE:'0'}});
  await new Promise(r => setTimeout(r, 1200));
  try {
    for (const [name, fn] of Object.entries(SCENES)) {
      if (ONLY ? !ONLY.includes(name) : name === 'perf') continue;
      const s = await wd(port, 'POST', '/session', {capabilities:{alwaysMatch:{browserName:'MiniBrowser', 'webkitgtk:browserOptions':{binary:'/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser', args:['--automation', '--enable-write-console-messages-to-stdout=true']}}}});
      const id = s.sessionId;
      await wd(port, 'POST', `/session/${id}/window/rect`, {width:W + 120, height:H + 300, x:0, y:0});
      await wd(port, 'POST', `/session/${id}/url`, {url:base + '/__host?' + name});
      const fr = await wd(port, 'POST', `/session/${id}/element`, {using:'css selector', value:'#f'});
      const ref = Object.values(fr)[0];
      await new Promise(r => setTimeout(r, 600));
      await wd(port, 'POST', `/session/${id}/frame`, {id:fr});
      const res = await wd(port, 'POST', `/session/${id}/execute/async`, {script:`const done = arguments[arguments.length - 1]; (async () => { const t0 = Date.now(); while (!(window.__eeg && document.querySelector('#menu .mode'))) { if (Date.now() - t0 > 20000) break; await new Promise(r => setTimeout(r, 100)); } ${HELPERS} try { await (${fn})(); done('ok'); } catch (e) { done('ERR ' + e); } })();`, args:[]});
      const vp = await wd(port, 'POST', `/session/${id}/execute/sync`, {script:'return [innerWidth, innerHeight, devicePixelRatio]', args:[]});
      if (name === 'perf') { console.log('perf webkit', JSON.stringify(await wd(port, 'POST', `/session/${id}/execute/sync`, {script:'return window.__perf', args:[]}))); await wd(port, 'DELETE', `/session/${id}`); continue; }
      await wd(port, 'POST', `/session/${id}/frame/parent`, {});
      // Captura completa y recorte del marco con Python (la captura de elemento de WebKitGTK sale desplazada)
      const rect = await wd(port, 'POST', `/session/${id}/execute/sync`, {script:'const r = document.getElementById("f").getBoundingClientRect(); return [r.left, r.top, r.width, r.height, devicePixelRatio, innerHeight]', args:[]});
      const png = await wd(port, 'GET', `/session/${id}/screenshot`);
      const full = path.join(OUT, `${name}.full.png`);
      fs.writeFileSync(full, Buffer.from(png, 'base64'));
      await crop(full, path.join(OUT, `${name}.png`), rect);
      if (!process.env.KEEP_FULL) fs.unlinkSync(full);
      void ref;
      console.log(name, 'webkit', vp.join('×'), res === 'ok' ? '' : res);
      await wd(port, 'DELETE', `/session/${id}`);
    }
  } finally { drv.kill(); xvfb.kill(); }
}

const srv = /** @type {http.Server} */ (await serve());
const addr = /** @type {import('node:net').AddressInfo} */ (srv.address());
fs.mkdirSync(OUT, {recursive:true});
try {
  if (ENGINE === 'webkit') await withWebKit(`http://127.0.0.1:${addr.port}`);
  else await withChromium(`http://127.0.0.1:${addr.port}`);
} finally { srv.close(); }

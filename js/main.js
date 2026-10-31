// @ts-check
// Arranque: carga el mapa y las banderas, prepara colores y alterna entre el menú y los tres modos.
import {S, save} from './store.js';
import {graphOf, newGame, playRound} from './engine/game.js';
import {newSeed, cleanSeed} from './engine/rng.js';
import {level as toLevel} from './engine/bots.js';
import {assignColors} from './art.js';
import {initFlags} from './flags.js';
import {unlockAudio, freezeFx, stepFx} from './fx.js';
import {MapView} from './map/render.js';
import {Match} from './ui/play.js';
import {NormalDriver, SoloDriver} from './ui/drivers.js';
import {renderMenu, hideMenu} from './ui/menu.js';
import {showSetup} from './ui/setup.js';
import {showWarSetup} from './ui/warsetup.js';
import {Conquest} from './ui/conquest.js';
import {geoOf, createGame} from './conquest/engine.js';
import {scenario} from './conquest/scenarios.js';
import {onlineSheet, resumeOnline, onlineMatch, onlineRoom} from './ui/online.js';
import {cleanCode} from './net/room.js';
import {$, applyLook, measureText, makeGrain} from './ui/dom.js';

/** @type {import('./ui/play.js').World} */
let W;
/** @type {Match|null} */
let match = null;
/** @type {Conquest|null} */
let war = null;
/** @type {import('./conquest/engine.js').Geo} */
let geo;
/** @type {number} */
let driftT = 0;

async function boot() {
  measureText(); applyLook(); makeGrain(); unlockAudio();
  const map = await (await fetch('data/map.json')).json();
  const graph = graphOf(map);
  const colors = assignColors(graph.adj);
  const names = map.provinces.map((/** @type {{name:string}} */ p) => p.name);
  const plates = map.provinces.map((/** @type {{plate:string}} */ p) => p.plate);
  const view = new MapView(/** @type {HTMLCanvasElement} */ ($('#map')), map, colors);
  W = {map, graph, colors, names, plates, view, onTap:null};
  geo = geoOf(map);
  /** @type {Record<string, any>} */
  let flags = {};
  try { const r = await fetch('data/flags.json'); if (r.ok) flags = await r.json(); } catch (e) {}
  initFlags(flags, W);
  const q = new URLSearchParams(location.search);
  if (q.has('hq')) view.adaptive = false;
  onLook();
  addEventListener('resize', () => { view.resize(!!match); match?.layout(); });
  if (document.fonts) document.fonts.ready.then(() => view.invalidate());
  // toques en el mapa (elegir provincia u objetivo)
  $('#map').addEventListener('click', e => W.onTap?.(e.clientX, e.clientY));
  fpsMeter();
  /** @type {any} */ (window).__eeg = {W, get match() { return match || onlineMatch(); }, get war() { return war; }, get room() { return onlineRoom(); }, start, solo, menu, startWar, geo:() => geo, freezeFx, stepFx, onPhase:null,
    look:(/** @type {any} */ o) => { Object.assign(S.settings, o); applyLook(); onLook(); }};

  const seed = cleanSeed(q.get('semilla') || ''), sala = cleanCode(q.get('sala') || '');
  const keep = q.get('red') === 'local' ? '?red=local' : '';
  if (seed) { history.replaceState(null, '', location.pathname + keep); start(seed); }
  else if (sala.length === 6) { history.replaceState(null, '', location.pathname + keep); menu(); onlineSheet(W, onlineHooks(), sala); }
  else if (S.online && S.online.data && S.online.data.phase === 'play') { hideMenu(); resumeOnline(W, onlineHooks()); }
  else menu();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

function onLook() {
  const v = W.view, st = S.settings;
  v.theme = st.theme; v.contrast = st.contrast; v.labels = st.labels && $('#menu').hidden;
  v.rebuild(); v.invalidate();
  $('#fps').hidden = !st.fps;
}

function menu() {
  match = null; W.view.labels = false; W.onTap = null; W.view.me = -1;
  W.view.setInsets({top:innerHeight * .08, bottom:innerHeight * .42, left:0, right:0});
  W.view.setOwners(W.map.provinces.map(p => p.i), W.map.provinces.map(() => false));
  match = null; war = null; W.view.setColors(W.colors);
  renderMenu(W, {onNormal:seed => start(seed), onLook, onWar:warSetup, onLoad:loadWar, onOnline:() => onlineSheet(W, onlineHooks()), onRoom:room});
  drift();
}
/** Fondo del menú: el mapa entero, con un leve vaivén de cámara. */
function drift() {
  const v = W.view;
  clearTimeout(driftT);
  const base = v.overview(), m = $('#menu');
  const frames = [{...base, s:base.s * 1.08}, {...base, x:base.x + 24, y:base.y - 12, s:base.s * 1.18}];
  let i = 0;
  v.moveTo(frames[0], 0);
  const next = () => {
    if (m.hidden || S.settings.motion === 'reduced') return;
    i = 1 - i; v.moveTo(frames[i], 16000);
    driftT = /** @type {any} */ (setTimeout(next, 16000));
  };
  next();
}
function leaveMenu() { clearTimeout(driftT); hideMenu(); W.view.labels = S.settings.labels; }
function onlineHooks() { return {onExit:menu, onLook}; }
function room() { leaveMenu(); resumeOnline(W, onlineHooks()).then(ok => { if (!ok) menu(); }); }

/* ---------- Normal ---------- */
/** @param {string} [seed] @param {{skip?:number}} [o] */
function start(seed, o = {}) {
  leaveMenu();
  const s = cleanSeed(seed || '') || newSeed();
  let game = newGame(W.graph, s);
  if (o.skip) game = fastForward(game, o.skip);
  S.stats.games++; save();
  run(game, new NormalDriver(W.graph), 'normal');
}
/* ---------- Conquista ---------- */
function warSetup() {
  leaveMenu();
  showWarSetup(W, {onBack:menu, onStart:(sc, me, diff) => startWar(sc, me, diff)});
}
/** @param {string} sc @param {number} me @param {import('./conquest/engine.js').Difficulty} diff @param {string} [seed] */
function startWar(sc, me, diff, seed) {
  leaveMenu();
  const spec = scenario(W.map, sc, W.colors);
  const g = createGame(geo, spec, {seed:cleanSeed(seed || '') || newSeed(), humans:[me], rules:{difficulty:diff}});
  const id = Date.now().toString(36);
  S.stats.games++;
  runWar(id, g, me, sc, diff);
}
/** @param {string} id */
function loadWar(id) {
  const x = S.saves.find(s => s.id === id); if (!x) return menu();
  leaveMenu();
  runWar(x.id, x.game, x.me, x.scenario, x.diff);
}
/** @param {string} id @param {import('./conquest/engine.js').Game} g @param {number} me @param {string} sc @param {string} diff */
function runWar(id, g, me, sc, diff) {
  const store = (/** @type {import('./conquest/engine.js').Game} */ game) => {
    const entry = {id, at:Date.now(), scenario:sc, me, diff, name:game.F.name[me], turn:game.turn, over:game.over || !game.F.alive[me], game};
    S.saves = [entry, ...S.saves.filter(s => s.id !== id)].slice(0, 5);
    save();
  };
  store(g);
  war = new Conquest(W, geo, g, me, {onExit:menu, save:store, onNew:warSetup});
  war.mount();
}

/* ---------- Un jugador ---------- */
function setup() {
  leaveMenu();
  showSetup(W, {onBack:menu, onStart:(me, lv) => solo(me, lv)});
}
/** @param {number} me @param {string} lv @param {string} [seed] @param {{skip?:number}} [o] */
function solo(me, lv, seed, o = {}) {
  leaveMenu();
  const level = toLevel(lv), s = cleanSeed(seed || '') || newSeed();
  let game = newGame(W.graph, s);
  const driver = new SoloDriver(W.graph, me, level);
  if (o.skip) for (let i = 0; i < o.skip && game.winner < 0 && game.alive[me]; i++) {
    game = playRound(W.graph, game, (g, f, t, rng) => f === me ? t[0] : driver.bot(g, f, t, rng)).game;
  }
  S.stats.games++; save();
  run(game, driver, 'solo');
}
function resume() {
  const c = S.current; if (!c) return menu();
  leaveMenu();
  if (c.mode === 'solo' && c.me != null) run(c.game, new SoloDriver(W.graph, c.me, toLevel(c.level)), 'solo');
  else run(c.game, new NormalDriver(W.graph), 'normal');
}
/** Avanza rondas sin animar (pruebas y capturas). @param {import('./engine/game.js').Game} g @param {number} n */
function fastForward(g, n) {
  for (let i = 0; i < n && g.winner < 0; i++) g = playRound(W.graph, g).game;
  return g;
}
/** @param {import('./engine/game.js').Game} game @param {import('./ui/drivers.js').Driver} driver @param {'normal'|'solo'} mode */
function run(game, driver, mode) {
  match = new Match(W, game, driver, {
    onExit:menu,
    onNew:seed => mode === 'solo' ? solo(driver.me, /** @type {SoloDriver} */ (driver).level, seed) : start(seed),
    save:g => {
      S.current = g.winner >= 0 ? null : {mode, game:g, at:Date.now(), ...(mode === 'solo' ? {me:driver.me, level:/** @type {SoloDriver} */ (driver).level} : {})};
      save();
    },
  });
  match.mount();
}

/** Medidor de fotogramas: media y percentil 95 del tiempo entre fotogramas mientras hay animación. */
function fpsMeter() {
  /** @type {number[]} */
  let d = [], last = 0;
  const el = $('#fps');
  const tick = (/** @type {number} */ t) => {
    if (!S.settings.fps) { last = 0; requestAnimationFrame(tick); return; }
    if (last) d.push(t - last);
    last = t;
    if (d.length >= 60) {
      const s = [...d].sort((a, b) => a - b), avg = d.reduce((a, b) => a + b, 0) / d.length, p95 = s[Math.floor(s.length * .95)];
      el.textContent = `${(1000 / avg).toFixed(0)} fps\n${avg.toFixed(1)} ms · p95 ${p95.toFixed(1)}\n×${W.view.dpr}`;
      d = [];
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

boot();

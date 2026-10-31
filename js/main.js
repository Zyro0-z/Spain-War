// @ts-check
// Arranque: carga el mapa, prepara colores y escudos, y alterna entre el menú y la partida.
import {S, save} from './store.js';
import {graphOf, newGame, playRound} from './engine/game.js';
import {newSeed, cleanSeed} from './engine/rng.js';
import {assignColors, shieldSymbol, shieldCommon} from './art.js';
import {unlockAudio, freezeFx, stepFx} from './fx.js';
import {MapView} from './map/render.js';
import {Match} from './ui/play.js';
import {renderMenu, hideMenu} from './ui/menu.js';
import {$, applyLook, measureText, makeGrain} from './ui/dom.js';

/** @type {import('./ui/play.js').World} */
let W;
/** @type {Match|null} */
let match = null;
/** @type {number} */
let driftT = 0;

async function boot() {
  measureText(); applyLook(); makeGrain(); unlockAudio();
  const map = await (await fetch('data/map.json')).json();
  const graph = graphOf(map);
  const colors = assignColors(graph.adj);
  const names = map.provinces.map((/** @type {{name:string}} */ p) => p.name);
  const plates = map.provinces.map((/** @type {{plate:string}} */ p) => p.plate);
  const parts = map.provinces.map((/** @type {{plate:string}} */ p, /** @type {number} */ i) => shieldSymbol({color:colors[i], plate:p.plate, idx:i}));
  $('#sprite').innerHTML = `<defs>${shieldCommon()}${parts.map(p => p.defs).join('')}</defs>${parts.map(p => p.symbol).join('')}`;
  const view = new MapView(/** @type {HTMLCanvasElement} */ ($('#map')), map, colors);
  W = {map, graph, colors, names, plates, view};
  if (new URLSearchParams(location.search).has('hq')) view.adaptive = false;
  onLook();
  addEventListener('resize', () => { view.resize(!!match); match?.layout(); });
  if (document.fonts) document.fonts.ready.then(() => view.invalidate());
  fpsMeter();
  /** @type {any} */ (window).__eeg = {W, get match() { return match; }, start, menu, freezeFx, stepFx, onPhase:null,
    look:(/** @type {any} */ o) => { Object.assign(S.settings, o); applyLook(); onLook(); }};

  const q = new URLSearchParams(location.search), seed = cleanSeed(q.get('semilla') || '');
  if (seed) { history.replaceState(null, '', location.pathname); start(seed); }
  else menu();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

function onLook() {
  const v = W.view, st = S.settings;
  v.theme = st.theme; v.contrast = st.contrast; v.labels = st.labels && !!match;
  v.rebuild(); v.invalidate();
  $('#fps').hidden = !st.fps;
}

function menu() {
  match = null; W.view.labels = false;
  W.view.setInsets({top:innerHeight * .08, bottom:innerHeight * .42, left:0, right:0});
  W.view.setOwners(W.map.provinces.map(p => p.i), W.map.provinces.map(() => false));
  renderMenu(W, {onNormal:seed => start(seed), onResume:resume, onLook});
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

/** @param {string} [seed] @param {{skip?:number}} [o] */
function start(seed, o = {}) {
  clearTimeout(driftT); hideMenu();
  const s = cleanSeed(seed || '') || newSeed();
  let game = newGame(W.graph, s);
  if (o.skip) game = fastForward(game, o.skip);
  S.stats.games++; save();
  run(game);
}
function resume() {
  if (!S.current) return menu();
  clearTimeout(driftT); hideMenu();
  run(S.current.game);
}
/** Avanza rondas sin animar (pruebas y capturas). @param {import('./engine/game.js').Game} g @param {number} n */
function fastForward(g, n) {
  for (let i = 0; i < n && g.winner < 0; i++) g = playRound(W.graph, g).game;
  return g;
}
/** @param {import('./engine/game.js').Game} game */
function run(game) {
  match = new Match(W, game, {onExit:menu, onNew:seed => start(seed)});
  W.view.labels = S.settings.labels;
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

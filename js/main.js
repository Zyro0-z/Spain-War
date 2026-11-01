// @ts-check
// Arranque: carga el mapa y las banderas, prepara colores y alterna entre el menú y los tres modos.
import {S, save} from './store.js';
import {graphOf, newGame, playRound} from './engine/game.js';
import {newSeed, cleanSeed} from './engine/rng.js';
import {assignColors} from './art.js';
import {initFlags} from './flags.js';
import {unlockAudio, freezeFx, stepFx} from './fx.js';
import {MapView} from './map/render.js';
import {Match} from './ui/play.js';
import {NormalDriver} from './ui/drivers.js';
import {renderMenu, hideMenu} from './ui/menu.js';
import {showWarSetup} from './ui/warsetup.js';
import {Conquest} from './ui/conquest.js';
import {geoOf} from './conquest/engine.js';
import {scenario, withPortugal, needsPortugal} from './conquest/scenarios.js';
import {newConquest} from './conquest/newgame.js';
import {MISSIONS, daily, today} from './conquest/campaign.js';
import {Tutor} from './ui/tutorial.js';
import {onlineSheet, resumeOnline, onlineWar, onlineRoom} from './ui/warlobby.js';
import {cleanCode} from './net/warroom.js';
import {$, applyLook, measureText, makeGrain} from './ui/dom.js';

/** @type {import('./ui/play.js').World} */
let W;
/** @type {Match|null} */
let match = null;
/** @type {Conquest|null} */
let war = null;
/** @type {import('./conquest/engine.js').Geo} */
let geo;
/** @type {import('./conquest/engine.js').Geo} con Portugal */
let geo48;
/** @param {string} sc */
const geoFor = sc => needsPortugal(sc) ? geo48 : geo;
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
  const map48 = withPortugal(map);
  W = {map, map48, graph, colors, names, plates, view, onTap:null};
  geo = geoOf(map); geo48 = geoOf(map48);
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
  /** @type {any} */ (window).__eeg = {W, get match() { return match; }, get war() { return war || onlineWar(); }, get room() { return onlineRoom(); }, get S() { return S; }, start, menu, startWar, geo:() => geo, freezeFx, stepFx, onPhase:null,
    look:(/** @type {any} */ o) => { Object.assign(S.settings, o); applyLook(); onLook(); }};

  const seed = cleanSeed(q.get('semilla') || ''), sala = cleanCode(q.get('sala') || '');
  const keep = q.get('red') === 'local' ? '?red=local' : '';
  if (seed) { history.replaceState(null, '', location.pathname + keep); start(seed); }
  else if (sala.length === 6) { history.replaceState(null, '', location.pathname + keep); menu(); onlineSheet(W, onlineHooks(), sala); }
  else if (S.online && S.online.v === 2 && S.online.data && S.online.data.phase === 'play') { hideMenu(); resumeOnline(W, onlineHooks()); }
  else menu();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

function onLook() {
  const v = W.view, st = S.settings;
  v.theme = st.theme; v.contrast = st.contrast; v.labels = st.labels && $('#menu').hidden;
  v.rebuild(); v.invalidate();
  $('#fps').hidden = !st.fps;
  war?.syncMusic();
}

function menu() {
  match = null; W.view.labels = false; W.onTap = null; W.view.me = -1; W.view.setMap(W.map);
  W.view.setInsets({top:innerHeight * .08, bottom:innerHeight * .42, left:0, right:0});
  W.view.setOwners(W.map.provinces.map(p => p.i), W.map.provinces.map(() => false));
  match = null; war = null; W.view.setColors(W.colors);
  renderMenu(W, {onNormal:seed => start(seed), onLook, onWar:warSetup, onLoad:loadWar, onOnline:() => onlineSheet(W, onlineHooks()), onRoom:room,
    onMission:startMission, onDaily:startDaily, onTutorial:startTutorial});
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
function leaveMenu() {
  clearTimeout(driftT); hideMenu(); W.view.labels = S.settings.labels;
  const su = $('#setup'); if (!su.hidden) { su.hidden = true; su.innerHTML = ''; }
}
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
/**
 * @typedef {object} WarStart
 * @property {string} sc escenario
 * @property {number} me
 * @property {import('./conquest/engine.js').Difficulty} diff
 * @property {string} [seed]
 * @property {{fog?:boolean, events?:boolean, seasons?:boolean, victory?:string, turns?:number, trait?:string, troops?:number, gold?:number, rivals?:number}} [rules]
 * @property {number} [center] provincia elegida (escenarios parciales)
 * @property {{name:string, flag:import('./flagmaker.js').FlagDesign, color?:string, motto?:string}|null} [custom] bando propio
 * @property {{kind:string, id:string}} [tag] campaña, desafío diario o tutorial
 */
function warSetup() {
  leaveMenu();
  showWarSetup(W, {onBack:menu, onStart:startWar});
}
/** Misión de la campaña. @param {string} id */
function startMission(id) {
  const m = MISSIONS.find(x => x.id === id); if (!m) return menu();
  const map = needsPortugal(m.sc) ? /** @type {any} */ (W.map48) : W.map;
  const center = m.center ? map.provinces.findIndex((/** @type {{ine:string}} */ p) => p.ine === m.center) : -1;
  const spec = scenario(map, m.sc, W.colors, center);
  const me = Math.max(0, m.me ? spec.factions.findIndex(f => f.name === m.me) : 0);
  startWar({sc:m.sc, me, diff:m.diff, seed:'CAMPANA' + m.id.toUpperCase(), center, rules:{victory:m.victory, ...(m.rules || {})}, tag:{kind:'campaign', id}});
}
/** El desafío de hoy: igual para todos. */
function startDaily() {
  const day = today(), d = daily(day, W.map);
  if (S.daily.day !== day) S.daily = {day, best:-1, plays:0};
  const center = W.map.provinces.findIndex(p => p.ine === d.center);
  const spec = scenario(W.map, d.sc, W.colors, center);
  const me = d.sc === 'vecinas' || d.sc === 'region' ? 0 : d.pick % spec.factions.length;
  startWar({sc:d.sc, me, diff:d.diff, seed:d.seed, center, rules:{victory:'puntos', turns:d.turns, events:true, seasons:true}, tag:{kind:'daily', id:day}});
}
function startTutorial() {
  const center = W.map.provinces.findIndex(p => p.ine === '42');
  startWar({sc:'vecinas', me:0, diff:'facil', seed:'TUTORIAL', center, rules:{events:false, troops:6}, tag:{kind:'tutorial', id:'t1'}});
}
/** @param {WarStart} o */
function startWar(o) {
  leaveMenu();
  const seed = cleanSeed(o.seed || '') || newSeed();
  const {g, humans} = newConquest(W, {sc:o.sc, center:o.center, seed, diff:o.diff, rules:o.rules, humans:[{f:o.me, custom:o.custom || null}]});
  if (o.tag) g.tag = o.tag;
  S.stats.games++;
  runWar(Date.now().toString(36), g, humans[0]);
}
/** @param {string} id */
function loadWar(id) {
  const x = S.saves.find(s => s.id === id); if (!x) return menu();
  leaveMenu();
  runWar(x.id, x.game, x.me);
}
/** @param {string} id @param {import('./conquest/engine.js').Game} g @param {number} me */
function runWar(id, g, me) {
  const store = (/** @type {import('./conquest/engine.js').Game} */ game) => {
    const entry = {id, at:Date.now(), scenario:game.scenario, me, diff:game.rules.difficulty, name:game.F.name[me], turn:game.turn, over:game.over || !game.F.alive[me], game};
    S.saves = [entry, ...S.saves.filter(s => s.id !== id)].slice(0, 5);
    save();
  };
  store(g);
  const tutor = g.tag?.kind === 'tutorial' && !S.tutorial ? new Tutor() : null;
  war = new Conquest(W, geoFor(g.scenario), g, me, {onExit:menu, save:store, onNew:warSetup, onMission:startMission, onEvent:k => tutor?.on(k)});
  war.mount();
}

/** Avanza rondas sin animar (pruebas y capturas). @param {import('./engine/game.js').Game} g @param {number} n */
function fastForward(g, n) {
  for (let i = 0; i < n && g.winner < 0; i++) g = playRound(W.graph, g).game;
  return g;
}
/** @param {import('./engine/game.js').Game} game @param {import('./ui/drivers.js').Driver} driver @param {'normal'} mode */
function run(game, driver, mode) {
  match = new Match(W, game, driver, {
    onExit:menu,
    onNew:seed => start(seed),
    save:g => { S.current = g.winner >= 0 ? null : {mode, game:g, at:Date.now()}; save(); },
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

// @ts-check
// Partida del modo conquista. El jugador da órdenes en su turno (mover, atacar, reclutar, construir, diplomacia)
// y al terminar actúan los bots: se ve en el mapa con flechas y, si te atacan, con los dados.
import {S, save} from '../store.js';
import * as E from '../conquest/engine.js';
import {endTurn} from '../conquest/turn.js';
import {TERRAIN_NAME} from '../conquest/data.js';
import {score as scoreOf, mult} from '../engine/prob.js';
import {flag} from '../flags.js';
import {icon} from '../icons.js';
import {sound, announce, shake, burstAt, celebrate, reduced, haptic} from '../fx.js';
import {diceRow, roll, markWin} from './dice.js';
import {$, esc, fmt, pct, toast, openSheet, closeSheet} from './dom.js';
import {Clock} from './clock.js';
import {Overlay} from './overlay.js';
import {enableGestures} from './gestures.js';
import {borderKey} from '../map/render.js';
import {needsPortugal} from '../conquest/scenarios.js';
import {bannerFlag} from '../flagmaker.js';
import {music} from '../music.js';
import {newspaper, stories} from './chronicle.js';
import {medalsFor} from '../conquest/medals.js';
import {award} from './medals.js';
import {MISSIONS, starsFor} from '../conquest/campaign.js';
import {fillBoard} from './board.js';
import {CHAT} from '../net/warroom.js';

/** @typedef {import('../conquest/engine.js').Game} Game */
/** @typedef {import('../conquest/engine.js').Geo} Geo */
/**
 * @typedef {object} WarHooks
 * @property {() => void} onExit
 * @property {(g:Game) => void} save
 * @property {() => void} [onNew]
 * @property {(id:string) => void} [onMission] empezar otra misión de la campaña
 * @property {(kind:string) => void} [onEvent] avisos para el tutorial
 * @property {Online} [online] partida en red
 */
/**
 * @typedef {object} Online
 * @property {import('../net/warroom.js').WarHost|import('../net/warroom.js').WarGuest} peer
 * @property {any[]} [plan] órdenes ya dadas este turno (al volver a abrir la app)
 * @property {() => void} onLeave abandonar la partida (tu bando pasa a ser un bot)
 */

const sleep = (/** @type {number} */ ms) => new Promise(r => setTimeout(r, reduced() ? Math.min(ms, 60) : ms));
const STATUS_CLS = ['peace', 'war', 'pact', 'ally'];

export class Conquest {
  /**
   * @param {import('./play.js').World} W @param {Geo} geo @param {Game} g @param {number} me @param {WarHooks} hooks
   */
  constructor(W, geo, g, me, hooks) {
    this.W = W; this.geo = geo; this.g = g; this.me = me; this.hooks = hooks;
    this.view = W.view;
    /** Geometría del escenario (con Portugal en la península). */
    this.map = needsPortugal(g.scenario) && W.map48 ? W.map48 : W.map;
    this.clock = new Clock();
    this.sel = -1;
    /** @type {'idle'|'move'|'attack'} */ this.mode = 'idle';
    this.src = -1;
    /** @type {Game[]} */ this.undo = [];
    this.busy = false;
    this.speed = 1;
    /** @type {number[]} provincias con batalla reciente (humo) */ this.battles = [];
    this.overlay = new Overlay(/** @type {SVGSVGElement} */ (/** @type {unknown} */ ($('#ov'))), this.view);
    this.offGestures = () => {};
    /** Partida en red: órdenes del turno, si ya se han enviado y cierres de turno por animar. */
    this.online = hooks.online || null;
    /** @type {any[]} */ this.plan = this.online?.plan ? [...this.online.plan] : [];
    this.sent = false;
    /** @type {{prev:Game, next:Game, ev:any[]}[]} */ this.inbox = [];
    /** Mirando (espectador o bando eliminado en una partida en red). */
    this.watching = me < 0;
  }
  /** Nombre del jugador que lleva un bando en red ('' si es un bot). @param {number} f */
  playerName(f) { const p = this.online?.peer.players.find(x => x.f === f && !x.left); return p && f !== this.me && this.g.humans.includes(f) ? p.name : ''; }
  /** @param {number} f */
  name(f) { return f === this.me ? 'Tú' : f >= 0 ? this.g.F.name[f] : 'Sin dueño'; }
  /** @param {number} f */
  fname(f) { return f >= 0 ? this.g.F.name[f] : 'Sin dueño'; }
  /** @param {number} p */
  pname(p) { return this.map.provinces[p].name; }
  /** Bandera del bando (la de su provincia de origen). @param {number} f @param {string} [cls] */
  flagOf(f, cls = '') {
    const b = f >= 0 ? this.g.F.banner?.[f] : null;
    if (b) return bannerFlag(b, {cls});
    return f >= 0 && this.g.F.flag[f] >= 0 ? flag(this.g.F.flag[f], {cls}) : '<span class="flag empty"></span>';
  }

  /* ======================= Montaje ======================= */
  mount() {
    const v = this.view, g = this.g;
    $('#war').hidden = false;
    $('#ov').style.display = '';
    v.setMap(this.map);
    v.labelDy = -15; v.me = this.me; v.labels = S.settings.labels;
    v.focus([], [], 0); v.hop = -1; v.cands = new Set(); v.hot = [];
    v.setColors(g.F.color);
    v.setOwners(g.P.owner, g.F.alive.map(a => !a));
    v.onCam = () => this.overlay.sync();
    this.overlay.build(g.P.active.flatMap((a, p) => a ? [p] : []));
    this.offGestures = enableGestures(v, /** @type {HTMLElement} */ ($('#map')), {onTap:(x, y) => this.tap(x, y), enabled:() => !this.busy});
    this.renderHud();
    this.renderBar();
    this.layout();
    const mine = E.provincesOf(g, this.me), act = g.P.active.flatMap((a, p) => a ? [p] : []);
    const cam = act.length < g.P.active.length ? v.frameOf(act, 2.6) : mine.length && mine.length < 12 ? v.frameOf(mine, 2.2) : v.overview();
    v.moveTo(cam, reduced() ? 0 : 700);
    this.refresh();
    music.start(); this.mood();
    this.afterTurnStart();
  }
  /** Música según las guerras abiertas. */
  mood() {
    const g = this.g, me = this.me, R = E.rebels(g);
    if (me < 0) { music.mood(.3); return; }
    let wars = 0; for (let f = 0; f < R; f++) if (f !== me && g.F.alive[f] && g.st[me][f] === E.WAR) wars++;
    music.mood(wars ? Math.min(1, .55 + wars * .12) : this.battles.length ? .3 : 0);
  }
  /** Tras cambiar los ajustes de sonido. */
  syncMusic() { music.sync(); if (!this.g.over) { music.start(); this.mood(); } }
  unmount() {
    music.stop();
    $('#war').querySelector('.coach')?.remove(); delete $('#war').dataset.coach;
    this.offGestures();
    this.overlay.clearArrows(); this.overlay.highlight({}); this.overlay.fronts([]); this.overlay.smoke([]);
    $('#tint').style.opacity = '0'; this.view.winter = false;
    $('#ov').style.display = 'none';
    $('#war').hidden = true; $('#wHud').innerHTML = ''; $('#wBar').innerHTML = '';
    const v = this.view;
    v.onCam = null; v.labelDy = 0; v.me = -1; v.focus([], [], 0);
    v.setMap(this.W.map);
  }
  layout() {
    const hud = $('#wHud').getBoundingClientRect(), bar = $('#wBar').getBoundingClientRect();
    this.view.setInsets({top:hud.bottom + 4, bottom:Math.max(0, innerHeight - bar.top + 4), left:0, right:0});
    this.view.invalidate();
  }
  save() { this.hooks.save(this.g); }

  /* ======================= Estado visible ======================= */
  /** Provincias cuyo contenido ve el jugador (niebla de guerra). */
  visibleSet() {
    const g = this.g, vis = new Set();
    if (!g.rules.fog || this.me < 0) { g.P.owner.forEach((_, p) => vis.add(p)); return vis; }
    for (let p = 0; p < this.geo.n; p++) {
      const o = g.P.owner[p];
      if (o === this.me || (o >= 0 && g.st[this.me][o] === E.ALLY)) { vis.add(p); this.geo.adj[p].forEach(q => vis.add(q)); }
    }
    for (const i of g.intel) if (i.f === this.me) vis.add(i.p);
    return vis;
  }
  refresh() {
    const g = this.g, vis = this.visibleSet();
    const caps = new Set(g.F.capital.filter((c, f) => c >= 0 && g.F.alive[f]));
    const marks = new Map();
    for (const gen of g.gens) if (vis.has(gen.p)) marks.set(gen.p, '★');
    this.overlay.update({owner:g.P.owner, troops:g.P.troops.map((t, p) => vis.has(p) ? t : null), colors:g.F.color, capitals:caps, mine:this.me, marks});
    // frentes de guerra contigo
    const fronts = [];
    for (const [key, d] of Object.entries(this.map.borders)) {
      const [a, b] = key.split('-').map(Number), oa = g.P.owner[a], ob = g.P.owner[b];
      if (oa < 0 || ob < 0 || oa === ob) continue;
      const other = this.me < 0 ? -1 : oa === this.me ? ob : ob === this.me ? oa : -1;
      if (other >= 0 && (other === E.rebels(g) || g.st[this.me][other] === E.WAR)) fronts.push(d);
    }
    this.overlay.fronts(fronts);
    this.overlay.smoke(this.battles);
    // estación y hora del día
    const winter = g.rules.seasons && E.season(g) === 3;
    if (this.view.winter !== winter) { this.view.winter = winter; this.view.rebuild(); this.view.invalidate(); }
    const tint = [['rgb(255,200,170)', .1], ['rgb(255,255,255)', 0], ['rgb(255,175,110)', .12], ['rgb(80,100,180)', .22]][g.turn % 4];
    const t = $('#tint'); t.style.background = /** @type {string} */ (tint[0]); t.style.opacity = String(reduced() ? 0 : tint[1]);
    this.renderHud();
  }

  /* ======================= Barra superior ======================= */
  renderHud() {
    const g = this.g, me = this.me, inc = me >= 0 ? E.income(this.geo, g, me) : 0;
    const wars = me >= 0 ? g.F.alive.filter((a, f) => a && f !== me && g.st[me][f] === E.WAR && f < E.rebels(g)).length : 0;
    $('#wHud').innerHTML = `
      <button class="icb glass" id="wMenu" aria-label="Menú de la partida">${icon('back')}</button>
      <div class="stat glass wturn" aria-label="Turno ${g.turn}, ${E.SEASONS[E.season(g)]} del año ${E.year(g)}"><div><span>Turno</span><b class="num">${g.turn}</b></div><i class="sepv"></i><div><span>${E.SEASONS[E.season(g)]}</span><b class="num">Año ${E.year(g)}</b></div></div>
      ${me >= 0 ? `<button class="stat glass wgold" id="wGold" aria-label="Oro ${g.F.gold[me]}, más ${inc} por turno"><div><span>Oro</span><b class="num">${g.F.gold[me]}</b></div><em class="num">+${inc}</em></button>` : ''}
      <button class="icb glass" id="wDip" aria-label="Diplomacia${wars ? `, ${wars} guerras` : ''}">${icon('flag')}${wars ? `<i class="dot num">${wars}</i>` : ''}</button>`;
    $('#wMenu').onclick = () => { sound('tap'); this.menuSheet(); };
    $('#wDip').onclick = () => { sound('tap'); this.diplomacySheet(); };
    const gold = $('#wGold'); if (gold) gold.onclick = () => { sound('tap'); this.economySheet(); };
  }

  /* ======================= Barra inferior ======================= */
  renderBar() {
    const g = this.g, me = this.me;
    if (this.sel >= 0) return this.card(this.sel);
    if (this.online && (this.sent || this.watching)) return this.waitBar();
    const mine = E.provincesOf(g, me), troops = mine.reduce((s, p) => s + g.P.troops[p], 0);
    $('#wBar').innerHTML = `<div class="wpanel glass idle">
      <div class="wsum">
        ${this.flagOf(me, 'md')}
        <div class="l"><b>${esc(this.fname(me))}</b>${g.motto?.[me] ? `<em class="motto-t">«${esc(g.motto[me])}»</em>` : ''}<small class="num">${mine.length} ${mine.length === 1 ? 'provincia' : 'provincias'} · ${troops} tropas · poder ${g.F.morale[me]}</small></div>
        ${this.undo.length ? `<button class="icb glass" id="wUndo" aria-label="Deshacer la última orden">${icon('replay')}</button>` : ''}
      </div>
      <p class="hint">Toca una provincia para ver sus opciones. Pellizca para acercar.</p>
      <button class="btn" id="wEnd">${icon('play')}Terminar turno</button>
    </div>`;
    $('#wEnd').onclick = () => this.endTurn();
    const u = $('#wUndo'); if (u) u.onclick = () => this.doUndo();
    this.layout();
  }

  /* ======================= Tocar el mapa ======================= */
  /** @param {number} x @param {number} y */
  tap(x, y) {
    if (this.busy) return;
    const p = this.view.hit(x, y);
    if (p < 0 || !this.g.P.active[p]) { this.deselect(); return; }
    sound('tap');
    if (this.mode === 'move') {
      if (E.reachable(this.geo, this.g, this.me, this.src).includes(p)) return this.amountSheet('move', this.src, p);
      if (p === this.src) return this.deselect();
    }
    if (this.mode === 'attack') {
      if (this.attackTargets(this.src).includes(p)) return this.amountSheet('attack', this.src, p);
      if (p === this.src) return this.deselect();
    }
    this.select(p);
  }
  /** @param {number} p */
  select(p) {
    this.sel = p; this.mode = 'idle'; this.src = -1;
    if (this.g.P.owner[p] === this.me) this.hooks.onEvent?.('select-own');
    this.overlay.highlight({sel:p});
    this.card(p);
  }
  deselect() { this.sel = -1; this.mode = 'idle'; this.src = -1; this.overlay.highlight({}); this.renderBar(); }
  /** Provincias enemigas atacables desde una propia. @param {number} from */
  attackTargets(from) { const g = this.g; return this.geo.adj[from].filter(q => g.P.active[q] && g.P.owner[q] !== this.me && g.P.owner[q] >= 0); }
  /** Mejor provincia propia para atacar a p (más tropas listas). @param {number} p */
  bestSource(p) {
    const g = this.g;
    return this.geo.adj[p].filter(q => g.P.owner[q] === this.me && g.P.ready[q] >= 1 && g.P.troops[q] >= 2).sort((a, b) => g.P.ready[b] - g.P.ready[a])[0] ?? -1;
  }

  /* ======================= Ficha de provincia ======================= */
  /** @param {number} p */
  card(p) {
    const g = this.g, geo = this.geo, me = this.me, o = g.P.owner[p], mine = o === me, vis = this.visibleSet().has(p);
    const sup = o >= 0 && o < E.rebels(g) ? E.supplied(geo, g, o) : [];
    const st = o >= 0 && o !== me && o < E.rebels(g) ? g.st[me][o] : -1;
    const chip = mine ? '<span class="chip mine">Tuya</span>' : o === E.rebels(g) ? `<span class="chip war">${esc(g.F.name[o])}</span>` : st >= 0 ? `<span class="chip ${STATUS_CLS[st]}">${E.STATUS_NAME[st]}</span>` : '';
    const gen = E.generalAt(g, p);
    const facts = [
      `<div><span>Tropas</span><b class="num">${vis ? g.P.troops[p] : '?'}${mine && g.P.ready[p] !== g.P.troops[p] ? `<small> (${g.P.ready[p]} listas)</small>` : ''}</b></div>`,
      mine ? `<div><span>Oro</span><b class="num">+${E.provinceIncome(geo, g, p, sup)}</b></div>` : `<div><span>Defensa</span><b class="num">×${fmt(E.defenseMul(geo, g, p) / 100, 2)}</b></div>`,
      `<div><span>Terreno</span><b>${TERRAIN_NAME[geo.terrain[p]]}</b></div>`,
      mine ? `<div><span>Lealtad</span><b class="num">${g.P.loyal[p]} %</b></div>` : `<div><span>Relación</span><b class="num">${o >= 0 && o < E.rebels(g) ? g.rel[me][o] : '—'}</b></div>`,
    ];
    const tags = [
      g.F.capital[o] === p ? `<span class="tag2">${icon('crown')}Capital</span>` : '',
      g.P.bld[p] ? `<span class="tag2">${icon('shield')}${E.BUILDINGS[/** @type {'cuartel'} */ (g.P.bld[p])].name}</span>` : '',
      gen && vis ? `<span class="tag2">★ ${esc(gen.name)} · ${E.SKILLS[gen.skill].name}${gen.lvl ? ' ' + gen.lvl : ''}</span>` : '',
      mine && !sup[p] ? `<span class="tag2 bad">Sin suministro</span>` : '',
      geo.coast[p] ? `<span class="tag2">Costa</span>` : '',
    ].filter(Boolean).join('');
    let actions = '';
    if (this.watching) actions = '';
    else if (mine) {
      const canMove = E.reachable(geo, g, me, p).length > 0 && g.P.ready[p] >= 1 && g.P.troops[p] >= 2;
      const canAtt = this.attackTargets(p).length > 0 && g.P.ready[p] >= 1 && g.P.troops[p] >= 2;
      actions = `
        <button class="act" id="aAtt" ${canAtt ? '' : 'disabled'}>${icon('swords')}<span>Atacar</span></button>
        <button class="act" id="aMove" ${canMove ? '' : 'disabled'}>${icon('map')}<span>Mover</span></button>
        <button class="act" id="aRec">${icon('users')}<span>Reclutar</span></button>
        <button class="act" id="aBld" ${g.P.bld[p] ? 'disabled' : ''}>${icon('shield')}<span>Construir</span></button>`;
    } else if (o >= 0 && !this.sent) {
      const src = this.bestSource(p);
      actions = `
        <button class="act" id="aAtt2" ${src >= 0 ? '' : 'disabled'}>${icon('swords')}<span>Atacar</span></button>
        ${o < E.rebels(g) ? `<button class="act" id="aDip">${icon('flag')}<span>Diplomacia</span></button>` : ''}
        <button class="act" id="aSpy">${icon('target')}<span>Espiar</span></button>`;
    }
    $('#wBar').innerHTML = `<div class="wpanel glass card" aria-label="Provincia ${esc(this.pname(p))}">
      <div class="ch">${this.flagOf(o, 'md')}<div class="l"><b>${esc(this.pname(p))}</b><small>${o === me ? 'Tu territorio' : esc(this.fname(o))}</small></div>${chip}<button class="icb x" id="cX" aria-label="Cerrar">${icon('close')}</button></div>
      ${tags ? `<div class="tags">${tags}</div>` : ''}
      <div class="facts">${facts.join('')}</div>
      <div class="acts">${actions}</div>
    </div>`;
    const on = (/** @type {string} */ id, /** @type {() => void} */ fn) => { const b = document.getElementById(id); if (b) b.onclick = () => { sound('tap'); fn(); }; };
    on('cX', () => this.deselect());
    on('aAtt', () => { this.mode = 'attack'; this.src = p; this.overlay.highlight({sel:p, enemy:this.attackTargets(p)}); this.hintBar('Toca la provincia que quieres atacar'); });
    on('aMove', () => { this.mode = 'move'; this.src = p; this.overlay.highlight({sel:p, own:E.reachable(geo, g, me, p)}); this.hintBar('Toca adónde mover las tropas'); });
    on('aRec', () => this.recruitSheet(p));
    on('aBld', () => this.buildSheet(p));
    on('aAtt2', () => { const src = this.bestSource(p); if (src >= 0) this.amountSheet('attack', src, p); });
    on('aDip', () => this.factionSheet(o));
    on('aSpy', () => this.spySheet(p));
    this.layout();
  }
  /** @param {string} text */
  hintBar(text) {
    $('#wBar').innerHTML = `<div class="wpanel glass hintp"><p>${esc(text)}</p><button class="btn sm ghost" id="hCancel">Cancelar</button></div>`;
    $('#hCancel').onclick = () => { sound('tap'); this.deselect(); };
    this.layout();
  }

  /* ======================= Mover y atacar ======================= */
  /**
   * Cuántas tropas: con la probabilidad en vivo si es un ataque.
   * @param {'move'|'attack'} kind @param {number} from @param {number} to
   */
  amountSheet(kind, from, to) {
    const g = this.g, geo = this.geo, me = this.me;
    const max = Math.min(g.P.ready[from], g.P.troops[from] - 1);
    if (max < 1) { toast('No quedan tropas listas en ' + this.pname(from)); return; }
    this.overlay.highlight({sel:to, own:kind === 'move' ? [from] : [], enemy:kind === 'attack' ? [to] : []});
    this.overlay.clearArrows();
    this.overlay.arrow(from, to, kind === 'attack' ? '#FF5A4E' : '#7FD8A0', {keep:true});
    const gen = E.generalAt(g, from), hasGen = !!(gen && gen.f === me);
    let n = kind === 'attack' ? max : Math.max(1, Math.ceil(max / 2)), withGen = hasGen;
    const draw = () => {
      let info = '';
      if (kind === 'attack') {
        const D = g.P.troops[to], p = n >= 1 ? (D > 0 ? E.odds(geo, g, me, from, to, n).p : 1) : 0;
        const st = g.P.owner[to] < E.rebels(g) ? g.st[me][g.P.owner[to]] : E.WAR;
        info = `<div class="pr"><span class="num big ${p >= .5 ? 'good' : 'bad'}">${pct(p)}</span><div class="pbar" style="--ca:#FF7A45;--cd:${g.F.color[g.P.owner[to]] || '#6B6F7A'}"><i style="width:${(p * 100).toFixed(1)}%"></i></div></div>
          <p class="note">${n} contra ${D} defensores${D > 0 ? ` · ataque ×${fmt(E.attackMul(geo, g, me, from, to, withGen) / 100, 2)} · defensa ×${fmt(E.defenseMul(geo, g, to, from) / 100, 2)}` : ' · sin defensores'}${E.riverBetween(geo, from, to) ? ` · cruzas el ${E.riverBetween(geo, from, to)} (+${E.RIVER_DEF} % para el que defiende)` : ''}</p>
          ${st !== E.WAR ? `<p class="warn">Atacar declara la guerra a ${esc(this.fname(g.P.owner[to]))}${st === E.PACT || st === E.ALLY ? ' y rompe vuestro acuerdo: todos desconfiarán de ti' : ''}.</p>` : ''}`;
      }
      $('#wBar').innerHTML = `<div class="wpanel glass amount">
        <div class="ah"><b>${kind === 'attack' ? 'Atacar' : 'Mover'}</b><span>${esc(this.pname(from))} → ${esc(this.pname(to))}</span></div>
        <div class="stepper"><button class="icb glass" id="nMin" aria-label="Menos">−</button><input type="range" id="nR" min="1" max="${max}" value="${n}" aria-label="Tropas"><button class="icb glass" id="nMax" aria-label="Más">+</button><b class="num" id="nV">${n}</b></div>
        ${info}
        ${hasGen ? `<button class="rowi" role="switch" aria-checked="${withGen}" id="nGen">★<div class="l">Con ${esc(gen.name)}<small>${E.SKILLS[gen.skill].name}</small></div><span class="switch"></span></button>` : ''}
        <div class="row2"><button class="btn sm ghost" id="nNo">Cancelar</button><button class="btn sm" id="nGo">${kind === 'attack' ? icon('swords') + 'Atacar' : icon('map') + 'Mover'}</button></div>
      </div>`;
      const r = /** @type {HTMLInputElement} */ ($('#nR'));
      r.oninput = () => { n = +r.value; draw(); /** @type {HTMLInputElement} */ ($('#nR')).focus(); };
      $('#nMin').onclick = () => { n = Math.max(1, n - 1); draw(); };
      $('#nMax').onclick = () => { n = Math.min(max, n + 1); draw(); };
      const gb = $('#nGen'); if (gb) gb.onclick = () => { withGen = !withGen; draw(); };
      $('#nNo').onclick = () => { sound('tap'); this.overlay.clearArrows(); this.deselect(); };
      $('#nGo').onclick = () => { this.overlay.clearArrows(); if (kind === 'attack') this.attack(from, to, n, withGen); else this.move(from, to, n, withGen); };
      this.layout();
    };
    draw();
  }
  /** @param {any} a */
  act(a, reversible = false) {
    if (this.online) {
      if (this.sent || this.watching) { toast(this.sent ? 'Ya has enviado tus órdenes' : 'Estás mirando la partida'); return null; }
      a = {...a, q:this.plan.length};
      if (a.type === 'attack') a.x = [this.g.P.owner[a.to], this.g.P.troops[a.to]];
    }
    try {
      const before = this.g;
      const r = E.apply(this.geo, this.g, a);
      if (reversible) this.undo.push(before); else this.undo = [];
      this.g = r.g;
      if (this.online) this.plan.push(a);
      this.save();
      award(medalsFor(this.g, this.me));
      this.hooks.onEvent?.(a.type);
      return r.ev;
    } catch (e) { toast(/** @type {Error} */ (e).message); return null; }
  }
  doUndo() {
    const prev = this.undo.pop(); if (!prev) return;
    sound('tap');
    this.g = prev;
    if (this.online) this.plan.pop();
    this.save();
    this.view.setOwners(this.g.P.owner); this.refresh(); this.deselect();
    toast('Orden deshecha');
  }
  /** @param {number} from @param {number} to @param {number} n @param {boolean} gen */
  async move(from, to, n, gen) {
    const ev = this.act({type:'move', f:this.me, from, to, n, gen}, true);
    if (!ev) return;
    sound('whoosh');
    this.busy = true;
    const dur = reduced() ? 200 : 600;
    await Promise.all([this.overlay.arrow(from, to, '#7FD8A0', {dur}), this.overlay.march(from, to, this.g.F.color[this.me], n, dur)]);
    this.busy = false;
    this.refresh(); this.select(to);
  }
  /** @param {number} from @param {number} to @param {number} n @param {boolean} gen */
  async attack(from, to, n, gen) {
    const before = this.g;
    const ev = this.act({type:'attack', f:this.me, from, to, n, gen});
    if (!ev) return;
    this.busy = true;
    for (const e of ev) if (e.t === 'war' && e.a === this.me) announce(`Declaras la guerra a ${this.fname(e.b)}.`);
    const a = ev.find(e => e.t === 'attack');
    if (a.D > 0) this.battles = [...new Set([...this.battles, a.to])];
    await this.showBattle(before, a, true);
    this.busy = false;
    this.afterAction(ev);
    if (a.won) this.select(to); else this.select(from);
  }
  /** Tras una orden: victoria, derrota, eliminaciones. @param {any[]} ev */
  afterAction(ev) {
    this.view.setOwners(this.g.P.owner, this.g.F.alive.map(a => !a));
    this.refresh();
    for (const e of ev) if (e.t === 'elim') { sound('eliminate'); toast(`${this.fname(e.f)} queda eliminado`); }
    if (this.g.over) this.end();
  }

  /**
   * Batalla con dados (tuya o contra ti).
   * @param {Game} before partida antes del combate @param {any} a suceso de ataque @param {boolean} mineAttack
   */
  async showBattle(before, a, mineAttack) {
    const g = before, geo = this.geo, W = this.W, view = this.view;
    const colA = g.F.color[a.f], colD = a.d >= 0 ? g.F.color[a.d] : '#6B6F7A';
    view.focus([a.from, a.to], [borderKey(a.from, a.to)], 300);
    await view.moveTo(view.frameOf([a.from, a.to], 3), reduced() ? 0 : 500);
    const arrow = this.overlay.arrow(a.from, a.to, colA, {dur:600});
    sound('whoosh');
    await Promise.all([arrow, this.overlay.march(a.from, a.to, colA, a.n, reduced() ? 150 : 650, .55)]);
    if (!a.rolls.length) { // provincia vacía
      await view.conquer(a.to, a.f, view.borderMid(a.to, [a.from]), reduced() ? 0 : 700, false);
      view.focus([], [], 300); toast(`${this.pname(a.to)} cae sin combate`);
      return;
    }
    const side = (/** @type {'att'|'def'} */ k, /** @type {number} */ f, /** @type {number} */ n, /** @type {number} */ m, /** @type {string} */ col) => `
      <div class="side ${k}" style="--c:${col}">
        <span class="tag">${icon(k === 'att' ? 'swords' : 'shield')}${k === 'att' ? 'Ataca' : 'Defiende'}${f === this.me ? ' · Tú' : ''}</span>
        <div class="who">${this.flagOf(f, 'sh')}<div><b>${esc(f >= 0 ? g.F.name[f] : 'Rebeldes')}</b><small>${esc(this.pname(k === 'att' ? a.from : a.to))}</small></div></div>
        <div class="pw"><span>Tropas <b class="num">${n}</b></span><em class="num">×${fmt(m / 100, 2)}</em></div>
        ${diceRow(col)}
        <div class="score num" data-score></div>
        <span class="delta" data-delta></span>
      </div>`;
    $('#wBar').innerHTML = `<div class="wpanel glass combat">
      <div class="prob"><span class="pv num" style="--pc:${colA}">${pct(a.p)}</span>
        <div><div class="lbl">Probabilidad de victoria</div><div class="pbar" style="--ca:${colA};--cd:${colD}"><i style="width:${(a.p * 100).toFixed(1)}%"></i></div></div>
        <span class="pv num" style="--pc:${colD}">${pct(1 - a.p)}</span></div>
      <div class="sides" style="position:relative">${side('att', a.f, a.n, a.mA, colA)}<span class="vs">VS</span>${side('def', a.d, a.D, a.mD, colD)}<div class="tie">Empate</div></div>
    </div>`;
    this.layout();
    const dock = $('#wBar'), att = /** @type {HTMLElement} */ (dock.querySelector('.side.att')), def = /** @type {HTMLElement} */ (dock.querySelector('.side.def'));
    const fast = !mineAttack && this.speed > 1;
    for (let i = 0; i < a.rolls.length; i++) {
      const {a:ra, d:rd} = a.rolls[i];
      sound('roll');
      await Promise.all([roll(/** @type {HTMLElement} */ (att.querySelector('.dice')), ra, fast ? 500 : 950, this.clock, i * 7 + a.to), roll(/** @type {HTMLElement} */ (def.querySelector('.dice')), rd, fast ? 500 : 950, this.clock, i * 7 + a.to + 3)]);
      sound('land'); haptic(8);
      const sa = ra[0] + ra[1] + ra[2], sd = rd[0] + rd[1] + rd[2];
      /** @type {HTMLElement} */ (att.querySelector('[data-score]')).innerHTML = `${sa} × ${fmt(a.n * a.mA / 100, 1)}`;
      /** @type {HTMLElement} */ (def.querySelector('[data-score]')).innerHTML = `${sd} × ${fmt(a.D * a.mD / 100, 1)}`;
      if (i < a.rolls.length - 1) { const t = /** @type {HTMLElement} */ (dock.querySelector('.tie')); t.classList.add('show'); await sleep(700); t.classList.remove('show'); }
      else await sleep(fast ? 200 : 380);
    }
    const [win, lose] = a.won ? [att, def] : [def, att];
    win.classList.add('win'); lose.classList.add('lose'); markWin(/** @type {HTMLElement} */ (win.querySelector('.dice')));
    const dl = (/** @type {HTMLElement} */ el, /** @type {number} */ v) => { const d = /** @type {HTMLElement} */ (el.querySelector('[data-delta]')); d.textContent = v ? '−' + v : '0'; d.className = 'delta show down'; };
    dl(att, a.attLoss); dl(def, a.won ? a.D : a.defLoss);
    const mid = view.borderMid(a.to, [a.from]), [sx, sy] = view.toScreen(mid[0], mid[1]);
    const meWon = (a.f === this.me) === a.won;
    if (a.won) {
      sound('impact'); shake($('#app'), 7); burstAt(sx, sy, colA, 1.1);
      const fan = sleep(220).then(() => sound(meWon ? 'conquer' : 'eliminate'));
      await Promise.all([view.conquer(a.to, a.f, mid, reduced() ? 0 : (fast ? 500 : 900), a.elim), fan]);
      if (a.capital) toast(`${a.f === this.me ? 'Tomas' : this.fname(a.f) + ' toma'} la capital de ${this.fname(a.d)}`);
    } else {
      sound('defend'); burstAt(sx, sy, colD, .5);
      await sleep(fast ? 350 : 700);
    }
    announce(`${this.name(a.f)} ${a.won ? 'conquista' : 'no conquista'} ${this.pname(a.to)}. ${meWon ? 'Victoria.' : 'Derrota.'}`);
    view.focus([], [], 300);
  }

  /* ======================= Reclutar, construir, espiar ======================= */
  /** @param {number} p */
  recruitSheet(p) {
    const g = this.g, f = this.me, price = g.P.bld[p] === 'cuartel' ? E.COST.recruitCuartel : E.COST.recruit;
    const max = Math.min(E.COST.maxRecruit, Math.floor(g.F.gold[f] / price));
    const canGen = !E.generalAt(g, p) && E.generalsOf(g, f).length < E.COST.maxGenerals;
    if (max < 1 && !canGen) { toast(`Reclutar cuesta ${price} de oro por tropa`); return; }
    let n = Math.max(1, max);
    const draw = (/** @type {HTMLElement} */ el) => {
      /** @type {HTMLElement} */ (el.querySelector('#rV')).textContent = String(n);
      /** @type {HTMLElement} */ (el.querySelector('#rC')).textContent = String(n * price);
    };
    openSheet({title:'Reclutar', body:`
      <p class="note" style="margin:0 4px 10px">${esc(this.pname(p))}: ${price} de oro por tropa${g.P.bld[p] === 'cuartel' ? ' (con cuartel)' : ''}. Tienes ${g.F.gold[f]}.</p>
      ${max >= 1 ? `<div class="stepper"><button class="icb glass" id="rMin">−</button><input type="range" id="rR" min="1" max="${max}" value="${n}" aria-label="Tropas"><button class="icb glass" id="rMax">+</button><b class="num" id="rV">${n}</b></div>
      <button class="btn" id="rGo">${icon('users')}Reclutar por <span class="num" id="rC">${n * price}</span> de oro</button>` : `<p class="note">No tienes oro para reclutar tropas (${price} por tropa).</p><span id="rR"></span><span id="rV"></span><span id="rC"></span><span id="rMin"></span><span id="rMax"></span><span id="rGo"></span>`}
      ${canGen ? `<div class="glabel">General (${E.COST.general} de oro)</div><div class="grp">${Object.entries(E.SKILLS).map(([k, v]) => `<button class="rowi" data-sk="${k}" ${g.F.gold[f] >= E.COST.general ? '' : 'disabled'}>★<div class="l">${v.name}<small>${v.desc}</small></div></button>`).join('')}</div>
        <p class="note">Va con las tropas que salen de su provincia y sube de nivel al ganar batallas. Máximo ${E.COST.maxGenerals}.</p>` : ''}`,
      mount:el => {
        const r = /** @type {HTMLInputElement} */ (el.querySelector('#rR'));
        r.oninput = () => { n = +r.value; draw(el); };
        /** @type {HTMLElement} */ (el.querySelector('#rMin')).onclick = () => { n = Math.max(1, n - 1); r.value = String(n); draw(el); };
        /** @type {HTMLElement} */ (el.querySelector('#rMax')).onclick = () => { n = Math.min(max, n + 1); r.value = String(n); draw(el); };
        /** @type {HTMLElement} */ (el.querySelector('#rGo')).onclick = () => {
          if (max >= 1 && this.act({type:'recruit', f, p, n}, true)) { sound('lock'); closeSheet(); this.refresh(); this.card(p); }
        };
        el.querySelectorAll('[data-sk]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
          const ev = this.act({type:'hire', f, p, skill:/** @type {any} */ (/** @type {HTMLElement} */ (b).dataset.sk)}, true);
          if (ev) { const h = this.g.gens.find(x => x.p === p); sound('conquer'); closeSheet(); toast(`${h ? h.name : 'Un general'} se une a tu ejército`); this.refresh(); this.card(p); }
        });
      }});
  }
  /** @param {number} p */
  buildSheet(p) {
    const g = this.g, f = this.me;
    openSheet({title:'Construir', body:`
      <p class="note" style="margin:0 4px 10px">Un edificio por provincia. Tienes ${g.F.gold[f]} de oro.</p>
      <div class="grp">${Object.entries(E.BUILDINGS).map(([k, b]) => {
        const cost = E.buildCost(g, f, /** @type {any} */ (k)), ok = g.F.gold[f] >= cost && (k !== 'puerto' || this.geo.coast[p]);
        return `<button class="rowi" data-b="${k}" ${ok ? '' : 'disabled'}>${icon('shield')}<div class="l">${b.name}<small>${b.desc}${k === 'puerto' && !this.geo.coast[p] ? ' · necesita costa' : ''}</small></div><b class="num cost">${cost}</b></button>`;
      }).join('')}</div>`,
      mount:el => el.querySelectorAll('[data-b]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
        if (this.act({type:'build', f, p, b:/** @type {any} */ (/** @type {HTMLElement} */ (b).dataset.b)}, true)) { sound('lock'); closeSheet(); this.refresh(); this.card(p); }
      })});
  }
  /** @param {number} p */
  spySheet(p) {
    const g = this.g, f = this.me, ch = E.spyChance(g, f);
    openSheet({title:'Espionaje', body:`
      <p class="note" style="margin:0 4px 10px">${esc(this.pname(p))} · probabilidad de éxito ${ch} %. Si falla, la relación empeora.</p>
      <div class="grp">${[['espiar', 'Espiar', 'Ves sus tropas 3 turnos'], ['sabotear', 'Sabotear', 'Destruye su edificio'], ['agitar', 'Agitar', '−30 de lealtad']].map(([k, n, d]) => {
        const cost = E.spyCost(g, f, /** @type {any} */ (k)), ok = g.F.gold[f] >= cost && (k !== 'sabotear' || !!g.P.bld[p]);
        return `<button class="rowi" data-k="${k}" ${ok ? '' : 'disabled'}>${icon('target')}<div class="l">${n}<small>${d}</small></div><b class="num cost">${cost}</b></button>`;
      }).join('')}</div>`,
      mount:el => el.querySelectorAll('[data-k]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
        const ev = this.act({type:'spy', f, p, kind:/** @type {any} */ (/** @type {HTMLElement} */ (b).dataset.k)});
        if (!ev) return;
        const e = ev.find(x => x.t === 'spy');
        closeSheet(); sound(e.ok ? 'lock' : 'defend'); toast(e.ok ? 'Misión cumplida' : 'Tu espía ha sido descubierto');
        this.refresh(); this.card(p);
      })});
  }

  /* ======================= Diplomacia ======================= */
  diplomacySheet() {
    this.hooks.onEvent?.('diplomacy');
    const g = this.g, me = this.me, R = E.rebels(g);
    const near = new Set();
    for (let p = 0; p < this.geo.n; p++) if (g.P.owner[p] === me) for (const q of this.geo.adj[p]) { const o = g.P.owner[q]; if (o >= 0 && o !== me && o < R) near.add(o); }
    const list = [];
    for (let f = 0; f < R; f++) if (f !== me && g.F.alive[f]) list.push(f);
    list.sort((a, b) => Number(near.has(b)) - Number(near.has(a)) || Number(g.st[me][b] === E.WAR) - Number(g.st[me][a] === E.WAR) || g.rel[me][b] - g.rel[me][a]);
    openSheet({title:'Diplomacia', body:`
      <p class="note" style="margin:0 4px 10px">Primero tus vecinos. Toca un bando para proponerle algo.</p>
      <div class="grp dlist">${list.map(f => `<button class="rowi" data-f="${f}">${this.flagOf(f)}<div class="l">${esc(g.F.name[f])}${this.playerName(f) ? ` <em class="you ext">${esc(this.playerName(f))}</em>` : near.has(f) ? ' <em class="you ext">Vecino</em>' : ''}<small><span class="rel"><i style="--v:${(g.rel[me][f] + 100) / 2}%"></i></span> ${g.rel[me][f]}</small></div><span class="chip ${STATUS_CLS[g.st[me][f]]}">${E.STATUS_NAME[g.st[me][f]]}</span></button>`).join('')}</div>`,
      mount:el => el.querySelectorAll('[data-f]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { closeSheet(); setTimeout(() => this.factionSheet(+(/** @type {HTMLElement} */ (b).dataset.f || 0)), 300); })});
  }
  /** @param {number} d */
  factionSheet(d) {
    const g = this.g, me = this.me, geo = this.geo, st = g.st[me][d];
    const opts = /** @type {[string, string, string][]} */ ([]);
    if (st === E.WAR) opts.push(['paz', 'Proponer la paz', '']);
    if (st === E.PEACE) opts.push(['pacto', 'Pacto de no agresión', `${E.PACT_TURNS} turnos sin atacaros`]);
    if (st !== E.WAR && st !== E.ALLY) opts.push(['alianza', 'Proponer alianza', 'Os defendéis mutuamente']);
    opts.push(['regalo', `Regalar ${E.COST.gift[0]} de oro`, '+10 de relación'], ['regalo2', `Regalar ${E.COST.gift[1]} de oro`, '+25 de relación']);
    if (st !== E.ALLY) opts.push(['tributo', 'Exigir tributo', 'Si te teme, te paga el 20 % de su oro']);
    opts.push(['anexion', 'Anexión pacífica', 'Se une a ti con todas sus provincias']);
    if (st !== E.WAR) opts.push(['guerra', 'Declarar la guerra', st === E.PACT || st === E.ALLY ? 'Rompe vuestro acuerdo: traición' : '']);
    const c = E.counts(g.P.owner, E.rebels(g) + 1);
    openSheet({title:g.F.name[d], body:`
      <div class="fhead">${this.flagOf(d, 'md')}<div><span class="chip ${STATUS_CLS[st]}">${E.STATUS_NAME[st]}${st === E.PACT ? ' · hasta el turno ' + g.until[me][d] : ''}</span>
        <p class="note">${c[d]} provincias · fuerza ${E.strength(g, d)} (tú ${E.strength(g, me)}) · relación ${g.rel[me][d]}</p></div></div>
      <div class="grp">${opts.map(([k, n, sub]) => {
        const w = k.startsWith('regalo') || k === 'guerra' ? null : E.wouldAccept(geo, g, me, d, k);
        return `<button class="rowi" data-k="${k}">${icon(k === 'guerra' ? 'swords' : 'flag')}<div class="l">${n}<small>${w ? `<b class="${w.ok ? 'ok' : 'no'}">${w.ok ? 'Aceptará' : 'Rechazará'}</b> · ${esc(w.why)}` : esc(sub)}</small></div></button>`;
      }).join('')}</div>`,
      mount:el => el.querySelectorAll('[data-k]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
        const k = /** @type {HTMLElement} */ (b).dataset.k || '';
        const a = k.startsWith('regalo') ? {type:'diplo', f:me, d, kind:'regalo', amount:k === 'regalo2' ? E.COST.gift[1] : E.COST.gift[0]} : {type:'diplo', f:me, d, kind:k};
        const ev = this.act(a); if (!ev) return;
        closeSheet();
        const acc = ev.find(e => e.t === 'accept'), rej = ev.find(e => e.t === 'reject');
        if (acc) { sound('conquer'); toast(`${g.F.name[d]} acepta`); }
        else if (rej) { sound('defend'); toast(`${g.F.name[d]} rechaza: ${rej.why || ''}`); }
        else if (k === 'guerra') { sound('impact'); toast(`Guerra contra ${g.F.name[d]}`); }
        else sound('lock');
        this.afterAction(ev);
        if (this.sel >= 0) this.card(this.sel);
      })});
  }
  /** Propuestas de los bots al empezar tu turno. */
  async afterTurnStart() {
    const g = this.g, me = this.me;
    const text = {paz:'propone la paz', pacto:'propone un pacto de no agresión', alianza:'propone una alianza', tributo:'exige un tributo del 20 % de tu oro'};
    for (;;) {
      const i = this.g.offers.findIndex(o => o.to === me);
      if (i < 0) break;
      const o = this.g.offers[i];
      const ans = await new Promise(res => openSheet({title:'Diplomacia', body:`
        <div class="fhead">${this.flagOf(o.from, 'md')}<div><b class="disp" style="font:800 24px/1 var(--display)">${esc(g.F.name[o.from])}</b><p class="note">${text[/** @type {'paz'} */ (o.kind)] || o.kind}</p></div></div>
        ${o.kind === 'tributo' ? '<p class="warn">Si te niegas, puede declararte la guerra.</p>' : ''}
        <div class="row2"><button class="btn sm ghost" id="oNo">Rechazar</button><button class="btn sm" id="oYes">Aceptar</button></div>`,
        close:() => res(null),
        mount:el => {
          /** @type {HTMLElement} */ (el.querySelector('#oYes')).onclick = () => { res(true); closeSheet(); };
          /** @type {HTMLElement} */ (el.querySelector('#oNo')).onclick = () => { res(false); closeSheet(); };
        }}));
      const ev = this.act({type:'answer', f:me, from:o.from, kind:o.kind, accept:!!ans});
      if (!ev) break;
      sound(ans ? 'conquer' : 'tap');
      await sleep(350);
    }
    this.refresh();
  }

  /* ======================= Paneles ======================= */
  economySheet() {
    this.hooks.onEvent?.('economy');
    const g = this.g, me = this.me, geo = this.geo, sup = E.supplied(geo, g, me);
    const rows = E.provincesOf(g, me).map(p => ({p, v:E.provinceIncome(geo, g, p, sup), gr:E.growth(geo, g, p, sup)})).sort((a, b) => b.v - a.v);
    const tech = E.TECHS.map((k, i) => {
      const lvl = g.F.tech[me][i], info = E.TECH_INFO[k], cost = lvl < 3 ? E.COST.tech[lvl] : 0;
      return `<div class="tech"><div><b>${info.name}</b><small>${lvl < 3 ? 'Siguiente: ' + info.desc[lvl] : 'Completa: ' + info.desc[2]}</small><div class="lv">${[0, 1, 2].map(l => `<i class="${l < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
        ${lvl < 3 ? `<button class="btn sm" data-t="${k}" ${g.F.gold[me] >= cost ? '' : 'disabled'}>${cost}</button>` : ''}</div>`;
    }).join('');
    openSheet({title:'Tesoro', body:`
      <p class="note" style="margin:0 4px 10px">${g.F.gold[me]} de oro · +${E.income(geo, g, me)} por turno${g.F.trait[me] && E.TRAITS[/** @type {'mercader'} */ (g.F.trait[me])] ? ' · líder ' + E.TRAITS[/** @type {'mercader'} */ (g.F.trait[me])].name.toLowerCase() : ''}</p>
      <div class="glabel">Mejoras</div>
      <div class="techs">${tech}</div>
      <div class="glabel">Ingresos por provincia</div>
      <div class="grp">${rows.map(r => `<div class="rowi"><div class="l">${esc(this.pname(r.p))}<small>${r.gr ? '+' + r.gr + ' tropas/turno' : 'No crece'}${!sup[r.p] ? ' · sin suministro' : ''}${g.P.loyal[r.p] < 30 ? ' · poco leal' : ''}</small></div><b class="num">+${r.v}</b></div>`).join('')}</div>`,
      mount:el => el.querySelectorAll('[data-t]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
        if (this.act({type:'research', f:me, k:/** @type {any} */ (/** @type {HTMLElement} */ (b).dataset.t)}, true)) { sound('conquer'); closeSheet(); this.refresh(); setTimeout(() => this.economySheet(), 320); }
      })});
  }
  menuSheet() {
    openSheet({title:'Partida', body:`
      <div class="grp">
        <button class="rowi" id="mmNews">${icon('map')}<div class="l">Crónica<small>Lo que ha pasado en el último año</small></div></button>
        <button class="rowi" id="mmRules">${icon('info')}<div class="l">Cómo se juega</div></button>
        ${this.online ? `<button class="rowi" id="mmChat">${icon('users')}<div class="l">Mensaje rápido</div></button>` : ''}
        <button class="rowi" id="mmExit">${icon('back')}<div class="l">Salir al menú<small>${this.online ? 'Puedes volver a la sala desde el menú' : 'La partida queda guardada'}</small></div></button>
        ${this.online ? `<button class="rowi" id="mmLeave">${icon('close')}<div class="l">Abandonar la partida<small>${'skip' in this.online.peer ? 'Eres el anfitrión: sin ti la partida se para' : 'Tu bando pasa a ser un bot'}</small></div></button>` : ''}
      </div>`,
      mount:el => {
        /** @type {HTMLElement} */ (el.querySelector('#mmExit')).onclick = () => { closeSheet(); this.save(); this.unmount(); this.hooks.onExit(); };
        /** @type {HTMLElement} */ (el.querySelector('#mmRules')).onclick = () => { closeSheet(); setTimeout(() => this.rulesSheet(), 300); };
        /** @type {HTMLElement} */ (el.querySelector('#mmNews')).onclick = () => { closeSheet(); setTimeout(() => this.news(Math.max(1, this.g.turn - 12), this.g.turn), 300); };
        const ch = el.querySelector('#mmChat'); if (ch) /** @type {HTMLElement} */ (ch).onclick = () => { closeSheet(); setTimeout(() => this.chatSheet(), 300); };
        const lv = el.querySelector('#mmLeave'); if (lv) /** @type {HTMLElement} */ (lv).onclick = () => { closeSheet(); this.unmount(); this.online?.onLeave(); };
      }});
  }
  rulesSheet() {
    openSheet({title:'Cómo se juega', body:`<div class="rules">
      <p><b>Tu turno.</b> Toca una provincia tuya para atacar a un vecino, mover tropas, reclutar o construir. Toca una ajena para atacarla, espiarla o hablar con su bando.</p>
      <p><b>Combate.</b> Cada lado tira 3 dados; gana quien saque más con «suma × fuerza». La fuerza depende de las tropas, el terreno, los edificios, la moral y los generales. Antes de atacar ves la probabilidad exacta.</p>
      <p><b>Oro.</b> Cada provincia da oro según su población. Úsalo para reclutar, construir y en diplomacia.</p>
      <p><b>Dificultad.</b> En Fácil nadie te ataca si no le atacas. En Normal los bots se pelean y te atacan si te ven débil. En Difícil es la guerra total.</p>
      <p><b>Ganas</b> ${victoryText(this.g)}.</p></div>`});
  }

  /* ======================= Fin de turno ======================= */
  async endTurn() {
    if (this.busy) return;
    if (this.online) return this.submitTurn();
    sound('lock');
    this.busy = true; this.undo = [];
    this.deselect();
    $('#wBar').innerHTML = `<div class="wpanel glass hintp"><p>Turno de los demás…</p><div class="speed" role="group" aria-label="Velocidad">${[1, 2, 5].map(v => `<button data-sp="${v}" aria-pressed="${this.speed === v}">x${v}</button>`).join('')}</div></div>`;
    $('#wBar').querySelectorAll('[data-sp]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { this.speed = +(/** @type {HTMLElement} */ (b).dataset.sp || 1); $('#wBar').querySelectorAll('[data-sp]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
    this.layout();
    const before = this.g;
    const {g, ev} = endTurn(this.geo, before);
    await this.afterResolve(before, g, ev);
  }
  /**
   * Lo que pasa tras resolverse el turno (en solitario o en red): animaciones, avisos, crónica y el siguiente turno.
   * @param {Game} before lo que veía el jugador @param {Game} g partida nueva @param {any[]} ev sucesos que hay que enseñar
   */
  async afterResolve(before, g, ev) {
    this.battles = [...new Set(ev.filter(e => e.t === 'attack' && e.D > 0).map(e => e.to))];
    this.busy = true;
    await this.animateBots(before, ev);
    this.g = g; this.save();
    this.view.setOwners(g.P.owner, g.F.alive.map(a => !a));
    this.refresh();
    this.busy = false;
    for (const e of ev) {
      if (e.t === 'event' && (e.f === this.me)) toast(eventText(e, this));
      if (e.t === 'revolt' && (e.from === this.me || e.to === this.me)) toast(`${this.pname(e.p)} se rebela`);
      if (e.t === 'season') toast(`Llega ${E.SEASONS[e.s].toLowerCase()}`);
    }
    for (const e of ev) if (e.t === 'cancel' && e.f === this.me) toast(`Orden anulada: ${e.why}`);
    award(medalsFor(g, this.me));
    this.mood();
    this.hooks.onEvent?.('endturn');
    if (g.over || (!this.watching && !g.F.alive[this.me])) return this.end();
    this.banner(`Turno ${g.turn} · ${E.SEASONS[E.season(g)]}`);
    this.renderBar();
    this.ticker(g.turn - 1);
    if (g.turn > 1 && (g.turn - 1) % 12 === 0 && (g.chron || []).some(n => n.n >= g.turn - 12)) {
      await sleep(900);
      await new Promise(res => this.news(g.turn - 12, g.turn - 1, `Crónica del año ${E.year(g) - 1}`, () => res(null)));
    }
    this.afterTurnStart();
  }
  /* ======================= En red ======================= */
  /** Envía las órdenes del turno y espera a los demás. */
  async submitTurn() {
    if (this.sent || this.watching || !this.online) return;
    sound('lock');
    this.sent = true; this.undo = [];
    this.deselect();
    this.save();
    this.online.peer.sendOrders(this.plan).catch(() => toast('Sin conexión: se reintenta al volver la red'));
  }
  /** Panel de espera: quién falta, mensajes rápidos y, para el anfitrión, seguir sin esperar. */
  waitBar() {
    const o = this.online; if (!o) return;
    const peer = o.peer, g = this.g, wait = peer.waiting();
    const name = (/** @type {number} */ f) => peer.players.find(p => p.f === f)?.name || g.F.name[f];
    const isHost = 'skip' in peer, t0 = /** @type {any} */ (peer).turnAt || 0;
    const left = peer.cfg.timer > 0 && t0 ? Math.max(0, Math.ceil((t0 + peer.cfg.timer * 1000 - Date.now()) / 1000)) : 0;
    $('#wBar').innerHTML = `<div class="wpanel glass waitp">
      <div class="wt">${this.watching ? 'Mirando la partida' : 'Órdenes enviadas'}<small>${wait.length ? 'Esperando a ' + wait.map(f => esc(name(f))).join(', ') : 'Cerrando el turno…'}${left ? ` · ${left} s` : ''}</small></div>
      <div class="who2">${peer.players.filter(p => p.f >= 0).map(p => `<span class="pl${wait.includes(p.f) ? '' : ' ok'}${p.left ? ' gone' : ''}">${this.flagOf(p.f)}${esc(p.name)}</span>`).join('')}</div>
      <div class="row2"><button class="btn sm ghost" id="wChat">${icon('users')}Mensaje</button>${isHost && wait.length ? `<button class="btn sm ghost" id="wSkip">No esperar más</button>` : ''}</div>
    </div>`;
    $('#wChat').onclick = () => { sound('tap'); this.chatSheet(); };
    const sk = $('#wSkip'); if (sk) sk.onclick = () => { sound('tap'); /** @type {any} */ (peer).skip(); };
    this.layout();
  }
  /** Mensajes rápidos. */
  chatSheet() {
    const o = this.online; if (!o) return;
    openSheet({title:'Mensaje rápido', body:`<div class="grp">${CHAT.map((t, k) => `<button class="rowi" data-k="${k}"><div class="l">${esc(t)}</div></button>`).join('')}</div>`,
      mount:el => el.querySelectorAll('[data-k]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => { sound('tap'); o.peer.chat(+(/** @type {HTMLElement} */ (b).dataset.k || 0)); closeSheet(); toast('Enviado'); })});
  }
  /** Bocadillo con el mensaje de otro jugador. @param {{f:number, name:string, text:string}} m */
  chatIn(m) {
    let b = /** @type {HTMLElement|null} */ ($('#war').querySelector('.bubble'));
    if (!b) { b = document.createElement('div'); b.className = 'bubble glass'; b.setAttribute('role', 'status'); $('#war').appendChild(b); }
    b.innerHTML = `${this.flagOf(m.f)}<div><b>${esc(m.name)}</b><span>${esc(m.text)}</span></div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    sound('tap'); announce(`${m.name}: ${m.text}`);
    clearTimeout(this.bubT); this.bubT = setTimeout(() => b?.classList.remove('show'), 3800);
  }
  /** @type {any} */ bubT;
  /** Algo cambió en la sala (alguien terminó, se fue…). */
  roomChanged() { if ((this.sent || this.watching) && !this.busy && !this.g.over) this.waitBar(); }
  /**
   * Turno cerrado en la red: se anima lo de los demás y empieza el siguiente.
   * @param {Game} prev @param {Game} next @param {any[]} ev
   */
  resolved(prev, next, ev) { this.inbox.push({prev, next, ev}); if (!this.draining) this.drain(); }
  async drain() {
    this.draining = true;
    while (this.inbox.length) {
      const {next, ev} = /** @type {{prev:Game, next:Game, ev:any[]}} */ (this.inbox.shift());
      const me = this.me, mineSent = this.sent;
      if (!mineSent && !this.watching && this.plan.length) toast('El turno se cerró sin tus órdenes');
      const before = this.g;
      this.plan = []; this.sent = false; this.undo = [];
      // lo mío ya lo vio el jugador al darlo; se enseña lo de los demás y los bots
      const show = this.inbox.length ? [] : ev.filter(e => !((e.t === 'attack' || e.t === 'move') && e.f === me && mineSent));
      if (this.watching && me >= 0 && next.F.alive[me] === false) this.watching = true;
      closeSheet();
      await this.afterResolve(this.inbox.length ? next : before, next, show);
      if (this.watching && !next.over) this.waitBar();
    }
    this.draining = false;
  }
  /** @type {boolean|undefined} */ draining;
  /** Titular del turno, como una tira de periódico; al tocarla se abre la crónica de ese turno. @param {number} turn */
  ticker(turn) {
    const top = stories(this.g, this.me, p => this.pname(p), turn, turn)[0];
    if (!top || top.w < 30) return;
    let t = /** @type {HTMLButtonElement|null} */ ($('#war').querySelector('.ticker'));
    if (!t) { t = document.createElement('button'); t.className = 'ticker'; $('#war').appendChild(t); }
    t.innerHTML = `<span>La Gaceta</span><b>${esc(top.h)}</b>`;
    t.setAttribute('aria-label', `Titular: ${top.h}. Abrir la crónica.`);
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    t.onclick = () => { t?.classList.remove('show'); this.news(turn, turn, `Turno ${turn}`); };
    clearTimeout(this.tickT); this.tickT = setTimeout(() => t?.classList.remove('show'), 5200);
  }
  /** @type {any} */ tickT;
  /** @param {number} from @param {number} to @param {string} [title] @param {() => void} [onClose] */
  news(from, to, title, onClose) {
    sound('tap');
    newspaper(this.g, this.me, p => this.pname(p), from, to, {title, onClose});
  }
  /** Muestra lo que han hecho los bots. @param {Game} before @param {any[]} ev */
  async animateBots(before, ev) {
    const owner = [...before.P.owner], view = this.view, me = this.me, vis = this.visibleSet();
    const step = () => 600 / this.speed;
    /** @type {any[]} */ let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const b = batch; batch = [];
      await Promise.all(b.flatMap(e => [this.overlay.arrow(e.from, e.to, before.F.color[e.f] || '#fff', {dur:step()}), this.overlay.march(e.from, e.to, before.F.color[e.f] || '#fff', e.n, step(), e.won ? 1 : .5)]));
      for (const e of b) if (e.won) owner[e.to] = e.f;
      view.setOwners(owner);
    };
    for (const e of ev) {
      if (e.t === 'war' && (e.b === me || e.a === me) && e.a !== me) { await flush(); sound('impact'); this.banner(`¡${before.F.name[e.a]} te declara la guerra!`); await sleep(900 / this.speed); }
      if (e.t === 'attack') {
        if (e.d === me || e.f === me) {
          await flush();
          const snap = {...before, P:{...before.P, owner:[...owner]}};
          await this.showBattle(/** @type {Game} */ (snap), e, false);
          if (e.won) owner[e.to] = e.f;
          view.setOwners(owner);
        } else if (vis.has(e.to) || vis.has(e.from)) {
          batch.push(e);
          if (batch.length >= 4) await flush();
        } else if (e.won) owner[e.to] = e.f;
      }
      if (e.t === 'elim' && e.f !== me) { await flush(); toast(`${before.F.name[e.f]} queda eliminado`); }
    }
    await flush();
    view.focus([], [], 200);
  }
  /** @param {string} text */
  banner(text) {
    const b = $('#wBanner'); b.textContent = text; b.className = 'banner glass disp show';
    clearTimeout(this.bannerT); this.bannerT = setTimeout(() => { b.className = 'banner glass disp'; }, 2200);
    announce(text);
  }
  /** @type {any} */ bannerT;

  /* ======================= Final ======================= */
  end() {
    music.stop();
    const g = this.g, me = this.me, won = me >= 0 && g.winner === me, lost = me >= 0 && !g.F.alive[me], tag = g.tag;
    const watchOn = !!this.online && lost && !g.over;
    award(medalsFor(g, me));
    const v = $('#victory');
    const f = won ? me : g.winner;
    // campaña: estrellas; desafío diario: puntuación
    let extra = '', kick = won ? 'Victoria' : lost ? 'Derrota' : 'Fin de la partida';
    const mission = tag?.kind === 'campaign' ? MISSIONS.findIndex(m => m.id === tag.id) : -1;
    let nextMission = '';
    if (mission >= 0) {
      const m = MISSIONS[mission];
      kick = `Misión ${mission + 1} · ${m.name}`;
      if (won) {
        const st = starsFor(m, g.turn);
        if (st > (S.campaign[m.id] || 0)) { S.campaign[m.id] = st; save(); }
        extra = `<div class="stars" aria-label="${st} de 3 estrellas">${[0, 1, 2].map(i => starSvg(i < st)).join('')}</div><p class="v-sub small">3 estrellas en ${m.stars[0]} turnos o menos · 2 en ${m.stars[1]}</p>`;
        if (MISSIONS.every(x => S.campaign[x.id])) award(['campana']);
        if (MISSIONS[mission + 1]) nextMission = MISSIONS[mission + 1].id;
      }
    }
    let shareText = '';
    /** @type {{pts:number, f:string}|null} */ let dailyPost = null;
    if (tag?.kind === 'daily') {
      const pts = g.F.alive[me] ? E.score(g, me) : 0;
      kick = 'Desafío del día';
      if (tag.id === S.daily.day) { S.daily.best = Math.max(S.daily.best, pts); S.daily.plays++; save(); }
      award(['diario']);
      extra = `<div class="pts"><b class="num">${pts}</b><span>puntos${S.daily.day === tag.id ? ` · tu mejor marca hoy: ${S.daily.best}` : ''}</span></div><div class="grp board v-board" id="vBoard"></div>`;
      dailyPost = {pts, f:g.F.name[me]};
      shareText = `España en Guerra · Desafío del ${tag.id.split('-').reverse().join('/')}: ${pts} puntos con ${g.F.name[me]}`;
    }
    if (tag?.kind === 'tutorial') { S.tutorial = true; save(); }
    v.hidden = false; v.className = 'overlay' + (lost ? ' lost' : '');
    v.innerHTML = `<div class="v-in">
      <div class="rays" style="--c:${g.F.color[f >= 0 ? f : me]}"><div class="pole">${this.flagOf(f >= 0 ? f : me, 'big' + (lost ? ' dead' : ' wave'))}</div></div>
      <div class="v-kick">${esc(kick)}</div>
      <h2 class="v-title" id="vTitle">${won ? winTitle(g) : lost ? 'Has caído' : esc(g.F.name[f])}</h2>
      <p class="v-sub">${won ? `${esc(g.F.name[me])} se impone en ${g.turn} turnos` : lost ? `Resistes hasta el turno ${g.turn}` : 'gana la partida'}</p>
      ${won && g.motto?.[me] ? `<p class="v-sub motto-t">«${esc(g.motto[me])}»</p>` : ''}
      ${extra}
      <div class="v-stats glass">
        <div><b class="num">${g.turn}</b><span>Turnos</span></div>
        <div><b class="num">${g.stats.conq[me]}</b><span>Conquistas</span></div>
        <div><b class="num">${g.stats.won[me]}</b><span>Batallas ganadas</span></div>
        <div><b class="num">${g.stats.peak[me]}</b><span>Máx. provincias</span></div>
      </div>
      ${this.powerChart()}
      <div class="v-btns">
        ${nextMission ? `<button class="btn" id="vNext">${icon('play')}Siguiente misión</button>` : this.hooks.onNew && !tag ? `<button class="btn" id="vNew">${icon('swords')}Otra partida</button>` : ''}
        ${watchOn ? `<button class="btn" id="vWatch">${icon('map')}Seguir mirando</button>` : ''}
        <div class="row3">
          <button class="btn sm ghost" id="vReplay">${icon('replay')}Repetición</button>
          <button class="btn sm ghost" id="vNews">${icon('map')}Crónica</button>
          ${shareText ? `<button class="btn sm ghost" id="vShare">${icon('users')}Compartir</button>` : ''}
          <button class="btn sm ghost" id="vMenu">${icon('back')}Menú</button>
        </div>
      </div></div>`;
    if (won) { sound('victory'); celebrate([g.F.color[me], '#F2C94C', '#FFFFFF']); } else sound('eliminate');
    const vb = document.getElementById('vBoard'); if (vb && dailyPost && tag) fillBoard(vb, tag.id, {post:dailyPost});
    announce(won ? 'Victoria.' : lost ? 'Derrota.' : 'Fin de la partida.');
    const close = () => { v.hidden = true; v.innerHTML = ''; v.className = 'overlay'; this.unmount(); };
    const on = (/** @type {string} */ id, /** @type {() => void} */ fn) => { const b = document.getElementById(id); if (b) b.onclick = () => { sound('tap'); fn(); }; };
    on('vNew', () => { close(); this.hooks.onNew?.(); });
    on('vWatch', () => { v.hidden = true; v.innerHTML = ''; v.className = 'overlay'; this.watching = true; this.sent = false; music.start(); this.mood(); this.renderBar(); });
    on('vNext', () => { close(); this.hooks.onMission?.(nextMission); });
    on('vMenu', () => { close(); this.hooks.onExit(); });
    on('vNews', () => this.news(Math.max(1, g.turn - 12), g.turn, 'Edición especial'));
    on('vReplay', () => this.replay());
    on('vShare', async () => {
      try { if (navigator.share) await navigator.share({text:shareText}); else { await navigator.clipboard.writeText(shareText); toast('Copiado'); } } catch (e) {}
    });
  }
  /** Provincias de cada bando en cada turno, a partir del historial. */
  series() {
    const g = this.g, nf = E.rebels(g) + 1;
    return g.hist.map(h => { const c = new Array(nf).fill(0); for (const ch of h) if (ch !== '.') c[ch.charCodeAt(0) - 48]++; return c; });
  }
  /** Gráfica del poder: tú y los cuatro bandos que más crecieron. */
  powerChart() {
    const g = this.g, me = this.me, S2 = this.series();
    if (S2.length < 3) return '';
    const nf = E.rebels(g), peak = Array.from({length:nf}, (_, f) => Math.max(...S2.map(c => c[f])));
    const pick = [me, ...peak.map((v, f) => ({v, f})).filter(x => x.f !== me).sort((a, b) => b.v - a.v).slice(0, 4).map(x => x.f)];
    const W = 300, H = 92, top = Math.max(2, ...pick.map(f => peak[f])), n = S2.length;
    const line = (/** @type {number} */ f) => S2.map((c, i) => `${(i * W / (n - 1)).toFixed(1)},${(H - c[f] * H / top).toFixed(1)}`).join(' ');
    const lines = pick.slice().reverse().map(f => `<polyline points="${line(f)}" fill="none" stroke="${g.F.color[f]}" stroke-width="${f === me ? 3 : 1.6}" stroke-linejoin="round" stroke-linecap="round"${f === me ? ' class="me"' : ' opacity=".85"'}/>`).join('');
    return `<figure class="pchart glass"><figcaption>El poder, turno a turno</figcaption>
      <svg viewBox="-2 -4 ${W + 4} ${H + 8}" preserveAspectRatio="none" role="img" aria-label="Provincias de cada bando por turno">
        ${[.25, .5, .75].map(k => `<line x1="0" x2="${W}" y1="${H * k}" y2="${H * k}" class="gl"/>`).join('')}${lines}</svg>
      <div class="lg">${pick.map(f => `<span><i style="background:${g.F.color[f]}"></i>${esc(f === me ? 'Tú' : g.F.name[f])}</span>`).join('')}</div></figure>`;
  }
  /** Cámara rápida: el mapa de toda la partida, turno a turno. Un toque la salta. */
  async replay() {
    const g = this.g, v = $('#victory'), view = this.view, hud = $('#wHud'), bar = $('#wBar'), b = $('#wBanner');
    v.hidden = true; hud.style.visibility = bar.style.visibility = 'hidden';
    this.overlay.show(false); view.me = -1;
    const act = g.P.active.flatMap((a, p) => a ? [p] : []);
    await view.moveTo(act.length < g.P.active.length ? view.frameOf(act, 2.6) : view.overview(), reduced() ? 0 : 500);
    let skip = false;
    const tap = () => { skip = true; };
    addEventListener('pointerdown', tap, true);
    const step = Math.max(45, Math.min(220, 11000 / g.hist.length));
    b.className = 'banner glass disp show';
    for (let i = 0; i < g.hist.length && !skip; i++) {
      view.setOwners([...g.hist[i]].map(ch => ch === '.' ? -1 : ch.charCodeAt(0) - 48), g.F.alive.map(() => false));
      b.textContent = `Turno ${i + 1} · año ${1 + Math.floor(i / 12)}`;
      await sleep(step);
    }
    removeEventListener('pointerdown', tap, true);
    await sleep(skip ? 0 : 700);
    b.className = 'banner glass disp';
    view.setOwners(g.P.owner, g.F.alive.map(a => !a)); view.me = this.me;
    this.overlay.show(true); hud.style.visibility = bar.style.visibility = '';
    v.hidden = false;
  }
}
/** Estrella de la campaña. @param {boolean} on */
export function starSvg(on) {
  return `<svg class="star${on ? ' on' : ''}" viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0-10.5 3.1-3.6 10.5-3.2 4.8 1.6 6.6 9 0 5 -6.6 9-4.8 1.6-10.5-3.2-3.1-3.6Z"/></svg>`;
}

/** Titular de la victoria según cómo se gana. @param {Game} g */
function winTitle(g) {
  const t = g.rules.victory.type;
  if (t === 'capitales') return '¡Las capitales son tuyas!';
  if (t === 'diplomatica') return '¡Paz bajo tu bandera!';
  if (t === 'puntos' || t === 'supervivencia') return '¡Primer puesto!';
  if (g.scenario === 'peninsula') return '¡La península es tuya!';
  if (g.scenario === 'region') return '¡Región conquistada!';
  if (g.scenario === 'vecinas') return '¡Comarca conquistada!';
  return '¡España es tuya!';
}
/** Objetivo de la partida. @param {Game} g */
function victoryText(g) {
  const v = g.rules.victory;
  if (v.type === 'capitales') return `cuando tienes ${v.n || 5} de las capitales originales`;
  if (v.type === 'diplomatica') return 'con el 30 % de las provincias y pacto o alianza con todos los bandos que sigan en pie';
  if (v.type === 'puntos') return `con más puntos al acabar el turno ${v.turns || 60} (10 por provincia, 25 por capital, más tropas y oro)`;
  return g.P.active.every(Boolean) ? 'cuando dominas todas las provincias' : 'cuando dominas todas las provincias en juego';
}
/** Texto de un suceso para el jugador. @param {any} e @param {Conquest} c */
function eventText(e, c) {
  const p = e.p != null ? c.pname(e.p) : '';
  return ({
    sequia:`Sequía en ${p}: sin oro ni reclutas 2 turnos`, revuelta:`Revuelta en ${p}: baja la lealtad`, fiestas:'Fiestas en tu tierra: +5 de poder',
    plaga:`Plaga en ${p}: −${e.v} tropas`, desertores:`Desertores en ${p}: −${e.v} tropas`, mercaderes:`Llegan mercaderes: +${e.v} de oro`,
    voluntarios:`Voluntarios en ${p}: +${e.v} tropas`, nevada:`Nevada en ${p}: no se puede cruzar este turno`,
  })[/** @type {'sequia'} */ (e.kind)] || e.kind;
}
void scoreOf; void mult; void S;

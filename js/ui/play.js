// @ts-check
// Partida: anima cada ronda (ruleta, objetivo, combate con dados, conquista). Quién decide lo dice el
// «conductor» (drivers.js): simulación normal, un jugador contra bots, anfitrión o invitado de una sala.
import {S, save} from '../store.js';
import {aliveFactions, counts, territory} from '../engine/game.js';
import {score, mult, winProb} from '../engine/prob.js';
import {hash01} from '../engine/rng.js';
import {bestTarget} from '../engine/bots.js';
import {flag} from '../flags.js';
import {icon} from '../icons.js';
import {sound, announce, shake, burstAt, celebrate, reduced, haptic} from '../fx.js';
import {Wheel} from './wheel.js';
import {diceRow, roll, markWin} from './dice.js';
import {$, esc, fmt, pct, toast, openSheet, closeSheet} from './dom.js';
import {Clock} from './clock.js';
import {borderKey} from '../map/render.js';
/** Tiempo para elegir objetivo en un turno humano (ms). */
const TURN_MS = 12000;

/**
 * @typedef {object} World
 * @property {import('../map/render.js').MapData} map las 47 provincias
 * @property {import('../map/render.js').MapData} [map48] con Portugal (escenario de la península)
 * @property {import('../engine/game.js').Graph} graph
 * @property {string[]} colors
 * @property {string[]} names
 * @property {string[]} plates
 * @property {import('../map/render.js').MapView} view
 * @property {((x:number, y:number) => void)|null} onTap
 */
/**
 * @typedef {object} Hooks
 * @property {() => void} onExit
 * @property {(seed?:string) => void} [onNew] otra partida del mismo modo
 * @property {(game:import('../engine/game.js').Game) => void} save
 * @property {() => string} [link] enlace para compartir
 * @property {() => string} [info] html extra para la hoja de partida
 * @property {() => void} [onEnd]
 */

const STOP = Symbol('stop');

export class Match {
  /**
   * @param {World} world @param {import('../engine/game.js').Game} game @param {import('./drivers.js').Driver} driver @param {Hooks} hooks
   * @param {{speeds?:number[], pause?:boolean, speed?:number}} [opts]
   */
  constructor(world, game, driver, hooks, opts = {}) {
    this.w = world; this.game = game; this.driver = driver; this.hooks = hooks;
    this.speeds = opts.speeds || [1, 2, 5];
    this.canPause = opts.pause !== false;
    this.clock = new Clock();
    this.clock.speed = opts.speed || (this.speeds.includes(S.settings.speed) ? S.settings.speed : this.speeds[0]);
    this.view = world.view;
    this.view.now = () => this.clock.now();
    this.view.wait = ms => this.clock.wait(ms);
    this.wheel = new Wheel($('#wheelbox'), {colors:world.colors, names:world.names, plates:world.plates}, this.clock);
    this.stopped = false;
    this.autoPaused = false;
    this.onVis = () => {
      if (!this.canPause) return;
      if (document.hidden && !this.clock.paused) { this.autoPaused = true; this.setPaused(true); }
      else if (!document.hidden && this.autoPaused) { this.autoPaused = false; this.setPaused(false); }
    };
    document.addEventListener('visibilitychange', this.onVis);
    if (driver.onStatus) driver.onStatus(s => {
      if (s === 'away') { this.banner('Anfitrión desconectado · <b>pausa</b>', 'El anfitrión se ha desconectado. La partida está en pausa hasta que vuelva.'); $('#banner').classList.add('paused'); }
      else { $('#banner').classList.remove('paused'); this.banner('El anfitrión ha vuelto', 'El anfitrión ha vuelto. Sigue la partida.'); }
    });
  }
  get me() { return this.driver.me; }

  /* ---------- Montaje ---------- */
  mount() {
    $('#play').hidden = false;
    this.renderHud();
    this.view.me = this.me; this.view.labels = S.settings.labels;
    this.view.focus([], [], 0); this.view.hop = -1; this.view.cands = new Set();
    this.view.setOwners(this.game.owner, this.game.alive.map(a => !a));
    this.view.rebuild(); this.view.invalidate();
    this.showRank();
    this.layout();
    this.view.moveTo(this.view.overview(), reduced() ? 0 : 700);
    this.updateHud();
    this.loop();
  }
  unmount() {
    this.stopped = true; this.clock.stopped = true;
    document.removeEventListener('visibilitychange', this.onVis);
    this.wheel.hide();
    this.w.onTap = null;
    $('#play').hidden = true; $('#dock').innerHTML = ''; $('#banner').className = 'banner';
    this.view.now = () => performance.now(); this.view.wait = ms => new Promise(r => setTimeout(r, ms));
    this.view.focus([], [], 0); this.view.hop = -1; this.view.cands = new Set(); this.view.hot = []; this.view.me = -1;
    this.view.rebuild(); this.view.invalidate();
  }
  /** Hueco libre del mapa según la barra y el panel. */
  layout() {
    const hud = $('#hud').getBoundingClientRect(), dock = $('#dock').getBoundingClientRect();
    const top = hud.bottom + 6, bottom = Math.max(0, innerHeight - dock.top + 6);
    this.view.setInsets({top, bottom, left:0, right:0});
    const p = $('#play');
    p.style.setProperty('--ft', top + 'px'); p.style.setProperty('--fb', bottom + 'px'); p.style.setProperty('--fh', (innerHeight - top - bottom) + 'px');
  }
  /** @param {string} name */
  phase(name) { document.body.dataset.phase = name; /** @type {any} */ (window).__eeg?.onPhase?.(name, this); }
  check() { if (this.stopped) throw STOP; }
  /** @param {number} ms */
  async wait(ms) { await this.clock.wait(this.clock.T(ms)); this.check(); }
  /** @param {number} ms */
  T(ms) { return this.clock.T(ms); }
  /** @param {number} f */
  nm(f) { return this.w.names[f]; }
  /** Nombre del bando con el del jugador humano si lo hay. @param {number} f */
  who(f) { if (f === this.me) return 'Tú'; const n = this.driver.nameOf?.(f); return n ? `${this.nm(f)} (${n})` : this.nm(f); }

  /* ---------- Barra superior ---------- */
  renderHud() {
    const st = S.settings, sp = this.clock.speed;
    $('#hud').innerHTML = `
      <button class="icb glass" id="hExit" aria-label="Salir al menú (la partida se guarda)">${icon('back')}</button>
      <button class="stat glass" id="hInfo" aria-label="Partida: semilla y opciones"><div><span>Ronda</span><b class="num" id="hRound">0</b></div><i class="sepv"></i><div><span>Bandos</span><b class="num" id="hAlive">47</b></div></button>
      <div class="ctl glass">
        ${this.canPause ? `<button class="icb" id="hPause" aria-label="Pausa">${icon('pause')}</button>` : ''}
        ${this.speeds.length > 1 ? `<div class="speed" role="group" aria-label="Velocidad">${this.speeds.map(v => `<button data-sp="${v}" aria-pressed="${sp === v}" aria-label="Velocidad por ${v}">x${v}</button>`).join('')}</div>` : `<span class="speed fixed" aria-label="Velocidad por ${sp}, la decide el anfitrión"><b>x${sp}</b></span>`}
        <button class="icb" id="hSound" aria-pressed="${st.sound}" aria-label="Sonido">${icon(st.sound ? 'soundOn' : 'soundOff')}</button>
      </div>`;
    $('#hExit').onclick = () => { sound('tap'); this.exit(); };
    const pb = $('#hPause'); if (pb) pb.onclick = () => { sound('tap'); this.setPaused(!this.clock.paused); };
    $('#hSound').onclick = () => {
      S.settings.sound = !S.settings.sound; save();
      $('#hSound').setAttribute('aria-pressed', String(S.settings.sound)); $('#hSound').innerHTML = icon(S.settings.sound ? 'soundOn' : 'soundOff');
      sound('tap');
    };
    $('#hInfo').onclick = () => { sound('tap'); this.infoSheet(); };
    $('#hud').querySelectorAll('[data-sp]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
      const v = /** @type {1|2|5} */ (+(/** @type {HTMLElement} */ (b).dataset.sp || 1));
      if (this.speeds.includes(5)) { S.settings.speed = v; save(); }
      this.clock.speed = v; sound('tap');
      $('#hud').querySelectorAll('[data-sp]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      this.onSpeed?.(v);
    });
  }
  /** @type {((v:number) => void)|undefined} */
  onSpeed;
  updateHud() {
    const r = $('#hRound'), a = $('#hAlive');
    if (r) r.textContent = String(this.game.round);
    if (a) a.textContent = String(aliveFactions(this.game).length);
    const c = counts(this.game), lead = c.indexOf(Math.max(...c));
    $('#map').setAttribute('aria-label', `Mapa de España. ${aliveFactions(this.game).length} bandos en pie. Lidera ${this.nm(lead)} con ${c[lead]} provincias.${this.me >= 0 ? ` Tú tienes ${c[this.me]}.` : ''}`);
  }
  /** @param {boolean} p */
  setPaused(p) {
    if (p) this.clock.pause(); else this.clock.resume();
    const b = $('#hPause');
    if (b) { b.innerHTML = icon(p ? 'play' : 'pause'); b.setAttribute('aria-label', p ? 'Reanudar' : 'Pausa'); }
    const bn = $('#banner');
    if (p) { this.prevBanner = bn.innerHTML; bn.innerHTML = 'Pausa'; bn.className = 'banner glass disp show paused'; announce('Partida en pausa'); }
    else if (bn.classList.contains('paused')) { bn.innerHTML = this.prevBanner || ''; bn.className = 'banner glass disp' + (this.prevBanner ? ' show' : ''); }
  }
  /** @param {string} html @param {string} [say] */
  banner(html, say) {
    const b = $('#banner'); if (this.clock.paused) { this.prevBanner = html; return; }
    b.innerHTML = html; b.className = 'banner glass disp show';
    if (say) announce(say);
  }
  exit() {
    this.hooks.save(this.game);
    this.unmount();
    this.hooks.onExit();
  }
  share() {
    const url = this.hooks.link ? this.hooks.link() : location.origin + location.pathname + '?semilla=' + encodeURIComponent(this.game.seed);
    const text = `España en Guerra: juega mi partida (semilla ${this.game.seed})`;
    if (navigator.share) navigator.share({title:'España en Guerra', text, url}).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado'), () => toast(this.game.seed));
  }
  infoSheet() {
    const g = this.game, wasPaused = this.clock.paused;
    if (this.canPause && !wasPaused) this.setPaused(true);
    const local = this.driver.kind === 'normal' || this.driver.kind === 'solo';
    openSheet({title:'Partida', body:`
      ${this.hooks.info ? this.hooks.info() : ''}
      <div class="glabel">Semilla</div>
      <div class="grp"><div class="rowi">${icon('seed')}<div class="l"><b class="disp" style="font:800 26px/1 var(--display);letter-spacing:.16em">${esc(g.seed)}</b><small>Con la misma semilla${this.driver.kind === 'normal' ? '' : ' y las mismas decisiones'} la partida se repite igual.</small></div></div></div>
      ${local ? `<div class="row2"><button class="btn sm" id="sShare">${icon('share')}Compartir</button><button class="btn sm ghost" id="sCopy">${icon('copy')}Copiar</button></div>
      <div class="glabel">Opciones</div>
      <div class="grp">
        <button class="rowi" id="sRestart">${icon('replay')}<div class="l">Empezar de nuevo<small>Misma semilla, desde la ronda 0</small></div></button>
        <button class="rowi" id="sNew">${icon('dice')}<div class="l">Partida nueva<small>Otra semilla al azar</small></div></button>
      </div>` : ''}`,
      close:() => { if (this.canPause && !wasPaused) this.setPaused(false); },
      mount:el => {
        const on = (/** @type {string} */ id, /** @type {() => void} */ fn) => { const b = /** @type {HTMLElement|null} */ (el.querySelector(id)); if (b) b.onclick = fn; };
        on('#sShare', () => this.share());
        on('#sCopy', () => { navigator.clipboard?.writeText(location.origin + location.pathname + '?semilla=' + g.seed).then(() => toast('Enlace copiado'), () => toast(g.seed)); });
        on('#sRestart', () => { closeSheet(); this.unmount(); this.hooks.onNew?.(g.seed); });
        on('#sNew', () => { closeSheet(); this.unmount(); this.hooks.onNew?.(); });
      }});
  }

  /* ---------- Panel inferior: clasificación ---------- */
  showRank() {
    const g = this.game, c = counts(g), alive = aliveFactions(g);
    const sorted = alive.sort((a, b) => c[b] - c[a] || g.power[b] - g.power[a] || a - b);
    let top = sorted.slice(0, 4);
    if (this.me >= 0 && g.alive[this.me] && !top.includes(this.me)) top = [...sorted.slice(0, 3), this.me];
    const max = Math.max(1, ...top.map(f => c[f]));
    $('#dock').innerHTML = `<div class="panel glass" id="rankP" aria-label="Clasificación">
      <div class="ph"><h4>Clasificación</h4><span class="num">${alive.length} de ${g.owner.length} en pie</span></div>
      <div class="rank" role="list">${top.map(f => {
        const pos = sorted.indexOf(f) + 1, mine = f === this.me, pn = this.driver.nameOf?.(f);
        return `<div class="rk${mine ? ' mine' : ''}" role="listitem" aria-label="${pos}. ${esc(this.who(f))}: ${c[f]} provincias, poder ${g.power[f]}">
          <span class="pos">${pos}</span>${flag(f)}
          <div style="min-width:0"><div class="nm">${esc(this.nm(f))}${mine ? ' <em class="you">Tú</em>' : pn ? ` <em class="you ext">${esc(pn)}</em>` : ''}</div><div class="bar"><i style="width:${(c[f] / max * 100).toFixed(1)}%;--c:${this.w.colors[f]}"></i></div></div>
          <span class="v num">${c[f]}<small>PROV.</small></span><span class="v num">${g.power[f]}<small>PODER</small></span>
        </div>`; }).join('')}</div></div>`;
    this.layout();
  }

  /* ---------- Panel inferior: combate ---------- */
  /** @param {import('../engine/game.js').Round} r */
  showCombat(r) {
    const W = this.w, c = counts(this.game);
    const side = (/** @type {'att'|'def'} */ k, /** @type {number} */ f, /** @type {number} */ p) => `
      <div class="side ${k}" style="--c:${W.colors[f]}">
        <span class="tag">${icon(k === 'att' ? 'swords' : 'shield')}${k === 'att' ? 'Ataca' : 'Defiende'}${f === this.me ? ' · Tú' : ''}</span>
        <div class="who">${flag(f, {cls:'sh'})}<div><b>${esc(this.nm(f))}</b><small>${c[f]} ${c[f] === 1 ? 'provincia' : 'provincias'}${k === 'def' && r.target !== f ? ' · ' + esc(this.nm(r.target)) : ''}</small></div></div>
        <div class="pw"><span>Poder <b class="num" data-pw>${p}</b></span><em class="num">×${fmt(mult(p), 2)}</em></div>
        ${diceRow(W.colors[f])}
        <div class="score num" data-score></div>
        <span class="delta" data-delta></span>
      </div>`;
    $('#dock').innerHTML = `<div class="panel glass combat" aria-label="Combate">
      <div class="prob" aria-label="Probabilidad de victoria: ${esc(this.nm(r.attacker))} ${pct(r.prob)}, ${esc(this.nm(r.defender))} ${pct(1 - r.prob)}">
        <span class="pv num" style="--pc:${W.colors[r.attacker]}">${pct(r.prob)}</span>
        <div><div class="lbl">Probabilidad de victoria</div><div class="pbar" style="--ca:${W.colors[r.attacker]};--cd:${W.colors[r.defender]}"><i style="width:50%"></i></div></div>
        <span class="pv num" style="--pc:${W.colors[r.defender]}">${pct(1 - r.prob)}</span>
      </div>
      <div class="sides" style="position:relative">${side('att', r.attacker, r.pa)}<span class="vs">VS</span>${side('def', r.defender, r.pd)}<div class="tie">Empate</div></div>
    </div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => { const i = /** @type {HTMLElement|null} */ ($('#dock').querySelector('.pbar i')); if (i) i.style.width = (r.prob * 100).toFixed(1) + '%'; }));
    this.layout();
  }

  /* ---------- Bucle ---------- */
  async loop() {
    try {
      while (!this.stopped && this.game.winner < 0) await this.round();
      if (!this.stopped && this.game.winner >= 0) await this.victory();
    } catch (e) { if (e !== STOP) { console.error(e); toast('Algo ha fallado. La partida está guardada.'); } }
  }
  /** @param {{game:import('../engine/game.js').Game}} res */
  apply(res) {
    this.game = res.game;
    this.view.setOwners(res.game.owner, res.game.alive.map(a => !a));
    this.hooks.save(this.game);
    S.stats.rounds++;
    this.updateHud();
  }
  /** Provincias del frente: las candidatas y las del atacante que las tocan. @param {import('./drivers.js').Step} step @param {import('../engine/game.js').Game} prev */
  front(step, prev) {
    const s = new Set(step.targets);
    for (const t of step.targets) for (const q of this.w.graph.adj[t]) if (prev.owner[q] === step.attacker) s.add(q);
    return [...s];
  }

  async round() {
    const W = this.w, view = this.view, prev = this.game;
    this.phase('wait');
    const step = await this.driver.next(prev); this.check();
    if (step.jump) { // ponerse al día de golpe (al volver a abrir)
      this.apply({game:step.jump}); view.focus([], [], 0); this.showRank(); return;
    }
    if (step.fast) { // con retraso: sin animación
      const res = step.known || await this.driver.settle(step); this.check();
      this.apply(res); if (res.game.round % 5 === 0) this.showRank();
      return;
    }
    const A = this.nm(step.attacker);
    const jit = (/** @type {string} */ k) => hash01(prev.seed + ':' + k + step.n);

    // 1. Ruleta de bandos
    this.phase('spin');
    this.banner(`Ronda <b>${step.n}</b>`);
    this.wheel.show(step.alive);
    await this.wait(reduced() ? 150 : 260);
    if (this.clock.speed < 5) sound('whoosh');
    await this.wheel.spin(step.attacker, this.T(2300), jit('w')); this.check();
    sound('lock'); haptic(10);
    const mineTurn = step.who === 'me';
    this.banner(mineTurn ? '<b>Tu turno</b>' : `<b>${esc(this.who(step.attacker))}</b> ataca`, mineTurn ? `Ronda ${step.n}. Te toca atacar.` : `Ronda ${step.n}. Ataca ${this.who(step.attacker)}.`);
    await this.wait(mineTurn ? 400 : 550);
    await this.wheel.hide(); this.check();

    // 2. Objetivo
    this.phase('target');
    const terr = territory(prev, step.attacker), front = this.front(step, prev);
    view.focus([...terr, ...step.targets], [], this.T(380));
    await view.moveTo(view.frameOf(front, 2.6), reduced() ? 0 : this.T(720)); this.check();
    /** @type {import('./drivers.js').Result} */
    let res;
    if (mineTurn) {
      const t = await this.humanTurn(step, prev); this.check();
      this.phase('sent');
      if (this.driver.kind === 'guest') this.banner('Ataque enviado · <b>esperando al anfitrión</b>');
      res = await this.driver.decide(step, t); this.check();
      if (res.round.target !== t) toast('Se agotó el tiempo: el anfitrión eligió el mejor objetivo');
    } else if (step.known) {
      res = step.known;
      if (step.targets.length > 1 && !reduced()) { view.cands = new Set(step.targets); await this.hop(step.targets, res.round.target, this.T(1350)); }
      else { view.hop = res.round.target; await this.wait(380); }
    } else {
      // otro jugador está eligiendo
      this.phase('remote');
      view.cands = new Set(step.targets);
      this.banner(`<b>${esc(this.who(step.attacker))}</b> elige objetivo…`, `${this.who(step.attacker)} está eligiendo objetivo.`);
      res = await this.driver.settle(step); this.check();
      view.hop = res.round.target; await this.wait(300);
    }
    view.cands = new Set();
    const r = res.round, D = this.nm(r.defender), P = this.nm(r.target);
    sound('lock'); haptic(10);
    this.banner(`<b>${esc(A)}</b> contra ${esc(P)}`, `Objetivo: ${P}, de ${D}.`);

    // 3. Combate
    this.phase('combat');
    view.hop = -1;
    this.showCombat(r);
    const hot = r.from.map(q => borderKey(r.target, q));
    view.focus([r.target, ...r.from], hot, this.T(380));
    await view.moveTo(view.frameOf([r.target, ...r.from]), reduced() ? 0 : this.T(650)); this.check();
    announce(`${A}, poder ${r.pa}, contra ${D}, poder ${r.pd}. Probabilidad de ganar el ataque: ${pct(r.prob)}.`);
    await this.wait(420);

    const dock = $('#dock');
    const att = /** @type {HTMLElement} */ (dock.querySelector('.side.att')), def = /** @type {HTMLElement} */ (dock.querySelector('.side.def'));
    const rowA = /** @type {HTMLElement} */ (att.querySelector('.dice')), rowD = /** @type {HTMLElement} */ (def.querySelector('.dice'));
    for (let i = 0; i < r.rolls.length; i++) {
      const {a, d} = r.rolls[i];
      this.phase('roll');
      if (this.clock.speed < 5 || i === 0) sound('roll');
      /** @type {HTMLElement} */ (att.querySelector('[data-score]')).innerHTML = ''; /** @type {HTMLElement} */ (def.querySelector('[data-score]')).innerHTML = '';
      await Promise.all([roll(rowA, a, this.T(1050), this.clock, r.n + i * 7), roll(rowD, d, this.T(1050), this.clock, r.n + i * 7 + 3)]); this.check();
      sound('land'); haptic(8);
      const sa = a[0] + a[1] + a[2], sd = d[0] + d[1] + d[2];
      /** @type {HTMLElement} */ (att.querySelector('[data-score]')).innerHTML = `${sa} × ${fmt(mult(r.pa), 2)} = <b>${fmt(score(sa, r.pa), 2)}</b>`;
      /** @type {HTMLElement} */ (def.querySelector('[data-score]')).innerHTML = `<b>${fmt(score(sd, r.pd), 2)}</b> = ${sd} × ${fmt(mult(r.pd), 2)}`;
      this.phase('landed');
      if (i < r.rolls.length - 1) {
        const tie = /** @type {HTMLElement} */ (dock.querySelector('.tie'));
        tie.classList.add('show'); announce(`Empate a ${fmt(score(sa, r.pa), 2)}. Se repite la tirada.`); sound('lock');
        await this.wait(850); tie.classList.remove('show'); await this.wait(150);
      } else await this.wait(420);
    }
    const last = r.rolls[r.rolls.length - 1], sa = last.a.reduce((x, y) => x + y), sd = last.d.reduce((x, y) => x + y);

    // 4. Resultado
    this.phase('result');
    const [win, lose] = r.won ? [att, def] : [def, att];
    win.classList.add('win'); lose.classList.add('lose'); markWin(/** @type {HTMLElement} */ (win.querySelector('.dice')));
    const setDelta = (/** @type {HTMLElement} */ el, /** @type {number} */ before, /** @type {number} */ after) => {
      const dl = /** @type {HTMLElement} */ (el.querySelector('[data-delta]')), diff = after - before;
      dl.textContent = (diff >= 0 ? '+' : '−') + Math.abs(diff); dl.className = 'delta show ' + (diff >= 0 ? 'up' : 'down');
      /** @type {HTMLElement} */ (el.querySelector('[data-pw]')).textContent = String(after);
    };
    setDelta(att, r.pa, r.paAfter); setDelta(def, r.pd, r.pdAfter);
    const mid = view.borderMid(r.target, r.from), [sx, sy] = view.toScreen(mid[0], mid[1]);
    if (r.won) {
      this.phase('conquest');
      sound('impact'); haptic([20, 40, 30]);
      const sk = shake($('#app'), 8); if (sk) this.clock.track(sk);
      burstAt(sx, sy, W.colors[r.attacker], 1.25);
      this.banner(`<b>${esc(A)}</b> conquista ${esc(P)}`, `${A} saca ${fmt(score(sa, r.pa), 2)} y ${D} ${fmt(score(sd, r.pd), 2)}. ${A} conquista ${P}.`);
      const fan = this.wait(260).then(() => sound('conquer'));
      await Promise.all([view.conquer(r.target, r.attacker, mid, reduced() ? 0 : this.T(1050), r.eliminated >= 0), fan]); this.check();
      if (r.eliminated >= 0) {
        this.phase('eliminated');
        sound('eliminate');
        def.querySelector('.flag')?.classList.add('dead');
        const meOut = r.eliminated === this.me;
        this.banner(meOut ? '<b>Has caído</b>' : `<b>${esc(D)}</b> queda eliminado`, meOut ? 'Has perdido tu última provincia.' : `${D} queda eliminado.`);
        await this.wait(1100);
      } else await this.wait(500);
    } else {
      this.phase('defended');
      sound('defend'); haptic(12);
      burstAt(sx, sy, W.colors[r.defender], .55);
      this.banner(`${esc(P)} <b>resiste</b>`, `${A} saca ${fmt(score(sa, r.pa), 2)} y ${D} ${fmt(score(sd, r.pd), 2)}. ${P} resiste.`);
      await this.wait(900);
    }

    // 5. Estado nuevo y vuelta a la vista general
    this.apply(res);
    if (r.eliminated >= 0 && r.eliminated === this.me && res.game.winner < 0) await this.defeat();
    if (res.game.winner >= 0) return;
    this.phase('overview');
    view.focus([], [], this.T(420));
    this.showRank();
    await view.moveTo(view.overview(), reduced() ? 0 : this.T(700)); this.check();
    await this.wait(180);
  }

  /**
   * Tu turno: eliges objetivo en el mapa o en la lista, viendo la probabilidad. 12 s; si se agotan, el mejor.
   * @param {import('./drivers.js').Step} step @param {import('../engine/game.js').Game} prev @returns {Promise<number>}
   */
  humanTurn(step, prev) {
    this.phase('choose');
    const W = this.w, view = this.view, me = step.attacker;
    const rows = step.targets.map(t => ({t, d:prev.owner[t], p:winProb(prev.power[me], prev.power[prev.owner[t]]).p})).sort((a, b) => b.p - a.p);
    view.cands = new Set(step.targets);
    this.banner('<b>Tu turno</b> · elige objetivo', `Te toca. Elige a quién atacar entre ${rows.length} provincias. Tienes 12 segundos.`);
    $('#dock').innerHTML = `<div class="panel glass choose" aria-label="Elige objetivo">
      <div class="ph"><h4>Elige objetivo</h4><span class="timer" aria-hidden="true"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" class="tr-bg"/><circle cx="18" cy="18" r="15.5" class="tr" pathLength="100"/></svg><b class="num" id="tLeft">12</b></span></div>
      <div class="targets" role="list">${rows.map(({t, d, p}) => `
        <button class="tg" role="listitem" data-t="${t}" style="--c:${W.colors[d]}" aria-label="Atacar ${esc(this.nm(t))}, de ${esc(this.who(d))}, probabilidad ${pct(p)}">
          ${flag(d)}<span class="tn"><b>${esc(this.nm(t))}</b><small>${t === d ? 'Poder ' + prev.power[d] : esc(this.who(d)) + ' · poder ' + prev.power[d]}</small></span>
          <span class="tp num"><b>${pct(p)}</b><i><em style="width:${(p * 100).toFixed(0)}%"></em></i></span>
        </button>`).join('')}</div></div>`;
    this.layout();
    return new Promise(res => {
      let done = false, raf = 0;
      const t0 = this.clock.now(), ring = /** @type {HTMLElement|null} */ ($('#dock').querySelector('.tr')), left = $('#tLeft');
      const finish = (/** @type {number} */ t, /** @type {boolean} */ auto) => {
        if (done) return; done = true; cancelAnimationFrame(raf); this.w.onTap = null; this.clock.listeners.delete(onPause);
        view.hop = t; view.invalidate();
        if (auto) { toast('Tiempo agotado: atacas al mejor objetivo'); announce(`Tiempo agotado. Atacas ${this.nm(t)}.`); }
        sound('lock'); haptic(14);
        res(t);
      };
      const tick = () => {
        if (done) return;
        if (this.stopped) { done = true; return; }
        const el = this.clock.now() - t0, rem = Math.max(0, TURN_MS - el);
        if (ring) ring.style.strokeDashoffset = String(100 - rem / TURN_MS * 100);
        const s = Math.ceil(rem / 1000);
        if (left && left.textContent !== String(s)) { left.textContent = String(s); if (s <= 3 && s > 0) sound('tick'); }
        if (rem <= 0) { finish(bestTarget(prev, me, step.targets), true); return; }
        raf = requestAnimationFrame(tick);
      };
      const onPause = () => { if (!this.clock.paused && !done) { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); } };
      this.clock.listeners.add(onPause);
      $('#dock').querySelectorAll('.tg').forEach(b => {
        const t = +(/** @type {HTMLElement} */ (b).dataset.t || -1);
        /** @type {HTMLElement} */ (b).onclick = () => finish(t, false);
        b.addEventListener('pointerenter', () => { view.hop = t; view.invalidate(); });
      });
      this.w.onTap = (x, y) => { const p = view.hit(x, y); if (p >= 0 && step.targets.includes(p)) finish(p, false); else if (p >= 0) toast(`${this.nm(p)} no es limítrofe con tus provincias`); };
      raf = requestAnimationFrame(tick);
    });
  }

  /**
   * Resalte que salta entre las candidatas cada vez más despacio y se para en el objetivo.
   * @param {number[]} cands @param {number} target @param {number} dur
   */
  async hop(cands, target, dur) {
    const view = this.view, ps = this.w.map.provinces;
    const cx = cands.reduce((s, p) => s + ps[p].label[0], 0) / cands.length, cy = cands.reduce((s, p) => s + ps[p].label[1], 0) / cands.length;
    const ring = [...cands].sort((a, b) => Math.atan2(ps[a].label[1] - cy, ps[a].label[0] - cx) - Math.atan2(ps[b].label[1] - cy, ps[b].label[0] - cx));
    const n = ring.length, hops = Math.max(n * 2, 9), ti = ring.indexOf(target);
    const w = Array.from({length:hops}, (_, k) => 1 + (k / hops) ** 2 * 5), sum = w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < hops; k++) {
      view.hop = ring[(((ti - hops + 1 + k) % n) + n) % n];
      view.invalidate();
      if (this.clock.speed < 5) sound('hop', k);
      await this.wait(dur * w[k] / sum * this.clock.speed);
    }
    view.hop = target;
  }

  /* ---------- Derrota (un jugador y online) ---------- */
  async defeat() {
    const g = this.game, f = this.me, W = this.w;
    const place = aliveFactions(g).length + 1;
    this.phase('defeat');
    const v = $('#victory');
    v.hidden = false; v.className = 'overlay lost';
    v.innerHTML = `<div class="v-in">
      <div class="pole">${flag(f, {cls:'big dead', title:'Bandera de ' + W.names[f]})}</div>
      <div class="v-kick">Derrota</div>
      <h2 class="v-title" id="vTitle">Has caído</h2>
      <p class="v-sub">${esc(W.names[f])} resiste ${g.round} rondas y termina en el puesto ${place} de ${g.owner.length}</p>
      <div class="v-stats glass">
        <div><b class="num">${g.round}</b><span>Rondas</span></div>
        <div><b class="num">${g.stats.conq[f]}</b><span>Conquistas</span></div>
        <div><b class="num">${g.stats.peak[f]}</b><span>Máx. provincias</span></div>
        <div><b class="num">${place}.º</b><span>Puesto</span></div>
      </div>
      <div class="v-btns">
        <button class="btn" id="vWatch">${icon('play')}Seguir mirando</button>
        ${this.hooks.onNew ? `<button class="btn sm ghost" id="vAgain">${icon('replay')}Otra partida</button>` : ''}
        <button class="btn sm ghost" id="vMenu">${icon('back')}Menú</button>
      </div></div>`;
    announce(`Has caído en la ronda ${g.round}. Puesto ${place}.`);
    $('#vWatch').focus();
    await new Promise(res => {
      const close = () => { v.hidden = true; v.innerHTML = ''; v.className = 'overlay'; };
      $('#vWatch').onclick = () => { close(); res(undefined); };
      const again = $('#vAgain'); if (again) again.onclick = () => { close(); this.unmount(); this.hooks.onNew?.(); res(undefined); };
      $('#vMenu').onclick = () => { close(); this.exit(); res(undefined); };
    });
    this.check();
  }

  /* ---------- Victoria ---------- */
  async victory() {
    const g = this.game, f = g.winner, W = this.w, mine = f === this.me, pn = this.driver.nameOf?.(f);
    this.phase('victory');
    S.stats.finished++;
    S.history.unshift({seed:g.seed, winner:f, rounds:g.round, at:Date.now()}); S.history = S.history.slice(0, 30);
    this.hooks.save(g); this.hooks.onEnd?.(); save();
    this.view.focus([], [], 400);
    await this.view.moveTo(this.view.overview(), reduced() ? 0 : 900);
    const v = $('#victory');
    v.hidden = false; v.className = 'overlay';
    v.style.setProperty('--c', W.colors[f]);
    v.innerHTML = `<div class="v-in">
      <div class="rays" style="--c:${W.colors[f]}"><div class="pole">${flag(f, {cls:'big wave', title:'Bandera de ' + W.names[f]})}</div></div>
      <div class="v-kick">Victoria</div>
      <h2 class="v-title" id="vTitle">${mine ? '¡Has ganado!' : esc(W.names[f])}</h2>
      <p class="v-sub">${mine ? esc(W.names[f]) + ' domina' : pn ? esc(pn) + ' domina' : 'domina'} las 47 provincias de la península</p>
      <div class="v-stats glass">
        <div><b class="num">${g.round}</b><span>Rondas</span></div>
        <div><b class="num">${g.stats.conq[f]}</b><span>Conquistas</span></div>
        <div><b class="num">${g.stats.wins[f]}</b><span>Combates ganados</span></div>
        <div><b class="num">${g.power[f]}</b><span>Poder final</span></div>
      </div>
      <div class="v-btns">
        ${this.hooks.onNew ? `<button class="btn" id="vNew">${icon('dice')}Partida nueva</button>` : ''}
        ${this.driver.kind === 'normal' || this.driver.kind === 'solo' ? `<div class="row2"><button class="btn sm ghost" id="vReplay">${icon('replay')}Repetir semilla</button><button class="btn sm ghost" id="vShare">${icon('share')}Compartir</button></div>` : ''}
        <button class="btn sm ghost" id="vMenu">${icon('back')}Menú</button>
      </div></div>`;
    sound('victory'); haptic([40, 80, 40, 80, 120]);
    celebrate([W.colors[f], '#F2C94C', '#FFFFFF']);
    announce(mine ? `Victoria. Has conquistado España tras ${g.round} rondas.` : `Victoria de ${W.names[f]} tras ${g.round} rondas.`);
    const close = () => { v.hidden = true; v.innerHTML = ''; this.unmount(); };
    const on = (/** @type {string} */ id, /** @type {() => void} */ fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    on('vNew', () => { close(); this.hooks.onNew?.(); });
    on('vReplay', () => { close(); this.hooks.onNew?.(g.seed); });
    on('vShare', () => this.share());
    on('vMenu', () => { close(); this.hooks.onExit(); });
    (/** @type {HTMLElement|null} */ (document.querySelector('#victory .btn')))?.focus();
  }
}

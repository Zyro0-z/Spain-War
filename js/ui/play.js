// @ts-check
// Partida en modo normal: simulación automática con ruleta, ruleta del mapa, combate con dados y conquista.
// El motor calcula la ronda entera de golpe y aquí solo se anima, así la semilla reproduce la partida exacta.
import {S, save} from '../store.js';
import {playRound, aliveFactions, counts, territory} from '../engine/game.js';
import {score, mult} from '../engine/prob.js';
import {hash01} from '../engine/rng.js';
import {shield} from '../art.js';
import {icon} from '../icons.js';
import {sound, announce, shake, burstAt, celebrate, reduced, haptic} from '../fx.js';
import {Wheel} from './wheel.js';
import {diceRow, roll, markWin} from './dice.js';
import {$, esc, fmt, pct, toast, openSheet, closeSheet} from './dom.js';
import {Clock} from './clock.js';
import {borderKey} from '../map/render.js';

/**
 * @typedef {object} World
 * @property {import('../map/render.js').MapData} map
 * @property {import('../engine/game.js').Graph} graph
 * @property {string[]} colors
 * @property {string[]} names
 * @property {string[]} plates
 * @property {import('../map/render.js').MapView} view
 */

const STOP = Symbol('stop');

export class Match {
  /**
   * @param {World} world @param {import('../engine/game.js').Game} game
   * @param {{onExit:()=>void, onNew:(seed?:string)=>void}} hooks
   */
  constructor(world, game, hooks) {
    this.w = world; this.game = game; this.hooks = hooks;
    this.clock = new Clock();
    this.clock.speed = S.settings.speed;
    this.view = world.view;
    this.view.now = () => this.clock.now();
    this.view.wait = ms => this.clock.wait(ms);
    this.wheel = new Wheel($('#wheelbox'), world, this.clock);
    this.stopped = false;
    this.autoPaused = false;
    this.onVis = () => {
      if (document.hidden && !this.clock.paused) { this.autoPaused = true; this.setPaused(true); }
      else if (!document.hidden && this.autoPaused) { this.autoPaused = false; this.setPaused(false); }
    };
    document.addEventListener('visibilitychange', this.onVis);
  }

  /* ---------- Montaje ---------- */
  mount() {
    $('#play').hidden = false;
    this.renderHud();
    this.view.focus([], [], 0); this.view.hop = -1; this.view.cands = new Set();
    this.view.setOwners(this.game.owner, this.game.alive.map(a => !a));
    this.showRank(false);
    this.layout();
    this.view.moveTo(this.view.overview(), reduced() ? 0 : 700);
    this.updateHud();
    this.loop();
  }
  unmount() {
    this.stopped = true; this.clock.stopped = true;
    document.removeEventListener('visibilitychange', this.onVis);
    this.wheel.hide();
    $('#play').hidden = true; $('#dock').innerHTML = ''; $('#banner').className = 'banner';
    this.view.now = () => performance.now(); this.view.wait = ms => new Promise(r => setTimeout(r, ms));
    this.view.focus([], [], 0); this.view.hop = -1; this.view.cands = new Set(); this.view.hot = [];
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
  /** Lanza STOP si se ha salido de la partida. */
  check() { if (this.stopped) throw STOP; }
  /** @param {number} ms */
  async wait(ms) { await this.clock.wait(this.clock.T(ms)); this.check(); }
  /** @param {number} ms */
  T(ms) { return this.clock.T(ms); }

  /* ---------- Barra superior ---------- */
  renderHud() {
    const st = S.settings;
    $('#hud').innerHTML = `
      <button class="icb glass" id="hExit" aria-label="Salir al menú (la partida se guarda)">${icon('back')}</button>
      <button class="stat glass" id="hInfo" aria-label="Partida: semilla y opciones"><div><span>Ronda</span><b class="num" id="hRound">0</b></div><i class="sepv"></i><div><span>Bandos</span><b class="num" id="hAlive">47</b></div></button>
      <div class="ctl glass">
        <button class="icb" id="hPause" aria-label="Pausa">${icon('pause')}</button>
        <div class="speed" role="group" aria-label="Velocidad">${[1, 2, 5].map(v => `<button data-sp="${v}" aria-pressed="${st.speed === v}" aria-label="Velocidad por ${v}">x${v}</button>`).join('')}</div>
        <button class="icb" id="hSound" aria-pressed="${st.sound}" aria-label="Sonido">${icon(st.sound ? 'soundOn' : 'soundOff')}</button>
      </div>`;
    $('#hExit').onclick = () => { sound('tap'); this.exit(); };
    $('#hPause').onclick = () => { sound('tap'); this.setPaused(!this.clock.paused); };
    $('#hSound').onclick = () => {
      S.settings.sound = !S.settings.sound; save();
      $('#hSound').setAttribute('aria-pressed', String(S.settings.sound)); $('#hSound').innerHTML = icon(S.settings.sound ? 'soundOn' : 'soundOff');
      sound('tap');
    };
    $('#hInfo').onclick = () => { sound('tap'); this.infoSheet(); };
    $('#hud').querySelectorAll('[data-sp]').forEach(b => /** @type {HTMLElement} */ (b).onclick = () => {
      const v = /** @type {1|2|5} */ (+(/** @type {HTMLElement} */ (b).dataset.sp || 1));
      S.settings.speed = v; save(); this.clock.speed = v; sound('tap');
      $('#hud').querySelectorAll('[data-sp]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    });
  }
  updateHud() {
    const r = $('#hRound'), a = $('#hAlive');
    if (r) r.textContent = String(this.game.round);
    if (a) a.textContent = String(aliveFactions(this.game).length);
    const c = counts(this.game), lead = c.indexOf(Math.max(...c));
    $('#map').setAttribute('aria-label', `Mapa de España. ${aliveFactions(this.game).length} bandos en pie. Lidera ${this.w.names[lead]} con ${c[lead]} provincias.`);
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
    this.saveNow();
    this.unmount();
    this.hooks.onExit();
  }
  saveNow() {
    if (this.game.winner >= 0) { S.current = null; save(); return; }
    S.current = {mode:'normal', game:this.game, at:Date.now()}; save();
  }
  link() { return location.origin + location.pathname + '?semilla=' + encodeURIComponent(this.game.seed); }
  infoSheet() {
    const g = this.game, wasPaused = this.clock.paused;
    if (!wasPaused) this.setPaused(true);
    openSheet({title:'Partida', body:`
      <div class="glabel">Semilla</div>
      <div class="grp"><div class="rowi">${icon('seed')}<div class="l"><b class="disp" style="font:800 26px/1 var(--display);letter-spacing:.16em">${esc(g.seed)}</b><small>Con la misma semilla la partida se repite igual en cualquier móvil.</small></div></div></div>
      <div class="row2"><button class="btn sm" id="sShare">${icon('share')}Compartir</button><button class="btn sm ghost" id="sCopy">${icon('copy')}Copiar</button></div>
      <div class="glabel">Opciones</div>
      <div class="grp">
        <button class="rowi" id="sRestart">${icon('replay')}<div class="l">Empezar de nuevo<small>Misma semilla, desde la ronda 0</small></div></button>
        <button class="rowi" id="sNew">${icon('dice')}<div class="l">Partida nueva<small>Otra semilla al azar</small></div></button>
      </div>`,
      close:() => { if (!wasPaused) this.setPaused(false); },
      mount:el => {
        /** @type {HTMLElement} */ (el.querySelector('#sShare')).onclick = () => this.share();
        /** @type {HTMLElement} */ (el.querySelector('#sCopy')).onclick = () => { navigator.clipboard?.writeText(this.link()).then(() => toast('Enlace copiado'), () => toast(g.seed)); };
        /** @type {HTMLElement} */ (el.querySelector('#sRestart')).onclick = () => { closeSheet(); this.unmount(); this.hooks.onNew(g.seed); };
        /** @type {HTMLElement} */ (el.querySelector('#sNew')).onclick = () => { closeSheet(); this.unmount(); this.hooks.onNew(); };
      }});
  }
  share() {
    const url = this.link(), text = `España en Guerra: juega mi partida con la semilla ${this.game.seed}`;
    if (navigator.share) navigator.share({title:'España en Guerra', text, url}).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado'), () => toast(this.game.seed));
  }

  /* ---------- Panel inferior: clasificación ---------- */
  /** @param {boolean} [anim] */
  showRank(anim = true) {
    const g = this.game, c = counts(g), alive = aliveFactions(g);
    const top = alive.sort((a, b) => c[b] - c[a] || g.power[b] - g.power[a] || a - b).slice(0, 4);
    const max = Math.max(1, ...top.map(f => c[f]));
    $('#dock').innerHTML = `<div class="panel glass${anim ? '' : ''}" id="rankP" aria-label="Clasificación">
      <div class="ph"><h4>Clasificación</h4><span class="num">${alive.length} de ${g.owner.length} en pie</span></div>
      <div class="rank" role="list">${top.map((f, i) => `
        <div class="rk" role="listitem" aria-label="${i + 1}. ${esc(this.w.names[f])}: ${c[f]} provincias, poder ${g.power[f]}">
          <span class="pos">${i + 1}</span><span>${shield(f)}</span>
          <div style="min-width:0"><div class="nm">${esc(this.w.names[f])}</div><div class="bar"><i style="width:${(c[f] / max * 100).toFixed(1)}%;--c:${this.w.colors[f]}"></i></div></div>
          <span class="v num">${c[f]}<small>PROV.</small></span><span class="v num">${g.power[f]}<small>PODER</small></span>
        </div>`).join('')}</div></div>`;
    this.layout();
  }

  /* ---------- Panel inferior: combate ---------- */
  /** @param {import('../engine/game.js').Round} r */
  showCombat(r) {
    const W = this.w, c = counts(this.game);
    const side = (/** @type {'att'|'def'} */ k, /** @type {number} */ f, /** @type {number} */ p) => `
      <div class="side ${k}" style="--c:${W.colors[f]}">
        <span class="tag">${icon(k === 'att' ? 'swords' : 'shield')}${k === 'att' ? 'Ataca' : 'Defiende'}</span>
        <div class="who"><span class="sh">${shield(f)}</span><div><b>${esc(W.names[f])}</b><small>${c[f]} ${c[f] === 1 ? 'provincia' : 'provincias'}${k === 'def' && r.target !== f ? ' · ' + esc(W.names[r.target]) : ''}</small></div></div>
        <div class="pw"><span>Poder <b class="num" data-pw>${p}</b></span><em class="num">×${fmt(mult(p), 2)}</em></div>
        ${diceRow(W.colors[f])}
        <div class="score num" data-score></div>
        <span class="delta" data-delta></span>
      </div>`;
    $('#dock').innerHTML = `<div class="panel glass combat" aria-label="Combate">
      <div class="prob" aria-label="Probabilidad de victoria: ${esc(W.names[r.attacker])} ${pct(r.prob)}, ${esc(W.names[r.defender])} ${pct(1 - r.prob)}">
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

  async round() {
    const W = this.w, view = this.view, prev = this.game;
    const {game, round:r} = playRound(W.graph, prev);
    const A = W.names[r.attacker], D = W.names[r.defender], P = W.names[r.target];
    const jit = (/** @type {string} */ k) => hash01(prev.seed + ':' + k + r.n);

    // 1. Ruleta de bandos
    this.phase('spin');
    this.banner(`Ronda <b>${r.n}</b>`);
    this.wheel.show(r.alive);
    await this.wait(reduced() ? 150 : 260);
    if (this.clock.speed < 5) sound('whoosh');
    await this.wheel.spin(r.attacker, this.T(2300), jit('w')); this.check();
    sound('lock'); haptic(10);
    this.banner(`<b>${esc(A)}</b> ataca`, `Ronda ${r.n}. Ataca ${A}.`);
    await this.wait(550);
    await this.wheel.hide(); this.check();

    // 2. Ruleta del mapa: el objetivo entre las provincias enemigas limítrofes
    this.phase('target');
    const terr = territory(prev, r.attacker);
    const front = new Set(r.targets);
    for (const t of r.targets) for (const q of W.graph.adj[t]) if (prev.owner[q] === r.attacker) front.add(q);
    view.focus([...terr, ...r.targets], [], this.T(380));
    await view.moveTo(view.frameOf([...front], 2.6), reduced() ? 0 : this.T(720)); this.check();
    if (r.targets.length > 1 && !reduced()) {
      view.cands = new Set(r.targets);
      await this.hop(r.targets, r.target, this.T(1350));
    } else { view.hop = r.target; await this.wait(380); }
    view.cands = new Set();
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
        def.querySelector('.sh .shield')?.classList.add('dead');
        this.banner(`<b>${esc(D)}</b> queda eliminado`, `${D} queda eliminado.`);
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
    this.game = game;
    view.setOwners(game.owner, game.alive.map(a => !a));
    this.saveNow();
    S.stats.rounds++;
    this.updateHud();
    if (game.winner >= 0) return;
    this.phase('overview');
    view.focus([], [], this.T(420));
    this.showRank();
    await view.moveTo(view.overview(), reduced() ? 0 : this.T(700)); this.check();
    await this.wait(180);
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

  /* ---------- Victoria ---------- */
  async victory() {
    const g = this.game, f = g.winner, W = this.w;
    this.phase('victory');
    S.stats.finished++;
    S.history.unshift({seed:g.seed, winner:f, rounds:g.round, at:Date.now()}); S.history = S.history.slice(0, 30);
    S.current = null; save();
    this.view.focus([], [], 400);
    await this.view.moveTo(this.view.overview(), reduced() ? 0 : 900);
    const v = $('#victory');
    v.hidden = false;
    v.style.setProperty('--c', W.colors[f]);
    v.innerHTML = `<div class="v-in">
      <div class="rays" style="--c:${W.colors[f]}">${shield(f, {title:'Escudo de ' + W.names[f]})}</div>
      <div class="v-kick">Victoria</div>
      <h2 class="v-title" id="vTitle">${esc(W.names[f])}</h2>
      <p class="v-sub">domina las 47 provincias de la península</p>
      <div class="v-stats glass">
        <div><b class="num">${g.round}</b><span>Rondas</span></div>
        <div><b class="num">${g.stats.conq[f]}</b><span>Conquistas</span></div>
        <div><b class="num">${g.stats.wins[f]}</b><span>Combates ganados</span></div>
        <div><b class="num">${g.power[f]}</b><span>Poder final</span></div>
      </div>
      <div class="v-btns">
        <button class="btn" id="vNew">${icon('dice')}Partida nueva</button>
        <div class="row2"><button class="btn sm ghost" id="vReplay">${icon('replay')}Repetir semilla</button><button class="btn sm ghost" id="vShare">${icon('share')}Compartir</button></div>
        <button class="btn sm ghost" id="vMenu">${icon('back')}Menú</button>
      </div></div>`;
    sound('victory'); haptic([40, 80, 40, 80, 120]);
    celebrate([W.colors[f], '#F2C94C', '#FFFFFF']);
    announce(`Victoria. ${W.names[f]} domina España tras ${g.round} rondas.`);
    $('#vNew').focus();
    const close = () => { v.hidden = true; v.innerHTML = ''; this.unmount(); };
    $('#vNew').onclick = () => { close(); this.hooks.onNew(); };
    $('#vReplay').onclick = () => { close(); this.hooks.onNew(g.seed); };
    $('#vShare').onclick = () => this.share();
    $('#vMenu').onclick = () => { close(); this.hooks.onExit(); };
  }
}

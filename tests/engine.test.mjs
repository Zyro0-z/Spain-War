// Reglas del motor: ruleta, conquista, poder, eliminación, empates, final con semilla fija y probabilidad exacta.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {graphOf, newGame, spin, attack, playRound, playOut, targetsOf, aliveFactions, counts, territory} from '../js/engine/game.js';
import {winProb, WAYS3D6, score} from '../js/engine/prob.js';
import {seedState, next, d6, int} from '../js/engine/rng.js';

const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));
const G = graphOf(map);
const idx = n => map.provinces.find(p => p.name === n).i;

test('el motor no usa DOM, reloj ni azar del sistema', () => {
  for (const f of ['game.js', 'prob.js', 'rng.js']) {
    const src = fs.readFileSync(new URL('../js/engine/' + f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /document|window\.|Date\.|performance\./, f);
    if (f !== 'rng.js') assert.doesNotMatch(src, /Math\.random/, f);
  }
});

test('generador con semilla: reproducible y uniforme', () => {
  const a = seedState('X'), b = seedState('X'), c = seedState('Y');
  const sa = Array.from({length:5}, () => next(a)), sb = Array.from({length:5}, () => next(b));
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, Array.from({length:5}, () => next(c)));
  const s = seedState('dados'), n = new Array(7).fill(0);
  for (let i = 0; i < 60000; i++) n[d6(s)]++;
  for (let v = 1; v <= 6; v++) assert.ok(Math.abs(n[v] / 60000 - 1 / 6) < .01, `cara ${v}`);
  assert.equal(n[0], 0);
});

test('partida nueva: un bando por provincia con poder 100', () => {
  const g = newGame(G, 'S');
  assert.equal(aliveFactions(g).length, 47);
  assert.ok(g.power.every(p => p === 100));
  assert.ok(g.owner.every((o, i) => o === i));
  assert.equal(g.winner, -1);
});

test('la ruleta elige un bando vivo y el objetivo es enemigo y limítrofe', () => {
  let g = newGame(G, 'R');
  for (let i = 0; i < 300; i++) {
    const {game, round:r} = playRound(G, g);
    assert.ok(g.alive[r.attacker], 'atacante vivo');
    assert.ok(r.alive.includes(r.attacker));
    assert.notEqual(g.owner[r.target], r.attacker);
    assert.equal(r.defender, g.owner[r.target]);
    assert.ok(r.from.length >= 1 && r.from.every(q => g.owner[q] === r.attacker && G.adj[q].includes(r.target)));
    g = game;
  }
});

test('objetivo no válido: lanza error', () => {
  const g = newGame(G, 'V'), {game} = spin(g);
  assert.throws(() => attack(G, game, idx('Madrid'), idx('Burgos')), /no válido/);
  assert.throws(() => attack(G, game, idx('Madrid'), idx('Madrid')), /no válido/);
});

/** Partida preparada a mano: el atacante con poder enorme gana siempre. */
function rigged(att, def, pa, pd) {
  const g = newGame(G, 'RIG');
  g.power[att] = pa; g.power[def] = pd;
  return g;
}

test('conquista: la provincia pasa al atacante y el poder cambia +3/−3', () => {
  const m = idx('Madrid'), t = idx('Toledo');
  const {game, round:r} = attack(G, rigged(m, t, 1000, 50), m, t);
  assert.equal(r.won, true);
  assert.equal(game.owner[t], m);
  assert.equal(game.power[m], 1003);
  assert.equal(game.power[t], 47);
  assert.equal(r.paAfter, 1003); assert.equal(r.pdAfter, 47);
  assert.equal(game.stats.conq[m], 1);
});

test('defensa: si gana el defensor no cambia el dueño', () => {
  const m = idx('Madrid'), t = idx('Toledo');
  const {game, round:r} = attack(G, rigged(m, t, 1, 1000), m, t);
  assert.equal(r.won, false);
  assert.equal(game.owner[t], t);
  assert.equal(game.power[t], 1003);
  assert.equal(game.power[m], 1, 'el poder nunca baja de 1');
});

test('poder mínimo 1 al perder', () => {
  const m = idx('Madrid'), t = idx('Toledo');
  const {game} = attack(G, rigged(m, t, 1000, 2), m, t);
  assert.equal(game.power[t], 1);
});

test('eliminación: un bando sin provincias queda fuera', () => {
  const m = idx('Madrid'), t = idx('Toledo');
  const {game, round:r} = attack(G, rigged(m, t, 1000, 100), m, t);
  assert.equal(r.eliminated, t);
  assert.equal(game.alive[t], false);
  assert.equal(territory(game, t).length, 0);
  assert.equal(aliveFactions(game).length, 46);
  // el poder del eliminado se queda donde estaba (pertenece al bando, no a la provincia)
  assert.equal(game.power[t], 97);
});

test('empate: se repite la tirada hasta que alguien gana', () => {
  let g = newGame(G, 'EMPATES'), found = 0, seed = 0;
  for (let i = 0; i < 20000 && found < 8; i++) {
    if (g.winner >= 0) g = newGame(G, 'EMPATES' + ++seed);
    const {game, round:r} = playRound(G, g);
    const sc = ({a, d}) => [a.reduce((x, y) => x + y) * r.pa, d.reduce((x, y) => x + y) * r.pd];
    r.rolls.slice(0, -1).forEach(roll => { const [x, y] = sc(roll); assert.equal(x, y, 'las tiradas repetidas eran empate'); });
    const [x, y] = sc(r.rolls[r.rolls.length - 1]);
    assert.notEqual(x, y);
    assert.equal(r.won, x > y);
    if (r.rolls.length > 1) found++;
    g = game;
  }
  assert.ok(found >= 8, `hubo empates (${found})`);
});

test('final: queda un bando con las 47 provincias; la semilla lo reproduce', () => {
  const a = playOut(G, newGame(G, 'FINAL')), b = playOut(G, newGame(G, 'FINAL'));
  assert.ok(a.game.winner >= 0);
  assert.deepEqual(aliveFactions(a.game), [a.game.winner]);
  assert.ok(a.game.owner.every(o => o === a.game.winner));
  assert.equal(a.rounds.length, a.game.round);
  assert.equal(b.game.winner, a.game.winner);
  assert.equal(b.game.round, a.game.round);
  assert.deepEqual(b.rounds.map(r => r.target), a.rounds.map(r => r.target));
  // valores fijos: si cambian, una partida compartida ya no se repetiría igual
  assert.equal(map.provinces[a.game.winner].name, 'Granada');
  assert.equal(a.game.round, 548);
  const c = playOut(G, newGame(G, 'OTRA'));
  assert.ok(c.game.round !== a.game.round || c.game.winner !== a.game.winner);
});

test('invariantes en toda la partida', () => {
  let g = newGame(G, 'INV');
  while (g.winner < 0) {
    const {game, round:r} = playRound(G, g);
    assert.ok(game.power.every(p => p >= 1));
    const c = counts(game);
    assert.equal(c.reduce((a, b) => a + b, 0), 47);
    game.alive.forEach((al, f) => assert.equal(al, c[f] > 0));
    assert.ok(targetsOf(G, game, aliveFactions(game)[0]).length > 0 || game.winner >= 0);
    assert.ok(r.prob > 0 && r.prob < 1 || r.pa !== r.pd);
    g = game;
  }
});

test('probabilidad exacta: convolución de 3d6 con los poderes', () => {
  assert.equal(WAYS3D6.reduce((a, b) => a + b, 0), 216);
  assert.deepEqual(WAYS3D6.slice(3), [1, 3, 6, 10, 15, 21, 25, 27, 27, 25, 21, 15, 10, 6, 3, 1]);
  const even = winProb(100, 100);
  assert.equal(even.p, .5);
  assert.equal(even.win + even.lose + even.tie, 46656);
  // fuerza bruta sobre las 6^6 tiradas
  for (const [pa, pd] of [[100, 100], [103, 97], [118, 76], [1, 250], [64, 64]]) {
    let w = 0, l = 0, t = 0;
    for (let k = 0; k < 46656; k++) {
      let x = k; const r = [];
      for (let j = 0; j < 6; j++) { r.push(x % 6 + 1); x = Math.floor(x / 6); }
      const a = (r[0] + r[1] + r[2]) * pa, d = (r[3] + r[4] + r[5]) * pd;
      if (a > d) w++; else if (a < d) l++; else t++;
    }
    const e = winProb(pa, pd);
    assert.deepEqual([e.win, e.lose, e.tie], [w, l, t], `${pa} contra ${pd}`);
    assert.ok(Math.abs(e.p + winProb(pd, pa).p - 1) < 1e-12);
  }
  assert.ok(winProb(110, 100).p > .5 && winProb(110, 100).p < winProb(130, 100).p);
  assert.equal(score(12, 103), 12.36);
});

test('probabilidad exacta frente al motor: 20.000 combates', () => {
  const pa = 112, pd = 97, s = seedState('mc');
  let wins = 0, n = 20000;
  for (let i = 0; i < n; i++) {
    for (;;) {
      const a = d6(s) + d6(s) + d6(s), d = d6(s) + d6(s) + d6(s);
      if (a * pa !== d * pd) { if (a * pa > d * pd) wins++; break; }
    }
  }
  assert.ok(Math.abs(wins / n - winProb(pa, pd).p) < .012, `${wins / n} frente a ${winProb(pa, pd).p}`);
  assert.equal(int(seedState('a'), 1), 0);
});

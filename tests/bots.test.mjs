// Bots: objetivos válidos, deterministas, y cada nivel juega mejor que el anterior.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {graphOf, newGame, spin, targetsOf, attack, counts} from '../js/engine/game.js';
import {bot, bestTarget, score, LEVELS, level} from '../js/engine/bots.js';
import {winProb} from '../js/engine/prob.js';
import {seedState} from '../js/engine/rng.js';

const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));
const G = graphOf(map);

test('niveles', () => {
  assert.deepEqual(Object.keys(LEVELS), ['recluta', 'estratega', 'mariscal']);
  assert.equal(level('nada'), 'estratega');
});

test('siempre eligen una provincia enemiga limítrofe y son deterministas', () => {
  for (const lv of ['recluta', 'estratega', 'mariscal']) {
    let g = newGame(G, 'BOT' + lv);
    const b = bot(lv, G);
    for (let i = 0; i < 400 && g.winner < 0; i++) {
      const sp = spin(g), ts = targetsOf(G, sp.game, sp.attacker);
      const a = structuredClone(sp.game.rng), t = b(sp.game, sp.attacker, ts, sp.game.rng);
      assert.ok(ts.includes(t), `${lv}: objetivo válido`);
      assert.equal(b(sp.game, sp.attacker, ts, a), t, `${lv}: mismo estado, misma elección`);
      g = attack(G, sp.game, sp.attacker, t, sp.alive).game;
    }
  }
});

test('mejor objetivo y Estratega: máxima probabilidad', () => {
  let g = newGame(G, 'MEJOR');
  for (let i = 0; i < 150; i++) g = attack(G, spin(g).game, spin(g).attacker, targetsOf(G, spin(g).game, spin(g).attacker)[0], spin(g).alive).game;
  const sp = spin(g), ts = targetsOf(G, sp.game, sp.attacker);
  const ps = ts.map(t => winProb(sp.game.power[sp.attacker], sp.game.power[sp.game.owner[t]]).p);
  assert.equal(ps[ts.indexOf(bestTarget(sp.game, sp.attacker, ts))], Math.max(...ps));
});

test('Mariscal remata a un bando con una sola provincia si puede ganar', () => {
  const g = newGame(G, 'REMATE'), me = map.provinces.find(p => p.name === 'Madrid').i;
  const ts = targetsOf(G, g, me); // al empezar todos tienen 1 provincia y poder 100
  g.power[ts[2]] = 60; // uno débil
  const c = counts(g);
  const best = ts.reduce((a, t) => score('mariscal', G, g, me, t, c) > score('mariscal', G, g, me, a, c) ? t : a);
  assert.equal(best, ts[2]);
  assert.equal(bot('mariscal', G)(g, me, ts, seedState('x')), ts[2]);
});

/** Partidas con bandos de dos niveles mezclados: victorias de cada uno. */
function duel(a, b, n) {
  const w = {[a]:0, [b]:0};
  for (let s = 0; s < n; s++) {
    let g = newGame(G, `D${a}${b}${s}`);
    const lv = Array.from({length:47}, (_, i) => (i + s) % 2 ? a : b), ch = {[a]:bot(a, G), [b]:bot(b, G)};
    while (g.winner < 0) { const sp = spin(g); g = attack(G, sp.game, sp.attacker, ch[lv[sp.attacker]](sp.game, sp.attacker, targetsOf(G, sp.game, sp.attacker), sp.game.rng), sp.alive).game; }
    w[lv[g.winner]]++;
  }
  return w;
}
test('Estratega y Mariscal ganan a Recluta (300 partidas cada uno)', () => {
  const a = duel('estratega', 'recluta', 300), b = duel('mariscal', 'recluta', 300);
  assert.ok(a.estratega > a.recluta * 1.2, JSON.stringify(a));
  assert.ok(b.mariscal > b.recluta * 1.2, JSON.stringify(b));
});

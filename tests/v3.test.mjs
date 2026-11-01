// Motor v3: edificios por niveles, tipos de tropa, tácticas, asedios, impuestos, mantenimiento, decisiones y migración.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../js/conquest/engine.js';
import {endTurn, cleanAction} from '../js/conquest/turn.js';
import {scenario} from '../js/conquest/scenarios.js';

const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));
const geo = E.geoOf(map);
const colors = map.provinces.map(() => '#888888');
const P = n => map.provinces.find(p => p.name === n).i;
const game = (o = {}) => E.createGame(geo, scenario(map, 'las47', colors), {seed:o.seed || 'V3', humans:[P('Madrid')], rules:{difficulty:'facil', events:false, ...(o.rules || {})}});
const act = (g, a) => E.apply(geo, g, a).g;
const troops = (g, p, v) => { g.P.u[p] = [...v]; g.P.troops[p] = v[0] + v[1] + v[2] + v[3]; g.P.ready[p] = g.P.troops[p]; };
const M = P('Madrid'), TO = P('Toledo'), VA = P('Valencia');

test('las tablas de reglas no usan azar del sistema ni el DOM', () => {
  const src = fs.readFileSync(new URL('../js/conquest/rules.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /Math\.random|Date\.|document\.|window\./);
});

test('edificios: niveles, huecos, costa, montaña y era', () => {
  let g = game(); const f = M; g.F.gold[f] = 1000;
  g = act(g, {type:'build', f, p:M, b:'granja'});
  g = act(g, {type:'build', f, p:M, b:'granja'});
  assert.equal(E.lvl(g, M, 'granja'), 2, 'mejorar sube de nivel');
  assert.equal(E.buildingsAt(g, M).length, 1, 'mejorar no ocupa hueco nuevo');
  assert.throws(() => act(g, {type:'build', f, p:M, b:'puerto'}), /costa/);
  assert.throws(() => act(g, {type:'build', f, p:M, b:'universidad'}), /Renacimiento/);
  const n = E.slots(geo, g, M);
  for (const b of ['mercado', 'cuartel', 'fortaleza', 'catedral', 'torre', 'caminos', 'muralla'].slice(0, n - 1)) g = act(g, {type:'build', f, p:M, b});
  assert.equal(E.buildingsAt(g, M).length, n);
  assert.throws(() => act(g, {type:'build', f, p:M, b:'caminos'}), /huecos/);
});

test('tropas: precio por tipo, artillería con el Renacimiento y tope de guarnición', () => {
  let g = game(); g.F.gold[M] = 1000;
  const before = g.F.gold[M];
  g = act(g, {type:'recruit', f:M, p:M, n:2, t:E.CAB});
  assert.equal(before - g.F.gold[M], 2 * E.unitCost(geo, g, M, M, E.CAB));
  assert.equal(g.P.u[M][E.CAB], 2);
  assert.equal(g.P.troops[M], g.P.u[M].reduce((a, b) => a + b, 0));
  assert.throws(() => act(g, {type:'recruit', f:M, p:M, n:1, t:E.ART}), /Renacimiento/);
  troops(g, M, [2 * E.cap(geo, g, M), 0, 0, 0]);
  assert.throws(() => act(g, {type:'recruit', f:M, p:M, n:1, t:E.INF}), /Caben/);
});

test('mantenimiento: la guarnición es gratis y el exceso cuesta oro', () => {
  const g = game();
  troops(g, M, [E.freeGarrison(geo.tier[M]), 0, 0, 0]);
  assert.equal(E.upkeepOf(g, M, geo), 0);
  troops(g, M, [E.freeGarrison(geo.tier[M]) + 4 * E.UPKEEP_PER, 0, 0, 0]);
  assert.equal(E.upkeepOf(g, M, geo), 4);
  assert.equal(E.treasury(geo, g, M).upkeep, 4);
});

test('tácticas: la postura que la contrarresta baja la probabilidad', () => {
  const g = game(); troops(g, M, [12, 0, 0, 0]);
  const v = [11, 0, 0, 0];
  const plain = E.battleOdds(geo, g, M, M, TO, v, {tac:0}).p;
  g.P.stance[TO] = E.TACTICS[0].counter;
  const countered = E.battleOdds(geo, g, M, M, TO, v, {tac:0}).p;
  assert.ok(countered < plain, `${countered} < ${plain}`);
});

test('caballería pesa más en llanura que en montaña', () => {
  assert.ok(E.unitAttack(E.CAB, 'l', false) > E.unitAttack(E.CAB, 'm', false));
  assert.ok(E.unitAttack(E.ART, 'l', true) > E.unitAttack(E.ART, 'l', false));
  assert.equal(E.unitAttack(E.MIL, 'l', false), 0, 'la milicia no ataca');
});

test('asedio: solo contra murallas y en guerra; la brecha crece cada turno', () => {
  let g = game(); g.P.bld[TO] = {muralla:1}; troops(g, M, [30, 0, 0, 0]);
  assert.throws(() => act(g, {type:'siege', f:M, from:M, to:TO}), /guerra/);
  g = act(g, {type:'diplo', f:M, d:TO, kind:'guerra'});
  g = act(g, {type:'siege', f:M, from:M, to:TO});
  assert.equal(g.sieges.length, 1);
  g = endTurn(geo, g).g;
  const s = g.sieges.find(x => x.f === M && x.p === TO);
  if (g.P.owner[TO] === TO) assert.ok(s && s.breach > 0, 'la brecha avanza');
});

test('impuestos: altos dan más oro y quitan lealtad', () => {
  const g0 = game(); g0.P.loyal[M] = 60;
  const g = act(g0, {type:'tax', f:M, p:M, lvl:2});
  const sup = E.supplied(geo, g0, M);
  assert.ok(E.provinceIncome(geo, g, M, sup) > E.provinceIncome(geo, g0, M, sup));
  assert.ok(endTurn(geo, g).g.P.loyal[M] < endTurn(geo, g0).g.P.loyal[M]);
});

test('decisiones: se aplica la opción elegida y desaparece', () => {
  let g = game();
  g.decisions.push({id:1, f:M, kind:'cosecha', p:M, until:g.turn + 1});
  const gold = g.F.gold[M];
  g = act(g, {type:'decide', f:M, id:1, opt:0});
  assert.equal(g.F.gold[M], gold + 40);
  assert.equal(g.decisions.length, 0);
});

test('maravilla: una por sitio y suma a la puntuación', () => {
  let g = game();
  const site = geo.wonderSite.findIndex(w => w === 'acueducto');
  assert.ok(site >= 0);
  const f = g.P.owner[site]; g.F.gold[f] = 500; g.humans = [f];
  const s0 = E.score(g, f);
  g = act(g, {type:'wonder', f, p:site});
  assert.ok(E.hasWonder(g, f, 'acueducto'));
  assert.ok(E.score(g, f) > s0);
  assert.throws(() => act(g, {type:'wonder', f, p:site}), /maravilla/);
});

test('diplomacia v3: embargo, vasallaje rechazado al débil', () => {
  let g = game();
  g = act(g, {type:'diplo', f:M, d:TO, kind:'embargo'});
  assert.ok(g.embargo.some(e => (e.a === M && e.b === TO) || (e.a === TO && e.b === M) || (Array.isArray(e) && e.includes(M) && e.includes(TO))));
  assert.equal(E.wouldAccept(geo, g, M, TO, 'vasallaje').ok, false);
});

test('flota: astillero en Valencia con el Renacimiento', () => {
  let g = E.createGame(geo, scenario(map, 'las47', colors), {seed:'F', humans:[VA], rules:{difficulty:'facil', events:false}});
  g.F.gold[VA] = 1000; g.F.know[VA] = ['calzadas', 'herreria', 'cancilleria', 'correos', 'gremios'];
  assert.equal(E.era(g, VA), 1);
  g = act(g, {type:'build', f:VA, p:VA, b:'astillero'});
  g = act(g, {type:'ships', f:VA, p:VA, n:2});
  assert.equal(g.F.ships[VA], 2);
  assert.throws(() => act(g, {type:'ships', f:VA, p:VA, n:1}), /trabajado/);
});

test('migración: una partida v2 pasa a v4 sin perder tropas ni edificios', () => {
  const g = game();
  const v2 = JSON.parse(JSON.stringify(g));
  v2.v = 2; v2.P.bld = v2.P.bld.map((b, p) => p === M ? 'cuartel' : '');
  for (const k of ['u', 'tax', 'stance', 'assim', 'wonder', 'cult']) delete v2.P[k];
  for (const k of ['weary', 'ships', 'lord', 'cult', 'min', 'know', 'rp']) delete v2.F[k];
  v2.F.tech[M] = [1, 2, 0, 0];
  for (const k of ['sieges', 'decisions', 'decSeq', 'missions', 'weds', 'embargo']) delete v2[k];
  const up = E.upgradeGame(geo, v2);
  assert.equal(up.v, 4);
  assert.deepEqual(up.F.know[M].sort(), ['calzadas', 'herreria', 'polvora'], 'los niveles pasan a saberes');
  assert.equal(E.lvl(up, M, 'cuartel'), 1);
  assert.deepEqual(up.P.u[M], [g.P.troops[M], 0, 0, 0]);
  assert.ok(up.F.min[M].guerra.name);
  assert.doesNotThrow(() => endTurn(geo, up));
});

test('red: cleanAction conserva tipos de tropa, táctica y desembarco', () => {
  const a = cleanAction({type:'naval', from:1, to:2, u:[3, '2', 0, -1], tac:2, x:[4, 5], q:7, evil:'x', b:{}}, 3);
  assert.deepEqual(a, {type:'naval', f:3, from:1, to:2, q:7, tac:2, x:[4, 5], u:[3, 2, 0, 0]});
});

test('saberes: requisitos, era, saber acumulado y oro', () => {
  let g = game();
  assert.equal(E.saberOpen(g, M, 'estribo').ok, false, 'el estribo pide herrería');
  assert.equal(E.saberOpen(g, M, 'polvora').ok, false, 'la pólvora pide herrería y el Renacimiento');
  g.F.rp[M] = 100; g.F.gold[M] = 0;
  g = act(g, {type:'research', f:M, k:'herreria'});
  assert.ok(E.knows(g, M, 'herreria'));
  assert.equal(g.F.rp[M], 100 - E.saberCost(g, M, 'herreria'), 'se paga con saber si llega');
  assert.throws(() => act(g, {type:'research', f:M, k:'herreria'}), /Ya lo conoces/);
  g.F.rp[M] = 0;
  assert.throws(() => act(g, {type:'research', f:M, k:'estribo'}), /oro/);
  for (const k of ['calzadas', 'cancilleria', 'correos', 'gremios']) { g.F.rp[M] = 99; g = act(g, {type:'research', f:M, k}); }
  assert.equal(E.era(g, M), 1, 'cinco saberes: Renacimiento');
  assert.ok(E.saberOpen(g, M, 'polvora').ok);
  const before = E.saberGain(geo, g, M);
  g.F.rp[M] = 999; g = act(g, {type:'research', f:M, k:'imprenta'});
  assert.equal(E.saberGain(geo, g, M), before + 3, 'la imprenta da saber');
  const r = endTurn(geo, g).g;
  assert.equal(r.F.rp[M], g.F.rp[M] + E.saberGain(geo, g, M), 'cada turno se suma el saber');
});

test('informe: el desglose suma lo mismo que el motor', () => {
  const g = game(); g.P.bld[M] = {mercado:2, granja:1, fortaleza:1}; g.P.tax[M] = 2;
  const sup = E.supplied(geo, g, M);
  assert.equal(E.incomeParts(geo, g, M, sup).total, E.provinceIncome(geo, g, M, sup));
  assert.ok(E.incomeParts(geo, g, M, sup).lines.some(([n]) => n === 'Mercado'));
  assert.equal(E.growthParts(geo, g, M, sup).total, E.growth(geo, g, M, sup));
  assert.equal(E.defenseParts(geo, g, M).total, E.defenseMul(geo, g, M));
  assert.ok(E.loyaltyParts(geo, g, M).lines.some(([n]) => n.startsWith('Impuestos')));
});

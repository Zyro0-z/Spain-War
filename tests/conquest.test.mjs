// Modo conquista: órdenes, combate con tropas, diplomacia, fin de turno, IA por dificultad y determinismo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../js/conquest/engine.js';
import {endTurn} from '../js/conquest/turn.js';
import {scenario} from '../js/conquest/scenarios.js';
import {winProb} from '../js/engine/prob.js';
import {tier} from '../js/conquest/data.js';

const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));
const geo = E.geoOf(map);
const colors = map.provinces.map(() => '#888888');
const P = n => map.provinces.find(p => p.name === n).i;
const game = (o = {}) => E.createGame(geo, scenario(map, o.sc || 'las47', colors), {seed:o.seed || 'T', humans:o.humans ?? [P('Madrid')], rules:{difficulty:o.diff || 'facil', events:false, ...(o.rules || {})}});
const act = (g, a) => E.apply(geo, g, a).g;
/** Pone n tropas de infantería en una provincia (y listas). */
const troops = (g, p, n) => { g.P.u[p] = [n, 0, 0, 0]; g.P.troops[p] = n; g.P.ready[p] = n; };

test('el motor no usa DOM, azar del sistema ni funciones que cambian entre navegadores', () => {
  for (const f of ['engine.js', 'turn.js', 'scenarios.js', 'data.js']) {
    const src = fs.readFileSync(new URL('../js/conquest/' + f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /Math\.(random|pow|log|exp|sqrt|sin|cos|atan|hypot)|Date\.|document\.|window\./, f);
  }
});

test('partida nueva: un bando por provincia, tropas, oro y paz en fácil', () => {
  const g = game();
  assert.equal(E.nFactions(g), 47);
  assert.equal(g.P.troops[P('Madrid')], 10);
  assert.equal(g.F.gold[0], 20);
  assert.ok(g.st.every((row, i) => row.every((s, j) => i === j || i === 47 || j === 47 || s === E.PEACE)));
  assert.equal(E.generalsOf(g, P('Madrid')).length, 1, 'el humano empieza con un general');
  assert.equal(tier('28'), 6);
});

test('escenarios: comunidades y reinos cubren las 47 provincias', () => {
  for (const id of ['comunidades', 'reinos']) {
    const sc = scenario(map, id, colors), all = sc.factions.flatMap(f => f.provinces).sort((a, b) => a - b);
    assert.deepEqual(all, map.provinces.map(p => p.i), id);
    for (const f of sc.factions) assert.ok(f.provinces.includes(f.capital), `${id}: capital de ${f.name}`);
  }
});

test('mover: solo a provincias propias alcanzables y dejando 1', () => {
  let g = game({sc:'comunidades', humans:[5]}); // Castilla y León
  const from = P('Valladolid'), to = P('Burgos');
  assert.ok(E.reachable(geo, g, 5, from).includes(to));
  assert.ok(!E.reachable(geo, g, 5, from).includes(P('Madrid')));
  assert.throws(() => act(g, {type:'move', f:5, from, to, n:g.P.troops[from]}), /al menos 1/);
  const n = g.P.troops[from] - 1;
  g = act(g, {type:'move', f:5, from, to, n});
  assert.equal(g.P.troops[from], 1);
  assert.equal(g.P.ready[to], g.P.troops[to] - n, 'las que llegan no actúan este turno');
});

test('atacar: probabilidad exacta, conquista, guerra declarada y moral', () => {
  let g = game();
  const me = P('Madrid'), to = P('Segovia');
  troops(g, me, 60);
  const o = E.odds(geo, g, me, me, to, 50);
  assert.equal(o.p, winProb(o.SA, o.SD).p);
  g = act(g, {type:'attack', f:me, from:me, to, n:50});
  const ev = g.log.find(e => e.t === 'attack');
  assert.equal(g.st[me][to], E.WAR, 'atacar declara la guerra');
  if (ev.won) {
    assert.equal(g.P.owner[to], me);
    assert.equal(g.P.loyal[to], 25);
    assert.equal(g.P.troops[to], 50 - ev.attLoss);
    assert.equal(g.F.morale[me], 103);
    assert.ok(ev.capital && ev.elim, 'Segovia era capital y su única provincia');
    assert.equal(g.F.alive[to], false);
  }
  assert.throws(() => act(g, {type:'attack', f:me, from:me, to:P('Barcelona'), n:2}), /limítrofe/);
});

test('combate: con mucha ventaja casi siempre se gana y las pérdidas son razonables', () => {
  let wins = 0;
  for (let i = 0; i < 40; i++) {
    let g = game({seed:'C' + i});
    const me = P('Madrid'), to = P('Toledo');
    troops(g, me, 80);
    g = act(g, {type:'attack', f:me, from:me, to, n:70});
    const ev = g.log.find(e => e.t === 'attack');
    if (ev.won) { wins++; assert.ok(ev.attLoss < 70); }
    else assert.ok(ev.attLoss >= 35, 'si pierde el atacante, pierde al menos la mitad');
  }
  assert.ok(wins >= 36, `${wins}/40`);
});

test('reclutar, construir, mejorar y contratar cuestan oro', () => {
  let g = game();
  const me = P('Madrid');
  g.F.gold[me] = 500;
  const price = E.unitCost(geo, g, me, me, E.INF);
  g = act(g, {type:'recruit', f:me, p:me, n:10});
  assert.equal(g.F.gold[me], 500 - 10 * price);
  const gold0 = g.F.gold[me], c1 = E.buildCost(geo, g, me, me, 'cuartel');
  g = act(g, {type:'build', f:me, p:me, b:'cuartel'});
  assert.equal(E.lvl(g, me, 'cuartel'), 1);
  assert.equal(g.F.gold[me], gold0 - c1);
  assert.ok(E.buildCost(geo, g, me, me, 'cuartel') > c1, 'subir de nivel cuesta más');
  assert.throws(() => act(g, {type:'build', f:P('Barcelona'), p:P('Barcelona'), b:'puerto'}), /oro/, 'Barcelona tiene costa pero no oro');
  const gold1 = g.F.gold[me], sg = E.saberGold(g, me, 'herreria');
  g = act(g, {type:'research', f:me, k:'herreria'});
  assert.equal(g.F.gold[me], gold1 - sg, 'lo que falta de saber se paga con oro');
  assert.deepEqual(g.F.tech[me], [0, 1, 0, 0]);
  assert.equal(E.attackMul(geo, g, me, me, P('Toledo')) - E.attackMul(geo, game(), me, me, P('Toledo')), 10, 'herrería +10 %');
  assert.equal(E.attackMul(geo, g, me, me, P('Toledo'), false) + 15, E.attackMul(geo, g, me, me, P('Toledo')), 'el general de asedio +15 %');
  assert.throws(() => act(g, {type:'hire', f:me, p:me, skill:'defensa'}), /Ya hay un general/);
  g.P.owner[P('Toledo')] = me;
  g = act(g, {type:'hire', f:me, p:P('Toledo'), skill:'defensa'});
  assert.equal(E.generalsOf(g, me).length, 2);
  assert.throws(() => act(game(), {type:'build', f:me, p:me, b:'puerto'}), /costa/);
});

test('diplomacia: aceptan o rechazan según las reglas y la anexión entrega las provincias', () => {
  let g = game({sc:'comunidades', humans:[10]}); // Madrid
  const me = 10, cl = 5;
  assert.equal(E.wouldAccept(geo, g, me, cl, 'pacto').ok, true);
  g = act(g, {type:'diplo', f:me, d:cl, kind:'pacto'});
  assert.equal(g.st[me][cl], E.PACT);
  // romper el pacto es traición
  g = act(g, {type:'diplo', f:me, d:cl, kind:'guerra'});
  assert.equal(g.st[me][cl], E.WAR);
  assert.equal(g.stats.betrayals[me], 1);
  assert.ok(g.rel[me][3] <= -40, 'los demás desconfían');
  // anexión de un bando pequeño y amigo
  let h = game({sc:'comunidades', humans:[5]});
  h.rel[5][3] = h.rel[3][5] = 80; // Cantabria
  for (const p of E.provincesOf(h, 5)) troops(h, p, 60);
  assert.equal(E.wouldAccept(geo, h, 5, 3, 'anexion').ok, true);
  h = act(h, {type:'diplo', f:5, d:3, kind:'anexion'});
  assert.equal(h.P.owner[P('Cantabria')], 5);
  assert.equal(h.F.alive[3], false);
});

test('fin de turno: oro, crecimiento con tope y tropas listas', () => {
  const g0 = game();
  const me = P('Madrid');
  const {g} = endTurn(geo, g0);
  assert.equal(g.turn, 2);
  assert.equal(g.F.gold[me], Math.max(0, 20 + E.treasury(geo, g0, me).total));
  assert.equal(g.P.troops[me], 10 + E.growth(geo, g0, me, E.supplied(geo, g0, me)));
  assert.deepEqual(g.P.ready, g.P.troops);
  let x = g0; for (let i = 0; i < 80; i++) x = endTurn(geo, x).g;
  assert.ok(x.P.troops[P('Soria')] <= E.cap(geo, x, P('Soria')));
});

test('fácil: los bots no se atacan entre sí; el que atacas entra en guerra contigo', () => {
  let g = game();
  for (let i = 0; i < 20; i++) g = endTurn(geo, g).g;
  assert.ok(g.F.alive.slice(0, 47).every(Boolean), 'nadie ha caído');
  const me = P('Madrid'), t = P('Toledo');
  troops(g, me, 25);
  g = act(g, {type:'attack', f:me, from:me, to:t, n:3});
  assert.equal(g.st[me][t], E.WAR);
  assert.equal(g.st[P('Cuenca')][t], E.PEACE, 'los demás siguen en paz');
});

test('normal y difícil: hay guerras entre bots y alguien gana', () => {
  for (const diff of ['normal', 'dificil']) {
    let g = game({sc:'comunidades', humans:[], diff});
    while (!g.over && g.turn < 400) g = endTurn(geo, g).g;
    assert.ok(g.over && g.winner >= 0, `${diff}: termina (${g.turn} turnos)`);
  }
});

test('determinista: misma semilla y mismas órdenes, misma partida', () => {
  const run = () => {
    let g = game({diff:'normal', seed:'DET'});
    const me = P('Madrid');
    g = act(g, {type:'attack', f:me, from:me, to:P('Toledo'), n:9});
    for (let i = 0; i < 30; i++) g = endTurn(geo, g).g;
    return E.hash(g);
  };
  assert.equal(run(), run());
  assert.notEqual(run(), E.hash(game({diff:'normal', seed:'OTRA'})));
});

test('suministro: una provincia aislada de la capital rinde la mitad', () => {
  let g = game({sc:'comunidades', humans:[5]});
  const cut = P('León');
  g.P.owner[P('Valladolid')] = 10; g.P.owner[P('Palencia')] = 10; g.P.owner[P('Zamora')] = 10; // la capital queda separada de León
  g.F.capital[5] = P('Burgos');
  const sup = E.supplied(geo, g, 5);
  assert.equal(sup[cut], false);
  assert.equal(E.provinceIncome(geo, g, cut, sup), Math.floor(E.provinceIncome(geo, g, cut, sup.map(() => true)) / 2));
});

test('rebeliones: provincia poco leal y sin tropas puede rebelarse', () => {
  let rebelled = false;
  for (let s = 0; s < 30 && !rebelled; s++) {
    let g = game({seed:'REB' + s});
    const me = P('Madrid'), t = P('Toledo');
    g.P.owner[t] = me; troops(g, t, 1); g.P.loyal[t] = 0; g.P.origin[t] = t; g.F.alive[t] = true; g.F.capital[t] = -1;
    g.P.owner[P('Cuenca')] = me;
    g = endTurn(geo, g).g;
    if (g.P.owner[t] !== me) rebelled = true;
  }
  assert.ok(rebelled);
});

test('victoria por capitales: cuentan las capitales originales aunque el bando caiga', () => {
  let g = E.createGame(geo, scenario(map, 'comunidades', colors), {seed:'CAP', humans:[10], rules:{difficulty:'facil', events:false, victory:{type:'capitales', n:2}}});
  const tol = P('Toledo'), me = 10;
  // Madrid conquista la capital de Castilla-La Mancha
  troops(g, P('Madrid'), 200);
  for (let i = 0; i < 10 && g.P.owner[tol] !== me; i++) g = act(g, {type:'attack', f:me, from:P('Madrid'), to:tol, n:Math.min(g.P.ready[P('Madrid')], g.P.troops[P('Madrid')] - 1)});
  assert.equal(g.P.owner[tol], me);
  assert.equal(g.over, true, 'Madrid + Toledo = 2 capitales');
  assert.equal(g.winner, me);
});

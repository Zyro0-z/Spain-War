// Etapa 3: Portugal, mapas parciales, bando propio, crónica, logros, campaña y desafío diario.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../js/conquest/engine.js';
import {endTurn} from '../js/conquest/turn.js';
import {scenario, withPortugal, SCENARIOS} from '../js/conquest/scenarios.js';
import {medalsFor, MEDALS} from '../js/conquest/medals.js';
import {MISSIONS, daily, starsFor, unlocked} from '../js/conquest/campaign.js';
import {flagSVG, cleanFlag, LAYOUTS, SYMBOLS, bannerColor} from '../js/flagmaker.js';

const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));
const map48 = withPortugal(map);
const colors = map.provinces.map(() => '#888888');
const P = n => map.provinces.find(p => p.name === n).i;

test('Portugal: provincia 47 con fronteras simétricas y sin tocar las 47 originales', () => {
  assert.equal(map.provinces.length, 47);
  assert.equal(map48.provinces.length, 48);
  const pt = map48.provinces[47];
  assert.equal(pt.name, 'Portugal');
  assert.deepEqual(pt.adj.map(i => map.provinces[i].name).sort(), ['Badajoz', 'Cáceres', 'Huelva', 'Ourense', 'Pontevedra', 'Salamanca', 'Zamora']);
  for (const p of map48.provinces) for (const q of p.adj) {
    assert.ok(map48.provinces[q].adj.includes(p.i), `${p.name}–${map48.provinces[q].name}`);
    assert.ok(map48.borders[`${Math.min(p.i, q)}-${Math.max(p.i, q)}`], `frontera ${p.name}–${map48.provinces[q].name}`);
  }
  assert.ok(map.provinces.every(p => !p.adj.includes(47)), 'el mapa normal no conoce Portugal');
});

test('península: 15 comunidades y Portugal, todas las provincias en juego', () => {
  const sc = scenario(map48, 'peninsula', colors);
  assert.equal(sc.factions.length, 16);
  const all = sc.factions.flatMap(f => f.provinces).sort((a, b) => a - b);
  assert.deepEqual(all, Array.from({length:48}, (_, i) => i));
  const g = E.createGame(E.geoOf(map48), sc, {seed:'P', humans:[15], rules:{difficulty:'normal'}});
  assert.equal(g.F.name[15], 'Portugal');
  assert.ok(g.F.banner[15], 'Portugal lleva su bandera dibujada');
  assert.equal(g.P.owner[47], 15);
});

test('mapas parciales: solo juegan tu provincia o región y sus vecinas', () => {
  const v = scenario(map, 'vecinas', colors, P('Soria'));
  assert.equal(v.factions[0].name, 'Soria');
  assert.equal(v.factions.length, 1 + map.provinces[P('Soria')].adj.length);
  const r = scenario(map, 'region', colors, P('Zaragoza'));
  assert.equal(r.factions[0].name, 'Aragón');
  assert.ok(r.factions.some(f => f.name === 'Cataluña') && !r.factions.some(f => f.name === 'Galicia'));
  const geo = E.geoOf(map);
  let g = E.createGame(geo, r, {seed:'R', humans:[0], rules:{difficulty:'dificil', events:false}});
  const active = new Set(r.factions.flatMap(f => f.provinces));
  assert.ok(g.P.owner.every((o, p) => active.has(p) ? o >= 0 : o === -1 && !g.P.active[p]));
  for (let i = 0; i < 40 && !g.over; i++) g = endTurn(geo, g).g;
  assert.ok(g.P.owner.every((o, p) => active.has(p) || o === -1), 'nadie entra en las provincias fuera de juego');
});

test('reglas a medida y líder: tropas iniciales, oro y rasgo', () => {
  const geo = E.geoOf(map), sc = scenario(map, 'las47', colors);
  const g = E.createGame(geo, sc, {seed:'X', humans:[P('Madrid')], traits:{[P('Madrid')]:'mercader'}, rules:{difficulty:'facil', startTroops:3, incomeMul:150}});
  assert.equal(g.P.troops[P('Soria')], 3 + 4, 'capital: +4');
  assert.equal(g.F.trait[P('Madrid')], 'mercader');
  const base = E.createGame(geo, sc, {seed:'X', humans:[P('Madrid')], traits:{[P('Madrid')]:'mercader'}, rules:{difficulty:'facil'}});
  assert.ok(E.income(geo, g, P('Madrid')) > E.income(geo, base, P('Madrid')));
});

test('bando propio: la bandera se valida y genera SVG', () => {
  const f = cleanFlag({layout:'cruz', c:['#123456', 'nope', '#FFFFFF'], sym:'castillo', sc:'#F1BF00'});
  assert.equal(f.layout, 'cruz'); assert.equal(f.c[1], '#F1BF00'); assert.equal(f.sym, 'castillo');
  assert.equal(cleanFlag({layout:'<script>', c:[], sym:'x'}).layout, 'h3');
  for (const l of Object.keys(LAYOUTS)) for (const s of Object.keys(SYMBOLS)) assert.match(flagSVG({layout:l, c:['#AA151B', '#F1BF00', '#0A1F44'], sym:s, sc:'#FFFFFF'}), /^<svg[^>]*>.*<\/svg>$/);
  assert.equal(bannerColor({layout:'h2', c:['#FFFFFF', '#0055A4', '#000000'], sym:'ninguno', sc:'#fff'}), '#0055A4');
});

test('crónica: guerras, capitales y eliminaciones quedan apuntadas', () => {
  const geo = E.geoOf(map), sc = scenario(map, 'las47', colors);
  const f = E.apply(geo, E.createGame(geo, sc, {seed:'C', humans:[P('Madrid')], rules:{difficulty:'facil'}}), {type:'diplo', f:P('Madrid'), d:P('Toledo'), kind:'guerra'}).g;
  assert.ok(f.chron.some(n => n.t === 'war' && n.a === P('Madrid') && n.b === P('Toledo')));
  let g = E.createGame(geo, sc, {seed:'C', humans:[P('Madrid')], rules:{difficulty:'dificil', events:false}});
  for (let i = 0; i < 30 && !g.over; i++) g = endTurn(geo, g).g;
  assert.ok(g.chron.some(n => n.t === 'cap' || n.t === 'elim'));
  assert.ok(g.chron.length <= 160);
  assert.ok(g.chron.every(n => n.n >= 1 && n.n <= g.turn));
});

test('logros: se ganan con el estado de la partida', () => {
  const geo = E.geoOf(map), sc = scenario(map, 'las47', colors), me = P('Soria');
  const g = E.createGame(geo, sc, {seed:'M', humans:[me], rules:{difficulty:'normal'}});
  assert.deepEqual(medalsFor(g, me), []);
  g.stats.conq[me] = 10; g.stats.caps[me] = 1; g.F.gold[me] = 400; g.over = true; g.winner = me; g.turn = 30;
  const m = medalsFor(g, me);
  for (const id of ['sangre', 'conquistador', 'capital', 'tesoro', 'facil', 'normal', 'relampago', 'palabra', 'david']) assert.ok(m.includes(id), id);
  assert.ok(!m.includes('dificil'));
  assert.ok(m.every(id => MEDALS[id]));
});

test('campaña: cada misión encuentra su bando y las estrellas van por turnos', () => {
  for (const m of MISSIONS) {
    const mp = m.sc === 'peninsula' ? map48 : map;
    const center = m.center ? mp.provinces.findIndex(p => p.ine === m.center) : -1;
    const sc = scenario(mp, m.sc, colors, center);
    assert.ok(m.sc in SCENARIOS, m.id);
    assert.ok(!m.me || sc.factions.some(f => f.name === m.me), `${m.id}: ${m.me}`);
    assert.equal(starsFor(m, m.stars[0]), 3); assert.equal(starsFor(m, m.stars[1]), 2); assert.equal(starsFor(m, m.stars[1] + 1), 1);
  }
  assert.ok(unlocked({}, 0) && !unlocked({}, 1) && unlocked({m1:1}, 1));
});

test('desafío diario: el mismo día da la misma partida y cambia de un día a otro', () => {
  const a = daily('2026-11-01', map), b = daily('2026-11-01', map), c = daily('2026-11-02', map);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.sc in SCENARIOS && a.turns === 30);
});

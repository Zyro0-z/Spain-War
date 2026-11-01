// Ríos, menos rivales, sobrevivir, dados por orden (multijugador) y la clasificación del desafío.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../js/conquest/engine.js';
import {endTurn, resolveTurn} from '../js/conquest/turn.js';
import {scenario, withRivals, withPortugal} from '../js/conquest/scenarios.js';
import {newConquest} from '../js/conquest/newgame.js';
import {table} from '../js/net/board.js';

const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));
const geo = E.geoOf(map);
const colors = map.provinces.map(() => '#888888');
const P = n => map.provinces.find(p => p.name === n).i;

test('ríos: dibujados, cruzarlos da defensa y Portugal también los tiene', () => {
  assert.ok(map.rivers.lines.length >= 8 && map.rivers.lines.every(l => /^M[-\d.,L]+$/.test(l.d)));
  const pairs = Object.entries(geo.river);
  assert.ok(pairs.length > 20);
  for (const [k] of pairs) { const [a, b] = k.split('-').map(Number); assert.ok(geo.adj[a].includes(b), k); }
  const [k, name] = pairs[0], [a, b] = k.split('-').map(Number);
  assert.equal(E.riverBetween(geo, b, a), name);
  const g = E.createGame(geo, scenario(map, 'las47', colors), {seed:'R', humans:[a], rules:{difficulty:'facil'}});
  assert.equal(E.defenseMul(geo, g, b, a) - E.defenseMul(geo, g, b), E.RIVER_DEF);
  const g48 = E.geoOf(withPortugal(map));
  assert.ok(Object.keys(g48.river).some(k2 => k2.endsWith('-47')), 'ríos en la frontera con Portugal');
});

test('menos rivales: el resto empieza como tierras libres que no atacan', () => {
  const spec = scenario(map, 'comunidades', colors), me = spec.factions.findIndex(f => f.name === 'Madrid');
  const r = withRivals(spec, me, 3, 'X');
  assert.equal(r.spec.factions.length, 4);
  assert.equal(r.spec.factions[r.me].name, 'Madrid');
  assert.deepEqual(withRivals(spec, me, 3, 'X'), r, 'misma semilla, mismos rivales');
  let g = E.createGame(geo, r.spec, {seed:'X', humans:[r.me], rules:{difficulty:'dificil', events:false}});
  const R = E.rebels(g);
  assert.equal(g.F.name[R], 'Tierras libres');
  assert.ok(g.P.owner.filter(o => o === R).length > 20);
  assert.ok(g.P.active.every(Boolean), 'todo el mapa está en juego');
  const before = g.P.owner.filter(o => o === R).length;
  for (let i = 0; i < 10; i++) g = endTurn(geo, g).g;
  assert.ok(g.P.owner.filter(o => o === R).length < before, 'los bots se expanden por las tierras libres');
  const {g:ng, humans} = newConquest({map, colors}, {sc:'comunidades', seed:'Y', diff:'normal', rules:{rivals:2, victory:'capitales'}, humans:[{f:me}]});
  assert.equal(E.nFactions(ng), 3); assert.equal(ng.F.name[humans[0]], 'Madrid'); assert.equal(ng.rules.victory.n, 2);
});

test('sobrevivir: llegar vivo al turno límite gana aunque otro sea más grande', () => {
  const {g} = newConquest({map, colors}, {sc:'las47', seed:'S', diff:'normal', rules:{victory:'supervivencia', turns:5, events:false}, humans:[{f:P('Soria')}]});
  let x = g;
  for (let i = 0; i < 8 && !x.over; i++) x = endTurn(geo, x).g;
  assert.ok(x.over); assert.equal(x.winner, P('Soria'));
});

test('dados por orden: el resultado de un ataque no depende del orden de los demás', () => {
  const {g} = newConquest({map, colors}, {sc:'las47', seed:'D', diff:'facil', rules:{events:false}, humans:[{f:P('Madrid')}, {f:P('Sevilla')}]});
  const a = {type:'attack', from:P('Madrid'), to:P('Toledo'), n:9, q:0};
  const b = {type:'attack', from:P('Sevilla'), to:P('Córdoba'), n:9, q:0};
  const one = resolveTurn(geo, g, {[P('Madrid')]:[a], [P('Sevilla')]:[b]}).ev.filter(e => e.t === 'attack' && e.f >= 0 && (e.f === P('Madrid') || e.f === P('Sevilla')));
  const g2 = {...g, turn:g.turn}; // mismo turno; cambia el orden rotando los humanos con otro turno no: se aplica a mano al revés
  const solo1 = E.apply(geo, g2, {...a, f:P('Madrid')}).ev.find(e => e.t === 'attack');
  const mid = E.apply(geo, g2, {...b, f:P('Sevilla')}).g;
  const solo2 = E.apply(geo, mid, {...a, f:P('Madrid')}).ev.find(e => e.t === 'attack');
  assert.deepEqual(solo1.rolls, solo2.rolls, 'mismas tiradas aunque antes haya atacado otro');
  assert.equal(one.length, 2);
});

test('clasificación del desafío: mejor marca por jugador y ordenada', () => {
  const m = (id, name, pts) => ({body:{v:2, t:'score', id, name, pts, f:'Madrid'}});
  const t = table([m('a', 'Ana', 300), m('b', 'Luis', 450), m('a', 'Ana', 500), m('c', 'Eva', 120), {body:{v:1, t:'score', id:'x', pts:999}}, {body:{v:2, t:'score', id:'y', name:'Mal', pts:'mucho'}}]);
  assert.deepEqual(t.map(x => [x.name, x.pts]), [['Ana', 500], ['Luis', 450], ['Eva', 120]]);
});

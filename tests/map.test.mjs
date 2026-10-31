// Datos del mapa: 47 provincias, adyacencia por frontera real, simetría, conexión y el enclave de Treviño.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));
const P = map.provinces;
const byName = n => P.find(p => p.name === n);
const names = ids => ids.map(i => P[i].name).sort();
const pts = d => [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(m => [+m[1], +m[2]]);

test('47 provincias peninsulares, sin islas ni ciudades autónomas', () => {
  assert.equal(P.length, 47);
  for (const n of ['Illes Balears', 'Las Palmas', 'Santa Cruz de Tenerife', 'Ceuta', 'Melilla']) assert.equal(byName(n), undefined, n);
  assert.equal(new Set(P.map(p => p.ine)).size, 47);
  P.forEach((p, i) => { assert.equal(p.i, i); assert.ok(p.d.startsWith('M')); assert.ok(p.plate.length >= 1); });
});

test('adyacencia simétrica, con su frontera compartida, y grafo conexo', () => {
  for (const p of P) {
    assert.ok(p.adj.length >= 1, p.name);
    for (const q of p.adj) {
      assert.ok(P[q].adj.includes(p.i), `${p.name}–${P[q].name}`);
      assert.ok(map.borders[`${Math.min(p.i, q)}-${Math.max(p.i, q)}`], `frontera ${p.name}–${P[q].name}`);
    }
  }
  assert.equal(Object.keys(map.borders).length, P.reduce((s, p) => s + p.adj.length, 0) / 2);
  const seen = new Set([0]), st = [0];
  while (st.length) for (const q of P[st.pop()].adj) if (!seen.has(q)) { seen.add(q); st.push(q); }
  assert.equal(seen.size, 47);
});

test('fronteras de verdad: más de 1 km, no un punto de contacto', () => {
  for (const [k, d] of Object.entries(map.borders)) {
    let len = 0; const ps = pts(d);
    for (let i = 1; i < ps.length; i++) len += Math.hypot(ps[i][0] - ps[i - 1][0], ps[i][1] - ps[i - 1][1]);
    assert.ok(len * map.kmPerUnit > 1, `${k}: ${len * map.kmPerUnit} km`);
  }
});

test('vecinos conocidos', () => {
  assert.deepEqual(names(byName('Madrid').adj), ['Cuenca', 'Guadalajara', 'Segovia', 'Toledo', 'Ávila']);
  assert.deepEqual(names(byName('Gipuzkoa').adj), ['Bizkaia', 'Navarra', 'Álava']);
  assert.deepEqual(names(byName('Asturias').adj), ['Cantabria', 'León', 'Lugo']);
  assert.ok(byName('Badajoz').adj.includes(byName('Toledo').i), 'Badajoz y Toledo se tocan (8 km)');
  assert.ok(!byName('Madrid').adj.includes(byName('Burgos').i));
});

test('Condado de Treviño: enclave de Burgos dentro de Álava', () => {
  const bu = byName('Burgos'), al = byName('Álava');
  assert.ok(bu.parts >= 2, 'Burgos tiene más de un polígono');
  assert.ok(bu.adj.includes(al.i));
  // Álava lleva un agujero (más de un anillo) y uno de los polígonos de Burgos cae dentro de su caja
  assert.ok((al.d.match(/M/g) || []).length >= 2, 'Álava tiene el hueco de Treviño');
  const rings = bu.d.split('M').filter(Boolean).map(s => pts('M' + s));
  const [x0, y0, x1, y1] = al.bbox;
  const inside = rings.filter(r => r.every(([x, y]) => x > x0 && x < x1 && y > y0 && y < y1));
  assert.ok(inside.length >= 1, 'un trozo de Burgos está rodeado por Álava');
});

test('costa/exterior por provincia y tierra vecina', () => {
  assert.equal(map.outer.length, 47);
  assert.ok(map.outer[byName('Madrid').i] === '', 'Madrid no tiene costa ni frontera exterior');
  assert.ok(map.outer[byName('A Coruña').i].length > 100);
  assert.ok(map.land.startsWith('M') && map.neutral.startsWith('M'));
  assert.match(map.credits, /Instituto Geográfico Nacional/);
});

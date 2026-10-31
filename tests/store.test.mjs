// Estado guardado: valores por defecto y migraciones.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh, migrate, VERSION} from '../js/store.js';
import {assignColors, factionPalette, luminance} from '../js/art.js';
import fs from 'node:fs';

test('estado nuevo', () => {
  const s = fresh();
  assert.equal(s.v, VERSION);
  assert.equal(s.settings.speed, 1);
  assert.equal(s.current, null);
});

test('migración: completa lo que falta y corrige lo inválido', () => {
  const s = migrate({settings:{speed:3, theme:'neon', textSize:9, sound:false}, history:'x', current:{game:{}}});
  assert.equal(s.settings.speed, 1);
  assert.equal(s.settings.theme, 'marina');
  assert.equal(s.settings.textSize, 'auto');
  assert.equal(s.settings.sound, false, 'respeta lo que sí es válido');
  assert.deepEqual(s.history, []);
  assert.equal(s.current, null, 'una partida guardada rota se descarta');
  assert.deepEqual(migrate(null), fresh());
});

test('colores: 47 distintos y las vecinas contrastan', () => {
  const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));
  const adj = map.provinces.map(p => p.adj), col = assignColors(adj);
  assert.equal(new Set(col).size, 47);
  assert.equal(factionPalette(47).length, 47);
  const diff = (a, b) => { const h = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)); const [p, q] = [h(a), h(b)]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  for (const p of map.provinces) for (const q of p.adj) assert.ok(diff(col[p.i], col[q]) > 40, `${p.name}–${map.provinces[q].name}`);
  for (const c of col) assert.ok(luminance(c) > .03 && luminance(c) < .7, c);
});

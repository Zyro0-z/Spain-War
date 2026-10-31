// Modo sin conexión: el service worker guarda todos los módulos, estilos, fuentes y datos que usa la app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const core = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);

test('CACHE tiene versión', () => assert.match(sw, /const CACHE = 'eeg-v\d+'/));

test('todo lo que está en la caché existe', () => {
  for (const f of core) assert.ok(fs.existsSync(path.join(root, f)), f);
});

test('todos los módulos y fuentes están en la caché', () => {
  const walk = d => fs.readdirSync(path.join(root, d), {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of [...walk('js'), ...walk('fonts').filter(f => f.endsWith('.woff2')), 'css/app.css', 'data/map.json']) assert.ok(core.includes(f), `falta en sw.js: ${f}`);
});

test('el multijugador no se sirve desde caché (solo este origen)', () => {
  assert.match(sw, /url\.origin !== location\.origin/);
});

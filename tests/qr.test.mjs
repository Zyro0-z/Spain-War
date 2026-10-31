// Código QR propio: se decodifica con jsQR (solo en desarrollo) para comprobar que es válido.
import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import {qrMatrix} from '../js/qr.js';

function decode(text) {
  const m = qrMatrix(text), n = m.length, q = 4, s = 6, W = (n + q * 2) * s;
  const px = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x])
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const i = (((y + q) * s + dy) * W + (x + q) * s + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  const r = jsQR(px, W, W);
  return r && r.data;
}

test('QR legible en todas las versiones (1 a 10)', () => {
  for (const t of ['A', 'https://zyro0-z.github.io/Spain-War/?sala=K7QX2M', 'x'.repeat(60), 'España en Guerra · ñ'.repeat(4), 'z'.repeat(150), 'q'.repeat(210)]) {
    assert.equal(decode(t), t, `«${t.slice(0, 20)}…» (${t.length})`);
  }
  assert.equal(qrMatrix('A').length, 21);
  assert.throws(() => qrMatrix('x'.repeat(300)));
});

// @ts-check
// Generador pseudoaleatorio con semilla (sfc32). Su estado son 4 enteros y viaja dentro de la partida,
// así una semilla reproduce siempre la misma partida en cualquier dispositivo.

/** @typedef {[number, number, number, number]} RngState */

/** Convierte una cadena en el estado inicial (cyrb128). @param {string} str @returns {RngState} */
export function seedState(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  /** @type {RngState} */
  const st = [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  for (let i = 0; i < 12; i++) next(st); // calentamiento
  return st;
}

/** Número en [0, 1). Avanza el estado (lo modifica). @param {RngState} s */
export function next(s) {
  let [a, b, c, d] = s;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  const t = (a + b | 0) + d | 0;
  d = d + 1 | 0;
  a = b ^ b >>> 9;
  b = c + (c << 3) | 0;
  c = c << 21 | c >>> 11;
  c = c + t | 0;
  s[0] = a >>> 0; s[1] = b >>> 0; s[2] = c >>> 0; s[3] = d >>> 0;
  return (t >>> 0) / 4294967296;
}

/** Entero en [0, n). @param {RngState} s @param {number} n */
export const int = (s, n) => Math.floor(next(s) * n);

/** Dado de 6 caras. @param {RngState} s */
export const d6 = s => 1 + int(s, 6);

/** Semilla corta para compartir: 8 caracteres sin letras que se confundan. */
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newSeed() {
  const b = new Uint32Array(8);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 8; i++) b[i] = Math.floor(Math.random() * 2 ** 32);
  return Array.from(b, v => ALPHA[v % ALPHA.length]).join('');
}
/** Limpia una semilla escrita a mano (mayúsculas, sin espacios). @param {string} s */
export const cleanSeed = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

/** Ruido determinista para detalles visuales (no consume el generador de la partida). @param {string|number} key */
export function hash01(key) {
  const s = seedState(String(key));
  return next(s);
}

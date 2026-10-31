// @ts-check
// Probabilidad exacta de victoria: convolución de 3d6 de cada bando con su poder.
// Puntuación = suma × poder/100. Se compara en enteros (suma × poder) para que coincida con el motor.

/** Formas de sacar cada suma con 3d6 (índice = suma, de 3 a 18). Total 216. */
export const WAYS3D6 = (() => {
  const w = new Array(19).fill(0);
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) w[a + b + c]++;
  return w;
})();

/**
 * Casos favorables sobre 216² = 46656 tiradas conjuntas.
 * @param {number} pa poder del atacante @param {number} pd poder del defensor
 * @returns {{win:number, lose:number, tie:number, p:number}} p = victoria del atacante repitiendo empates
 */
export function winProb(pa, pd) {
  let win = 0, lose = 0, tie = 0;
  for (let a = 3; a <= 18; a++) for (let d = 3; d <= 18; d++) {
    const n = WAYS3D6[a] * WAYS3D6[d], x = a * pa, y = d * pd;
    if (x > y) win += n; else if (x < y) lose += n; else tie += n;
  }
  return {win, lose, tie, p:win / (win + lose)};
}

/** Puntuación mostrada: suma × poder/100, con dos decimales. @param {number} sum @param {number} power */
export const score = (sum, power) => Math.round(sum * power) / 100;

/** Multiplicador mostrado (1,03). @param {number} power */
export const mult = power => power / 100;

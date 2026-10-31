// @ts-check
// Reloj de la partida: se puede pausar y acelerar. El mapa, la ruleta y los dados miden el tiempo con él,
// así la pausa congela todo en el acto.

export class Clock {
  constructor() {
    this.paused = false;
    this.speed = 1;
    this.offset = 0;   // tiempo acumulado en pausa
    this.pausedAt = 0;
    /** @type {Set<Animation>} */
    this.anims = new Set();
    /** @type {Set<() => void>} */
    this.listeners = new Set();
    this.stopped = false;
  }
  now() { return (this.paused ? this.pausedAt : performance.now()) - this.offset; }
  /** Duración ajustada a la velocidad. @param {number} ms */
  T(ms) { return ms / this.speed; }
  pause() {
    if (this.paused) return;
    this.paused = true; this.pausedAt = performance.now();
    this.anims.forEach(a => { try { a.pause(); } catch (e) {} });
    this.listeners.forEach(f => f());
  }
  resume() {
    if (!this.paused) return;
    this.offset += performance.now() - this.pausedAt; this.paused = false;
    this.anims.forEach(a => { try { a.play(); } catch (e) {} });
    this.listeners.forEach(f => f());
  }
  /** Avanza el tiempo estando en pausa (capturas deterministas). @param {number} ms */
  advance(ms) {
    if (!this.paused) return;
    this.offset -= ms;
    this.anims.forEach(a => { try { if (a.currentTime != null) a.currentTime = +a.currentTime + ms; } catch (e) {} });
  }
  /** Registra una animación web para que respete la pausa. @param {Animation} a */
  track(a) {
    this.anims.add(a);
    if (this.paused) a.pause();
    a.finished.catch(() => {}).finally(() => this.anims.delete(a));
    return a;
  }
  /** Espera en tiempo de partida (no corre en pausa). @param {number} ms */
  wait(ms) {
    const end = this.now() + Math.max(0, ms);
    return new Promise(res => {
      const tick = () => {
        if (this.stopped) return res(undefined);
        const left = end - this.now();
        if (left <= 0) res(undefined); else setTimeout(tick, this.paused ? 80 : Math.min(left, 80));
      };
      tick();
    });
  }
}

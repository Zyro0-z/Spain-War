// @ts-check
// Transporte de mensajes de la sala, con el mismo mecanismo que la mesa compartida de Contador de Sushi:
// se publica con POST en un tema de ntfy.sh y se escucha con EventSource (SSE). Al volver a abrir la app
// se recupera lo perdido con poll=1&since=<último id> (ntfy guarda los mensajes unas horas).
//
// - Publica en orden (cola) y reintenta con espera creciente ante 429, 5xx o fallos de red.
// - Descarta duplicados por id (EventSource puede repetir al reconectar).
// - LocalTransport hace lo mismo entre pestañas del mismo navegador (pruebas sin internet).

export const NTFY = 'https://ntfy.sh/';
/** Prefijo único del canal: el código de sala se añade al final. */
export const PREFIX = 'espana-en-guerra-q7z4-';
export const topicOf = (/** @type {string} */ code) => PREFIX + code.toLowerCase();
/** Esperas entre reintentos (ms). */
export const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];
/** ntfy acepta hasta 4096 bytes por mensaje; se deja margen. */
export const MAX_BYTES = 3800;

/** @typedef {{id:string, time:number, body:any}} NetMsg */
/**
 * @typedef {object} Transport
 * @property {(body:object) => Promise<void>} publish
 * @property {(onMsg:(m:NetMsg) => void, since?:string) => void} subscribe
 * @property {(since:string) => Promise<NetMsg[]>} poll
 * @property {() => void} close
 * @property {(cb:(s:'on'|'wait'|'err'|'off') => void) => void} onStatus
 */

/** @param {number} ms */
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Tamaño en bytes (UTF-8). @param {string} s */
export const bytes = s => new TextEncoder().encode(s).length;

export class NtfyTransport {
  /**
   * @param {string} topic
   * @param {{fetch?:typeof fetch, EventSource?:any, sleep?:(ms:number)=>Promise<unknown>, host?:string}} [deps]
   */
  constructor(topic, deps = {}) {
    this.topic = topic;
    this.host = deps.host || NTFY;
    this.f = deps.fetch || ((...a) => fetch(...a));
    this.ES = deps.EventSource || (typeof EventSource !== 'undefined' ? EventSource : null);
    this.sleep = deps.sleep || sleep;
    /** @type {Promise<void>} */ this.queue = Promise.resolve();
    /** @type {Set<string>} */ this.seen = new Set();
    /** @type {any} */ this.es = null;
    /** @type {(s:any) => void} */ this.status = () => {};
    this.closed = false;
    this.retries = 0; // reintentos hechos (para pruebas y diagnóstico)
  }
  /** @param {(s:'on'|'wait'|'err'|'off') => void} cb */
  onStatus(cb) { this.status = cb; }
  /** Publica en orden; reintenta con espera creciente. @param {object} body */
  publish(body) {
    const text = JSON.stringify(body);
    if (bytes(text) > MAX_BYTES) return Promise.reject(new Error('Mensaje demasiado grande'));
    const job = this.queue.then(async () => {
      for (let i = 0; ; i++) {
        if (this.closed) return;
        let r = null;
        try { r = await this.f(this.host + this.topic, {method:'POST', body:text}); } catch (e) { r = null; }
        if (r && r.ok) { this.status('on'); return; }
        if (r && r.status >= 400 && r.status < 500 && r.status !== 429) throw new Error('ntfy ' + r.status);
        if (i >= BACKOFF.length) { this.status('err'); throw new Error('Sin conexión con ntfy'); }
        this.status(r && r.status === 429 ? 'wait' : 'err');
        this.retries++;
        await this.sleep(BACKOFF[i] + Math.floor(Math.random() * 300));
      }
    });
    this.queue = job.catch(() => {});
    return job;
  }
  /** @param {any} raw @returns {NetMsg|null} */
  parse(raw) {
    if (!raw || raw.event !== 'message' || !raw.message || this.seen.has(raw.id)) return null;
    this.seen.add(raw.id);
    try { return {id:raw.id, time:raw.time, body:JSON.parse(raw.message)}; } catch (e) { return null; }
  }
  /** Mensajes guardados desde un id (o 'all', '1h'…). @param {string} since */
  async poll(since) {
    for (let i = 0; i <= BACKOFF.length; i++) {
      try {
        const r = await this.f(`${this.host}${this.topic}/json?poll=1&since=${encodeURIComponent(since)}`);
        if (r.ok) {
          const out = [];
          for (const line of (await r.text()).split('\n')) { if (!line.trim()) continue; let j; try { j = JSON.parse(line); } catch (e) { continue; } const m = this.parse(j); if (m) out.push(m); }
          return out;
        }
      } catch (e) {}
      if (i < BACKOFF.length) await this.sleep(BACKOFF[i]);
    }
    throw new Error('Sin conexión con ntfy');
  }
  /** Escucha en directo (SSE). @param {(m:NetMsg) => void} onMsg @param {string} [since] */
  subscribe(onMsg, since = '') {
    if (!this.ES) return;
    if (this.es) this.es.close();
    this.closed = false;
    this.status('wait');
    const url = `${this.host}${this.topic}/sse${since ? '?since=' + encodeURIComponent(since) : ''}`;
    this.es = new this.ES(url);
    this.es.onopen = () => this.status('on');
    this.es.onerror = () => this.status('err');
    this.es.onmessage = (/** @type {{data:string}} */ ev) => { let j; try { j = JSON.parse(ev.data); } catch (e) { return; } const m = this.parse(j); if (m) onMsg(m); };
  }
  close() { this.closed = true; if (this.es) this.es.close(); this.es = null; this.status('off'); }
}

/** Sala entre pestañas del mismo navegador: BroadcastChannel para lo nuevo y localStorage como registro. */
export class LocalTransport {
  /** @param {string} topic */
  constructor(topic) {
    this.topic = topic; this.key = 'eeg-net:' + topic;
    this.ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(this.key) : null;
    /** @type {Set<string>} */ this.seen = new Set();
    /** @type {(s:any) => void} */ this.status = () => {};
  }
  /** @param {(s:'on'|'wait'|'err'|'off') => void} cb */
  onStatus(cb) { this.status = cb; }
  log() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch (e) { return []; } }
  /** @param {object} body */
  async publish(body) {
    const log = this.log(), m = {id:Date.now().toString(36) + Math.random().toString(36).slice(2, 7), time:Math.floor(Date.now() / 1000), body};
    log.push(m); try { localStorage.setItem(this.key, JSON.stringify(log.slice(-800))); } catch (e) {}
    this.seen.add(m.id);
    if (this.ch) this.ch.postMessage(m);
    if (this.self) this.self(m); // ntfy también devuelve los propios mensajes
    this.status('on');
  }
  /** @param {string} since */
  async poll(since) {
    const log = this.log(), i = log.findIndex((/** @type {NetMsg} */ m) => m.id === since);
    const out = since === 'all' || i < 0 ? log : log.slice(i + 1);
    return out.filter((/** @type {NetMsg} */ m) => { if (this.seen.has(m.id)) return false; this.seen.add(m.id); return true; });
  }
  /** @param {(m:NetMsg) => void} onMsg */
  subscribe(onMsg) {
    const take = (/** @type {NetMsg} */ m) => { if (this.seen.has(m.id)) return; this.seen.add(m.id); onMsg(m); };
    if (this.ch) this.ch.onmessage = e => take(e.data);
    this.self = (/** @type {NetMsg} */ m) => onMsg(m);
    this.status('on');
  }
  close() { if (this.ch) this.ch.close(); this.self = null; this.status('off'); }
}

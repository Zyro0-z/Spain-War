// Protocolo de la sala: sala de espera, partida completa, orden de mensajes, reconexión, anfitrión caído,
// tiempo agotado y reintentos ante 429. Con un ntfy simulado en memoria y un reloj falso.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {graphOf, targetsOf} from '../js/engine/game.js';
import {bestTarget} from '../js/engine/bots.js';
import {Host, Guest, TURN_MS, GRACE_MS, AWAY_MS, newCode, cleanCode} from '../js/net/room.js';
import {NtfyTransport, MAX_BYTES, BACKOFF, bytes, topicOf} from '../js/net/transport.js';

const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));
const G = graphOf(map);
const idx = n => map.provinces.find(p => p.name === n).i;

/** Reloj falso con temporizadores. */
function fakeClock() {
  let t = 0, seq = 0; const q = [];
  return {
    now:() => t,
    setTimeout:(f, ms) => { const id = ++seq; q.push({id, at:t + ms, f}); return id; },
    clearTimeout:id => { const i = q.findIndex(x => x.id === id); if (i >= 0) q.splice(i, 1); },
    async tick(ms) {
      const end = t + ms;
      for (;;) { q.sort((a, b) => a.at - b.at); const n = q[0]; if (!n || n.at > end) break; q.shift(); t = n.at; n.f(); await flush(); }
      t = end; await flush();
    },
  };
}
const flush = () => new Promise(r => setImmediate(r));

/** ntfy en memoria: registro ordenado, entrega en directo, poll con since y opciones para desordenar. */
function fakeNtfy() {
  const hub = {log:[], n:0, subs:new Set(), published:[]};
  hub.transport = () => {
    let sub = null;
    return {
      async publish(body) {
        const text = JSON.stringify(body);
        assert.ok(bytes(text) <= MAX_BYTES, 'mensaje de más de 3,8 KB');
        const m = {id:'m' + (++hub.n), time:hub.n, body:JSON.parse(text)};
        hub.log.push(m); hub.published.push(m);
        for (const s of [...hub.subs]) s.deliver(m);
      },
      subscribe(cb) { sub = {cb, hold:null, deliver(m) { if (this.hold) this.hold.push(m); else cb(m); }}; hub.subs.add(sub); this.sub = sub; },
      async poll(since) { const i = hub.log.findIndex(m => m.id === since); return since === 'all' || i < 0 ? [...hub.log] : hub.log.slice(i + 1); },
      close() { hub.subs.delete(sub); },
      onStatus() {},
    };
  };
  return hub;
}

async function lobby(clock, hub, n = 2) {
  const host = new Host({transport:hub.transport(), graph:G, id:'H', name:'Ana', code:'ABC123', level:'estratega', ...clock});
  await host.open();
  const guests = [];
  for (let i = 0; i < n; i++) {
    const g = new Guest({transport:hub.transport(), graph:G, id:'G' + i, name:'Invitado ' + i, code:'ABC123', ...clock});
    await g.join(); guests.push(g);
  }
  await clock.tick(700);
  host.pick(idx('Madrid'));
  await guests[0].pick(idx('Sevilla'));
  if (guests[1]) await guests[1].pick(idx('Burgos'));
  await clock.tick(700);
  return {host, guests};
}

/** Juega una partida online completa: cada invitado decide con bestTarget o deja agotar el tiempo. */
async function playAll(clock, host, guests, {timeoutFor = new Set()} = {}) {
  await host.advance();
  let turns = 0;
  while (host.game.winner < 0) {
    const p = host.pending; turns++;
    const owner = host.humanOf(p.attacker);
    let target;
    if (owner === host.id) target = bestTarget(p.g, p.attacker, targetsOf(G, p.g, p.attacker));
    else {
      const g = guests.find(x => x.id === owner);
      const wait = host.waitMove();
      if (!timeoutFor.has(owner)) { const t = targetsOf(G, p.g, p.attacker); await g.move(p.n, t[t.length - 1]); }
      else await clock.tick(TURN_MS + GRACE_MS + 10);
      target = await wait;
    }
    await host.play(target);
  }
  return turns;
}

/** Reconstruye la partida de un invitado con lo recibido. */
function replay(guest) {
  let g = guest.initial(), r;
  while ((r = guest.resolveNext(g))) g = r.game;
  return g;
}

test('código de sala y canal', () => {
  const c = newCode();
  assert.match(c, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(cleanCode(' abc-12 3x '), 'ABC123');
  assert.equal(topicOf('ABC123'), 'espana-en-guerra-q7z4-abc123');
});

test('sala de espera: entrar, elegir provincia y no repetirla; mensajes agrupados', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests} = await lobby(clock, hub);
  assert.equal(host.players.length, 3);
  assert.deepEqual(guests[0].players.map(p => p.f), [idx('Madrid'), idx('Sevilla'), idx('Burgos')]);
  await guests[1].pick(idx('Madrid')); await clock.tick(700);
  assert.equal(host.players.find(p => p.id === 'G1').f, idx('Burgos'), 'Madrid ya era del anfitrión');
  const lobbies = hub.published.filter(m => m.body.t === 'lobby').length;
  assert.ok(lobbies <= 4, `la sala se anuncia agrupada (${lobbies} mensajes)`);
  assert.ok(host.canStart());
  const spec = new Guest({transport:hub.transport(), graph:G, id:'S', name:'Mirón', code:'ABC123', role:'spectator', ...clock});
  await spec.join(); await clock.tick(700);
  assert.equal(host.players.length, 3, 'el espectador no ocupa plaza');
});

test('partida completa: los invitados reconstruyen el mismo estado que el anfitrión', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests} = await lobby(clock, hub);
  await host.start('SALA1');
  assert.equal(guests[0].phase, 'play');
  const turns = await playAll(clock, host, guests);
  for (const gu of guests) {
    const g = replay(gu);
    assert.deepEqual(g.owner, host.game.owner);
    assert.deepEqual(g.power, host.game.power);
    assert.equal(g.round, host.game.round);
    assert.equal(g.winner, host.game.winner);
  }
  const batches = hub.published.filter(m => m.body.t === 'batch').length;
  assert.ok(batches < host.game.round / 2, `rondas agrupadas: ${batches} mensajes para ${host.game.round} rondas`);
  assert.ok(batches >= turns, 'al menos un mensaje por turno humano');
});

test('tiempo agotado: el anfitrión elige el mejor objetivo', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests} = await lobby(clock, hub);
  await host.start('TIEMPO');
  await host.advance();
  while (host.humanOf(host.pending.attacker) === host.id) await host.play(bestTarget(host.pending.g, host.pending.attacker, targetsOf(G, host.pending.g, host.pending.attacker)));
  const p = host.pending, best = bestTarget(p.g, p.attacker, targetsOf(G, p.g, p.attacker));
  const wait = host.waitMove();
  await clock.tick(TURN_MS + GRACE_MS - 100);
  let done = false; wait.then(() => { done = true; }); await flush();
  assert.equal(done, false, 'aún dentro de plazo');
  await clock.tick(200);
  assert.equal(await wait, best);
});

test('una jugada no válida o de otro jugador no cuenta', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests} = await lobby(clock, hub);
  await host.start('TRAMPA');
  await host.advance();
  while (host.humanOf(host.pending.attacker) === host.id) await host.play(bestTarget(host.pending.g, host.pending.attacker, targetsOf(G, host.pending.g, host.pending.attacker)));
  const p = host.pending, owner = host.humanOf(p.attacker), other = guests.find(g => g.id !== owner);
  const wait = host.waitMove();
  await other.move(p.n, targetsOf(G, p.g, p.attacker)[0]);           // no es su turno
  await guests.find(g => g.id === owner).move(p.n, idx('Girona') === p.attacker ? 0 : 9999); // objetivo imposible
  await clock.tick(TURN_MS + GRACE_MS + 10);
  assert.equal(await wait, bestTarget(p.g, p.attacker, targetsOf(G, p.g, p.attacker)));
});

test('orden de mensajes: desordenados y repetidos se procesan en orden', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests} = await lobby(clock, hub, 1);
  const late = new Guest({transport:hub.transport(), graph:G, id:'L', name:'Tarde', code:'ABC123', role:'spectator', ...clock});
  await host.start('ORDEN');
  await playAll(clock, host, guests);
  // entrega manual: todos los mensajes del anfitrión, barajados y con duplicados
  const msgs = hub.log.filter(m => typeof m.body.s === 'number');
  const shuffled = [...msgs, ...msgs.slice(0, 5)].sort((a, b) => ((a.id.charCodeAt(1) * 7919 + a.time * 104729) % 97) - ((b.id.charCodeAt(1) * 7919 + b.time * 104729) % 97));
  for (const m of shuffled) late.onMsg(m);
  await clock.tick(2000);
  assert.equal(late.hs, msgs.length, 'todos procesados una vez');
  const g = replay(late);
  assert.deepEqual(g.owner, host.game.owner);
  assert.equal(g.winner, host.game.winner);
});

test('reconexión: al volver, recupera lo perdido con poll since', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests} = await lobby(clock, hub);
  await host.start('VUELVE');
  await host.advance();
  // el invitado 1 cierra Safari a mitad
  const saved = JSON.parse(JSON.stringify(guests[1].toJSON()));
  guests[1].close();
  const turns = await playAll(clock, host, [guests[0], guests[1]], {timeoutFor:new Set(['G1'])});
  assert.ok(turns > 0);
  // vuelve a abrir: estado guardado + mensajes desde el último id
  const back = new Guest({transport:hub.transport(), graph:G, id:'G1', name:'Invitado 1', code:'ABC123', ...clock});
  back.restore(saved);
  await back.join(saved.lastId);
  const g = replay(back);
  assert.deepEqual(g.owner, host.game.owner);
  assert.equal(g.round, host.game.round);
  // también puede saltar directamente al último estado
  assert.equal(back.snapshot().round, host.game.round);
  assert.deepEqual(back.snapshot().owner, host.game.owner);
});

test('anfitrión caído: el invitado lo nota a los 20 s y sigue cuando vuelve', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests} = await lobby(clock, hub, 1);
  await host.start('CAIDA');
  await host.advance();
  const g = guests[0];
  let news = g.waitNews(AWAY_MS);
  await clock.tick(AWAY_MS + 10);
  assert.equal(await news, false, 'sin noticias en 20 s: partida en pausa');
  // el anfitrión vuelve (restaura su estado y sigue)
  const saved = JSON.parse(JSON.stringify(host.toJSON()));
  host.close();
  const back = new Host({transport:hub.transport(), graph:G, id:'H', name:'Ana', code:'ABC123', ...clock});
  back.restore(saved);
  await back.open(saved.lastId);
  news = g.waitNews(AWAY_MS);
  const owner = back.humanOf(back.pending.attacker);
  if (owner === g.id) { const t = targetsOf(G, back.pending.g, back.pending.attacker); const w = back.waitMove(); await g.move(back.pending.n, t[0]); await back.play(await w); }
  else await back.play(bestTarget(back.pending.g, back.pending.attacker, targetsOf(G, back.pending.g, back.pending.attacker)));
  assert.equal(await news, true, 'llegan rondas nuevas: se reanuda');
  assert.deepEqual(replay(g).owner, back.game.owner);
});

test('ntfy: reintenta con espera creciente ante 429 y publica en orden', async () => {
  const calls = [], waits = [];
  let n = 0;
  const fetch = async (url, o) => { calls.push(o.body); n++; return n <= 2 ? {ok:false, status:429} : {ok:true, status:200}; };
  const t = new NtfyTransport('tema', {fetch, sleep:async ms => { waits.push(ms); }});
  await Promise.all([t.publish({a:1}), t.publish({a:2})]);
  assert.deepEqual(calls.map(c => JSON.parse(c).a), [1, 1, 1, 2], 'el segundo espera al primero');
  assert.equal(t.retries, 2);
  assert.ok(waits[0] >= BACKOFF[0] && waits[1] >= BACKOFF[1] && waits[1] > waits[0], 'espera creciente');
  await assert.rejects(t.publish({x:'y'.repeat(5000)}), /grande/);
  const bad = new NtfyTransport('tema', {fetch:async () => ({ok:false, status:403}), sleep:async () => {}});
  await assert.rejects(bad.publish({a:1}), /403/);
});

test('ntfy: poll lee NDJSON, solo mensajes y sin repetir', async () => {
  const lines = [{id:'1', event:'open'}, {id:'2', event:'message', time:1, message:'{"v":1,"s":1}'}, {id:'3', event:'keepalive'}, {id:'2', event:'message', time:1, message:'{"v":1,"s":1}'}, {id:'4', event:'message', time:2, message:'no json'}]
    .map(x => JSON.stringify(x)).join('\n');
  let url = '';
  const t = new NtfyTransport('tema', {fetch:async u => { url = u; return {ok:true, text:async () => lines}; }, sleep:async () => {}});
  const out = await t.poll('abc');
  assert.match(url, /\/tema\/json\?poll=1&since=abc$/);
  assert.deepEqual(out.map(m => m.id), ['2']);
});

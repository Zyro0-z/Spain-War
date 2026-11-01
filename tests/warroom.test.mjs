// Conquista online: sala, órdenes simultáneas, cierre del turno por el anfitrión, mismo estado en todos los
// móviles (huella), órdenes que chocan, tiempo agotado, abandono, reconexión y chat. ntfy simulado en memoria.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../js/conquest/engine.js';
import {cleanAction} from '../js/conquest/turn.js';
import {newConquest} from '../js/conquest/newgame.js';
import {WarHost, WarGuest, CHAT, newCode, cleanCode, cleanCustom, ordersHash} from '../js/net/warroom.js';
import {NtfyTransport, MAX_BYTES, BACKOFF, bytes} from '../js/net/transport.js';

const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));
const W = {map, colors:map.provinces.map(() => '#888888')};
const geo = E.geoOf(map);
const build = ({seed, players, cfg}) => newConquest(W, {sc:cfg.sc, seed, diff:cfg.diff, rules:cfg.rules, humans:players.filter(p => p.f >= 0).map(p => ({f:p.f, custom:p.custom}))}).g;

function fakeClock() {
  let t = 0, seq = 0; const q = [];
  return {
    now:() => t,
    setTimeout:(f, ms) => { const id = ++seq; q.push({id, at:t + ms, f}); return id; },
    clearTimeout:id => { const i = q.findIndex(x => x.id === id); if (i >= 0) q.splice(i, 1); },
    async tick(ms) {
      const end = t + ms;
      for (;;) { q.sort((a, b) => a.at - b.at); const n = q[0]; if (!n || n.at > end) break; q.shift(); t = n.at; await n.f(); await flush(); }
      t = end; await flush();
    },
  };
}
const flush = () => new Promise(r => setImmediate(r));
function fakeNtfy() {
  const hub = {log:[], n:0, subs:new Set()};
  hub.transport = () => {
    let sub = null;
    return {
      async publish(body) {
        const text = JSON.stringify(body);
        assert.ok(bytes(text) <= MAX_BYTES, 'mensaje de más de 3,8 KB');
        const m = {id:'m' + (++hub.n), time:hub.n, body:JSON.parse(text)};
        hub.log.push(m);
        for (const s of [...hub.subs]) s(m);
      },
      subscribe(cb) { sub = cb; hub.subs.add(cb); },
      async poll(since) { const i = hub.log.findIndex(m => m.id === since); return since === 'all' || i < 0 ? [...hub.log] : hub.log.slice(i + 1); },
      close() { hub.subs.delete(sub); },
      onStatus() {},
    };
  };
  return hub;
}
const opts = (hub, clock, id, name, extra = {}) => ({transport:hub.transport(), id, name, code:'ABC123', build, geo:() => geo, ...clock, ...extra});
const fid = (name) => ['Andalucía', 'Aragón', 'Asturias', 'Cantabria', 'Castilla-La Mancha', 'Castilla y León', 'Cataluña', 'Comunitat Valenciana', 'Extremadura', 'Galicia', 'Madrid', 'Murcia', 'Navarra', 'País Vasco', 'La Rioja'].indexOf(name);

async function room(clock, hub, cfg = {}) {
  const turns = [];
  const host = new WarHost(opts(hub, clock, 'H', 'Ana', {cfg:{sc:'comunidades', diff:'normal', rules:{fog:false, events:true, seasons:true, victory:'dominacion'}, timer:0, ...cfg}, onTurn:(a, b) => turns.push(['H', b.turn, E.hash(b)])}));
  await host.open();
  const guests = [];
  for (const [id, name] of [['G1', 'Luis'], ['G2', 'Marta']]) {
    const g = new WarGuest(opts(hub, clock, id, name, {onTurn:(a, b) => turns.push([id, b.turn, E.hash(b)])}));
    await g.join(); guests.push(g);
  }
  await clock.tick(700);
  host.pick(fid('Madrid'));
  await guests[0].pick(fid('Andalucía'));
  await guests[1].pick(fid('Cataluña'), {name:'Reino de Marta', flag:{layout:'cruz', c:['#123456', '#FFFFFF', '#FFFFFF'], sym:'estrella', sc:'#FFFFFF'}, motto:'Siempre adelante'});
  await clock.tick(700);
  return {host, guests, turns};
}
/** Órdenes razonables para un bando: reclutar y atacar al vecino más débil con todo. */
function plan(g, f) {
  const out = []; let q = 0; let cur = g;
  const mine = E.provincesOf(cur, f);
  if (mine.length) out.push({type:'recruit', f, p:mine[0], n:2, q:q++});
  cur = out.reduce((s, a) => { try { return E.apply(geo, s, a).g; } catch (e) { return s; } }, cur);
  for (const from of E.provincesOf(cur, f)) {
    const to = geo.adj[from].find(t => cur.P.active[t] && cur.P.owner[t] !== f && cur.P.troops[t] < cur.P.troops[from] - 2);
    if (to == null) continue;
    const n = Math.min(cur.P.ready[from], cur.P.troops[from] - 1);
    if (n < 2) continue;
    const a = {type:'attack', f, from, to, n, q:q++, x:[cur.P.owner[to], cur.P.troops[to]]};
    try { cur = E.apply(geo, cur, a).g; out.push(a); } catch (e) {}
    if (out.length > 4) break;
  }
  return out;
}

test('código de sala y datos de la red saneados', () => {
  const c = newCode(() => .5); assert.equal(c.length, 6); assert.equal(cleanCode(' ab-c1 23x '), 'ABC123');
  assert.equal(cleanCustom({name:'<b>Yo</b>', flag:{layout:'cruz', c:['#123456', 'rojo'], sym:'x', sc:'#fff'}, color:'azul', motto:'a'.repeat(60)}).name, 'bYo/b');
  assert.equal(cleanCustom(null), null);
  const a = cleanAction({type:'attack', f:9, from:'3', to:4.7, n:5, q:1, x:[1, 2], evil:'x', gen:1}, 2);
  assert.deepEqual(a, {type:'attack', f:2, from:3, to:4, n:5, q:1, gen:true, x:[1, 2]});
  assert.equal(ordersHash([1, 2]), ordersHash([1, 2])); assert.notEqual(ordersHash([1, 2]), ordersHash([2, 1]));
});

test('sala: entrar, elegir bando sin repetir y empezar todos con la misma partida', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests} = await room(clock, hub);
  assert.deepEqual(host.players.map(p => p.f), [fid('Madrid'), fid('Andalucía'), fid('Cataluña')]);
  await guests[0].pick(fid('Madrid')); await clock.tick(700);
  assert.equal(host.players[1].f, fid('Andalucía'), 'no puede coger un bando ocupado');
  assert.ok(host.canStart());
  await host.start('SALA1'); await clock.tick(10);
  assert.equal(guests[0].phase, 'play');
  assert.equal(E.hash(guests[0].game), E.hash(host.game));
  assert.deepEqual(host.game.humans, [fid('Andalucía'), fid('Cataluña'), fid('Madrid')].sort((a, b) => a - b));
  assert.equal(guests[1].game.F.name[fid('Cataluña')], 'Reino de Marta');
  assert.equal(guests[1].game.motto[fid('Cataluña')], 'Siempre adelante');
});

test('turnos simultáneos: todos los móviles llegan al mismo estado turno a turno', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests, turns} = await room(clock, hub, {diff:'dificil'});
  await host.start('SALA2'); await clock.tick(10);
  const peers = [host, ...guests];
  for (let t = 0; t < 12 && !host.game.over; t++) {
    const turn = host.game.turn;
    for (const p of peers) await p.sendOrders(plan(p.game, p.me));
    await clock.tick(10);
    for (const p of peers) assert.equal(p.game.turn, turn + 1, 'el turno avanza en ' + p.id);
    const hs = new Set(peers.map(p => E.hash(p.game)));
    assert.equal(hs.size, 1, `misma partida en el turno ${turn}`);
    assert.ok(!peers.some(p => p.desynced));
  }
  assert.ok(turns.length >= 3 * 10);
  assert.ok(host.game.stats.conq.some(c => c > 0), 'hay conquistas');
});

test('órdenes que chocan: si la provincia cambia antes, el segundo ataque se anula', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests} = await room(clock, hub, {diff:'facil'});
  await guests[0].pick(fid('Castilla y León')); await clock.tick(700);
  await host.start('SALA3'); await clock.tick(10);
  const g = host.game, A = fid('Madrid'), C = fid('Castilla y León'), B = fid('Castilla-La Mancha');
  // dos humanos atacan la misma provincia de un tercero: Madrid y Castilla y León contra Guadalajara
  const target = E.provincesOf(g, B).find(p => geo.adj[p].some(q => g.P.owner[q] === A) && geo.adj[p].some(q => g.P.owner[q] === C));
  assert.ok(target != null);
  const shot = (f) => { const from = geo.adj[target].find(q => g.P.owner[q] === f); return {type:'attack', f, from, to:target, n:Math.min(g.P.ready[from], g.P.troops[from] - 1), q:0, x:[B, g.P.troops[target]]}; };
  /** @type {any[]} */ let ev = [];
  host.onTurn = (a, b, e) => { ev = e; };
  await host.sendOrders([shot(A)]); await guests[0].sendOrders([shot(C)]); await guests[1].sendOrders([]);
  await clock.tick(10);
  const attacks = ev.filter(e => e.t === 'attack' && e.to === target && (e.f === A || e.f === C));
  const cancels = ev.filter(e => e.t === 'cancel');
  assert.equal(attacks.length + cancels.length, 2);
  if (attacks[0].won || attacks[0].defLoss > 0) assert.equal(cancels.length, 1, 'el segundo ya no encuentra lo que esperaba');
  assert.equal(E.hash(guests[0].game), E.hash(host.game));
});

test('tiempo agotado y abandono: el anfitrión no espera para siempre y el que se va pasa a bot', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests} = await room(clock, hub, {timer:60});
  await host.start('SALA4'); await clock.tick(10);
  await host.sendOrders([]); await guests[0].sendOrders([]);
  assert.equal(host.game.turn, 1, 'falta Marta');
  await clock.tick(60000);
  assert.equal(host.game.turn, 2, 'se cierra al agotarse el tiempo');
  assert.equal(guests[1].game.turn, 2);
  await guests[1].leave(); await clock.tick(10);
  await host.sendOrders([]); await guests[0].sendOrders([]); await clock.tick(10);
  assert.equal(host.game.turn, 3, 'no espera al que se ha ido');
  assert.ok(!host.game.humans.includes(fid('Cataluña')), 'su bando lo lleva un bot');
  assert.equal(E.hash(guests[0].game), E.hash(host.game));
});

test('reconexión: un móvil que vuelve reconstruye la partida desde ntfy', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests} = await room(clock, hub);
  await host.start('SALA5'); await clock.tick(10);
  for (let t = 0; t < 4; t++) { for (const p of [host, ...guests]) await p.sendOrders(plan(p.game, p.me)); await clock.tick(10); }
  guests[1].close();
  const back = new WarGuest(opts(hub, clock, 'G2', 'Marta'));
  await back.join(); await clock.tick(2000);
  assert.equal(back.phase, 'play');
  assert.equal(back.game.turn, host.game.turn);
  assert.equal(E.hash(back.game), E.hash(host.game));
});

test('chat: frases rápidas a todos menos a uno mismo', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const got = [];
  const {host, guests} = await room(clock, hub);
  guests[0].onChat = m => got.push(m);
  await host.start('SALA6'); await clock.tick(10);
  await host.chat(3); await guests[0].chat(1); await clock.tick(10);
  assert.deepEqual(got, [{f:fid('Madrid'), name:'Ana', text:CHAT[3]}]);
});

test('órdenes largas: se trocean en varios mensajes y se juntan', async () => {
  const clock = fakeClock(), hub = fakeNtfy();
  const {host, guests} = await room(clock, hub);
  await host.start('SALA7'); await clock.tick(10);
  const f = host.me, p = E.provincesOf(host.game, f)[0];
  const many = Array.from({length:90}, (_, i) => ({type:'build', f, p, b:'mercado', q:i}));
  await host.sendOrders(many); await guests[0].sendOrders([]); await guests[1].sendOrders([]);
  await clock.tick(10);
  assert.ok(hub.log.filter(m => m.body.t === 'orders' && m.body.f === f).length > 1, 'más de un mensaje');
  assert.equal(host.game.turn, 2); assert.equal(E.hash(guests[1].game), E.hash(host.game));
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

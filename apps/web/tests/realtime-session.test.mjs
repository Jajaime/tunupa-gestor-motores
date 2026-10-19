import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { startRealtimeSession } from '../src/lib/realtime-session.ts';

class FakeSocket extends EventEmitter {
  connects = 0;
  disconnects = 0;
  connect() { this.connects += 1; return this; }
  disconnect() { this.disconnects += 1; return this; }
}
function setup(t, ensureSession = async () => {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const socket = new FakeSocket();
  const states = [];
  let revoked = 0;
  const dispose = startRealtimeSession(socket, {
    ensureSession, onRevoked: () => { revoked += 1; }, onStatus: (s) => states.push(s),
  });
  t.after(dispose);
  return { socket, states, dispose, revoked: () => revoked };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('conectado solo después de session.ready; limpia listeners al desmontar', (t) => {
  const { socket, states, dispose } = setup(t);
  assert.equal(socket.connects, 1);
  socket.emit('connect'); assert.equal(states.length, 0);
  socket.emit('session.ready'); assert.equal(states.at(-1), 'connected');
  dispose(); assert.equal(socket.listenerCount('session.expired'), 0);
});

test('fallo de transporte reintenta sin renovar ni cerrar la sesión', (t) => {
  let renewals = 0;
  const { socket, revoked } = setup(t, async () => { renewals += 1; });
  socket.emit('connect_error', new Error('network'));
  t.mock.timers.tick(1000);
  assert.equal(socket.connects, 2); assert.equal(renewals, 0); assert.equal(revoked(), 0);
});

test('vencimiento repetido comparte recuperación y vuelve a conectar', async (t) => {
  let calls = 0;
  const { socket } = setup(t, async () => { calls += 1; });
  socket.emit('session.expired'); socket.emit('session.expired');
  await flush(); t.mock.timers.tick(1000);
  assert.equal(calls, 1); assert.equal(socket.connects, 2);
});

test('logout durante renovación impide reconectar después de desmontar', async (t) => {
  let resolve;
  const pending = new Promise((r) => { resolve = r; });
  const { socket, dispose } = setup(t, () => pending);
  socket.emit('session.expired'); dispose(); resolve();
  await flush(); t.mock.timers.tick(30_000);
  assert.equal(socket.connects, 1);
});

test('sesión revocada termina los reintentos y notifica autenticación', (t) => {
  const { socket, revoked } = setup(t);
  socket.emit('session.revoked'); t.mock.timers.tick(30_000);
  assert.equal(revoked(), 1); assert.equal(socket.connects, 1);
});

test('renovación rechazada vuelve a login; fallo de red permite reintentar', async (t) => {
  const { socket, revoked } = setup(t, async () => { throw Object.assign(new Error(), { status: 401 }); });
  socket.emit('session.expired'); await flush(); t.mock.timers.tick(30_000);
  assert.equal(revoked(), 1); assert.equal(socket.connects, 1);
});

test('error de red al recuperar conserva la sesión y reintenta', async (t) => {
  const { socket, revoked } = setup(t, async () => { throw Object.assign(new Error(), { status: 0 }); });
  socket.emit('session.expired'); await flush(); t.mock.timers.tick(1000);
  assert.equal(revoked(), 0); assert.equal(socket.connects, 2);
});

test('origen rechazado no inicia un bucle de refresh', (t) => {
  let calls = 0;
  const { socket, states } = setup(t, async () => { calls += 1; });
  socket.emit('connect_error', Object.assign(new Error(), { data: { code: 'ORIGIN_FORBIDDEN' } }));
  t.mock.timers.tick(30_000);
  assert.equal(calls, 0); assert.equal(socket.connects, 1); assert.equal(states.at(-1), 'disconnected');
});

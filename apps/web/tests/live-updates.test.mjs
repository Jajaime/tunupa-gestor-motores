import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createRefreshScheduler } from '../src/lib/refresh-scheduler.ts';
import { startRealtimeSession } from '../src/lib/realtime-session.ts';

const flush = () => new Promise((resolve) => setImmediate(resolve));
function scheduler(t, run) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  const value = createRefreshScheduler(run);
  t.after(() => value.dispose());
  return value;
}
test('una ráfaga produce una recarga y respeta el intervalo mínimo', async (t) => {
  let calls = 0;
  const s = scheduler(t, async () => { calls++; });
  for (let i = 0; i < 50; i++) s.request();
  t.mock.timers.tick(199); await flush(); assert.equal(calls, 0);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 1);
  s.request(true); t.mock.timers.tick(999); await flush(); assert.equal(calls, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
});
test('un evento durante HTTP conserva una pasada pendiente sin solapar consultas', async (t) => {
  let calls = 0, release;
  const s = scheduler(t, async () => { calls++; if (calls === 1) await new Promise((r) => { release = r; }); });
  s.request(true); t.mock.timers.tick(0); await flush();
  s.request(); s.request(); t.mock.timers.tick(5000); await flush(); assert.equal(calls, 1);
  release(); await flush(); t.mock.timers.tick(200); await flush(); assert.equal(calls, 2);
});
test('ocultar pausa HTTP y volver a la pestaña fuerza la reconciliación', async (t) => {
  let calls = 0;
  const s = scheduler(t, async () => { calls++; });
  s.request(); s.setVisible(false); t.mock.timers.tick(60000); await flush();
  s.request(); t.mock.timers.tick(60000); await flush(); assert.equal(calls, 0);
  s.setVisible(true); t.mock.timers.tick(0); await flush(); assert.equal(calls, 1);
});
test('desmontar durante HTTP impide ejecutar trabajo pendiente', async (t) => {
  let calls = 0, release;
  const s = scheduler(t, async () => { calls++; await new Promise((r) => { release = r; }); });
  s.request(true); t.mock.timers.tick(0); await flush(); s.request(); s.dispose();
  release(); await flush(); t.mock.timers.tick(60000); await flush(); assert.equal(calls, 1);
});
test('un fallo HTTP permite una recarga posterior', async (t) => {
  let calls = 0;
  const s = scheduler(t, async () => { calls++; throw new Error('red'); });
  s.request(true); t.mock.timers.tick(0); await flush(); s.request();
  t.mock.timers.tick(1000); await flush(); assert.equal(calls, 2);
});

class Socket extends EventEmitter {
  connected = false;
  connect() { this.connected = true; return this; }
  disconnect() { this.connected = false; return this; }
}
const payload = (type, id = '1') => ({ version: 1, eventId: id, occurredAt: new Date().toISOString(), motorId: 'motor', deviceId: 'device', type, data: {} });
test('los tres eventos disparan invalidación; duplicados y contratos ajenos se ignoran', (t) => {
  const socket = new Socket(), received = [];
  const stop = startRealtimeSession(socket, { ensureSession: async () => {}, onStatus() {}, onRevoked() {}, onData: (e) => received.push(e) });
  t.after(stop);
  for (const type of ['telemetry.received', 'motor.status.changed', 'alarm.changed']) {
    socket.emit(type, payload(type, type)); socket.emit(type, payload(type, type));
  }
  socket.emit('telemetry.received', { ...payload('telemetry.received', 'bad'), version: 2 });
  socket.emit('alarm.changed', payload('telemetry.received', 'wrong'));
  assert.equal(received.length, 3);
  stop(); socket.emit('telemetry.received', payload('telemetry.received', 'late'));
  assert.equal(received.length, 3); assert.equal(socket.listenerCount('alarm.changed'), 0);
});
test('cada session.ready solicita snapshot aunque no haya eventos pendientes', (t) => {
  const socket = new Socket(); let snapshots = 0;
  const stop = startRealtimeSession(socket, { ensureSession: async () => {}, onStatus() {}, onRevoked() {}, onReady: () => snapshots++ });
  t.after(stop);
  socket.emit('session.ready'); socket.emit('session.ready'); assert.equal(snapshots, 2);
  stop(); socket.emit('session.ready'); assert.equal(snapshots, 2);
});

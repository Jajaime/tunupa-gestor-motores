import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { io } from 'socket.io-client';
import { setTimeout as pause } from 'node:timers/promises';
import { createMeasurements } from '../../simulator/dist/scenarios.js';
const require = createRequire(import.meta.url);
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { APP_GUARD } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const cookieParser = require('cookie-parser');
const argon2 = require('argon2');
const {
  CommittedEventsService,
} = require('../dist/realtime/committed-events.service');
const { AuthService } = require('../dist/auth/auth.service');
const { AuthController } = require('../dist/auth/auth.controller');
const { SessionAccessService } = require('../dist/auth/session-access.service');
const { User } = require('../dist/auth/entities/user.entity');
const { AuthSession } = require('../dist/auth/entities/auth-session.entity');
const { AccessTokenGuard } = require('../dist/auth/guards/access-token.guard');
const { CsrfGuard } = require('../dist/auth/guards/csrf.guard');
const { DashboardGateway } = require('../dist/realtime/dashboard.gateway');
const { RealtimeAdapter } = require('../dist/realtime/realtime.adapter');
const {
  DashboardController,
} = require('../dist/dashboard/dashboard.controller');
const { DashboardService } = require('../dist/dashboard/dashboard.service');
const {
  TelemetryIngestionService,
} = require('../dist/telemetry/telemetry-ingestion.service');
const {
  TelemetryValidatorService,
} = require('../dist/telemetry/telemetry-validator.service');
const { MotorStateService } = require('../dist/telemetry/motor-state.service');
const {
  TelemetryWatchdogService,
} = require('../dist/telemetry/telemetry-watchdog.service');
config({ path: resolve('.env'), quiet: true });
config({ path: resolve('../../.env'), override: false, quiet: true });

function event(socket, name, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, done);
      reject(new Error(`No llegó ${name}`));
    }, timeout);
    function done(value) {
      clearTimeout(timer);
      resolve(value);
    }
    socket.once(name, done);
  });
}

test(
  'eventos confirmados: telemetría, alarmas, desconexión y recuperación HTTP',
  { timeout: 30_000 },
  async (t) => {
    for (const key of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'])
      assert(process.env[key], `Falta ${key}`);
    const db = new DataSource({
      type: 'postgres',
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      entities: [User, AuthSession],
      synchronize: false,
      logging: false,
      connectTimeoutMS: 10000,
    });
    await db.initialize();
    const committed = new CommittedEventsService(db);
    const clientId = randomUUID(),
      plantId = randomUUID(),
      motorId = randomUUID(),
      deviceId = randomUUID(),
      userId = randomUUID();
    const code = `EVENTS-${randomUUID()}`;
    let app;
    const sockets = [];
    try {
      const manager = db.manager;
      const source = db;
      await db.transaction(async (m) => {
        await m.query('INSERT INTO public.clients(id,name) VALUES($1,$2)', [
          clientId,
          code,
        ]);
        await m.query(
          'INSERT INTO public.plants(id,client_id,name,code) VALUES($1,$2,$3,$3)',
          [plantId, clientId, code],
        );
        await m.query(
          'INSERT INTO public.motors(id,plant_id,name,code,rated_current) VALUES($1,$2,$3,$3,10)',
          [motorId, plantId, code],
        );
        await m.query(
          "INSERT INTO public.devices(id,plant_id,motor_id,name,device_code,communication_type) VALUES($1,$2,$3,$4,$4,'WIFI')",
          [deviceId, plantId, motorId, code],
        );
      });
      const origin = 'http://localhost:3000';
      const settings = new ConfigService({
        WEB_ORIGIN: origin,
        AUTH_ACCESS_TTL_SECONDS: 120,
        TELEMETRY_TIMEOUT_SECONDS: 30,
        AUTH_REFRESH_TTL_DAYS: 1,
        AUTH_COOKIE_SECURE: false,
        AUTH_MAX_LOGIN_ATTEMPTS: 5,
        AUTH_LOCK_MINUTES: 15,
      });
      const jwt = new JwtService({ secret: randomUUID() + randomUUID() });
      const sessions = new SessionAccessService(jwt, source);
      const auth = new AuthService(
        manager.getRepository(User),
        manager.getRepository(AuthSession),
        jwt,
        settings,
        source,
        sessions,
      );
      const email = `verify-${randomUUID()}@example.invalid`;
      const password = randomUUID() + 'Test1!';
      await manager.getRepository(User).save({
        id: userId,
        email,
        displayName: 'Prueba aislada',
        passwordHash: await argon2.hash(password),
        role: 'ADMIN',
        status: 'ACTIVE',
        failedLoginAttempts: 0,
      });
      const module = await Test.createTestingModule({
        controllers: [AuthController, DashboardController],
        providers: [
          { provide: AuthService, useValue: auth },
          { provide: ConfigService, useValue: settings },
          { provide: SessionAccessService, useValue: sessions },
          DashboardGateway,
          { provide: DashboardService, useValue: new DashboardService(db) },
          {
            provide: CommittedEventsService,
            useValue: committed,
          },
          { provide: APP_GUARD, useClass: CsrfGuard },
          { provide: APP_GUARD, useClass: AccessTokenGuard },
        ],
      }).compile();
      app = module.createNestApplication({ logger: false });
      app.use(cookieParser());
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      app.useWebSocketAdapter(new RealtimeAdapter(app, origin));
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      const jar = new Map();
      const cookies = (map = jar) =>
        [...map].map(([k, v]) => `${k}=${v}`).join('; ');
      async function request(
        path,
        method = 'GET',
        body,
        map = jar,
        csrf = true,
      ) {
        const response = await fetch(`${base}/api/v1/auth/${path}`, {
          method,
          headers: {
            Cookie: cookies(map),
            Origin: origin,
            'Content-Type': 'application/json',
            ...(csrf && map.has('tunupa_csrf')
              ? { 'X-CSRF-Token': map.get('tunupa_csrf') }
              : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        for (const header of response.headers.getSetCookie()) {
          const pair = header.split(';')[0];
          const at = pair.indexOf('=');
          map.set(pair.slice(0, at), pair.slice(at + 1));
        }
        return response;
      }
      function socket(cookie = cookies(), requestOrigin = origin) {
        const client = io(`${base}/dashboard`, {
          transports: ['websocket'],
          reconnection: false,
          forceNew: true,
          autoConnect: false,
          extraHeaders: { Origin: requestOrigin, Cookie: cookie },
        });
        sockets.push(client);
        return client;
      }
      async function connected(cookie = cookies()) {
        const client = socket(cookie);
        const ready = event(client, 'session.ready');
        client.connect();
        assert.equal((await ready).version, 1);
        return client;
      }
      await request('csrf');
      assert.equal(
        (await request('login', 'POST', { email, password })).status,
        200,
      );
      const client = await connected();
      const received = [];
      for (const name of [
        'telemetry.received',
        'motor.status.changed',
        'alarm.changed',
      ])
        client.on(name, (e) => received.push(e));
      const state = new MotorStateService(settings, committed);
      const ingestion = new TelemetryIngestionService(db, state, committed);
      const validator = new TelemetryValidatorService();
      const topic = `tunupa/v1/devices/${code}/telemetry`;
      let sequence = 0;
      function payload(scenario = 'normal') {
        return {
          schemaVersion: 1,
          messageId: randomUUID(),
          deviceCode: code,
          measuredAt: new Date().toISOString(),
          sequence: ++sequence,
          scenario,
          measurements: createMeasurements(scenario, 10, () => 0.5),
        };
      }
      async function ingest(value, service = ingestion) {
        const raw = Buffer.from(JSON.stringify(value));
        const validated = await validator.validateMessage(topic, raw);
        assert.equal(validated.valid, true, validated.reason);
        return service.processTelemetry(topic, raw, validated.value);
      }
      async function send(scenario = 'normal') {
        const value = payload(scenario);
        const next = event(client, 'telemetry.received');
        await ingest(value);
        const e = await next;
        assert.equal(e.data.messageId, value.messageId);
        assert.equal(e.version, 1);
        assert.equal(e.motorId, motorId);
        assert.equal(e.data.measurements.length, 6);
        const rows = await db.query(
          'SELECT count(*)::integer AS n FROM public.telemetry WHERE device_id=$1 AND measured_at=$2',
          [deviceId, value.measuredAt],
        );
        assert(
          rows[0].n >= 6,
          'El evento debe corresponder a mediciones persistidas',
        );
        return value;
      }
      async function snapshot() {
        const response = await fetch(`${base}/api/v1/dashboard/motors`, {
          headers: { Cookie: cookies() },
        });
        assert.equal(response.status, 200);
        return (await response.json()).find((m) => m.id === motorId);
      }
      const first = await send();
      assert(
        received.some(
          (e) =>
            e.type === 'motor.status.changed' && e.data.status === 'RUNNING',
        ),
      );
      assert.equal((await snapshot()).operationalStatus, 'RUNNING');
      let count = received.length;
      assert.equal((await ingest(first)).duplicate, true);
      await pause(100);
      assert.equal(received.length, count);
      assert.equal(
        (await validator.validateMessage(topic, Buffer.from('{}'))).valid,
        false,
      );
      const discarded = payload();
      await assert.rejects(
        db.transaction(async (manager) => {
          const scoped = new TelemetryIngestionService(
            { transaction: (work) => manager.transaction(work) },
            state,
            committed,
          );
          await ingest(discarded, scoped);
          await pause(50);
          assert.equal(received.length, count, 'Un savepoint no debe publicar');
          throw new Error('rollback intencional');
        }),
        /rollback intencional/,
      );
      await pause(100);
      assert.equal(received.length, count);
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::integer AS n FROM public.telemetry_ingestions WHERE message_id=$1',
            [discarded.messageId],
          )
        )[0].n,
        0,
      );
      t.diagnostic(
        'OK: COMMIT publica; duplicados, savepoints y rollback no filtran eventos.',
      );
      for (const [scenario, alarmType] of [
        ['overtemperature', 'HIGH_TEMPERATURE'],
        ['overcurrent', 'OVERCURRENT'],
        ['high-vibration', 'HIGH_VIBRATION'],
      ]) {
        await send(scenario);
        const created = received.findLast(
          (e) => e.type === 'alarm.changed' && e.data.alarmType === alarmType,
        );
        assert.equal(created.data.change, 'CREATED');
        assert.equal(created.data.severity, 'CRITICAL');
        assert.equal((await snapshot()).activeAlarmCount, 1);
        await send(scenario);
        const updated = received.findLast((e) => e.type === 'alarm.changed');
        assert.equal(updated.data.change, 'UPDATED');
        assert.equal(updated.data.id, created.data.id);
        await send();
        const resolved = received.findLast((e) => e.type === 'alarm.changed');
        assert.equal(resolved.data.change, 'RESOLVED');
        assert.equal(resolved.data.id, created.data.id);
        assert(resolved.data.resolvedAt);
        assert.equal((await snapshot()).activeAlarmCount, 0);
      }
      t.diagnostic(
        'OK: temperatura, corriente y vibración crean/actualizan/resuelven una sola alarma.',
      );
      const statusTopic = `tunupa/v1/devices/${code}/status`;
      const offline = {
        schemaVersion: 1,
        deviceCode: code,
        status: 'OFFLINE',
        reason: 'integration-test',
        occurredAt: new Date().toISOString(),
      };
      const statusRaw = Buffer.from(JSON.stringify(offline));
      const statusDto = await validator.validateMessage(statusTopic, statusRaw);
      assert.equal(statusDto.valid, true, statusDto.reason);
      let changed = event(client, 'motor.status.changed');
      await ingestion.processStatus(statusDto.value);
      assert.equal((await changed).data.status, 'OFFLINE');
      await send();
      await db.query(
        "UPDATE public.devices SET last_telemetry_received_at=now()-interval '2 minutes' WHERE id=$1",
        [deviceId],
      );
      // Se ejecuta SQL real, pero el adaptador de prueba limita la selección del
      // monitor al motor sintético; nunca cambia dispositivos del usuario.
      const scopedWatchdog = {
        transaction: (work) =>
          db.transaction((manager) => {
            const scoped = Object.create(manager);
            scoped.query = (sql, params) => {
              if (sql.includes('SELECT m.id FROM public.motors AS m')) {
                sql = sql.replace(
                  'WHERE EXISTS (',
                  'WHERE m.id = $2 AND EXISTS (',
                );
                params = [...params, motorId];
              }
              return manager.query(sql, params);
            };
            return work(scoped);
          }),
      };
      changed = event(client, 'motor.status.changed');
      assert.equal(
        await new TelemetryWatchdogService(
          scopedWatchdog,
          settings,
          state,
        ).checkNow(),
        1,
      );
      const timeout = await changed;
      assert.equal(timeout.data.status, 'OFFLINE');
      assert.equal(timeout.data.reason, 'TELEMETRY_TIMEOUT');
      await send();
      assert.equal((await snapshot()).operationalStatus, 'RUNNING');
      t.diagnostic(
        'OK: OFFLINE MQTT y silencio de telemetría notifican desconexión y recuperación.',
      );
      client.disconnect();
      const missed = payload('overtemperature');
      await ingest(missed);
      const reconnected = await connected();
      const current = await snapshot();
      assert.equal(current.operationalStatus, 'CRITICAL');
      assert.equal(current.activeAlarmCount, 1);
      assert.equal(
        current.latestMeasurements.TEMPERATURE.value,
        missed.measurements.find((m) => m.type === 'TEMPERATURE').value,
      );
      const history = await fetch(
        `${base}/api/v1/dashboard/motors/${motorId}/history?measurementType=TEMPERATURE&limit=120`,
        { headers: { Cookie: cookies() } },
      );
      assert.equal(history.status, 200);
      assert((await history.json()).length > 0);
      let afterLogout = 0;
      reconnected.on('telemetry.received', () => afterLogout++);
      const revoked = event(reconnected, 'session.revoked');
      assert.equal((await request('logout', 'POST')).status, 204);
      await revoked;
      await ingest(payload());
      await pause(100);
      assert.equal(afterLogout, 0);
      t.diagnostic(
        'OK: reconectar recupera snapshot/histórico; logout impide recibir datos.',
      );
    } finally {
      for (const socket of sockets) socket.disconnect();
      if (app) await app.close();
      committed.onModuleDestroy();
      try {
        // IDs aleatorios propios: la limpieza nunca selecciona registros demo.
        await db.transaction(async (m) => {
          await m.query('DELETE FROM public.telemetry WHERE device_id=$1', [
            deviceId,
          ]);
          await m.query(
            'DELETE FROM public.telemetry_ingestions WHERE device_id=$1',
            [deviceId],
          );
          await m.query('DELETE FROM public.alarms WHERE motor_id=$1', [
            motorId,
          ]);
          await m.query('DELETE FROM public.devices WHERE id=$1', [deviceId]);
          await m.query('DELETE FROM public.motors WHERE id=$1', [motorId]);
          await m.query('DELETE FROM public.plants WHERE id=$1', [plantId]);
          await m.query('DELETE FROM public.clients WHERE id=$1', [clientId]);
          await m.query('DELETE FROM public.auth_events WHERE user_id=$1', [
            userId,
          ]);
          await m.query('DELETE FROM public.users WHERE id=$1', [userId]);
        });
      } finally {
        await db.destroy();
      }
    }
  },
);

import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import test from 'node:test';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { createMeasurements } from '../../simulator/dist/scenarios.js';
import ingestionModule from '../dist/telemetry/telemetry-ingestion.service.js';
import eventsModule from '../dist/realtime/committed-events.service.js';
import stateModule from '../dist/telemetry/motor-state.service.js';
import watchdogModule from '../dist/telemetry/telemetry-watchdog.service.js';

config({ path: resolve(process.cwd(), '.env'), quiet: true });
config({
  path: resolve(process.cwd(), '../../.env'),
  override: false,
  quiet: true,
});

test('telemetría repetida, alarmas y recuperación con el driver PostgreSQL real', async () => {
  for (const key of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB']) {
    assert(
      process.env[key],
      `Falta ${key} en la configuración local de la API.`,
    );
  }
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    synchronize: false,
    logging: false,
    connectTimeoutMS: 10_000,
  });
  await dataSource.initialize();
  const events = new eventsModule.CommittedEventsService(dataSource);
  const runner = dataSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    const manager = runner.manager;
    // now() queda fijo dentro de la transacción exterior de esta prueba.
    const clock = await manager.query(
      "SELECT now() - interval '1 second' AS measured_at",
    );
    const measuredAt = clock[0].measured_at.toISOString();
    const clientId = randomUUID(),
      plantId = randomUUID(),
      motorId = randomUUID(),
      deviceId = randomUUID();
    const code = `VERIFY-${randomUUID()}`;
    await manager.query('INSERT INTO public.clients(id,name) VALUES($1,$2)', [
      clientId,
      code,
    ]);
    await manager.query(
      'INSERT INTO public.plants(id,client_id,name,code) VALUES($1,$2,$3,$3)',
      [plantId, clientId, code],
    );
    await manager.query(
      'INSERT INTO public.motors(id,plant_id,name,code,rated_current) VALUES($1,$2,$3,$3,10)',
      [motorId, plantId, code],
    );
    await manager.query(
      "INSERT INTO public.devices(id,plant_id,motor_id,name,device_code,communication_type) VALUES($1,$2,$3,$4,$4,'WIFI')",
      [deviceId, plantId, motorId, code],
    );

    // Cada transacción del servicio usa un savepoint dentro de la prueba exterior.
    const scopedSource = { transaction: (work) => manager.transaction(work) };
    const settings = {
      getOrThrow: (key) => (key === 'TELEMETRY_TIMEOUT_SECONDS' ? 30 : 5000),
    };
    const motorState = new stateModule.MotorStateService(settings, events);
    const ingestion = new ingestionModule.TelemetryIngestionService(
      scopedSource,
      motorState,
      events,
    );
    let sequence = 0;
    async function send(scenario) {
      const payload = {
        schemaVersion: 1,
        messageId: randomUUID(),
        deviceCode: code,
        measuredAt,
        sequence: ++sequence,
        scenario,
        measurements: createMeasurements(scenario, 10, () => 0.5),
      };
      const result = await ingestion.processTelemetry(
        `tunupa/v1/devices/${code}/telemetry`,
        Buffer.from(JSON.stringify(payload)),
        payload,
      );
      return { payload, result };
    }

    assert.equal((await send('normal')).result.operationalStatus, 'RUNNING');
    for (const [scenario, alarm] of [
      ['overtemperature', 'HIGH_TEMPERATURE'],
      ['overcurrent', 'OVERCURRENT'],
      ['high-vibration', 'HIGH_VIBRATION'],
    ]) {
      for (let i = 0; i < 3; i++) {
        assert.equal(
          (await send(scenario)).result.operationalStatus,
          'CRITICAL',
        );
      }
      const open = await manager.query(
        "SELECT alarm_type,severity FROM public.alarms WHERE device_id=$1 AND status IN ('ACTIVE','ACKNOWLEDGED')",
        [deviceId],
      );
      assert.deepEqual(open, [{ alarm_type: alarm, severity: 'CRITICAL' }]);
      assert.equal((await send('normal')).result.operationalStatus, 'RUNNING');
      const resolved = await manager.query(
        'SELECT status FROM public.alarms WHERE device_id=$1 AND alarm_type=$2 ORDER BY started_at DESC LIMIT 1',
        [deviceId, alarm],
      );
      assert.equal(resolved[0].status, 'RESOLVED');
    }

    const { payload } = await send('normal');
    const duplicate = await ingestion.processTelemetry(
      `tunupa/v1/devices/${code}/telemetry`,
      Buffer.from(JSON.stringify(payload)),
      payload,
    );
    assert.equal(duplicate.duplicate, true);
    const ingestions = await manager.query(
      'SELECT count(*)::integer AS n FROM public.telemetry_ingestions WHERE device_id=$1',
      [deviceId],
    );
    const measurements = await manager.query(
      'SELECT count(*)::integer AS n FROM public.telemetry WHERE device_id=$1',
      [deviceId],
    );
    assert.equal(ingestions[0].n, sequence);
    assert.equal(measurements[0].n, sequence * 6);

    await manager.query(
      "UPDATE public.devices SET last_telemetry_received_at=now()-interval '2 minutes' WHERE id=$1",
      [deviceId],
    );
    const watchdog = new watchdogModule.TelemetryWatchdogService(
      scopedSource,
      settings,
      motorState,
    );
    const expired = await watchdog.checkNow();
    assert(expired >= 1);
    const offline = await manager.query(
      'SELECT operational_status FROM public.motors WHERE id=$1',
      [motorId],
    );
    assert.equal(offline[0].operational_status, 'OFFLINE');
    assert.equal((await send('normal')).result.operationalStatus, 'RUNNING');
  } finally {
    try {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
    } finally {
      try {
        await runner.release();
      } finally {
        events.onModuleDestroy();
        await dataSource.destroy();
      }
    }
  }
});

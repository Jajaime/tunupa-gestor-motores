import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { connectAsync, type MqttClient } from 'mqtt';

const scenarios = [
  'normal',
  'overtemperature',
  'overcurrent',
  'high-vibration',
  'connection-loss',
] as const;

type Scenario = (typeof scenarios)[number];
type Quality = 'GOOD' | 'UNCERTAIN' | 'BAD';

interface Measurement {
  type: string;
  value: number;
  unit: string;
  quality: Quality;
}

interface TelemetryMessage {
  schemaVersion: 1;
  messageId: string;
  deviceCode: string;
  measuredAt: string;
  sequence: number;
  scenario: Scenario;
  measurements: Measurement[];
}

const mqttUrl = requiredEnvironment('MQTT_URL');
const username = requiredEnvironment('MQTT_USERNAME');
const password = requiredEnvironment('MQTT_PASSWORD');

const selectedScenario = parseScenario(
  argumentValue('--scenario') ??
    process.env.SIMULATOR_SCENARIO ??
    'normal',
);

const deviceCodes = parseDeviceCodes(
  argumentValue('--devices') ??
    process.env.SIMULATOR_DEVICE_CODES ??
    '',
);

const intervalMs = parsePositiveInteger(
  argumentValue('--interval') ??
    process.env.SIMULATOR_INTERVAL_MS ??
    '2000',
  'intervalo',
);

const connectionLossAfter = parsePositiveInteger(
  process.env.SIMULATOR_CONNECTION_LOSS_AFTER ?? '5',
  'cantidad de mensajes antes de la desconexión',
);

const clients = new Map<string, MqttClient>();
let shuttingDown = false;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }

  return value;
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  if (index < 0) {
    return undefined;
  }

  return process.argv[index + 1];
}

function parseScenario(value: string): Scenario {
  if (!scenarios.includes(value as Scenario)) {
    throw new Error(
      `Escenario inválido "${value}". Opciones: ${scenarios.join(', ')}.`,
    );
  }

  return value as Scenario;
}

function parseDeviceCodes(value: string): string[] {
  const codes = [
    ...new Set(
      value
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean),
    ),
  ];

  if (codes.length === 0) {
    throw new Error('Debe configurarse al menos un código de dispositivo.');
  }

  return codes;
}

function parsePositiveInteger(value: string, description: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`El ${description} debe ser un entero positivo.`);
  }

  return parsed;
}

function randomBetween(minimum: number, maximum: number): number {
  return minimum + Math.random() * (maximum - minimum);
}

function rounded(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function measurement(
  type: string,
  value: number,
  unit: string,
  quality: Quality = 'GOOD',
): Measurement {
  return {
    type,
    value: rounded(value),
    unit,
    quality,
  };
}

function createMeasurements(scenario: Scenario): Measurement[] {
  let temperatureC = randomBetween(48, 65);
  let currentA = randomBetween(2.4, 3.4);
  let vibrationMmS = randomBetween(1.2, 2.8);

  switch (scenario) {
    case 'overtemperature':
      temperatureC = randomBetween(90, 110);
      break;

    case 'overcurrent':
      currentA = randomBetween(5.5, 8);
      temperatureC = randomBetween(65, 82);
      break;

    case 'high-vibration':
      vibrationMmS = randomBetween(8, 15);
      break;

    case 'normal':
    case 'connection-loss':
      break;
  }

  return [
    measurement('ROTATION_SPEED', randomBetween(1430, 1490), 'rpm'),
    measurement('TEMPERATURE', temperatureC, 'C'),
    measurement('CURRENT', currentA, 'A'),
    measurement('VOLTAGE', randomBetween(215, 225), 'V'),
    measurement('FREQUENCY', randomBetween(49.8, 50.2), 'Hz'),
    measurement('VIBRATION', vibrationMmS, 'mm/s'),
  ];
}

function statusTopic(deviceCode: string): string {
  return `tunupa/v1/devices/${deviceCode}/status`;
}

function telemetryTopic(deviceCode: string): string {
  return `tunupa/v1/devices/${deviceCode}/telemetry`;
}

function statusPayload(
  deviceCode: string,
  status: 'ONLINE' | 'OFFLINE',
  reason: string,
): string {
  return JSON.stringify({
    schemaVersion: 1,
    deviceCode,
    status,
    reason,
    occurredAt: new Date().toISOString(),
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runDevice(deviceCode: string): Promise<void> {
  const clientId = `sim-${deviceCode
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')}-${randomUUID().slice(0, 8)}`;

  const client = await connectAsync(mqttUrl, {
    username,
    password,
    clientId,
    clean: true,
    connectTimeout: 10_000,
    reconnectPeriod: 1_000,
    protocolVersion: 4,
    will: {
      topic: statusTopic(deviceCode),
      payload: statusPayload(
        deviceCode,
        'OFFLINE',
        'UNEXPECTED_DISCONNECT',
      ),
      qos: 1,
      retain: true,
    },
  });

  clients.set(deviceCode, client);

  client.on('reconnect', () => {
    console.warn(`[${deviceCode}] intentando reconectar...`);
  });

  client.on('error', (error) => {
    console.error(`[${deviceCode}] error MQTT: ${error.message}`);
  });

  await client.publishAsync(
    statusTopic(deviceCode),
    statusPayload(deviceCode, 'ONLINE', 'SIMULATOR_STARTED'),
    {
      qos: 1,
      retain: true,
    },
  );

  console.log(
    `[${deviceCode}] conectado como ${clientId}; escenario=${selectedScenario}`,
  );

  let sequence = 0;

  while (!shuttingDown) {
    sequence += 1;

    const payload: TelemetryMessage = {
      schemaVersion: 1,
      messageId: randomUUID(),
      deviceCode,
      measuredAt: new Date().toISOString(),
      sequence,
      scenario: selectedScenario,
      measurements: createMeasurements(selectedScenario),
    };

    await client.publishAsync(
      telemetryTopic(deviceCode),
      JSON.stringify(payload),
      {
        qos: 1,
        retain: false,
      },
    );

    console.log(
      `[${deviceCode}] medición ${sequence} publicada (${selectedScenario})`,
    );

    if (
      selectedScenario === 'connection-loss' &&
      sequence >= connectionLossAfter
    ) {
      console.warn(
        `Simulando pérdida abrupta de conexión después de ${sequence} mensajes.`,
      );

      await delay(250);

      // SIGKILL impide el cierre MQTT normal y activa el Last Will.
      process.kill(process.pid, 'SIGKILL');
    }

    await delay(intervalMs);
  }
}

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log('\nCerrando simulador correctamente...');

  await Promise.all(
    [...clients.entries()].map(async ([deviceCode, client]) => {
      try {
        await client.publishAsync(
          statusTopic(deviceCode),
          statusPayload(deviceCode, 'OFFLINE', 'GRACEFUL_SHUTDOWN'),
          {
            qos: 1,
            retain: true,
          },
        );

        await client.endAsync();
        console.log(`[${deviceCode}] desconectado.`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Error desconocido';

        console.error(`[${deviceCode}] error al cerrar: ${message}`);
      }
    }),
  );
}

process.once('SIGINT', () => {
  void shutdown().then(() => process.exit(0));
});

process.once('SIGTERM', () => {
  void shutdown().then(() => process.exit(0));
});

try {
  console.log(`Broker: ${mqttUrl}`);
  console.log(`Dispositivos: ${deviceCodes.join(', ')}`);
  console.log(`Intervalo: ${intervalMs} ms`);

  await Promise.all(deviceCodes.map((deviceCode) => runDevice(deviceCode)));
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Error desconocido';

  console.error(`No fue posible iniciar el simulador: ${message}`);
  await shutdown();
  process.exitCode = 1;
}
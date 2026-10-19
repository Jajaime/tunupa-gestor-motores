import assert from 'node:assert/strict';
import test from 'node:test';
import { connectionLabel, summarizeMotorStates } from '../src/lib/dashboard-status.ts';

test('advertencias y críticos siguen en línea; desconocidos no se cuentan como desconectados', () => {
  const motors = [
    { operationalStatus: 'RUNNING', activeAlarmCount: 0 },
    { operationalStatus: 'WARNING', activeAlarmCount: 1 },
    { operationalStatus: 'CRITICAL', activeAlarmCount: 2 },
    { operationalStatus: 'OFFLINE', activeAlarmCount: 1 },
    { operationalStatus: 'UNKNOWN', activeAlarmCount: 0 },
  ];
  assert.deepEqual(summarizeMotorStates(motors), { online: 3, offline: 1, unknown: 1, alarms: 4 });
});

test('un listado vacío tiene conteos cero', () => {
  assert.deepEqual(summarizeMotorStates([]), { online: 0, offline: 0, unknown: 0, alarms: 0 });
});

test('el indicador distingue consulta pendiente, correcta y fallida', () => {
  assert.equal(connectionLabel('connecting'), 'Conectando con API');
  assert.equal(connectionLabel('connected'), 'API conectada');
  assert.equal(connectionLabel('disconnected'), 'API no disponible');
});

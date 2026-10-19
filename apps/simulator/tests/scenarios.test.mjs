import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeasurements, scenarios } from '../src/scenarios.ts';

const value = (rows, type) => rows.find(row => row.type === type).value;
const ratedCurrents = [0.001, 3, 10, 25];
const samples = [0, 0.5, 1];

test('normal queda por debajo de todos los umbrales de advertencia', () => {
  for (const rated of ratedCurrents) for (const sample of samples) {
    const rows = createMeasurements('normal', rated, () => sample);
    assert(value(rows, 'TEMPERATURE') < 80);
    assert(value(rows, 'CURRENT') < rated * 1.6);
    assert(value(rows, 'VIBRATION') < 4.5);
  }
});

test('sobrecorriente supera el umbral crítico para distintas corrientes nominales', () => {
  for (const rated of ratedCurrents) for (const sample of samples) {
    const rows = createMeasurements('overcurrent', rated, () => sample);
    assert(value(rows, 'CURRENT') > rated * 2);
    assert(value(rows, 'TEMPERATURE') < 80);
    assert(value(rows, 'VIBRATION') < 4.5);
  }
});

test('sobretemperatura genera solo la condición crítica de temperatura', () => {
  for (const sample of samples) {
    const rows = createMeasurements('overtemperature', 10, () => sample);
    assert(value(rows, 'TEMPERATURE') > 95);
    assert(value(rows, 'CURRENT') < 16);
    assert(value(rows, 'VIBRATION') < 4.5);
  }
});

test('vibración elevada supera su umbral crítico sin provocar otras condiciones', () => {
  for (const sample of samples) {
    const rows = createMeasurements('high-vibration', 10, () => sample);
    assert(value(rows, 'VIBRATION') > 7.1);
    assert(value(rows, 'TEMPERATURE') < 80);
    assert(value(rows, 'CURRENT') < 16);
  }
});

test('cada escenario conserva las seis mediciones y su contrato', () => {
  const types = ['ROTATION_SPEED', 'TEMPERATURE', 'CURRENT', 'VOLTAGE', 'FREQUENCY', 'VIBRATION'];
  for (const scenario of scenarios) {
    const rows = createMeasurements(scenario, 3);
    assert.deepEqual(rows.map(row => row.type), types);
    assert(rows.every(row => Number.isFinite(row.value) && row.unit && row.quality === 'GOOD'));
  }
});

test('volver al escenario normal no conserva valores de una falla anterior', () => {
  createMeasurements('overtemperature', 3);
  createMeasurements('overcurrent', 3);
  createMeasurements('high-vibration', 3);
  const rows = createMeasurements('normal', 3, () => 0.5);
  assert(value(rows, 'TEMPERATURE') < 80);
  assert(value(rows, 'CURRENT') < 4.8);
  assert(value(rows, 'VIBRATION') < 4.5);
});

test('rechaza una corriente nominal inválida', () => {
  for (const invalid of [0, -1, NaN, Infinity]) {
    assert.throws(() => createMeasurements('normal', invalid), /corriente nominal/);
  }
});

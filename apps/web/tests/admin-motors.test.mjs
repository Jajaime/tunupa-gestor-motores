import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSidebarItems } from '../src/lib/sidebar-navigation.ts';
import {
  buildAdminMotorPayload, emptyAdminMotorForm, adminMotorFormFromRecord,
} from '../src/lib/admin-motor-form.ts';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('Gestión de motores solo aparece en el menú ADMIN', () => {
  const admin = getSidebarItems('ADMIN');
  assert.ok(admin.some((item) => item.id === 'adminMotors' && item.href === '/admin/motors'));
  for (const role of ['OPERATOR', 'VIEWER', undefined]) {
    assert.ok(!getSidebarItems(role).some((item) => item.id === 'adminMotors'));
  }
  assert.ok(admin.some((item) => item.href === '/motors'), 'No sustituir el inventario de lectura');
});

test('convierte formulario en DTO válido y no permite cambiar plantId en PATCH', () => {
  const form = {
    ...emptyAdminMotorForm, plantId: 'planta-1', name: '  Motor principal  ',
    code: '  M-001 ', ratedPowerKw: '0.373', ratedVoltage: '220',
    ratedCurrent: '2.5', ratedFrequencyHz: '50.000',
  };
  const payload = buildAdminMotorPayload(form);
  assert.equal(payload.name, 'Motor principal');
  assert.equal(payload.code, 'M-001');
  assert.equal(payload.ratedPowerKw, 0.373);
  assert.equal(payload.ratedVoltage, 220);
  assert.equal(payload.ratedCurrent, 2.5);
  assert.equal(payload.ratedFrequencyHz, 50);
  assert.equal(payload.manufacturer, null);
  assert.equal('plantId' in payload, false);
  assert.deepEqual(Object.keys(payload).sort(), [
    'name', 'code', 'status', 'manufacturer', 'model', 'serialNumber',
    'ratedPowerKw', 'ratedVoltage', 'ratedCurrent', 'ratedFrequencyHz',
  ].sort());
});

test('valida campos obligatorios y valores nominales positivos con 3 decimales', () => {
  for (const value of ['-1', '0', '1.2345', 'NaN', 'Infinity', '1,3', '1e3']) {
    assert.throws(() => buildAdminMotorPayload({
      ...emptyAdminMotorForm, name: 'Motor', code: 'M-001', ratedVoltage: value,
    }), Error, value);
  }
  assert.throws(() => buildAdminMotorPayload({ ...emptyAdminMotorForm, name: ' ', code: 'M-001' }), /obligatorios/);
  assert.equal(buildAdminMotorPayload({ ...emptyAdminMotorForm, name: 'Motor', code: 'M-001' }).ratedVoltage, null);
});

test('la edición recupera los datos técnicos del motor sin cambiar la planta', () => {
  const form = adminMotorFormFromRecord({
    id: 'motor-1', plantId: 'planta-1', name: 'Motor', code: 'M-001',
    manufacturer: 'WEG', model: 'W22', serialNumber: null,
    ratedPowerKw: 5.5, ratedVoltage: 380, ratedCurrent: null,
    ratedFrequencyHz: 50, status: 'MAINTENANCE',
    operationalStatus: 'UNKNOWN', lastTelemetryAt: null,
  });
  assert.equal(form.plantId, 'planta-1');
  assert.equal(form.status, 'MAINTENANCE');
  assert.equal(form.ratedPowerKw, '5.5');
  assert.equal(form.ratedCurrent, '');
});

test('la pantalla y los clientes API respetan el guard administrativo, sesión y CSRF', () => {
  const component = read('src/components/admin/motors-admin.tsx');
  const api = read('src/lib/api.ts');
  const page = read('src/app/admin/motors/page.tsx');
  const sidebar = read('src/components/layout/app-sidebar.tsx');
  assert.match(component, /user\?\.role !== 'ADMIN'/);
  assert.match(component, /detail\.client\.status !== 'ACTIVE'/);
  assert.match(component, /plant\.status === 'ACTIVE'/);
  assert.match(component, /disabled=\{busy \|\| Boolean\(editingId\)\}/);
  assert.match(component, /getAdminMotor\(id\)/);
  assert.match(component, /createAdminMotor\(create\)/);
  assert.match(component, /updateAdminMotor\(editingId, payload\)/);
  assert.match(page, /<AuthBoundary><MotorsAdmin \/><\/AuthBoundary>/);
  assert.match(api, /return mutate<AdminMotorRecord>\('\/motors', data\)/);
  assert.match(api, /return mutate<AdminMotorRecord>\(`\/motors\/\$\{encodeURIComponent\(id\)\}`, data, 'PATCH'\)/);
  assert.match(api, /async function mutate</);
  assert.match(api, /'X-CSRF-Token': await getCsrf\(\)/);
  assert.match(sidebar, /id === 'adminMotors'/);
  assert.match(read('src/app/layout.tsx'), /tunupa-admin-motors\.css/);
});

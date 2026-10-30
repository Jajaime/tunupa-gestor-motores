import assert from 'node:assert/strict';
import test from 'node:test';
import { getSidebarItems } from '../src/lib/sidebar-navigation.ts';

test('administración puede acceder al panel y a clientes', () => {
  assert.deepEqual(getSidebarItems('ADMIN'), [
    { id: 'dashboard', href: '/', label: 'Panel general — Admin' },
    { id: 'clients', href: '/admin/clients', label: 'Clientes' },
    { id: 'motors', href: '/motors', label: 'Mis motores' },
    { id: 'alarms', href: '/alarms', label: 'Alarmas y eventos' },
    { id: 'devices', href: '/devices', label: 'Dispositivos' },
  ]);
});

test('operador y visor no ven la administración', () => {
  for (const role of ['OPERATOR', 'VIEWER']) {
    assert.deepEqual(getSidebarItems(role), [
      { id: 'dashboard', href: '/', label: 'Resumen del cliente' },
      { id: 'motors', href: '/motors', label: 'Mis motores' },
      { id: 'alarms', href: '/alarms', label: 'Alarmas y eventos' },
      { id: 'devices', href: '/devices', label: 'Dispositivos' },
    ]);
  }
  assert.deepEqual(getSidebarItems(undefined), [
    { id: 'dashboard', href: '/', label: 'Resumen del cliente' },
  ]);
});

test('la navegación solo publica rutas implementadas', () => {
  for (const role of ['ADMIN', 'OPERATOR', 'VIEWER']) {
    assert.ok(getSidebarItems(role).every((item) => ['/', '/admin/clients', '/motors', '/alarms', '/devices'].includes(item.href)));
  }
});

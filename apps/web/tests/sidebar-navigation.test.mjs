import assert from 'node:assert/strict';
import test from 'node:test';
import { getSidebarItems } from '../src/lib/sidebar-navigation.ts';

test('administración puede acceder al panel y a clientes', () => {
  assert.deepEqual(getSidebarItems('ADMIN'), [
    { id: 'dashboard', href: '/', label: 'Panel general — Admin' },
    { id: 'clients', href: '/admin/clients', label: 'Clientes' },
  ]);
});

test('operador y visor no ven la administración', () => {
  for (const role of ['OPERATOR', 'VIEWER', undefined]) {
    assert.deepEqual(getSidebarItems(role), [{
      id: 'dashboard', href: '/', label: 'Panel general',
    }]);
  }
});

test('la navegación no publica rutas de módulos sin implementar', () => {
  for (const role of ['ADMIN', 'OPERATOR', 'VIEWER']) {
    assert.ok(getSidebarItems(role).every((item) => ['/', '/admin/clients'].includes(item.href)));
  }
});

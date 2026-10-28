import assert from 'node:assert/strict';
import test from 'node:test';
import { getSidebarItems } from '../src/lib/sidebar-navigation.ts';

test('administración muestra solo el panel general administrativo', () => {
  assert.deepEqual(getSidebarItems('ADMIN'), [{
    id: 'dashboard', href: '#dashboard', label: 'Panel general — Admin',
  }]);
});

test('operador y visor no reciben una etiqueta de administrador', () => {
  for (const role of ['OPERATOR', 'VIEWER', undefined]) {
    assert.deepEqual(getSidebarItems(role), [{
      id: 'dashboard', href: '#dashboard', label: 'Panel general',
    }]);
  }
});

test('la navegación no publica rutas de módulos sin implementar', () => {
  for (const role of ['ADMIN', 'OPERATOR', 'VIEWER']) {
    assert.deepEqual(getSidebarItems(role).map((item) => item.href), ['#dashboard']);
  }
});

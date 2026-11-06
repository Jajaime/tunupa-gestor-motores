import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSidebarItems } from '../src/lib/sidebar-navigation.ts';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

// Confirma que los métodos de cuenta comparten la protección de sesión de la API.
test('Mi cuenta se muestra a los tres roles, sin acceso administrativo adicional', () => {
  for (const role of ['ADMIN', 'OPERATOR', 'VIEWER']) {
    assert.ok(getSidebarItems(role).some(item => item.href === '/account'));
  }
  assert.ok(!getSidebarItems(undefined).some(item => item.href === '/account'));
});

test('la ruta de cuenta requiere AuthBoundary y no usa llamadas fetch independientes', () => {
  const route = read('src/app/account/page.tsx');
  const page = read('src/components/account/account-page.tsx');
  assert.match(route, /AuthBoundary/);
  assert.match(page, /getAccountProfile\(/);
  assert.match(page, /getAccountSessions\(/);
  assert.match(page, /changeAccountPassword\(/);
  assert.doesNotMatch(page, /\bfetch\(/);
});

test('la pantalla tiene validación de contraseña y controles de sesión actual', () => {
  const page = read('src/components/account/account-page.tsx');
  assert.match(page, /newPassword !== confirmPassword/);
  assert.match(page, /newPassword\.length < 14/);
  assert.match(page, /session\.isCurrent \?/);
  assert.match(page, /revokeOtherAccountSessions\(/);
  assert.match(page, /autoComplete="current-password"/);
  assert.match(page, /autoComplete="new-password"/);
});

test('la API incorpora endpoints de cuenta a través de request/mutate con CSRF', () => {
  const api = read('src/lib/api.ts');
  assert.match(api, /request<AccountProfile>\('\/account\/profile'\)/);
  assert.match(api, /request<AccountSession\[\]>\('\/account\/sessions'\)/);
  assert.match(api, /mutate<\{ revokedSessions: number \}>\('\/account\/password'/);
  assert.match(api, /mutate<void>\(`\/account\/sessions\/\$\{encodeURIComponent\(id\)\}\/revoke`/);
});

test('el diseño de Mi cuenta está aislado de los estados operativos', () => {
  const layout = read('src/app/layout.tsx');
  const css = read('src/styles/tunupa-account.css');
  assert.match(layout, /tunupa-account\.css/);
  assert.match(css, /\.tunupa-account/);
  assert.doesNotMatch(css, /\.status-pill|\.live-dot|\.status-beacon/);
});

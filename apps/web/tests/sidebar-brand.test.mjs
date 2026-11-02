import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const sidebar = read('src/components/layout/app-sidebar.tsx');
const css = read('src/styles/tunupa-sidebar.css');
const layout = read('src/app/layout.tsx');

test('la navegación usa logos TUNUPA oficiales sin duplicar ni alterar el microchip', () => {
  for (const path of ['public/brand/tunupa/logo-horizontal-light.svg', 'public/brand/tunupa/symbol-orange.svg']) {
    assert.ok(existsSync(resolve(root, path)));
    assert.ok(sidebar.includes(path.replace('public/', '/')));
  }
  assert.doesNotMatch(sidebar, /groundtek-logo\.png/i);
  assert.match(sidebar, /Un desarrollo de/);
  assert.match(sidebar, /GroundTEK/);
});

test('mantiene rutas por rol y estados de conexión existentes', () => {
  assert.match(sidebar, /getSidebarItems\(role\)\.map/);
  assert.match(sidebar, /aria-current=\{active \? 'page'/);
  assert.match(sidebar, /connectionLabel\(apiConnection\)/);
  assert.match(sidebar, /lastRefresh\.toLocaleTimeString\('es-CL'\)/);
  assert.match(sidebar, /item\.href !== '\/'/);
});

test('menú móvil tiene controles accesibles y se puede abrir y cerrar', () => {
  assert.match(sidebar, /aria-expanded=\{menuOpen\}/);
  assert.match(sidebar, /aria-controls="tunupa-primary-navigation"/);
  assert.match(sidebar, /setMobileMenu/);
  assert.match(sidebar, /onClick=\{\(\) => setMobileMenu\(/);
  assert.match(css, /\.tunupa-sidebar-nav\.is-open/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(min-width: 761px\) and \(max-width: 1100px\)/);
});

test('el tema sidebar se carga de último y respeta iconos semánticos', () => {
  assert.ok(layout.indexOf("import '../styles/tunupa-sidebar.css';") > layout.indexOf("import '../styles/tunupa-theme.css';"));
  assert.match(css, /var\(--tunupa-copper\)/);
  assert.match(css, /var\(--tunupa-orange\)/);
  for (const state of ['.live-dot.connecting', '.live-dot.disconnected', '.status-pill.online']) {
    assert.ok(!css.includes(state), `${state} debe seguir definido en el tema existente`);
  }
  assert.doesNotMatch(sidebar, /\/admin\/clients|\/devices|\/motors|\/alarms/);
});

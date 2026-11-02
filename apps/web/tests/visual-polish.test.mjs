import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (name) => readFileSync(resolve(root, name), 'utf8');
const css = read('src/styles/tunupa-polish.css');
const layout = read('src/app/layout.tsx');

test('Patch 08: el refinamiento se importa después del dashboard y de los módulos', () => {
  const last = layout.indexOf("import '../styles/tunupa-polish.css';");
  assert.ok(last > layout.indexOf("import '../styles/tunupa-dashboard.css';"));
  assert.ok(last > layout.indexOf("import '../styles/tunupa-modules.css';"));
});

test('Patch 08: adapta encabezados, tablas y series a pantallas reducidas', () => {
  for (const rule of ['.content:not(#dashboard) .topbar', '.fleet-table-wrap', '#dashboard .chart-container', 'overflow-wrap: anywhere', '@media (max-width: 760px)', '@media (max-width: 400px)']) {
    assert.ok(css.includes(rule), `Falta ${rule}`);
  }
});

test('Patch 08: permite foco visible y respeta reducción de movimiento', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(prefers-contrast: more\)/);
  assert.match(css, /min-height: 44px/);
});

test('Patch 08: no sobrescribe estados críticos ni introduce enlaces externos', () => {
  for (const state of ['--green:', '--red:', '--amber:', '.status-pill.critical', '.status-pill.warning', '.live-dot.disconnected']) {
    assert.ok(!css.includes(state), `No modificar estado operativo ${state}`);
  }
  assert.doesNotMatch(css, /https?:\/\//);
  assert.doesNotMatch(css, /@import/);
});

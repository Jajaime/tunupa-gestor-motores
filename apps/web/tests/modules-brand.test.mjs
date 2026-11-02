import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const css = read('src/styles/tunupa-modules.css');
const layout = read('src/app/layout.tsx');
const pkg = JSON.parse(read('package.json'));

test('módulos: los estilos se cargan después del tema, sidebar y login', () => {
  const history = [
    "import './globals.css';",
    "import '../styles/tunupa-brand-tokens.css';",
    "import '../styles/tunupa-theme.css';",
    "import '../styles/tunupa-sidebar.css';",
    "import '../styles/tunupa-login.css';",
    "import '../styles/tunupa-modules.css';",
  ];
  const positions = history.map(item => layout.indexOf(item));
  assert.ok(positions.every(pos => pos >= 0), 'Falta una importación del tema');
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(pkg.scripts.test, /test:modules-brand/);
});

test('módulos: existen filtros, tablas, selección de clientes y fichas', () => {
  for (const selector of [
    '.admin-clients-header', '.admin-client-item[aria-pressed=',
    '.fleet-toolbar', '.fleet-table-wrap', '.fleet-table th',
    '.fleet-detail-summary article', '.fleet-specs',
    '.alarms-filters', '.alarms-detail-grid', '.alarms-timeline li',
  ]) assert.ok(css.includes(selector), `Falta ${selector}`);
});

test('módulos: usan la paleta de marca y mantienen estados operativos', () => {
  for (const color of ['var(--tunupa-orange)', 'var(--tunupa-orange-light)', 'var(--brand-button)', 'var(--tunupa-module-outline)']) {
    assert.ok(css.includes(color), `Falta ${color}`);
  }
  for (const semantic of [
    '.status-pill', '.status-beacon', '.fleet-condition', '.alarms-pill',
    '.live-dot', '.realtime-', '.quality-good', '--green:', '--red:', '--amber:',
  ]) assert.ok(!css.includes(`${semantic} {`) && !css.includes(`${semantic}.`), `No cambiar estado: ${semantic}`);
});

test('módulos: navegación accesible, responsividad y movimiento reducido', () => {
  for (const selector of [':focus-visible', '@media (max-width: 760px)', '@media (max-width: 600px)', '@media (prefers-reduced-motion: reduce)']) {
    assert.ok(css.includes(selector), `Falta ${selector}`);
  }
  assert.match(css, /overflow-x:\s*auto/);
  assert.doesNotMatch(css, /@import\s+url|https?:\/\//);
});

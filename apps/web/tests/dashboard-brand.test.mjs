import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const layout = read('src/app/layout.tsx');
const pkg = JSON.parse(read('package.json'));
const css = read('src/styles/tunupa-dashboard.css');

// El comportamiento del dashboard sigue en Dashboard/useLiveDashboard sin cambios.
test('el estilo del dashboard se importa después del tema, sidebar, login y módulos', () => {
  const files = [
    'tunupa-theme.css', 'tunupa-sidebar.css', 'tunupa-login.css',
    'tunupa-modules.css', 'tunupa-dashboard.css',
  ];
  let previous = -1;
  for (const name of files) {
    const index = layout.indexOf(`import '../styles/${name}';`);
    assert.ok(index > previous, `${name} debe importarse en orden`);
    previous = index;
  }
  assert.ok(existsSync(resolve(root, 'src/styles/tunupa-dashboard.css')));
  assert.match(pkg.scripts.test, /test:dashboard-brand/);
});

test('el rediseño queda limitado al dashboard y utiliza recursos oficiales TUNUPA', () => {
  assert.match(css, /#dashboard\.content\s*\{/);
  assert.match(css, /#dashboard \.topbar\s*\{/);
  assert.match(css, /#dashboard \.summary-grid/);
  assert.match(css, /#dashboard \.motor-row/);
  assert.match(css, /#dashboard \.measurements-grid/);
  assert.match(css, /#dashboard \.chart-container/);
  assert.match(css, /\/brand\/tunupa\/symbol-orange\.svg/);
  for (const token of ['--tunupa-orange', '--tunupa-orange-light', '--tunupa-ice']) {
    assert.ok(css.includes(token), `Falta token de marca ${token}`);
  }
  // No permitir selectores globales de estilos semánticos en esta hoja.
  for (const line of css.split('\n')) {
    if (/^\s*(?:\.status-pill|\.live-dot|\.status-beacon|\.realtime-connected|\.realtime-disconnected)\b/.test(line)) {
      assert.fail(`Selector semántico global inesperado: ${line}`);
    }
  }
});

test('se conservan colores operativos de calidad y conexión', () => {
  assert.doesNotMatch(css, /--(?:green|green-soft|amber|red)\s*:/);
  assert.doesNotMatch(css, /\.status-pill\.(?:online|warning|critical)\s*\{/);
  assert.doesNotMatch(css, /\.live-dot\.(?:connecting|disconnected)\s*\{/);
  assert.match(css, /background:\s*currentColor/);
  assert.match(css, /strong\.text-alert\s*\{\s*color:\s*var\(--red\)/);
});

test('es adaptable, navegable por teclado y respeta movimiento reducido', () => {
  for (const bp of ['960', '760', '520']) {
    assert.ok(css.includes(`@media (max-width: ${bp}px)`), `Falta breakpoint ${bp}`);
  }
  assert.match(css, /#dashboard \.motor-row:focus-visible/);
  assert.match(css, /#dashboard \.chart-heading select:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

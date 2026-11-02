import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const tokens = read('src/styles/tunupa-brand-tokens.css');
const theme = read('src/styles/tunupa-theme.css');
const layout = read('src/app/layout.tsx');

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16) / 255);
  const linear = channels.map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

test('se importan los estilos después del CSS histórico, en orden correcto', () => {
  const oldCss = layout.indexOf("import './globals.css';");
  const brand = layout.indexOf("import '../styles/tunupa-brand-tokens.css';");
  const overrides = layout.indexOf("import '../styles/tunupa-theme.css';");
  assert.ok(oldCss >= 0 && brand > oldCss && overrides > brand);
});

test('la paleta B mantiene los cinco tonos aprobados', () => {
  for (const color of ['#2A1B12', '#4A2C1A', '#F15A00', '#FF8C42', '#F3F4F6']) {
    assert.ok(tokens.includes(color), `Falta ${color}`);
  }
});

test('el tema conserva modo oscuro y referencia los colores oficiales', () => {
  assert.match(theme, /color-scheme:\s*dark/);
  assert.match(theme, /--tunupa-accent:\s*var\(--tunupa-orange\)/);
  assert.match(theme, /--tunupa-accent-readable:\s*var\(--tunupa-orange-light\)/);
  assert.match(theme, /--brand:\s*var\(--tunupa-accent-readable\)/);
  assert.match(theme, /--sidebar|\.sidebar\s*\{/);
});

test('botón de acción: contraste de texto blanco WCAG AA', () => {
  const match = theme.match(/--brand-button:\s*(#[0-9a-f]{6})/i);
  assert.ok(match, 'Falta color de botón');
  assert.ok(contrast('#ffffff', match[1]) >= 4.5);
});

test('no sobrescribe las variables operativas de estados', () => {
  for (const name of ['--green:', '--green-soft:', '--red:', '--amber:']) {
    assert.equal(theme.includes(name), false, `El tema no debe reemplazar ${name}`);
  }
  for (const selector of ['.live-dot', '.status-beacon', '.status-pill.online', '.status-pill.warning', '.status-pill.critical', '.realtime-connected', '.realtime-disconnected']) {
    assert.equal(theme.includes(`${selector} {`), false, `No cambiar estado operativo: ${selector}`);
  }
});

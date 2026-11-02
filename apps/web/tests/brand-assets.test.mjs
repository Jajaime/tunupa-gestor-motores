import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../public/brand/tunupa/', import.meta.url));
const cssPath = fileURLToPath(new URL('../src/styles/tunupa-brand-tokens.css', import.meta.url));
const files = [
  'symbol.svg', 'symbol-dark.svg', 'symbol-light.svg', 'symbol-orange.svg',
  'logo-horizontal.svg', 'logo-horizontal-light.svg',
  'logo-vertical.svg', 'logo-vertical-light.svg',
  'app-icon.svg', 'app-icon-512.png', 'symbol-512.png', 'logo-horizontal.png', 'README.md',
];

test('identidad TUNUPA: existen todos los recursos oficiales', () => {
  for (const file of files) {
    const path = join(root, file);
    assert.ok(existsSync(path), `Falta ${file}`);
    assert.ok(statSync(path).size > 100, `${file} está vacío`);
  }
});

test('variantes SVG preservan la geometría del símbolo y son autocontenidas', () => {
  const symbols = [
    'symbol.svg', 'symbol-dark.svg', 'symbol-light.svg', 'symbol-orange.svg',
    'logo-horizontal.svg', 'logo-horizontal-light.svg',
    'logo-vertical.svg', 'logo-vertical-light.svg', 'app-icon.svg',
  ].map(name => readFileSync(join(root,name),'utf8'));
  // Misma silueta en todas las variantes (el primer elemento es la referencia).
  const ref = symbols[0].match(/fill-rule="evenodd" d="([^"]+)"/)?.[1];
  assert.ok(ref);
  for (const svg of symbols) {
    assert.match(svg, /<svg\s/);
    assert.ok(svg.includes(`fill-rule="evenodd" d="${ref}"`));
    assert.doesNotMatch(svg, /<script|<foreignObject|<image|xlink:href|@import/i);
    assert.match(svg, /<\/svg>/);
  }
});

test('exportaciones PNG contienen cabecera correcta', () => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const name of ['app-icon-512.png', 'symbol-512.png', 'logo-horizontal.png']) {
    const content = readFileSync(join(root, name));
    assert.ok(content.subarray(0,8).equals(signature), `${name} no es PNG`);
  }
});

test('paleta B contiene los cinco colores aprobados', () => {
  const css = readFileSync(cssPath, 'utf8');
  for (const color of ['#2A1B12', '#4A2C1A', '#F15A00', '#FF8C42', '#F3F4F6']) {
    assert.ok(css.includes(color), `Falta ${color}`);
  }
});

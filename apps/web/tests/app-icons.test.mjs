import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path));
const text = (path) => read(path).toString('utf8');
const sourceIcon = text('public/brand/tunupa/app-icon.svg');
const svgIcon = text('src/app/icon.svg');

function pngDimensions(path) {
  const png = read(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

test('favicon SVG es copia literal del icono oficial del Patch 01', () => {
  assert.equal(svgIcon, sourceIcon);
  assert.match(svgIcon, /viewBox="0 0 512 512"/);
  assert.match(svgIcon, /fill-rule="evenodd" d="[^"]+"/);
  assert.doesNotMatch(svgIcon, /<script|<foreignObject|<image|xlink:href|@import/i);
});

test('iOS 180 px y web 192/512 px usan tamaños correctos', () => {
  assert.deepEqual(pngDimensions('src/app/apple-icon.png'), [180, 180]);
  assert.deepEqual(pngDimensions('public/brand/tunupa/app-icon-192.png'), [192, 192]);
  assert.deepEqual(pngDimensions('public/brand/tunupa/app-icon-512.png'), [512, 512]);
});

test('favicon ICO contiene 16, 32 y 48 px', () => {
  const ico = read('src/app/favicon.ico');
  assert.ok(statSync(resolve(root,'src/app/favicon.ico')).size > 200);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  const count = ico.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const width = ico[6 + i * 16] || 256;
    const height = ico[7 + i * 16] || 256;
    assert.equal(width, height);
    sizes.push(width);
  }
  assert.deepEqual(sizes.sort((a,b) => a-b), [16,32,48]);
});

test('manifiesto y metadatos declaran TUNUPA con rutas de iconos válidas', () => {
  const manifest = text('src/app/manifest.ts');
  const layout = text('src/app/layout.tsx');
  assert.match(manifest, /name: 'TUNUPA \| Gestor de motores'/);
  assert.match(manifest, /app-icon-192\.png/);
  assert.match(manifest, /app-icon-512\.png/);
  assert.match(manifest, /background_color: '#1B1D22'/);
  assert.match(manifest, /theme_color: '#2A1B12'/);
  assert.match(layout, /applicationName: 'TUNUPA'/);
  assert.match(layout, /title: 'TUNUPA \| Gestor de motores'/);
});

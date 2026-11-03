import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSidebarItems } from '../src/lib/sidebar-navigation.ts';
import { alignTrendSeries, resolveTrendWindow } from '../src/lib/trends-model.ts';

const read = file => readFileSync(resolve(import.meta.dirname, '..', file), 'utf8');

test('Tendencias se publica para ADMIN, OPERATOR y VIEWER sin administrar clientes ajenos', () => {
  for (const role of ['ADMIN', 'OPERATOR', 'VIEWER']) {
    assert.ok(getSidebarItems(role).some(x => x.id === 'trends' && x.href === '/trends'));
  }
  assert.ok(!getSidebarItems(undefined).some(x => x.id === 'trends'));
  const page = read('src/components/trends/trends-page.tsx');
  assert.match(page, /getFleetMotors\(\)/);
  assert.match(page, /getMotorTrends\(/);
  assert.doesNotMatch(page, /getAdminClients|localStorage/);
});

test('rangos automáticos son limitados y tienen agrupación representativa', () => {
  const clock = Date.parse('2026-11-03T12:00:00Z');
  assert.equal(resolveTrendWindow('24h', '', '', clock).bucket, '5m');
  assert.equal(resolveTrendWindow('7d', '', '', clock).bucket, '1h');
  assert.equal(resolveTrendWindow('30d', '', '', clock).bucket, '6h');
  assert.equal(resolveTrendWindow('24h', '', '', clock).to, '2026-11-03T12:00:00.000Z');
  assert.equal(resolveTrendWindow('24h', '', '', clock).from, '2026-11-02T12:00:00.000Z');
});

test('rangos personalizados rechazan fechas inválidas, invertidas y demasiado extensas', () => {
  const now = Date.parse('2026-11-03T23:00:00Z');
  assert.throws(() => resolveTrendWindow('custom', '', '', now));
  assert.throws(() => resolveTrendWindow('custom', '2026-02-30', '2026-03-01', now));
  assert.throws(() => resolveTrendWindow('custom', '2026-11-04', '2026-11-01', now));
  assert.throws(() => resolveTrendWindow('custom', '2026-01-01', '2026-05-01', now));
});

test('agregaciones comparativas preservan huecos, orden temporal y rechazan unidades incompatibles', () => {
  const point = (bucketAt, average, unit='°C') => ({ bucketAt, average, minimum: average, maximum: average, unit, sampleCount: 1 });
  const series = [
    { id: 'a', label: 'Motor A', points: [point('2026-11-03T01:00:00Z', 9), point('2026-11-03T03:00:00Z', 10)] },
    { id: 'b', label: 'Motor B', points: [point('2026-11-03T02:00:00Z', 11)] },
  ];
  const result = alignTrendSeries(series);
  assert.equal(result.unit, '°C');
  assert.deepEqual(result.rows.map(r => [r.series0, r.series1]), [[9, undefined], [undefined, 11], [10, undefined]]);
  const withGap = alignTrendSeries([{ id: 'a', label: 'A', points: series[0].points }], '1h');
  assert.deepEqual(withGap.rows.map(r => r.series0), [9, undefined, 10]);
  assert.throws(() => alignTrendSeries([{ id: 'x', label: 'X', points: [point('2026-11-03T01:00:00Z', 2, 'rpm'), point('2026-11-03T02:00:00Z', 3, 'Hz')] }]));
});

test('los estilos están aislados y la API conserva cookies, sesión y autorización en servidor', () => {
  const api = read('src/lib/api.ts');
  const css = read('src/styles/tunupa-trends.css');
  const page = read('src/app/trends/page.tsx');
  assert.match(api, /return request<import\('\.\/trends-model'\)\.TrendPoint\[\]>/);
  assert.match(api, /\/trends\/motors\/\$\{encodeURIComponent\(motorId\)\}/);
  assert.doesNotMatch(api, /fetch\([^\n]*\/trends\/motors/);
  assert.match(page, /AuthBoundary/);
  assert.match(css, /\.tunupa-trends/);
  assert.doesNotMatch(css, /\.status-pill|\.live-dot|\.status-beacon/);
});

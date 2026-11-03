import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildReportCsv, reportFilename, summarizeReport } from '../src/lib/reports-model.ts';
import { getSidebarItems } from '../src/lib/sidebar-navigation.ts';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const sample = {
  clientName: 'Empresa; Ejemplo', plantName: 'Planta "Norte"',
  motorName: '=HYPERLINK("https://ejemplo.com")', motorCode: '../MOTOR-01',
  measurementName: 'Corriente',
  window: { from: '2026-11-02T12:00:00.000Z', to: '2026-11-03T12:00:00.000Z', bucket: '5m' },
  generatedAt: '2026-11-03T12:00:00.000Z',
  points: [
    { bucketAt: '2026-11-03T10:00:00.000Z', average: 1.5, minimum: 1, maximum: 2, sampleCount: 4, unit: 'A' },
    { bucketAt: '2026-11-03T10:05:00.000Z', average: 2.5, minimum: 2, maximum: 3, sampleCount: 2, unit: 'A' },
  ],
};

test('Informes aparece para ADMIN, OPERATOR y VIEWER sin revelar administración', () => {
  for (const role of ['ADMIN', 'OPERATOR', 'VIEWER']) {
    assert.ok(getSidebarItems(role).some(x => x.href === '/reports' && x.label === 'Informes'));
  }
  assert.ok(!getSidebarItems('VIEWER').some(x => x.href === '/admin/motors'));
  assert.ok(!getSidebarItems(undefined).some(x => x.href === '/reports'));
});

test('resumen calcula promedio ponderado por muestras, mínimo y máximo reales', () => {
  const result = summarizeReport(sample.points);
  assert.equal(result.sampleCount, 6);
  assert.equal(result.intervalCount, 2);
  assert.equal(result.average, 11 / 6);
  assert.equal(result.minimum, 1);
  assert.equal(result.maximum, 3);
  assert.equal(result.unit, 'A');
  assert.deepEqual(summarizeReport([]), { average: null, minimum: null, maximum: null, sampleCount: 0, intervalCount: 0, unit: '' });
});

test('rechaza unidades incompatibles, promedios no finitos y muestras inválidas', () => {
  assert.throws(() => summarizeReport([...sample.points, { ...sample.points[0], unit: 'V' }]));
  assert.throws(() => summarizeReport([{ ...sample.points[0], sampleCount: 0 }]));
  assert.throws(() => summarizeReport([{ ...sample.points[0], average: Number.NaN }]));
  assert.throws(() => summarizeReport([{ ...sample.points[0], minimum: 10 }]));
});

test('CSV incluye BOM UTF-8, separador ;, decimal , y neutraliza fórmulas', () => {
  const csv = buildReportCsv(sample);
  assert.ok(csv.startsWith('\uFEFF'));
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /;1,5;1;2;4;"A"$/);
  assert.match(lines[2], /;2,5;2;3;2;"A"$/);
  assert.match(lines[1], /"Empresa; Ejemplo"/);
  assert.match(lines[1], /"Planta ""Norte"""/);
  assert.match(lines[1], /"'=HYPERLINK/);
});

test('nombre de archivo CSV no contiene rutas externas ni separadores', () => {
  const name = reportFilename(sample);
  assert.match(name, /^tunupa-informe-[\w-]+\.csv$/);
  assert.ok(name.endsWith('-2026-11-02.csv'));
});

test('usa API con cookies y permisos; impresión excluye sidebar y formularios', () => {
  const page = read('src/app/reports/page.tsx');
  const component = read('src/components/reports/reports-page.tsx');
  const css = read('src/styles/tunupa-reports.css');
  const api = read('src/lib/api.ts');
  assert.match(page, /AuthBoundary/);
  assert.match(component, /getFleetMotors\(\)/);
  assert.match(component, /getMotorTrends\(motor\.id/);
  assert.match(component, /resolveTrendWindow\(/);
  assert.match(component, /window\.print\(\)/);
  assert.match(component, /buildReportCsv\(report\)/);
  assert.doesNotMatch(component, /fetch\(|localStorage|sessionStorage|innerHTML/);
  assert.match(api, /credentials: 'include'/);
  assert.match(css, /@media print/);
  assert.match(css, /\.app-shell > \.sidebar/);
  assert.doesNotMatch(css, /\.live-dot|\.status-pill/);
});

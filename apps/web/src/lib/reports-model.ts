import type { TrendPoint, TrendWindow } from './trends-model';

export interface MotorReport {
  clientName: string;
  plantName: string;
  motorName: string;
  motorCode: string;
  measurementName: string;
  window: TrendWindow;
  points: TrendPoint[];
  generatedAt: string;
}

export function summarizeReport(points: TrendPoint[]) {
  const total = points.reduce((n, p) => n + p.sampleCount, 0);
  const units = new Set(points.map(p => p.unit));
  if (units.size > 1) throw new Error('El histórico contiene unidades incompatibles.');
  if (points.some(p => !Number.isFinite(p.average) || !Number.isFinite(p.minimum)
    || !Number.isFinite(p.maximum) || !Number.isSafeInteger(p.sampleCount)
    || p.sampleCount <= 0 || p.minimum > p.average || p.average > p.maximum)) {
    throw new Error('El histórico contiene datos inconsistentes.');
  }
  return {
    average: total ? points.reduce((n, p) => n + p.average * p.sampleCount, 0) / total : null,
    minimum: points.length ? Math.min(...points.map(p => p.minimum)) : null,
    maximum: points.length ? Math.max(...points.map(p => p.maximum)) : null,
    sampleCount: total, intervalCount: points.length, unit: [...units][0] ?? '',
  };
}

/** Evita que códigos y nombres se interpreten como fórmulas en hojas de cálculo. */
function csvText(value: string): string {
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Valor de telemetría inválido.');
  return String(value).replace('.', ',');
}

/** CSV UTF-8 BOM, separador ; y decimal , para Excel en Chile. Fechas ISO UTC. */
export function buildReportCsv(report: MotorReport): string {
  summarizeReport(report.points);
  const header = ['Empresa', 'Planta', 'Motor', 'Código motor', 'Variable',
    'Desde UTC', 'Hasta UTC', 'Agrupación', 'Fecha/hora UTC',
    'Promedio', 'Mínimo', 'Máximo', 'Muestras', 'Unidad'];
  const rows = report.points.map(p => [
    csvText(report.clientName), csvText(report.plantName), csvText(report.motorName),
    csvText(report.motorCode), csvText(report.measurementName),
    csvText(report.window.from), csvText(report.window.to), csvText(report.window.bucket),
    csvText(p.bucketAt), csvNumber(p.average), csvNumber(p.minimum),
    csvNumber(p.maximum), String(p.sampleCount), csvText(p.unit),
  ].join(';'));
  return `\uFEFF${[header.map(csvText).join(';'), ...rows].join('\r\n')}\r\n`;
}

export function reportFilename(report: MotorReport): string {
  const safeName = (name: string, limit: number) => name.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, limit) || 'dato';
  return `tunupa-informe-${safeName(report.motorCode, 40)}-${safeName(report.measurementName, 30)}-${report.window.from.slice(0, 10)}.csv`;
}

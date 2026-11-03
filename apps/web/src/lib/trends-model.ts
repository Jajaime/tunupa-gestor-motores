export interface TrendPoint {
  bucketAt: string;
  average: number;
  minimum: number;
  maximum: number;
  sampleCount: number;
  unit: string;
}

export type TrendPeriod = '24h' | '7d' | '30d' | 'custom';
export type TrendBucket = '5m' | '15m' | '1h' | '6h' | '1d';

export interface TrendWindow { from: string; to: string; bucket: TrendBucket; }

function localDay(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Selecciona una fecha válida.');
  const date = new Date(`${day}T00:00:00`);
  const parts = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  if (!Number.isFinite(date.getTime()) || parts !== day) throw new Error('Selecciona una fecha válida.');
  return date;
}

export function resolveTrendWindow(
  period: TrendPeriod, fromDay = '', toDay = '', now = Date.now(),
): TrendWindow {
  let start: number;
  let end: number;
  if (period === 'custom') {
    if (!fromDay || !toDay) throw new Error('Indica ambas fechas del período.');
    start = localDay(fromDay).getTime();
    const nextDay = localDay(toDay);
    nextDay.setDate(nextDay.getDate() + 1); // día final completo (hora local)
    end = Math.min(nextDay.getTime(), now);
  } else {
    const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;
    start = now - days * 86_400_000;
    end = now;
  }
  const width = end - start;
  if (!Number.isFinite(width) || width <= 0 || width > 31 * 86_400_000) {
    throw new Error('El período debe ser válido y no superar 31 días.');
  }
  const bucket: TrendBucket = width <= 36 * 3_600_000 ? '5m'
    : width <= 4 * 86_400_000 ? '15m'
      : width <= 14 * 86_400_000 ? '1h' : '6h';
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString(), bucket };
}

export interface TrendSeries { id: string; label: string; points: TrendPoint[]; }
export interface ChartRow { timestamp: number; [key: string]: number; }

/** Align comparison series on identical UTC time buckets, without inventing observations. */
export function alignTrendSeries(
  series: TrendSeries[], bucket?: TrendBucket,
): { rows: ChartRow[]; unit: string } {
  const units = new Set(series.flatMap(s => s.points.map(p => p.unit)));
  if (units.size > 1) throw new Error('Las mediciones tienen unidades distintas; no es seguro compararlas.');
  const byTime = new Map<number, ChartRow>();
  for (let i = 0; i < series.length; i += 1) {
    for (const point of series[i].points) {
      const timestamp = Date.parse(point.bucketAt);
      if (!Number.isFinite(timestamp)) continue;
      const row = byTime.get(timestamp) ?? { timestamp };
      row[`series${i}`] = point.average;
      byTime.set(timestamp, row);
    }
  }
  const milliseconds: Record<TrendBucket, number> = {
    '5m': 300_000, '15m': 900_000, '1h': 3_600_000,
    '6h': 21_600_000, '1d': 86_400_000,
  };
  if (bucket && byTime.size) {
    const existing = [...byTime.keys()].sort((a, b) => a - b);
    const step = milliseconds[bucket];
    // Missing buckets are explicit gaps; never invent a smooth signal across silence.
    for (let t = existing[0]; t <= existing[existing.length - 1]; t += step) {
      if (!byTime.has(t)) byTime.set(t, { timestamp: t });
    }
  }
  return { rows: [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp), unit: [...units][0] ?? '' };
}

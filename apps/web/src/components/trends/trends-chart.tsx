'use client';

import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ChartRow, TrendSeries } from '@/lib/trends-model';

const palette = ['#FF8C42', '#76B9F6'];
const formatTime = (timestamp: number) => new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'short', timeStyle: 'short',
}).format(new Date(timestamp));

export function TrendsChart({ rows, series, unit }: {
  rows: ChartRow[]; series: TrendSeries[]; unit: string;
}) {
  if (!rows.length) return <p className="trends-empty" role="status">Sin mediciones para este período.</p>;
  return (
    <div className="trends-chart" role="img" aria-label="Gráfico comparativo de promedios de telemetría">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 22, right: 20, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']}
            scale="time" tickFormatter={formatTime} minTickGap={44}
            stroke="var(--chart-axis)" tickLine={false} />
          <YAxis width={62} stroke="var(--chart-axis)" tickLine={false}
            tickFormatter={value => Number(value).toLocaleString('es-CL', { maximumFractionDigits: 2 })} />
          <Tooltip labelFormatter={value => formatTime(Number(value))}
            formatter={value => [`${Number(value).toLocaleString('es-CL', { maximumFractionDigits: 2 })} ${unit}`, 'Promedio']}
            contentStyle={{ borderRadius: 12, background: '#292b31', border: '1px solid #775340', color: '#fff' }}
            labelStyle={{ color: '#f3f4f6' }} itemStyle={{ color: '#f3f4f6' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((motor, i) => <Line key={motor.id} name={motor.label}
            dataKey={`series${i}`} type="linear" connectNulls={false}
            stroke={palette[i]} strokeWidth={2.5} dot={false}
            isAnimationActive={false} activeDot={{ r: 4 }} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

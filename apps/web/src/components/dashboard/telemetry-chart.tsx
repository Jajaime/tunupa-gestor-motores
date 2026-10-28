'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TelemetryHistoryPoint } from '@/lib/types';

interface TelemetryChartProps {
  data: TelemetryHistoryPoint[];
  unit?: string;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function TelemetryChart({ data, unit }: TelemetryChartProps) {
  if (data.length === 0) {
    return (
      <div className="chart-empty">
        Aún no hay muestras para esta variable y motor.
      </div>
    );
  }

  return (
    <div className="chart-container" aria-label="Gráfico histórico de telemetría">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="measuredAt"
            tickFormatter={formatTime}
            minTickGap={36}
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
            width={54}
          />
          <Tooltip
            labelFormatter={(value) =>
              new Intl.DateTimeFormat('es-CL', {
                dateStyle: 'medium',
                timeStyle: 'medium',
              }).format(new Date(String(value)))
            }
            formatter={(value) => [`${Number(value).toFixed(2)} ${unit ?? ''}`, 'Valor']}
            contentStyle={{
              borderRadius: 12,
              borderColor: 'var(--line)',
              backgroundColor: 'var(--surface-raised)',
              color: 'var(--ink)',
            }}
            labelStyle={{ color: 'var(--ink)' }}
            itemStyle={{ color: 'var(--ink)' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--brand)"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, fill: 'var(--brand-hover)', strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

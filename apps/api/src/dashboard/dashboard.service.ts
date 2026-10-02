import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TelemetryHistoryQueryDto } from './dto/telemetry-history-query.dto';

export interface LatestMeasurement {
  value: number;
  unit: string;
  quality: string;
  measuredAt: string;
}

export interface DashboardMotorSummary {
  id: string;
  plantId: string;
  plantName: string;
  name: string;
  code: string;
  status: string;
  operationalStatus: string;
  lastTelemetryAt: string | null;
  device: {
    id: string;
    code: string;
    status: string;
    lastConnectionAt: string | null;
  } | null;
  activeAlarmCount: number;
  latestMeasurements: Record<string, LatestMeasurement>;
}

export interface TelemetryHistoryPoint {
  measurementType: string;
  value: number;
  unit: string;
  quality: string;
  measuredAt: string;
}

interface DashboardMotorRow {
  id: string;
  plant_id: string;
  plant_name: string;
  name: string;
  code: string;
  status: string;
  operational_status: string;
  last_telemetry_at: Date | string | null;
  device_id: string | null;
  device_code: string | null;
  device_status: string | null;
  last_connection_at: Date | string | null;
  active_alarm_count: number | string;
  latest_measurements: Record<string, LatestMeasurement>;
}

interface TelemetryHistoryRow {
  measurement_type: string;
  value: number | string;
  unit: string;
  quality: string;
  measured_at: Date | string;
}

interface ExistingMotorRow {
  exists: boolean;
}

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async findMotorSummaries(): Promise<DashboardMotorSummary[]> {
    const rows = await this.dataSource.query<DashboardMotorRow[]>(`
      SELECT
        m.id,
        m.plant_id,
        p.name AS plant_name,
        m.name,
        m.code,
        m.status,
        m.operational_status,
        m.last_telemetry_at,
        device.id AS device_id,
        device.device_code,
        device.status AS device_status,
        device.last_connection_at,
        COALESCE(alarm_summary.active_alarm_count, 0)
          AS active_alarm_count,
        COALESCE(latest.latest_measurements, '{}'::jsonb)
          AS latest_measurements
      FROM public.motors AS m
      INNER JOIN public.plants AS p ON p.id = m.plant_id
      LEFT JOIN LATERAL (
        SELECT d.id, d.device_code, d.status, d.last_connection_at
        FROM public.devices AS d
        WHERE d.motor_id = m.id
        ORDER BY d.last_connection_at DESC NULLS LAST, d.created_at DESC
        LIMIT 1
      ) AS device ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS active_alarm_count
        FROM public.alarms AS a
        WHERE a.motor_id = m.id
          AND a.status IN ('ACTIVE', 'ACKNOWLEDGED')
      ) AS alarm_summary ON TRUE
      LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(
          point.measurement_type,
          jsonb_build_object(
            'value', point.value,
            'unit', point.unit,
            'quality', point.quality,
            'measuredAt', point.measured_at
          )
        ) AS latest_measurements
        FROM (
          SELECT DISTINCT ON (UPPER(t.measurement_type))
            UPPER(t.measurement_type) AS measurement_type,
            t.value,
            t.unit,
            t.quality,
            t.measured_at
          FROM public.telemetry AS t
          WHERE t.motor_id = m.id
          ORDER BY UPPER(t.measurement_type), t.measured_at DESC
        ) AS point
      ) AS latest ON TRUE
      ORDER BY m.name ASC;
    `);

    return rows.map((row) => ({
      id: row.id,
      plantId: row.plant_id,
      plantName: row.plant_name,
      name: row.name,
      code: row.code,
      status: row.status,
      operationalStatus: row.operational_status,
      lastTelemetryAt: this.toISOString(row.last_telemetry_at),
      device:
        row.device_id && row.device_code && row.device_status
          ? {
              id: row.device_id,
              code: row.device_code,
              status: row.device_status,
              lastConnectionAt: this.toISOString(row.last_connection_at),
            }
          : null,
      activeAlarmCount: Number(row.active_alarm_count),
      latestMeasurements: row.latest_measurements,
    }));
  }

  async findTelemetryHistory(
    motorId: string,
    query: TelemetryHistoryQueryDto,
  ): Promise<TelemetryHistoryPoint[]> {
    this.validateDateRange(query);
    await this.ensureMotorExists(motorId);

    const rows = await this.dataSource.query<TelemetryHistoryRow[]>(
      `
        SELECT *
        FROM (
          SELECT
            UPPER(t.measurement_type) AS measurement_type,
            t.value,
            t.unit,
            t.quality,
            t.measured_at
          FROM public.telemetry AS t
          WHERE t.motor_id = $1
            AND ($2::varchar IS NULL OR UPPER(t.measurement_type) = $2)
            AND ($3::timestamptz IS NULL OR t.measured_at >= $3)
            AND ($4::timestamptz IS NULL OR t.measured_at <= $4)
          ORDER BY t.measured_at DESC
          LIMIT $5
        ) AS history
        ORDER BY history.measured_at ASC, history.measurement_type ASC;
      `,
      [
        motorId,
        query.measurementType ?? null,
        query.from ?? null,
        query.to ?? null,
        query.limit,
      ],
    );

    return rows.map((row) => ({
      measurementType: row.measurement_type,
      value: Number(row.value),
      unit: row.unit,
      quality: row.quality,
      measuredAt: this.toISOString(row.measured_at) as string,
    }));
  }

  private async ensureMotorExists(motorId: string): Promise<void> {
    const rows = await this.dataSource.query<ExistingMotorRow[]>(
      `SELECT EXISTS (
        SELECT 1 FROM public.motors WHERE id = $1
      ) AS "exists";`,
      [motorId],
    );

    if (!rows[0]?.exists) {
      throw new NotFoundException(`No existe un motor con id ${motorId}`);
    }
  }

  private validateDateRange(query: TelemetryHistoryQueryDto): void {
    if (query.from && query.to) {
      if (new Date(query.from).getTime() > new Date(query.to).getTime()) {
        throw new BadRequestException(
          'La fecha inicial no puede ser posterior a la fecha final',
        );
      }
    }
  }

  private toISOString(value: Date | string | null): string | null {
    return value === null ? null : new Date(value).toISOString();
  }
}

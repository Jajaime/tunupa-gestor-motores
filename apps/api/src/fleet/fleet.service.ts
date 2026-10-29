import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AccessTokenPayload } from '../auth/auth.types';

export interface FleetMeasurement {
  value: number;
  unit: string;
  quality: string;
  measuredAt: string;
}

export interface FleetMotorSummary {
  id: string;
  clientId: string;
  clientName: string;
  plantId: string;
  plantName: string;
  name: string;
  code: string;
  status: string;
  operationalStatus: string;
  lastTelemetryAt: string | null;
  activeAlarmCount: number;
  deviceCount: number;
}

export interface FleetDevice {
  id: string;
  name: string;
  code: string;
  serialNumber: string | null;
  firmwareVersion: string | null;
  communicationType: string;
  status: string;
  lastConnectionAt: string | null;
  lastTelemetryReceivedAt: string | null;
}

export interface FleetMotorDetail extends FleetMotorSummary {
  plantLocation: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  ratedPowerKw: number | null;
  ratedVoltage: number | null;
  ratedCurrent: number | null;
  ratedFrequencyHz: number | null;
  devices: FleetDevice[];
  latestMeasurements: Record<string, FleetMeasurement>;
}

type DbSummary = Omit<FleetMotorSummary, 'lastTelemetryAt'> & {
  lastTelemetryAt: Date | string | null;
};
type DbDetail = Omit<
  FleetMotorDetail,
  | 'lastTelemetryAt'
  | 'ratedPowerKw'
  | 'ratedVoltage'
  | 'ratedCurrent'
  | 'ratedFrequencyHz'
> & {
  lastTelemetryAt: Date | string | null;
  ratedPowerKw: string | number | null;
  ratedVoltage: string | number | null;
  ratedCurrent: string | number | null;
  ratedFrequencyHz: string | number | null;
};

// Se consulta la asociación usuario/cliente en cada petición, nunca desde un
// clientId que envíe el navegador. Para usuarios no autorizados se responde 404.
const tenantScope = `(
  $1::text = 'ADMIN'
  OR ($1::text IN ('VIEWER', 'OPERATOR') AND c.status = 'ACTIVE'
    AND EXISTS (
      SELECT 1 FROM public.user_client_access uca
      WHERE uca.user_id = $2 AND uca.client_id = c.id
    ))
)`;

@Injectable()
export class FleetService {
  constructor(private readonly db: DataSource) {}

  async list(user: AccessTokenPayload): Promise<FleetMotorSummary[]> {
    const rows = await this.db.query<DbSummary[]>(
      `
      SELECT m.id, c.id AS "clientId", c.name AS "clientName",
        p.id AS "plantId", p.name AS "plantName", m.name, m.code,
        m.status, m.operational_status AS "operationalStatus",
        m.last_telemetry_at AS "lastTelemetryAt",
        (SELECT COUNT(*)::integer FROM public.alarms a
         WHERE a.motor_id = m.id AND a.status IN ('ACTIVE', 'ACKNOWLEDGED'))
           AS "activeAlarmCount",
        (SELECT COUNT(*)::integer FROM public.devices d WHERE d.motor_id = m.id)
           AS "deviceCount"
      FROM public.motors m
      JOIN public.plants p ON p.id = m.plant_id
      JOIN public.clients c ON c.id = p.client_id
      WHERE ${tenantScope}
      ORDER BY c.name, p.name, m.name, m.id;
    `,
      [user.role, user.sub],
    );
    return rows.map((row) => ({
      ...row,
      lastTelemetryAt: this.asDate(row.lastTelemetryAt),
    }));
  }

  async detail(
    id: string,
    user: AccessTokenPayload,
  ): Promise<FleetMotorDetail> {
    // Una sola sentencia SQL incorpora autorización, dispositivos y mediciones.
    // Esto impide filtrar información de un motor ajeno por UUID y mantiene
    // una misma instantánea de permisos para los datos relacionados.
    const rows = await this.db.query<DbDetail[]>(
      `
      SELECT m.id, c.id AS "clientId", c.name AS "clientName",
        p.id AS "plantId", p.name AS "plantName", p.location AS "plantLocation",
        m.name, m.code, m.status,
        m.operational_status AS "operationalStatus",
        m.last_telemetry_at AS "lastTelemetryAt",
        m.manufacturer, m.model, m.serial_number AS "serialNumber",
        m.rated_power_kw AS "ratedPowerKw",
        m.rated_voltage AS "ratedVoltage",
        m.rated_current AS "ratedCurrent",
        m.rated_frequency_hz AS "ratedFrequencyHz",
        (SELECT COUNT(*)::integer FROM public.alarms a
         WHERE a.motor_id = m.id AND a.status IN ('ACTIVE', 'ACKNOWLEDGED'))
           AS "activeAlarmCount",
        (SELECT COUNT(*)::integer FROM public.devices d WHERE d.motor_id = m.id)
           AS "deviceCount",
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', d.id,
            'name', d.name,
            'code', d.device_code,
            'serialNumber', d.serial_number,
            'firmwareVersion', d.firmware_version,
            'communicationType', d.communication_type,
            'status', d.status,
            'lastConnectionAt', d.last_connection_at,
            'lastTelemetryReceivedAt', d.last_telemetry_received_at
          ) ORDER BY d.name, d.id)
          FROM public.devices d WHERE d.motor_id = m.id
        ), '[]'::jsonb) AS devices,
        COALESCE((
          SELECT jsonb_object_agg(
            point.measurement_type,
            jsonb_build_object(
              'value', point.value,
              'unit', point.unit,
              'quality', point.quality,
              'measuredAt', point.measured_at
            )
          )
          FROM (
            SELECT DISTINCT ON (UPPER(t.measurement_type))
              UPPER(t.measurement_type) AS measurement_type,
              t.value, t.unit, t.quality, t.measured_at
            FROM public.telemetry t
            WHERE t.motor_id = m.id
            ORDER BY UPPER(t.measurement_type), t.measured_at DESC,
              t.received_at DESC, t.id DESC
          ) point
        ), '{}'::jsonb) AS "latestMeasurements"
      FROM public.motors m
      JOIN public.plants p ON p.id = m.plant_id
      JOIN public.clients c ON c.id = p.client_id
      WHERE m.id = $3 AND ${tenantScope};
    `,
      [user.role, user.sub, id],
    );

    const row = rows[0];
    if (!row) throw new NotFoundException('Motor no encontrado.');
    return {
      ...row,
      lastTelemetryAt: this.asDate(row.lastTelemetryAt),
      ratedPowerKw: this.asNumber(row.ratedPowerKw),
      ratedVoltage: this.asNumber(row.ratedVoltage),
      ratedCurrent: this.asNumber(row.ratedCurrent),
      ratedFrequencyHz: this.asNumber(row.ratedFrequencyHz),
      devices: row.devices ?? [],
      latestMeasurements: row.latestMeasurements ?? {},
    };
  }

  private asDate(date: Date | string | null): string | null {
    return date === null ? null : new Date(date).toISOString();
  }

  private asNumber(value: number | string | null): number | null {
    return value === null ? null : Number(value);
  }
}

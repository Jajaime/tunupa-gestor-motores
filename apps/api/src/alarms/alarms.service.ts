import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AccessTokenPayload } from '../auth/auth.types';
import { CommittedEventsService } from '../realtime/committed-events.service';
import { AlarmsQueryDto } from './dto/alarms-query.dto';

export interface AlarmRecord {
  id: string;
  motorId: string;
  motorName: string;
  motorCode: string;
  plantName: string;
  clientName: string;
  deviceId: string | null;
  deviceCode: string | null;
  alarmType: string;
  severity: string;
  status: string;
  message: string;
  measuredValue: number | null;
  thresholdValue: number | null;
  unit: string | null;
  startedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

export interface AlarmEvent {
  id: string;
  eventType: string;
  previousStatus: string | null;
  currentStatus: string;
  previousSeverity: string | null;
  currentSeverity: string;
  occurredAt: string;
  actorName: string | null;
}

export interface AlarmDetail extends AlarmRecord {
  events: AlarmEvent[];
}

interface DbAlarm extends Omit<
  AlarmRecord,
  | 'measuredValue'
  | 'thresholdValue'
  | 'startedAt'
  | 'acknowledgedAt'
  | 'resolvedAt'
> {
  measuredValue: string | number | null;
  thresholdValue: string | number | null;
  startedAt: Date | string;
  acknowledgedAt: Date | string | null;
  resolvedAt: Date | string | null;
}

interface DbAlarmEvent extends Omit<AlarmEvent, 'occurredAt'> {
  occurredAt: Date | string;
}

interface UpdatedAlarm {
  id: string;
  motor_id: string;
  device_id: string | null;
  alarm_type: string;
  severity: string;
  status: string;
  measured_value: string | number | null;
  threshold_value: string | number | null;
  unit: string | null;
  started_at: Date | string;
  resolved_at: Date | string | null;
}

// Mantener este control en cada SELECT y en cada UPDATE; la interfaz nunca
// elige el tenant. Usuario de otra empresa recibe 404, no 403.
const scope = `(
  $1::text = 'ADMIN' OR (
    $1::text IN ('OPERATOR', 'VIEWER') AND c.status = 'ACTIVE'
    AND EXISTS (
      SELECT 1 FROM public.user_client_access uca
      WHERE uca.user_id = $2::uuid AND uca.client_id = c.id
    )
  )
)`;

const relations = `
  FROM public.alarms a
  JOIN public.motors m ON m.id = a.motor_id
  JOIN public.plants p ON p.id = m.plant_id
  JOIN public.clients c ON c.id = p.client_id
  LEFT JOIN public.devices d ON d.id = a.device_id
`;

const fields = `
  a.id, a.motor_id AS "motorId", m.name AS "motorName",
  m.code AS "motorCode", p.name AS "plantName", c.name AS "clientName",
  a.device_id AS "deviceId", d.device_code AS "deviceCode",
  a.alarm_type AS "alarmType", a.severity, a.status, a.message,
  a.measured_value AS "measuredValue", a.threshold_value AS "thresholdValue",
  a.unit, a.started_at AS "startedAt",
  a.acknowledged_at AS "acknowledgedAt", a.resolved_at AS "resolvedAt"
`;

@Injectable()
export class AlarmsService {
  constructor(
    private readonly db: DataSource,
    private readonly events: CommittedEventsService,
  ) {}

  async list(
    query: AlarmsQueryDto,
    user: AccessTokenPayload,
  ): Promise<{
    items: AlarmRecord[];
    hasMore: boolean;
  }> {
    if (
      query.from &&
      query.to &&
      new Date(query.from).getTime() > new Date(query.to).getTime()
    ) {
      throw new BadRequestException('La fecha inicial supera la fecha final.');
    }
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const rows = await this.db.query<DbAlarm[]>(
      `SELECT ${fields} ${relations}
       WHERE ${scope}
         AND ($3::text IS NULL OR a.status = $3)
         AND ($4::text IS NULL OR a.severity = $4)
         AND ($5::uuid IS NULL OR a.motor_id = $5)
         AND ($6::timestamptz IS NULL OR a.started_at >= $6)
         AND ($7::timestamptz IS NULL OR a.started_at <= $7)
       ORDER BY a.started_at DESC, a.id DESC
       LIMIT $8 OFFSET $9`,
      [
        user.role,
        user.sub,
        query.status ?? null,
        query.severity ?? null,
        query.motorId ?? null,
        query.from ?? null,
        query.to ?? null,
        limit + 1,
        offset,
      ],
    );
    return {
      items: rows.slice(0, limit).map((row) => this.normalize(row)),
      hasMore: rows.length > limit,
    };
  }

  async detail(id: string, user: AccessTokenPayload): Promise<AlarmDetail> {
    const rows = await this.db.query<DbAlarm[]>(
      `SELECT ${fields} ${relations} WHERE a.id = $3::uuid AND ${scope}`,
      [user.role, user.sub, id],
    );
    if (!rows[0]) throw new NotFoundException('Alarma no encontrada.');

    // Auditoría consultada con el MISMO filtro de pertenencia, no solo alarm_id.
    const eventRows = await this.db.query<DbAlarmEvent[]>(
      `SELECT ae.id::text AS id, ae.event_type AS "eventType",
         ae.previous_status AS "previousStatus", ae.current_status AS "currentStatus",
         ae.previous_severity AS "previousSeverity", ae.current_severity AS "currentSeverity",
         ae.occurred_at AS "occurredAt", u.display_name AS "actorName"
       FROM public.alarm_events ae
       JOIN public.alarms a ON a.id = ae.alarm_id
       JOIN public.motors m ON m.id = a.motor_id
       JOIN public.plants p ON p.id = m.plant_id
       JOIN public.clients c ON c.id = p.client_id
       LEFT JOIN public.users u ON u.id = ae.actor_user_id
       WHERE a.id = $3::uuid AND ${scope}
       ORDER BY ae.occurred_at ASC, ae.id ASC
       LIMIT 500`,
      [user.role, user.sub, id],
    );
    return {
      ...this.normalize(rows[0]),
      events: eventRows.map((row) => ({
        ...row,
        occurredAt: new Date(row.occurredAt).toISOString(),
      })),
    };
  }

  async acknowledge(
    id: string,
    user: AccessTokenPayload,
  ): Promise<AlarmDetail> {
    if (user.role !== 'ADMIN' && user.role !== 'OPERATOR') {
      throw new ForbiddenException('Tu rol no permite reconocer alarmas.');
    }
    await this.db.transaction(async (manager) => {
      // La identidad se inyecta en la transacción únicamente para auditoría.
      await manager.query(
        `SELECT set_config('tunupa.actor_user_id', $1, true)`,
        [user.sub],
      );
      const updated = await manager.query<UpdatedAlarm[]>(
        `UPDATE public.alarms AS a
         SET status = 'ACKNOWLEDGED', acknowledged_at = CURRENT_TIMESTAMP
         WHERE a.id = $3::uuid AND a.status = 'ACTIVE'
           AND EXISTS (
             SELECT 1 FROM public.motors m
             JOIN public.plants p ON p.id = m.plant_id
             JOIN public.clients c ON c.id = p.client_id
             WHERE m.id = a.motor_id AND ${scope}
           )
         RETURNING a.*`,
        [user.role, user.sub, id],
      );
      if (!updated[0]) {
        const owned = await manager.query<{ id: string }[]>(
          `SELECT a.id ${relations} WHERE a.id = $3::uuid AND ${scope}`,
          [user.role, user.sub, id],
        );
        if (!owned[0]) throw new NotFoundException('Alarma no encontrada.');
        throw new ConflictException('La alarma ya fue reconocida o resuelta.');
      }
      const alarm = updated[0];
      this.events.record(
        manager,
        'alarm.changed',
        alarm.motor_id,
        alarm.device_id,
        {
          id: alarm.id,
          alarmType: alarm.alarm_type,
          severity: alarm.severity,
          status: alarm.status,
          change: 'UPDATED',
          measuredValue:
            alarm.measured_value === null ? null : Number(alarm.measured_value),
          thresholdValue:
            alarm.threshold_value === null
              ? null
              : Number(alarm.threshold_value),
          unit: alarm.unit,
          startedAt: new Date(alarm.started_at).toISOString(),
          resolvedAt:
            alarm.resolved_at === null
              ? null
              : new Date(alarm.resolved_at).toISOString(),
        },
      );
    });
    return this.detail(id, user);
  }

  private normalize(row: DbAlarm): AlarmRecord {
    return {
      ...row,
      measuredValue:
        row.measuredValue === null ? null : Number(row.measuredValue),
      thresholdValue:
        row.thresholdValue === null ? null : Number(row.thresholdValue),
      startedAt: new Date(row.startedAt).toISOString(),
      acknowledgedAt:
        row.acknowledgedAt === null
          ? null
          : new Date(row.acknowledgedAt).toISOString(),
      resolvedAt:
        row.resolvedAt === null ? null : new Date(row.resolvedAt).toISOString(),
    };
  }
}

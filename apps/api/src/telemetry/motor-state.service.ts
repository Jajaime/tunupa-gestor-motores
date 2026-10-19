import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommittedEventsService } from '../realtime/committed-events.service';
import type { EntityManager } from 'typeorm';

export type MotorOperationalStatus =
  'UNKNOWN' | 'RUNNING' | 'WARNING' | 'CRITICAL' | 'OFFLINE';

@Injectable()
export class MotorStateService {
  constructor(
    private readonly config: ConfigService,
    private readonly events: CommittedEventsService,
  ) {}

  // El llamador debe mantener bloqueada la fila del motor en su transacción.
  async refresh(
    manager: EntityManager,
    motorId: string,
    context: { deviceId?: string; reason: string } = { reason: 'RECALCULATED' },
  ): Promise<MotorOperationalStatus> {
    const previous = await manager.query<
      { operational_status: MotorOperationalStatus }[]
    >('SELECT operational_status FROM public.motors WHERE id = $1', [motorId]);
    const timeout = this.config.getOrThrow<number>('TELEMETRY_TIMEOUT_SECONDS');
    const rows = await manager.query<
      { operational_status: MotorOperationalStatus }[]
    >(
      `
        WITH updated_motor AS (
        UPDATE public.motors AS m
        SET operational_status = CASE
          WHEN EXISTS (
            SELECT 1 FROM public.devices AS d
            WHERE d.motor_id = m.id AND d.status = 'ACTIVE'
              AND d.last_telemetry_received_at >=
                CURRENT_TIMESTAMP - make_interval(secs => $2::integer)
          ) THEN (
            SELECT CASE
              WHEN bool_or(a.severity = 'CRITICAL') THEN 'CRITICAL'
              WHEN bool_or(a.severity = 'WARNING') THEN 'WARNING'
              ELSE 'RUNNING'
            END
            FROM public.alarms AS a
            WHERE a.motor_id = m.id
              AND a.status IN ('ACTIVE', 'ACKNOWLEDGED')
          )
          WHEN EXISTS (
            SELECT 1 FROM public.devices AS d
            WHERE d.motor_id = m.id AND d.status = 'ACTIVE'
              AND d.last_telemetry_received_at IS NULL
              AND d.last_connection_at >=
                CURRENT_TIMESTAMP - make_interval(secs => $2::integer)
          ) THEN 'UNKNOWN'
          ELSE 'OFFLINE'
        END
        WHERE m.id = $1
        RETURNING m.operational_status
        )
        SELECT operational_status FROM updated_motor;
      `,
      [motorId, timeout],
    );
    if (!rows[0])
      throw new Error('No existe el motor para actualizar su estado.');
    if (previous[0]?.operational_status !== rows[0].operational_status) {
      this.events.record(
        manager,
        'motor.status.changed',
        motorId,
        context.deviceId ?? null,
        {
          previousStatus: previous[0]?.operational_status ?? 'UNKNOWN',
          status: rows[0].operational_status,
          reason: context.reason,
        },
      );
    }
    return rows[0].operational_status;
  }
}

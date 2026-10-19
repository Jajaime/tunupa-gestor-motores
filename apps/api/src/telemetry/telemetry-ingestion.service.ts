import { CommittedEventsService } from '../realtime/committed-events.service';
import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import {
  DeviceConnectionStatus,
  type DeviceStatusMessageDto,
} from './dto/device-status-message.dto';
import {
  MeasurementType,
  type MeasurementDto,
  type TelemetryMessageDto,
} from './dto/telemetry-message.dto';
import { MotorStateService } from './motor-state.service';
import type { MotorOperationalStatus } from './motor-state.service';

type AlarmSeverity = 'WARNING' | 'CRITICAL';

interface DeviceContext {
  device_id: string;
  motor_id: string;
  rated_current: string | null;
}

interface ExistingMessage {
  exists: boolean;
}

interface AlarmRow {
  id: string;
  alarm_type: string;
  severity: string;
  status: string;
  measured_value: string | number | null;
  threshold_value: string | number | null;
  unit: string | null;
  started_at: Date;
  resolved_at: Date | null;
}
interface OpenAlarm {
  id: string;
}

interface AlarmRule {
  alarmType: string;
  label: string;
  warningThreshold: number;
  criticalThreshold: number;
}

export interface TelemetryProcessingResult {
  duplicate: boolean;
  deviceCode: string;
  messageId: string;
  measurementsInserted: number;
  operationalStatus?: MotorOperationalStatus;
}

@Injectable()
export class TelemetryIngestionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly motorState: MotorStateService,
    private readonly events: CommittedEventsService,
  ) {}

  async processTelemetry(
    topic: string,
    payload: Buffer,
    message: TelemetryMessageDto,
  ): Promise<TelemetryProcessingResult> {
    this.validateBusinessRules(message);

    const measuredAt = new Date(message.measuredAt);

    return this.dataSource.transaction(async (manager) => {
      const duplicateRows = await manager.query<ExistingMessage[]>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM public.telemetry_ingestions
            WHERE message_id = $1
          ) AS "exists";
        `,
        [message.messageId],
      );

      if (duplicateRows[0]?.exists) {
        return {
          duplicate: true,
          deviceCode: message.deviceCode,
          messageId: message.messageId,
          measurementsInserted: 0,
        };
      }

      const device = await this.findDevice(manager, message.deviceCode);

      await manager.query(
        `
          INSERT INTO public.telemetry_ingestions (
            message_id,
            device_id,
            motor_id,
            topic,
            measured_at,
            payload
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb);
        `,
        [
          message.messageId,
          device.device_id,
          device.motor_id,
          topic,
          measuredAt,
          payload.toString('utf8'),
        ],
      );

      for (const measurement of message.measurements) {
        await manager.query(
          `
            INSERT INTO public.telemetry (
              measured_at,
              device_id,
              motor_id,
              measurement_type,
              value,
              unit,
              quality,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb);
          `,
          [
            measuredAt,
            device.device_id,
            device.motor_id,
            measurement.type,
            measurement.value,
            measurement.unit,
            measurement.quality,
            JSON.stringify({
              messageId: message.messageId,
              sequence: message.sequence,
              scenario: message.scenario,
            }),
          ],
        );

        await this.evaluateMeasurementAlarm(
          manager,
          device,
          measurement,
          measuredAt,
        );
      }

      await manager.query(
        `
          UPDATE public.devices
          SET
            last_connection_at = CURRENT_TIMESTAMP,
            last_telemetry_received_at = clock_timestamp(),
            status = CASE
              WHEN status IN ('REGISTERED', 'INACTIVE')
                THEN 'ACTIVE'
              ELSE status
            END
          WHERE id = $1;
        `,
        [device.device_id],
      );

      await manager.query(
        `
          UPDATE public.motors
          SET
            last_telemetry_at = CASE
              WHEN last_telemetry_at IS NULL
                OR last_telemetry_at < $1
                THEN $1
              ELSE last_telemetry_at
            END
          WHERE id = $2;
        `,
        [measuredAt, device.motor_id],
      );

      const operationalStatus = await this.motorState.refresh(
        manager,
        device.motor_id,
        { deviceId: device.device_id, reason: 'TELEMETRY_RECEIVED' },
      );

      this.events.record(
        manager,
        'telemetry.received',
        device.motor_id,
        device.device_id,
        {
          messageId: message.messageId,
          measuredAt: measuredAt.toISOString(),
          measurements: message.measurements.map(
            ({ type, value, unit, quality }) => ({
              type,
              value,
              unit,
              quality,
            }),
          ),
        },
      );
      return {
        duplicate: false,
        deviceCode: message.deviceCode,
        messageId: message.messageId,
        measurementsInserted: message.measurements.length,
        operationalStatus,
      };
    });
  }

  async processStatus(message: DeviceStatusMessageDto): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const device = await this.findDevice(manager, message.deviceCode);

      if (message.status === DeviceConnectionStatus.ONLINE) {
        await manager.query(
          `
            UPDATE public.devices
            SET
              last_connection_at = CURRENT_TIMESTAMP,
              status = CASE
                WHEN status IN ('REGISTERED', 'INACTIVE')
                  THEN 'ACTIVE'
                ELSE status
              END
            WHERE id = $1;
          `,
          [device.device_id],
        );

        await this.motorState.refresh(manager, device.motor_id, {
          deviceId: device.device_id,
          reason: 'MQTT_ONLINE',
        });

        return;
      }

      await manager.query(
        `
          UPDATE public.devices
          SET status = CASE
            WHEN status = 'ACTIVE'
              THEN 'INACTIVE'
            ELSE status
          END
          WHERE id = $1;
        `,
        [device.device_id],
      );

      await this.motorState.refresh(manager, device.motor_id, {
        deviceId: device.device_id,
        reason: 'MQTT_OFFLINE',
      });
    });
  }

  private validateBusinessRules(message: TelemetryMessageDto): void {
    if (message.schemaVersion !== 1) {
      throw new Error(
        `Versión de telemetría no soportada: ${message.schemaVersion}.`,
      );
    }

    const measurementTypes = message.measurements.map(
      (measurement) => measurement.type,
    );

    if (new Set(measurementTypes).size !== measurementTypes.length) {
      throw new Error('El mensaje contiene tipos de medición duplicados.');
    }

    const measuredAt = new Date(message.measuredAt);
    const maximumFutureDate = Date.now() + 5 * 60 * 1000;

    if (measuredAt.getTime() > maximumFutureDate) {
      throw new Error(
        'La fecha de medición está más de cinco minutos en el futuro.',
      );
    }
  }

  private async findDevice(
    manager: EntityManager,
    deviceCode: string,
  ): Promise<DeviceContext> {
    const rows = await manager.query<DeviceContext[]>(
      `
        SELECT
          d.id AS device_id,
          d.motor_id,
          m.rated_current
        FROM public.devices d
        INNER JOIN public.motors m
          ON m.id = d.motor_id
        WHERE d.device_code = $1
        FOR UPDATE OF m;
      `,
      [deviceCode],
    );

    const device = rows[0];

    if (!device) {
      throw new Error(
        `No existe un dispositivo asociado a motor con código ${deviceCode}.`,
      );
    }

    return device;
  }

  private async evaluateMeasurementAlarm(
    manager: EntityManager,
    device: DeviceContext,
    measurement: MeasurementDto,
    measuredAt: Date,
  ): Promise<void> {
    const rule = this.getAlarmRule(measurement, device.rated_current);

    if (!rule) {
      return;
    }

    const openAlarms = await manager.query<OpenAlarm[]>(
      `
        SELECT id
        FROM public.alarms
        WHERE device_id = $1
          AND alarm_type = $2
          AND status IN ('ACTIVE', 'ACKNOWLEDGED')
        FOR UPDATE;
      `,
      [device.device_id, rule.alarmType],
    );

    const openAlarm = openAlarms[0];

    if (measurement.value < rule.warningThreshold) {
      if (!openAlarm) return;
      const resolved = await manager.query<AlarmRow[]>(
        `
          WITH changed AS (UPDATE public.alarms
          SET
            status = 'RESOLVED',
            resolved_at = CURRENT_TIMESTAMP
          WHERE device_id = $1
            AND alarm_type = $2
            AND status IN ('ACTIVE', 'ACKNOWLEDGED')
          RETURNING *) SELECT * FROM changed;
        `,
        [device.device_id, rule.alarmType],
      );
      this.recordAlarms(manager, device, resolved, 'RESOLVED');
      return;
    }

    const severity: AlarmSeverity =
      measurement.value >= rule.criticalThreshold ? 'CRITICAL' : 'WARNING';

    const threshold =
      severity === 'CRITICAL' ? rule.criticalThreshold : rule.warningThreshold;

    const alarmMessage =
      `${rule.label}: ${measurement.value} ${measurement.unit}; ` +
      `umbral ${threshold} ${measurement.unit}.`;

    if (openAlarm) {
      const updated = await manager.query<AlarmRow[]>(
        `
          WITH changed AS (UPDATE public.alarms
          SET
            severity = $2::varchar,
            message = $3,
            measured_value = $4,
            threshold_value = $5,
            unit = $6,
            status = CASE
              WHEN severity <> $2::varchar THEN 'ACTIVE'
              ELSE status
            END,
            acknowledged_at = CASE
              WHEN severity <> $2::varchar THEN NULL
              ELSE acknowledged_at
            END,
            resolved_at = NULL
          WHERE id = $1 RETURNING *) SELECT * FROM changed;
        `,
        [
          openAlarm.id,
          severity,
          alarmMessage,
          measurement.value,
          threshold,
          measurement.unit,
        ],
      );
      this.recordAlarms(manager, device, updated, 'UPDATED');
      return;
    }

    const created = await manager.query<AlarmRow[]>(
      `
        INSERT INTO public.alarms (
          motor_id,
          device_id,
          alarm_type,
          severity,
          message,
          measured_value,
          threshold_value,
          unit,
          started_at,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          'ACTIVE'
        ) RETURNING *;
      `,
      [
        device.motor_id,
        device.device_id,
        rule.alarmType,
        severity,
        alarmMessage,
        measurement.value,
        threshold,
        measurement.unit,
        measuredAt,
      ],
    );
    this.recordAlarms(manager, device, created, 'CREATED');
  }

  private recordAlarms(
    manager: EntityManager,
    device: DeviceContext,
    rows: AlarmRow[],
    change: 'CREATED' | 'UPDATED' | 'RESOLVED',
  ): void {
    for (const row of rows)
      this.events.record(
        manager,
        'alarm.changed',
        device.motor_id,
        device.device_id,
        {
          id: row.id,
          alarmType: row.alarm_type,
          severity: row.severity,
          status: row.status,
          change,
          measuredValue:
            row.measured_value === null ? null : Number(row.measured_value),
          thresholdValue:
            row.threshold_value === null ? null : Number(row.threshold_value),
          unit: row.unit,
          startedAt: new Date(row.started_at).toISOString(),
          resolvedAt:
            row.resolved_at === null
              ? null
              : new Date(row.resolved_at).toISOString(),
        },
      );
  }

  private getAlarmRule(
    measurement: MeasurementDto,
    ratedCurrentValue: string | null,
  ): AlarmRule | null {
    if (measurement.type === MeasurementType.TEMPERATURE) {
      return {
        alarmType: 'HIGH_TEMPERATURE',
        label: 'Temperatura elevada',
        warningThreshold: 80,
        criticalThreshold: 95,
      };
    }

    if (measurement.type === MeasurementType.VIBRATION) {
      return {
        alarmType: 'HIGH_VIBRATION',
        label: 'Vibración elevada',
        warningThreshold: 4.5,
        criticalThreshold: 7.1,
      };
    }

    if (measurement.type === MeasurementType.CURRENT) {
      const ratedCurrent = Number(ratedCurrentValue);

      const referenceCurrent =
        Number.isFinite(ratedCurrent) && ratedCurrent > 0 ? ratedCurrent : 3;

      return {
        alarmType: 'OVERCURRENT',
        label: 'Sobrecorriente',
        warningThreshold: referenceCurrent * 1.6,
        criticalThreshold: referenceCurrent * 2,
      };
    }

    return null;
  }
}

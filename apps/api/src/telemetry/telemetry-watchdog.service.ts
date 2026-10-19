import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { MotorStateService } from './motor-state.service';

@Injectable()
export class TelemetryWatchdogService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelemetryWatchdogService.name);
  private timer?: ReturnType<typeof setInterval>;
  private inFlight?: Promise<number>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly motorState: MotorStateService,
  ) {}

  onApplicationBootstrap(): void {
    const interval = this.config.getOrThrow<number>(
      'TELEMETRY_CHECK_INTERVAL_MS',
    );
    this.runInBackground();
    this.timer = setInterval(() => this.runInBackground(), interval);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.inFlight?.catch(() => undefined);
  }

  checkNow(): Promise<number> {
    if (this.inFlight) return this.inFlight;
    const operation = this.markExpired();
    this.inFlight = operation;
    void operation
      .finally(() => {
        if (this.inFlight === operation) this.inFlight = undefined;
      })
      .catch(() => undefined);
    return operation;
  }

  private runInBackground(): void {
    void this.checkNow().catch((error: unknown) => {
      this.logger.error(
        `No fue posible revisar la telemetría: ${
          error instanceof Error ? error.message : 'Error desconocido'
        }`,
      );
    });
  }

  private async markExpired(): Promise<number> {
    const timeout = this.config.getOrThrow<number>('TELEMETRY_TIMEOUT_SECONDS');
    const expiredCount = await this.dataSource.transaction(async (manager) => {
      // El mismo orden de bloqueo que la ingesta: primero el motor, luego devices.
      const motors = await manager.query<{ id: string }[]>(
        `
          SELECT m.id FROM public.motors AS m
          WHERE EXISTS (
            SELECT 1 FROM public.devices AS d
            WHERE d.motor_id = m.id AND d.status = 'ACTIVE'
              AND COALESCE(d.last_telemetry_received_at, d.last_connection_at)
                < CURRENT_TIMESTAMP - make_interval(secs => $1::integer)
          )
          ORDER BY m.id
          FOR UPDATE OF m SKIP LOCKED;
        `,
        [timeout],
      );
      let count = 0;
      for (const motor of motors) {
        const expired = await manager.query<{ id: string }[]>(
          `
            WITH expired_devices AS (
            UPDATE public.devices
            SET status = 'INACTIVE'
            WHERE motor_id = $1 AND status = 'ACTIVE'
              AND COALESCE(last_telemetry_received_at, last_connection_at)
                < CURRENT_TIMESTAMP - make_interval(secs => $2::integer)
            RETURNING id
            )
            SELECT id FROM expired_devices;
          `,
          [motor.id, timeout],
        );
        if (expired.length === 0) continue;
        count += expired.length;
        await this.motorState.refresh(manager, motor.id, {
          reason: 'TELEMETRY_TIMEOUT',
        });
      }
      return count;
    });
    if (expiredCount > 0) {
      this.logger.warn(
        `${expiredCount} dispositivo(s) sin telemetría válida durante ${timeout}s.`,
      );
    }
    return expiredCount;
  }
}

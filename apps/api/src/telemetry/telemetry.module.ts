import { Module } from '@nestjs/common';
import { RealtimeEventsModule } from '../realtime/realtime-events.module';
import { TelemetryIngestionService } from './telemetry-ingestion.service';
import { TelemetryValidatorService } from './telemetry-validator.service';
import { MotorStateService } from './motor-state.service';
import { TelemetryWatchdogService } from './telemetry-watchdog.service';

@Module({
  imports: [RealtimeEventsModule],
  providers: [
    TelemetryValidatorService,
    TelemetryIngestionService,
    MotorStateService,
    TelemetryWatchdogService,
  ],
  exports: [TelemetryValidatorService, TelemetryIngestionService],
})
export class TelemetryModule {}

import { Module } from '@nestjs/common';
import { TelemetryIngestionService } from './telemetry-ingestion.service';
import { TelemetryValidatorService } from './telemetry-validator.service';

@Module({
  providers: [TelemetryValidatorService, TelemetryIngestionService],
  exports: [TelemetryValidatorService, TelemetryIngestionService],
})
export class TelemetryModule {}

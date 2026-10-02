import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { MeasurementType } from '../../telemetry/dto/telemetry-message.dto';

export class TelemetryHistoryQueryDto {
  @IsOptional()
  @IsEnum(MeasurementType)
  measurementType?: MeasurementType;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit: number = 300;
}

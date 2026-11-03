import { IsEnum, IsISO8601 } from 'class-validator';
import { MeasurementType } from '../telemetry/dto/telemetry-message.dto';

/** Fixed aggregation steps: no arbitrary SQL intervals from clients. */
export enum TrendBucket {
  FIVE_MINUTES = '5m',
  FIFTEEN_MINUTES = '15m',
  ONE_HOUR = '1h',
  SIX_HOURS = '6h',
  ONE_DAY = '1d',
}

export const TREND_INTERVALS: Record<
  TrendBucket,
  { interval: string; milliseconds: number }
> = {
  [TrendBucket.FIVE_MINUTES]: { interval: '5 minutes', milliseconds: 300_000 },
  [TrendBucket.FIFTEEN_MINUTES]: {
    interval: '15 minutes',
    milliseconds: 900_000,
  },
  [TrendBucket.ONE_HOUR]: { interval: '1 hour', milliseconds: 3_600_000 },
  [TrendBucket.SIX_HOURS]: { interval: '6 hours', milliseconds: 21_600_000 },
  [TrendBucket.ONE_DAY]: { interval: '1 day', milliseconds: 86_400_000 },
};

export class TrendsQueryDto {
  @IsEnum(MeasurementType)
  measurementType!: MeasurementType;

  @IsISO8601({ strict: true, strictSeparator: true })
  from!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  to!: string;

  @IsEnum(TrendBucket)
  bucket!: TrendBucket;
}

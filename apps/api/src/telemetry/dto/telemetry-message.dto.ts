import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum TelemetryScenario {
  NORMAL = 'normal',
  OVERTEMPERATURE = 'overtemperature',
  OVERCURRENT = 'overcurrent',
  HIGH_VIBRATION = 'high-vibration',
  CONNECTION_LOSS = 'connection-loss',
}

export enum MeasurementType {
  ROTATION_SPEED = 'ROTATION_SPEED',
  TEMPERATURE = 'TEMPERATURE',
  CURRENT = 'CURRENT',
  VOLTAGE = 'VOLTAGE',
  FREQUENCY = 'FREQUENCY',
  VIBRATION = 'VIBRATION',
}

export enum TelemetryQuality {
  GOOD = 'GOOD',
  UNCERTAIN = 'UNCERTAIN',
  BAD = 'BAD',
}

export class MeasurementDto {
  @IsEnum(MeasurementType)
  type!: MeasurementType;

  @IsNumber({
    allowNaN: false,
    allowInfinity: false,
  })
  value!: number;

  @IsString()
  @MaxLength(20)
  unit!: string;

  @IsEnum(TelemetryQuality)
  quality!: TelemetryQuality;
}

export class TelemetryMessageDto {
  @IsInt()
  @Min(1)
  schemaVersion!: number;

  @IsUUID('4')
  messageId!: string;

  @IsString()
  @MaxLength(80)
  deviceCode!: string;

  @IsISO8601({
    strict: true,
    strictSeparator: true,
  })
  measuredAt!: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  @IsEnum(TelemetryScenario)
  scenario!: TelemetryScenario;

  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MeasurementDto)
  measurements!: MeasurementDto[];
}

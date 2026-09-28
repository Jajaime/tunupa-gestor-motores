import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum DeviceConnectionStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}

export class DeviceStatusMessageDto {
  @IsInt()
  @Min(1)
  schemaVersion!: number;

  @IsString()
  @MaxLength(80)
  deviceCode!: string;

  @IsEnum(DeviceConnectionStatus)
  status!: DeviceConnectionStatus;

  @IsString()
  @MaxLength(100)
  reason!: string;

  @IsISO8601({
    strict: true,
    strictSeparator: true,
  })
  occurredAt!: string;
}

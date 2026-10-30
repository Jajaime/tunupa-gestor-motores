import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DeviceCommunicationType {
  WIFI = 'WIFI',
  LTE = 'LTE',
  LORAWAN = 'LORAWAN',
}

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDeviceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  motorId!: string;

  @ApiProperty({ maxLength: 150, example: 'Gateway ESP32 de prueba' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 'ESP32-LAB-001', maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'El código solo admite letras, números, guion y guion bajo.',
  })
  code!: string;

  @ApiProperty({ enum: DeviceCommunicationType })
  @IsEnum(DeviceCommunicationType)
  communicationType!: DeviceCommunicationType;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firmwareVersion?: string;
}

// No permite modificar deviceCode, motorId, estado ni configuration.
export class UpdateDeviceDto {
  @ApiPropertyOptional({ maxLength: 150 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ enum: DeviceCommunicationType })
  @IsOptional()
  @IsEnum(DeviceCommunicationType)
  communicationType?: DeviceCommunicationType;

  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string | null;

  @ApiPropertyOptional({ maxLength: 50, nullable: true })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firmwareVersion?: string | null;
}

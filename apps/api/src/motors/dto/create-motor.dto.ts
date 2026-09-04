import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MotorStatus } from '../entities/motor.entity';

const trimText = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMotorDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Identificador de una planta existente',
  })
  @IsUUID()
  plantId!: string;

  @ApiProperty({
    example: 'Bomba centrífuga principal',
    maxLength: 150,
  })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiProperty({
    example: 'MOTOR-001',
    maxLength: 50,
  })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @ApiPropertyOptional({
    example: 'WEG',
    nullable: true,
  })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  manufacturer?: string | null;

  @ApiPropertyOptional({
    example: 'W22',
    nullable: true,
  })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string | null;

  @ApiPropertyOptional({
    example: 'SN-2026-0001',
    nullable: true,
  })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string | null;

  @ApiPropertyOptional({
    example: 0.373,
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  ratedPowerKw?: number | null;

  @ApiPropertyOptional({
    example: 220,
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  ratedVoltage?: number | null;

  @ApiPropertyOptional({
    example: 2.5,
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  ratedCurrent?: number | null;

  @ApiPropertyOptional({
    example: 50,
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  ratedFrequencyHz?: number | null;

  @ApiPropertyOptional({
    enum: MotorStatus,
    default: MotorStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(MotorStatus)
  status?: MotorStatus;
}

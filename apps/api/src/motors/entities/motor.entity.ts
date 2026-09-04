import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ValueTransformer,
} from 'typeorm';

export enum MotorStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
}

const decimalTransformer: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

@Entity({
  schema: 'public',
  name: 'motors',
})
export class Motor {
  @ApiProperty({
    format: 'uuid',
    example: '182ba5c0-5e7c-4ca1-b53e-71e401a82494',
  })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Identificador de la planta a la que pertenece el motor',
  })
  @Column({
    name: 'plant_id',
    type: 'uuid',
  })
  plantId!: string;

  @ApiProperty({
    example: 'Bomba centrífuga principal',
    maxLength: 150,
  })
  @Column({
    type: 'varchar',
    length: 150,
  })
  name!: string;

  @ApiProperty({
    example: 'MOTOR-001',
    maxLength: 50,
  })
  @Column({
    type: 'varchar',
    length: 50,
  })
  code!: string;

  @ApiPropertyOptional({
    example: 'WEG',
    nullable: true,
  })
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  manufacturer!: string | null;

  @ApiPropertyOptional({
    example: 'W22',
    nullable: true,
  })
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  model!: string | null;

  @ApiPropertyOptional({
    example: 'SN-2026-0001',
    nullable: true,
  })
  @Column({
    name: 'serial_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  serialNumber!: string | null;

  @ApiPropertyOptional({
    example: 0.373,
    nullable: true,
  })
  @Column({
    name: 'rated_power_kw',
    type: 'numeric',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  ratedPowerKw!: number | null;

  @ApiPropertyOptional({
    example: 220,
    nullable: true,
  })
  @Column({
    name: 'rated_voltage',
    type: 'numeric',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  ratedVoltage!: number | null;

  @ApiPropertyOptional({
    example: 2.5,
    nullable: true,
  })
  @Column({
    name: 'rated_current',
    type: 'numeric',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  ratedCurrent!: number | null;

  @ApiPropertyOptional({
    example: 50,
    nullable: true,
  })
  @Column({
    name: 'rated_frequency_hz',
    type: 'numeric',
    precision: 8,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  ratedFrequencyHz!: number | null;

  @ApiProperty({
    enum: MotorStatus,
    example: MotorStatus.ACTIVE,
  })
  @Column({
    type: 'varchar',
    length: 20,
    default: MotorStatus.ACTIVE,
  })
  status!: MotorStatus;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  @Column({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  @Column({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt!: Date;
}

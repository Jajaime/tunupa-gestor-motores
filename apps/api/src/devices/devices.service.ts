import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import type { AccessTokenPayload } from '../auth/auth.types';
import { CreateDeviceDto, UpdateDeviceDto } from './dto/device.dto';

export interface DeviceRecord {
  id: string;
  clientId: string;
  clientName: string;
  plantId: string;
  plantName: string;
  motorId: string | null;
  motorName: string | null;
  motorCode: string | null;
  name: string;
  code: string;
  serialNumber: string | null;
  firmwareVersion: string | null;
  communicationType: string;
  status: string;
  lastConnectionAt: string | null;
  lastTelemetryReceivedAt: string | null;
}

type DbDevice = Omit<
  DeviceRecord,
  'lastConnectionAt' | 'lastTelemetryReceivedAt'
> & {
  lastConnectionAt: Date | string | null;
  lastTelemetryReceivedAt: Date | string | null;
};

// Nunca se confía en un clientId recibido desde el navegador.
// Las asignaciones usuario/empresa se consultan en cada lectura.
const scope = `(
  $1::text = 'ADMIN' OR (
    $1::text IN ('OPERATOR', 'VIEWER') AND c.status = 'ACTIVE'
    AND EXISTS (
      SELECT 1 FROM public.user_client_access uca
      WHERE uca.user_id = $2::uuid AND uca.client_id = c.id
    )
  )
)`;

const fields = `
  d.id, c.id AS "clientId", c.name AS "clientName",
  p.id AS "plantId", p.name AS "plantName",
  m.id AS "motorId", m.name AS "motorName", m.code AS "motorCode",
  d.name, d.device_code AS "code", d.serial_number AS "serialNumber",
  d.firmware_version AS "firmwareVersion",
  d.communication_type AS "communicationType", d.status,
  d.last_connection_at AS "lastConnectionAt",
  d.last_telemetry_received_at AS "lastTelemetryReceivedAt"
`;

const relations = `
  FROM public.devices d
  JOIN public.plants p ON p.id = d.plant_id
  JOIN public.clients c ON c.id = p.client_id
  LEFT JOIN public.motors m ON m.id = d.motor_id
`;

@Injectable()
export class DevicesService {
  constructor(private readonly db: DataSource) {}

  async list(user: AccessTokenPayload): Promise<DeviceRecord[]> {
    const rows = await this.db.query<DbDevice[]>(
      `SELECT ${fields} ${relations}
       WHERE ${scope}
       ORDER BY c.name, p.name, d.name, d.id`,
      [user.role, user.sub],
    );
    return rows.map((row) => this.normalize(row));
  }

  async detail(id: string, user: AccessTokenPayload): Promise<DeviceRecord> {
    const rows = await this.db.query<DbDevice[]>(
      `SELECT ${fields} ${relations}
       WHERE d.id = $3::uuid AND ${scope}`,
      [user.role, user.sub, id],
    );
    if (!rows[0]) throw new NotFoundException('Dispositivo no encontrado.');
    return this.normalize(rows[0]);
  }

  async create(
    dto: CreateDeviceDto,
    user: AccessTokenPayload,
  ): Promise<DeviceRecord> {
    this.assertAdmin(user);
    try {
      // plant_id procede exclusivamente de la planta del motor. El cliente no
      // puede forzar una relación entre plantas/motores de empresas distintas.
      const rows = await this.db.query<{ id: string }[]>(
        `INSERT INTO public.devices (
           plant_id, motor_id, name, device_code, serial_number,
           firmware_version, communication_type, status
         )
         SELECT m.plant_id, m.id, $2, $3, $4, $5, $6, 'REGISTERED'
         FROM public.motors m
         JOIN public.plants p ON p.id = m.plant_id
         JOIN public.clients c ON c.id = p.client_id
         WHERE m.id = $1::uuid AND m.status = 'ACTIVE'
           AND p.status = 'ACTIVE' AND c.status = 'ACTIVE'
         RETURNING id`,
        [
          dto.motorId,
          dto.name,
          dto.code,
          dto.serialNumber || null,
          dto.firmwareVersion || null,
          dto.communicationType,
        ],
      );
      if (!rows[0]) {
        throw new NotFoundException('Motor activo no encontrado.');
      }
      return this.detail(rows[0].id, user);
    } catch (error: unknown) {
      this.handleWriteError(error);
    }
  }

  async update(
    id: string,
    dto: UpdateDeviceDto,
    user: AccessTokenPayload,
  ): Promise<DeviceRecord> {
    this.assertAdmin(user);
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'Indica al menos un campo para actualizar.',
      );
    }
    try {
      const rows = await this.db.query<{ id: string }[]>(
        `UPDATE public.devices AS d SET
           name = COALESCE($2::varchar, d.name),
           serial_number = CASE WHEN $3::boolean THEN $4::varchar ELSE d.serial_number END,
           firmware_version = CASE WHEN $5::boolean THEN $6::varchar ELSE d.firmware_version END,
           communication_type = COALESCE($7::varchar, d.communication_type)
         WHERE d.id = $1::uuid
         RETURNING d.id`,
        [
          id,
          dto.name ?? null,
          Object.prototype.hasOwnProperty.call(dto, 'serialNumber'),
          dto.serialNumber || null,
          Object.prototype.hasOwnProperty.call(dto, 'firmwareVersion'),
          dto.firmwareVersion || null,
          dto.communicationType ?? null,
        ],
      );
      if (!rows[0]) throw new NotFoundException('Dispositivo no encontrado.');
      return this.detail(rows[0].id, user);
    } catch (error: unknown) {
      this.handleWriteError(error);
    }
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo administración puede modificar dispositivos.',
      );
    }
  }

  private handleWriteError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driver = error.driverError as { code?: string };
      if (driver.code === '23505') {
        throw new ConflictException(
          'El código o número de serie ya está registrado.',
        );
      }
      if (driver.code === '23503' || driver.code === '23514') {
        throw new BadRequestException(
          'Los datos incumplen las reglas de dispositivos.',
        );
      }
    }
    throw error;
  }

  private normalize(row: DbDevice): DeviceRecord {
    return {
      ...row,
      lastConnectionAt:
        row.lastConnectionAt === null
          ? null
          : new Date(row.lastConnectionAt).toISOString(),
      lastTelemetryReceivedAt:
        row.lastTelemetryReceivedAt === null
          ? null
          : new Date(row.lastTelemetryReceivedAt).toISOString(),
    };
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateClientDto } from './dto/create-client.dto';
import { CreatePlantDto } from './dto/create-plant.dto';

export interface ClientSummary {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  plantCount: number;
  motorCount: number;
}

export interface PlantSummary {
  id: string;
  name: string;
  code: string;
  location: string | null;
  status: string;
  motorCount: number;
}

export interface ClientMotor {
  id: string;
  plantId: string;
  name: string;
  code: string;
  status: string;
  operationalStatus: string;
  lastTelemetryAt: Date | null;
}

const clientColumns = `
  c.id, c.name, c.tax_id AS "taxId", c.email, c.phone, c.status,
  (SELECT COUNT(*)::integer FROM public.plants p WHERE p.client_id = c.id) AS "plantCount",
  (SELECT COUNT(*)::integer FROM public.motors m
   JOIN public.plants p ON p.id = m.plant_id
   WHERE p.client_id = c.id) AS "motorCount"
`;

@Injectable()
export class ClientsAdminService {
  constructor(private readonly db: DataSource) {}

  list(): Promise<ClientSummary[]> {
    return this.db.query<ClientSummary[]>(
      `SELECT ${clientColumns} FROM public.clients c ORDER BY c.name ASC`,
    );
  }

  private async findClient(id: string): Promise<ClientSummary> {
    const rows = await this.db.query<ClientSummary[]>(
      `SELECT ${clientColumns} FROM public.clients c WHERE c.id = $1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Cliente no encontrado.');
    return rows[0];
  }

  async detail(id: string): Promise<{
    client: ClientSummary;
    plants: PlantSummary[];
    motors: ClientMotor[];
  }> {
    const client = await this.findClient(id);
    const plants = await this.db.query<PlantSummary[]>(`
      SELECT p.id, p.name, p.code, p.location, p.status,
        COUNT(m.id)::integer AS "motorCount"
      FROM public.plants p
      LEFT JOIN public.motors m ON m.plant_id = p.id
      WHERE p.client_id = $1
      GROUP BY p.id
      ORDER BY p.name ASC
    `, [id]);
    const motors = await this.db.query<ClientMotor[]>(`
      SELECT m.id, m.plant_id AS "plantId", m.name, m.code, m.status,
        m.operational_status AS "operationalStatus",
        m.last_telemetry_at AS "lastTelemetryAt"
      FROM public.motors m
      JOIN public.plants p ON p.id = m.plant_id
      WHERE p.client_id = $1
      ORDER BY p.name ASC, m.name ASC
    `, [id]);
    return { client, plants, motors };
  }

  async create(dto: CreateClientDto): Promise<ClientSummary> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El nombre no puede estar vacío.');
    try {
      const rows = await this.db.query<{ id: string }[]>(`
        INSERT INTO public.clients (name, tax_id, email, phone)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [name, this.optional(dto.taxId), this.optional(dto.email)?.toLowerCase() ?? null, this.optional(dto.phone)]);
      return this.findClient(rows[0].id);
    } catch (error) {
      this.mapDatabaseError(error);
    }
  }

  async createPlant(clientId: string, dto: CreatePlantDto): Promise<PlantSummary> {
    const name = dto.name.trim();
    const code = dto.code.trim();
    if (!name || !code) throw new BadRequestException('Nombre y código son obligatorios.');
    const client = await this.findClient(clientId);
    if (client.status !== 'ACTIVE') {
      throw new BadRequestException('No se pueden agregar plantas a un cliente inactivo.');
    }
    try {
      const rows = await this.db.query<PlantSummary[]>(`
        INSERT INTO public.plants (client_id, name, code, location)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, code, location, status
      `, [clientId, name, code, this.optional(dto.location)]);
      return { ...rows[0], motorCount: 0 };
    } catch (error) {
      this.mapDatabaseError(error);
    }
  }

  private optional(value?: string): string | null {
    return value?.trim() || null;
  }

  private mapDatabaseError(error: unknown): never {
    const postgres = error as { driverError?: { code?: string }; code?: string };
    const code = postgres.driverError?.code ?? postgres.code;
    if (code === '23505') throw new ConflictException('Ya existe un registro con esos datos.');
    if (code === '23503') throw new BadRequestException('El cliente o la planta asociada no existe.');
    throw error;
  }
}

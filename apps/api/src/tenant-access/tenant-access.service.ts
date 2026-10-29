import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AccessTokenPayload } from '../auth/auth.types';

// La consulta a PostgreSQL se hace en cada entrega WebSocket; cambios de
// asignación se reflejan sin conservar listas antiguas en memoria.
@Injectable()
export class TenantAccessService {
  constructor(private readonly db: DataSource) {}

  async permittedMotorIds(
    user: AccessTokenPayload,
    motorIds: string[],
  ): Promise<Set<string>> {
    if (user.role === 'ADMIN') return new Set(motorIds);
    if (!['VIEWER', 'OPERATOR'].includes(user.role) || motorIds.length === 0) {
      return new Set();
    }
    const rows = await this.db.query<{ id: string }[]>(
      `SELECT DISTINCT m.id
       FROM public.motors m
       JOIN public.plants p ON p.id = m.plant_id
       JOIN public.clients c ON c.id = p.client_id
       JOIN public.user_client_access uca ON uca.client_id = c.id
       WHERE uca.user_id = $1 AND c.status = 'ACTIVE'
         AND m.id = ANY($2::uuid[])`,
      [user.sub, motorIds],
    );
    return new Set(rows.map((row) => row.id));
  }
}

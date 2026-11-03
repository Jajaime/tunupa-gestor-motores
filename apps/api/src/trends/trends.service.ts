import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AccessTokenPayload } from '../auth/auth.types';
import { TrendsQueryDto, TREND_INTERVALS } from './trends-query.dto';

interface ExistenceRow {
  exists: boolean;
}
interface BucketRow {
  bucket_at: Date | string;
  average: number | string;
  minimum: number | string;
  maximum: number | string;
  sample_count: number | string;
  unit: string;
}

export interface TrendPoint {
  bucketAt: string;
  average: number;
  minimum: number;
  maximum: number;
  sampleCount: number;
  unit: string;
}

@Injectable()
export class TrendsService {
  constructor(private readonly db: DataSource) {}

  async history(
    motorId: string,
    filters: TrendsQueryDto,
    user: AccessTokenPayload,
  ): Promise<TrendPoint[]> {
    const start = Date.parse(filters.from);
    const end = Date.parse(filters.to);
    const step = TREND_INTERVALS[filters.bucket];
    const windowMs = end - start;

    // Inclusive start, exclusive end. Limit both database workload and displayed points.
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      !step ||
      windowMs <= 0 ||
      windowMs > 31 * 86_400_000 ||
      end > Date.now() + 5 * 60_000 ||
      windowMs / step.milliseconds > 600
    ) {
      throw new BadRequestException(
        'Período inválido: máximo 31 días y 600 intervalos por consulta.',
      );
    }

    // A foreign motor must appear indistinguishable from a non-existent motor.
    const exists = await this.db.query<ExistenceRow[]>(
      `
      SELECT EXISTS (
        SELECT 1 FROM public.motors m
        JOIN public.plants p ON p.id = m.plant_id
        WHERE m.id = $1 AND ($2::text = 'ADMIN' OR (
          $2::text IN ('VIEWER', 'OPERATOR') AND EXISTS (
            SELECT 1 FROM public.user_client_access uca
            JOIN public.clients c ON c.id = uca.client_id
            WHERE uca.user_id = $3 AND uca.client_id = p.client_id
              AND c.status = 'ACTIVE'
          )
        ))
      ) AS "exists"`,
      [motorId, user.role, user.sub],
    );

    if (!exists[0]?.exists) throw new NotFoundException('Motor no encontrado.');

    const rows = await this.db.query<BucketRow[]>(
      `
      SELECT time_bucket($5::interval, t.measured_at) AS bucket_at,
        AVG(t.value)::double precision AS average,
        MIN(t.value)::double precision AS minimum,
        MAX(t.value)::double precision AS maximum,
        COUNT(*)::integer AS sample_count, t.unit
      FROM public.telemetry t
      WHERE t.motor_id = $1
        AND UPPER(t.measurement_type) = $2
        AND t.measured_at >= $3::timestamptz
        AND t.measured_at < $4::timestamptz
        AND t.quality IN ('GOOD', 'UNCERTAIN')
        AND EXISTS (
          SELECT 1 FROM public.motors m JOIN public.plants p ON p.id = m.plant_id
          WHERE m.id = t.motor_id AND ($6::text = 'ADMIN' OR (
            $6::text IN ('VIEWER', 'OPERATOR') AND EXISTS (
              SELECT 1 FROM public.user_client_access uca
              JOIN public.clients c ON c.id = uca.client_id
              WHERE uca.user_id = $7 AND uca.client_id = p.client_id
                AND c.status = 'ACTIVE'
            )
          ))
        )
      GROUP BY bucket_at, t.unit
      ORDER BY bucket_at ASC, t.unit ASC
      LIMIT 601`,
      [
        motorId,
        filters.measurementType,
        filters.from,
        filters.to,
        step.interval,
        user.role,
        user.sub,
      ],
    );

    if (rows.length > 600) {
      throw new BadRequestException(
        'Demasiados intervalos o unidades diferentes.',
      );
    }

    return rows.map((row) => ({
      bucketAt: new Date(row.bucket_at).toISOString(),
      average: Number(row.average),
      minimum: Number(row.minimum),
      maximum: Number(row.maximum),
      sampleCount: Number(row.sample_count),
      unit: row.unit,
    }));
  }
}

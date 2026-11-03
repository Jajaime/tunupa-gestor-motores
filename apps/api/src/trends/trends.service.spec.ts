import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MeasurementType } from '../telemetry/dto/telemetry-message.dto';
import { TrendBucket, type TrendsQueryDto } from './trends-query.dto';
import { TrendsService } from './trends.service';

const viewer = { role: 'VIEWER', sub: 'user-1' } as never;
const valid: TrendsQueryDto = {
  measurementType: MeasurementType.TEMPERATURE,
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-01-02T00:00:00.000Z',
  bucket: TrendBucket.FIVE_MINUTES,
};

describe('TrendsService tenant-scoped aggregation', () => {
  const query =
    jest.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>();
  const trends = new TrendsService({ query } as never);
  beforeEach(() => query.mockReset());

  it('no revela motores de otras empresas y no consulta su telemetría', async () => {
    query.mockResolvedValueOnce([{ exists: false }]);
    await expect(
      trends.history('foreign-motor', valid, viewer),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(
      (query.mock.calls as unknown as Array<[string, unknown[]]>)[0][1],
    ).toEqual(['foreign-motor', 'VIEWER', 'user-1']);
  });

  it('filtra tanto por motor autorizado como por pertenencia en la agregación', async () => {
    query.mockResolvedValueOnce([{ exists: true }]).mockResolvedValueOnce([
      {
        bucket_at: '2026-01-01T00:00:00.000Z',
        average: '10.5',
        minimum: '9',
        maximum: '11',
        sample_count: '3',
        unit: '°C',
      },
    ]);
    const result = await trends.history('my-motor', valid, viewer);
    expect(result).toEqual([
      {
        bucketAt: '2026-01-01T00:00:00.000Z',
        average: 10.5,
        minimum: 9,
        maximum: 11,
        sampleCount: 3,
        unit: '°C',
      },
    ]);
    const [sql, params] = (
      query.mock.calls as unknown as Array<[string, unknown[]]>
    )[1];
    expect(sql).toContain('time_bucket($5::interval');
    expect(sql).toContain('public.user_client_access');
    expect(sql).toContain("t.quality IN ('GOOD', 'UNCERTAIN')");
    expect(params).toEqual([
      'my-motor',
      'TEMPERATURE',
      valid.from,
      valid.to,
      '5 minutes',
      'VIEWER',
      'user-1',
    ]);
  });

  it('rechaza fecha invertida, ventana extensa o demasiados intervalos antes de SQL', async () => {
    await expect(
      trends.history('x', { ...valid, from: valid.to }, viewer),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      trends.history('x', { ...valid, to: '2026-04-02T00:00:00.000Z' }, viewer),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      trends.history('x', { ...valid, to: '2026-01-05T00:00:00.000Z' }, viewer),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rechaza agregaciones con más de 600 filas para evitar muestras parciales', async () => {
    query
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce(
        Array.from({ length: 601 }, () => ({ bucket_at: valid.from })),
      );
    await expect(trends.history('x', valid, viewer)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

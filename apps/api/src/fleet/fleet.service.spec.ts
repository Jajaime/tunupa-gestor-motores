import { NotFoundException } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.types';
import { FleetService } from './fleet.service';

const admin = { sub: 'admin-user', role: 'ADMIN' } as AccessTokenPayload;
const viewer = { sub: 'client-user', role: 'VIEWER' } as AccessTokenPayload;
const operator = { sub: 'operator-user', role: 'OPERATOR' } as AccessTokenPayload;

describe('FleetService: acceso multiempresa', () => {
  const query = jest.fn();
  const service = new FleetService({ query } as never);
  beforeEach(() => query.mockReset());

  it('filtra en PostgreSQL el listado por usuario y empresa', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.list(viewer)).resolves.toEqual([]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('uca.user_id = $2 AND uca.client_id = c.id');
    expect(sql).toContain("c.status = 'ACTIVE'");
    expect(params).toEqual(['VIEWER', 'client-user']);
  });

  it('incluye administradores sin otorgar ese acceso a otros roles', async () => {
    query.mockResolvedValueOnce([]);
    await service.list(admin);
    expect(query.mock.calls[0][1]).toEqual(['ADMIN', 'admin-user']);
    expect(query.mock.calls[0][0]).toContain("$1::text = 'ADMIN'");
    expect(query.mock.calls[0][0]).toContain("$1::text IN ('VIEWER', 'OPERATOR')");
  });

  it('retorna 404 si el motor no existe o es de otra empresa', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.detail('id-externo', viewer)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE m.id = $3 AND');
    expect(sql).toContain('uca.user_id = $2 AND uca.client_id = c.id');
    expect(params).toEqual(['VIEWER', 'client-user', 'id-externo']);
  });

  it('obtiene dispositivos y últimas lecturas en la misma consulta autorizada', async () => {
    query.mockResolvedValueOnce([{
      id: 'id-propio', lastTelemetryAt: null,
      ratedPowerKw: '0.750', ratedVoltage: '220.000',
      ratedCurrent: null, ratedFrequencyHz: '50.000',
      devices: [], latestMeasurements: {},
    }]);
    const detail = await service.detail('id-propio', operator);
    expect(detail.ratedPowerKw).toBe(0.75);
    expect(detail.ratedVoltage).toBe(220);
    expect(detail.ratedFrequencyHz).toBe(50);
    expect(detail.ratedCurrent).toBeNull();
    expect(detail.devices).toEqual([]);
    expect(detail.latestMeasurements).toEqual({});
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM public.devices d WHERE d.motor_id = m.id');
    expect(sql).toContain('FROM public.telemetry t');
    expect(params).toEqual(['OPERATOR', 'operator-user', 'id-propio']);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('normaliza fechas de la lista a ISO 8601', async () => {
    query.mockResolvedValueOnce([{
      id: 'm1', name: 'Motor', lastTelemetryAt: new Date('2026-10-29T14:00:00Z'),
    }]);
    const rows = await service.list(admin);
    expect(rows[0].lastTelemetryAt).toBe('2026-10-29T14:00:00.000Z');
  });
});

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.types';
import { AlarmsService } from './alarms.service';

const viewer = { sub: 'user-a', role: 'VIEWER' } as AccessTokenPayload;
const operator = { sub: 'user-b', role: 'OPERATOR' } as AccessTokenPayload;

describe('AlarmsService - permisos y trazabilidad', () => {
  const query =
    jest.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
  const managerQuery =
    jest.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
  const transaction = jest.fn(
    async (
      work: (manager: { query: typeof managerQuery }) => Promise<unknown>,
    ) => work({ query: managerQuery }),
  );
  const record = jest.fn();
  const service = new AlarmsService(
    { query, transaction } as never,
    { record } as never,
  );
  const calls = () =>
    query.mock.calls as unknown as Array<[string, unknown[]?]>;
  const managerCalls = () =>
    managerQuery.mock.calls as unknown as Array<[string, unknown[]?]>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filtra por la asociación usuario-cliente en la misma consulta SQL', async () => {
    query.mockResolvedValueOnce([]);
    await expect(
      service.list({ limit: 50, offset: 0 }, viewer),
    ).resolves.toEqual({
      items: [],
      hasMore: false,
    });
    expect(calls()[0][0]).toContain('uca.user_id = $2::uuid');
    expect(calls()[0][0]).toContain("c.status = 'ACTIVE'");
    expect(calls()[0][1]?.slice(0, 2)).toEqual(['VIEWER', 'user-a']);
  });

  it('no revela alarmas ajenas o inexistentes', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.detail('foreign', viewer)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calls()[0][0]).toContain('a.id = $3::uuid');
    expect(calls()[0][1]).toEqual(['VIEWER', 'user-a', 'foreign']);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('impide a VIEWER reconocer incluso una alarma conocida', async () => {
    await expect(service.acknowledge('known', viewer)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rechaza reconocimiento si el estado ya cambió, sin revelar datos ajenos', async () => {
    managerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await expect(
      service.acknowledge('foreign', operator),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(managerCalls()[1][0]).toContain("a.status = 'ACTIVE'");
    expect(managerCalls()[1][0]).toContain('uca.user_id = $2::uuid');
    expect(managerCalls()[1][1]).toEqual(['OPERATOR', 'user-b', 'foreign']);
    expect(record).not.toHaveBeenCalled();
  });

  it('devuelve conflicto a un operador autorizado cuando ya está reconocida', async () => {
    managerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'alarm-a' }]);
    await expect(
      service.acknowledge('alarm-a', operator),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(record).not.toHaveBeenCalled();
  });

  it('registra el evento solo en la transacción de reconocimiento autorizado', async () => {
    managerQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'alarm-a',
        motor_id: 'motor-a',
        device_id: null,
        alarm_type: 'HIGH_TEMPERATURE',
        severity: 'WARNING',
        status: 'ACKNOWLEDGED',
        measured_value: '80',
        threshold_value: '70',
        unit: '°C',
        started_at: '2026-10-29T15:00:00Z',
        resolved_at: null,
      },
    ]);
    const detail = jest
      .spyOn(service, 'detail')
      .mockResolvedValue({ id: 'alarm-a', events: [] } as never);
    await service.acknowledge('alarm-a', operator);
    expect(managerCalls()[0][0]).toContain("set_config('tunupa.actor_user_id'");
    expect(managerCalls()[0][1]).toEqual(['user-b']);
    expect(record).toHaveBeenCalledWith(
      expect.anything(),
      'alarm.changed',
      'motor-a',
      null,
      expect.objectContaining({ id: 'alarm-a', status: 'ACKNOWLEDGED' }),
    );
    detail.mockRestore();
  });
});

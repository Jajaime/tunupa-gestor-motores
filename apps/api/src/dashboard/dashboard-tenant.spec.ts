import { DashboardService } from './dashboard.service';

const user = { sub: 'user-a', role: 'VIEWER' } as never;

describe('DashboardService - tenant isolation', () => {
  const query = jest.fn();
  const service = new DashboardService({ query } as never);
  beforeEach(() => query.mockReset());

  it('lista motores exclusivamente según la asociación del usuario', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.findMotorSummaries(user)).resolves.toEqual([]);
    expect(query.mock.calls[0][0]).toContain('public.user_client_access');
    expect(query.mock.calls[0][1]).toEqual(['VIEWER', 'user-a']);
  });
  it('no revela si el UUID de otro cliente corresponde a un motor existente', async () => {
    query.mockResolvedValueOnce([{ exists: false }]);
    await expect(service.findTelemetryHistory('foreign', { limit: 10 } as never, user))
      .rejects.toMatchObject({ status: 404 });
    expect(query.mock.calls[0][1]).toEqual(['foreign', 'VIEWER', 'user-a']);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('consulta historial usando el filtro también en la consulta de telemetría', async () => {
    query.mockResolvedValueOnce([{ exists: true }]).mockResolvedValueOnce([]);
    await service.findTelemetryHistory('motor-own', { limit: 10 } as never, user);
    expect(query.mock.calls[1][0]).toContain('public.user_client_access');
    expect(query.mock.calls[1][1]).toEqual(['motor-own', null, null, null, 10, 'VIEWER', 'user-a']);
  });
});

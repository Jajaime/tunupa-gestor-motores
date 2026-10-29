import { TenantAccessService } from './tenant-access.service';

const viewer = { sub: 'user-uuid', role: 'VIEWER' } as never;

describe('TenantAccessService', () => {
  const query = jest.fn();
  const service = new TenantAccessService({ query } as never);
  beforeEach(() => query.mockReset());

  it('ADMIN recibe todos los ids sin consultar asignaciones', async () => {
    expect(await service.permittedMotorIds({ role: 'ADMIN' } as never, ['a'])).toEqual(new Set(['a']));
    expect(query).not.toHaveBeenCalled();
  });
  it('usuario no asociado no recibe motores', async () => {
    query.mockResolvedValueOnce([]);
    expect(await service.permittedMotorIds(viewer, ['motor-a'])).toEqual(new Set());
    expect(query.mock.calls[0][1]).toEqual(['user-uuid', ['motor-a']]);
    expect(query.mock.calls[0][0]).toContain('uca.user_id = $1');
    expect(query.mock.calls[0][0]).toContain("c.status = 'ACTIVE'");
  });
  it('solo conserva los motores autorizados por la base de datos', async () => {
    query.mockResolvedValueOnce([{ id: 'motor-a' }]);
    expect(await service.permittedMotorIds(viewer, ['motor-a', 'motor-b']))
      .toEqual(new Set(['motor-a']));
  });
  it('rol desconocido y lote vacío no generan consultas', async () => {
    expect(await service.permittedMotorIds({ role: 'OTHER' } as never, ['a']))
      .toEqual(new Set());
    expect(await service.permittedMotorIds(viewer, [])).toEqual(new Set());
    expect(query).not.toHaveBeenCalled();
  });
});

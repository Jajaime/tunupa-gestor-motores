import { TenantAccessService } from './tenant-access.service';

const viewer = { sub: 'user-uuid', role: 'VIEWER' } as never;

describe('TenantAccessService', () => {
  const query =
    jest.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
  const service = new TenantAccessService({ query } as never);
  const typedCalls = () =>
    query.mock.calls as unknown as Array<[string, unknown[]?]>;
  beforeEach(() => query.mockReset());

  it('ADMIN recibe todos los ids sin consultar asignaciones', async () => {
    expect(
      await service.permittedMotorIds({ role: 'ADMIN' } as never, ['a']),
    ).toEqual(new Set(['a']));
    expect(query).not.toHaveBeenCalled();
  });
  it('usuario no asociado no recibe motores', async () => {
    query.mockResolvedValueOnce([]);
    expect(await service.permittedMotorIds(viewer, ['motor-a'])).toEqual(
      new Set(),
    );
    expect(typedCalls()[0][1]).toEqual(['user-uuid', ['motor-a']]);
    expect(typedCalls()[0][0]).toContain('uca.user_id = $1');
    expect(typedCalls()[0][0]).toContain("c.status = 'ACTIVE'");
  });
  it('solo conserva los motores autorizados por la base de datos', async () => {
    query.mockResolvedValueOnce([{ id: 'motor-a' }]);
    expect(
      await service.permittedMotorIds(viewer, ['motor-a', 'motor-b']),
    ).toEqual(new Set(['motor-a']));
  });
  it('rol desconocido y lote vacío no generan consultas', async () => {
    expect(
      await service.permittedMotorIds({ role: 'OTHER' } as never, ['a']),
    ).toEqual(new Set());
    expect(await service.permittedMotorIds(viewer, [])).toEqual(new Set());
    expect(query).not.toHaveBeenCalled();
  });
});

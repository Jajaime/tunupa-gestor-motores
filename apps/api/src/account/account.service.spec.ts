import * as argon2 from 'argon2';
import { AccountService } from './account.service';
import type { AccessTokenPayload } from '../auth/auth.types';

const user = {
  sub: '11111111-1111-4111-8111-111111111111',
  sid: '22222222-2222-4222-8222-222222222222',
  role: 'VIEWER',
} as AccessTokenPayload;

describe('AccountService - protección de cuenta y sesiones', () => {
  const query =
    jest.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
  const revoked = jest.fn<(sid: string) => void>();
  const queryCalls = (): Array<[string, unknown[]]> => {
    const calls: unknown = query.mock.calls;
    return calls as Array<[string, unknown[]]>;
  };
  const transaction = jest.fn<
    (
      work: (manager: { query: typeof query }) => Promise<unknown>,
    ) => Promise<unknown>
  >(
    (
      work: (manager: { query: typeof query }) => Promise<unknown>,
    ): Promise<unknown> => work({ query }),
  );
  const service = new AccountService(
    { query, transaction } as never,
    { revoked } as never,
  );
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consulta perfil sin exponer password_hash', async () => {
    query.mockResolvedValueOnce([
      { id: user.sub, email: 'a@b.cl', role: 'VIEWER' },
    ]);
    await expect(service.profile(user)).resolves.toMatchObject({
      id: user.sub,
    });
    expect(queryCalls()[0][0]).not.toContain('password_hash');
    expect(queryCalls()[0][1]).toEqual([user.sub]);
  });

  it('enumera solo sesiones del usuario y marca la actual', async () => {
    query.mockResolvedValueOnce([
      {
        id: user.sid,
        createdAt: '2026-01-01',
        expiresAt: '2027-01-01',
        ipAddress: null,
        userAgent: null,
      },
      {
        id: 'otro',
        createdAt: '2026-01-01',
        expiresAt: '2027-01-01',
        ipAddress: null,
        userAgent: null,
      },
    ]);
    const result = await service.sessions(user);
    expect(result.map((s) => s.isCurrent)).toEqual([true, false]);
    expect(queryCalls()[0][1]).toEqual([user.sub]);
    expect(queryCalls()[0][0]).toContain('LIMIT 100');
  });

  it('no permite revocar la sesión que realiza la petición', async () => {
    await expect(service.revokeSession(user, user.sid)).rejects.toMatchObject({
      status: 400,
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('revoca solo sesiones propias y notifica el cierre en tiempo real', async () => {
    const foreign = '33333333-3333-4333-8333-333333333333';
    query.mockResolvedValueOnce([]);
    await expect(service.revokeSession(user, foreign)).rejects.toMatchObject({
      status: 404,
    });
    expect(queryCalls()[0][1]).toEqual([foreign, user.sub]);
    query.mockResolvedValueOnce([{ id: foreign }]);
    await service.revokeSession(user, foreign);
    expect(revoked).toHaveBeenCalledWith(foreign);
  });

  it('cierra otras sesiones sin revocar la sesión actual', async () => {
    query.mockResolvedValueOnce([{ id: 'otra' }]);
    await expect(service.revokeOthers(user)).resolves.toEqual({
      revokedSessions: 1,
    });
    expect(queryCalls()[0][1]).toEqual([user.sub, user.sid]);
    expect(revoked).toHaveBeenCalledWith('otra');
  });

  it('exige la contraseña actual y no escribe ante una contraseña incorrecta', async () => {
    const hash = await argon2.hash('contraseña-original-larga');
    query.mockResolvedValueOnce([
      { id: user.sub, email: 'a@b.cl', password_hash: hash },
    ]);
    await expect(
      service.changePassword(
        user,
        {
          currentPassword: 'incorrecta',
          newPassword: 'otra-contraseña-segura',
        },
        {},
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(revoked).not.toHaveBeenCalled();
  });

  it('cambia hash y revoca otras sesiones solo después de confirmar transacción', async () => {
    const hash = await argon2.hash('contraseña-original-larga');
    query.mockResolvedValueOnce([
      { id: user.sub, email: 'a@b.cl', password_hash: hash },
    ]);
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([{ id: 'otra' }]);
    query.mockResolvedValueOnce([]);
    await expect(
      service.changePassword(
        user,
        {
          currentPassword: 'contraseña-original-larga',
          newPassword: 'nueva-contraseña-segura-2026',
        },
        { ipAddress: '127.0.0.1' },
      ),
    ).resolves.toEqual({ revokedSessions: 1 });
    const update = queryCalls()[1];
    expect(update[0]).toContain('password_changed_at');
    expect(update[1]?.[0]).toBe(user.sub);
    expect(
      await argon2.verify(
        update[1]?.[1] as string,
        'nueva-contraseña-segura-2026',
      ),
    ).toBe(true);
    expect(queryCalls()[2][1]).toEqual([user.sub, user.sid]);
    expect(revoked).toHaveBeenCalledWith('otra');
  });
});

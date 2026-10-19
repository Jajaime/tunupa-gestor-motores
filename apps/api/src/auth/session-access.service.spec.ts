import { SessionAccessService } from './session-access.service';

const claims = {
  sub: '11111111-1111-4111-8111-111111111111',
  sid: '22222222-2222-4222-8222-222222222222',
  email: 'old@example.invalid',
  role: 'ADMIN',
  exp: 0,
};

describe('SessionAccessService', () => {
  const jwt = { verifyAsync: jest.fn() };
  const db = { query: jest.fn() };
  const service = new SessionAccessService(jwt as never, db as never);
  beforeEach(() => {
    jest.clearAllMocks();
    claims.exp = Math.floor(Date.now() / 1000) + 60;
    jwt.verifyAsync.mockResolvedValue({ ...claims });
    db.query.mockResolvedValue([
      { email: 'current@example.invalid', role: 'VIEWER' },
    ]);
  });
  it('usa identidad vigente y exige sid/user coincidentes en la base', async () => {
    await expect(service.verify('signed')).resolves.toMatchObject({
      role: 'VIEWER',
      email: 'current@example.invalid',
    });
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      claims.sid,
      claims.sub,
    ]);
  });
  it('rechaza acceso sin cookie', async () => {
    await expect(service.verify(undefined)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(db.query).not.toHaveBeenCalled();
  });
  it('rechaza tokens anteriores sin sid', async () => {
    jwt.verifyAsync.mockResolvedValue({ ...claims, sid: undefined });
    await expect(service.verify('old')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });
  it('rechaza JWT firmado pero con claims inválidos', async () => {
    jwt.verifyAsync.mockResolvedValue(null);
    await expect(service.verify('invalid')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });
  it('distingue JWT vencido', async () => {
    jwt.verifyAsync.mockRejectedValue(
      Object.assign(new Error(), { name: 'TokenExpiredError' }),
    );
    await expect(service.verify('expired')).rejects.toMatchObject({
      code: 'ACCESS_EXPIRED',
    });
  });
  it('rechaza sesión revocada, vencida o usuario inactivo', async () => {
    db.query.mockResolvedValue([]);
    await expect(service.verify('signed')).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
  });
  it('un error de base de datos no se interpreta como credenciales inválidas', async () => {
    const failure = new Error('database offline');
    db.query.mockRejectedValue(failure);
    await expect(service.verify('signed')).rejects.toBe(failure);
  });
  it('notifica la revocación de una sesión y permite retirar listeners', () => {
    const listener = jest.fn();
    const off = service.onRevoked(listener);
    service.revoked(claims.sid);
    expect(listener).toHaveBeenCalledWith(claims.sid);
    off();
    service.revoked(claims.sid);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

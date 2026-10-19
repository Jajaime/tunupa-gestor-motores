import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard';

const request: { cookies: Record<string, string>; user?: unknown } = {
  cookies: {},
};
const context = {
  getHandler: () => class Handler {},
  getClass: () => class Controller {},
  switchToHttp: () => ({ getRequest: () => request }),
} as unknown as ExecutionContext;

describe('AccessTokenGuard', () => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const jwt = { verify: jest.fn() };
  const guard = new AccessTokenGuard(reflector as never, jwt as never);

  beforeEach(() => {
    request.cookies = {};
    request.user = undefined;
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
  });

  it('permite rutas públicas', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rechaza solicitudes sin access token', async () => {
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('adjunta el usuario de un token válido', async () => {
    request.cookies.tunupa_access = 'token';
    jwt.verify.mockResolvedValue({
      sub: 'user-id',
      email: 'admin@example.com',
      role: 'ADMIN',
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(expect.objectContaining({ sub: 'user-id' }));
  });
});

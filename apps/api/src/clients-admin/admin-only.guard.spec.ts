import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { AdminOnlyGuard } from './admin-only.guard';

function context(role?: string): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }) } as unknown as ExecutionContext;
}

describe('AdminOnlyGuard', () => {
  const guard = new AdminOnlyGuard();
  it('autoriza únicamente a ADMIN', () => {
    expect(guard.canActivate(context('ADMIN'))).toBe(true);
  });
  it.each(['OPERATOR', 'VIEWER', undefined])('rechaza rol %s', (role) => {
    expect(() => guard.canActivate(context(role))).toThrow(ForbiddenException);
  });
});

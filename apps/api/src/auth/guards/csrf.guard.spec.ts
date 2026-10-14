import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

function context(
  method: string,
  cookie?: string,
  header?: string,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        cookies: { tunupa_csrf: cookie },
        headers: { 'x-csrf-token': header },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('permite solicitudes seguras sin token', () => {
    expect(guard.canActivate(context('GET'))).toBe(true);
  });

  it('permite una mutación cuando cookie y cabecera coinciden', () => {
    expect(
      guard.canActivate(context('POST', 'token-seguro', 'token-seguro')),
    ).toBe(true);
  });

  it('rechaza una mutación sin token coincidente', () => {
    expect(() => guard.canActivate(context('POST', 'uno', 'otro'))).toThrow(
      ForbiddenException,
    );
  });
});

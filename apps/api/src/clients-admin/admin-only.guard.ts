import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../auth/auth.types';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AccessTokenPayload | undefined;
    if (user?.role !== 'ADMIN') {
      throw new ForbiddenException('Acceso reservado a administración GroundTEK.');
    }
    return true;
  }
}

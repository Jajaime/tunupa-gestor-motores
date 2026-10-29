import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (user?.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Acceso reservado a administración GroundTEK.',
      );
    }
    return true;
  }
}

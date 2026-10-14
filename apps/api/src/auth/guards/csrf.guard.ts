import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { CSRF_COOKIE } from '../auth.constants';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const cookie = request.cookies?.[CSRF_COOKIE] as string | undefined;
    const headerValue = request.headers['x-csrf-token'];
    const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!cookie || !header)
      throw new ForbiddenException('Token CSRF inválido.');
    const left = Buffer.from(cookie);
    const right = Buffer.from(header);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new ForbiddenException('Token CSRF inválido.');
    }
    return true;
  }
}

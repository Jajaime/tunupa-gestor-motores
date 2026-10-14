import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ACCESS_COOKIE } from '../auth.constants';
import type { AccessTokenPayload } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('Autenticación requerida.');
    try {
      request.user = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException('La sesión expiró.');
    }
  }
}

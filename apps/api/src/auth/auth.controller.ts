import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';
import type { AccessTokenPayload, RequestMetadata } from './auth.types';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('csrf')
  @ApiOperation({ summary: 'Genera el token CSRF previo al inicio de sesión' })
  csrf(@Res({ passthrough: true }) response: Response) {
    const csrfToken = randomBytes(32).toString('base64url');
    response.cookie(
      CSRF_COOKIE,
      csrfToken,
      this.cookieOptions(false, 86_400_000),
    );
    return { csrfToken };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(
      dto.email,
      dto.password,
      this.metadata(request),
    );
    this.setSessionCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.refresh(
      request.cookies?.[REFRESH_COOKIE] as string | undefined,
      this.metadata(request),
    );
    this.setSessionCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(
      request.cookies?.[REFRESH_COOKIE] as string | undefined,
      this.metadata(request),
    );
    response.clearCookie(ACCESS_COOKIE, this.cookieOptions(true));
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions(true));
  }

  @Get('me')
  me(@Req() request: Request) {
    const user = request.user as AccessTokenPayload;
    return { user: { id: user.sub, email: user.email, role: user.role } };
  }

  private setSessionCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    response.cookie(
      ACCESS_COOKIE,
      accessToken,
      this.cookieOptions(
        true,
        this.config.getOrThrow<number>('AUTH_ACCESS_TTL_SECONDS') * 1000,
      ),
    );
    response.cookie(
      REFRESH_COOKIE,
      refreshToken,
      this.cookieOptions(
        true,
        this.config.getOrThrow<number>('AUTH_REFRESH_TTL_DAYS') * 86_400_000,
      ),
    );
  }

  private cookieOptions(httpOnly: boolean, maxAge?: number) {
    return {
      httpOnly,
      secure: this.config.getOrThrow<boolean>('AUTH_COOKIE_SECURE'),
      sameSite: 'lax' as const,
      path: '/',
      maxAge,
    };
  }

  private metadata(request: Request): RequestMetadata {
    return { ipAddress: request.ip, userAgent: request.get('user-agent') };
  }
}

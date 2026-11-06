import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../auth/auth.types';
import { AccountService } from './account.service';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('account')
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Consultar los datos de la cuenta actual' })
  profile(@Req() request: Request) {
    return this.account.profile(request.user as AccessTokenPayload);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Consultar las sesiones activas de la cuenta' })
  sessions(@Req() request: Request) {
    return this.account.sessions(request.user as AccessTokenPayload);
  }

  @Post('password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cambiar contraseña y revocar otras sesiones' })
  changePassword(@Req() request: Request, @Body() dto: ChangePasswordDto) {
    return this.account.changePassword(
      request.user as AccessTokenPayload,
      dto,
      {
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
      },
    );
  }

  @Post('sessions/revoke-others')
  @ApiOperation({ summary: 'Revocar todas las sesiones salvo la actual' })
  revokeOthers(@Req() request: Request) {
    return this.account.revokeOthers(request.user as AccessTokenPayload);
  }

  @Post('sessions/:id/revoke')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revocar una sesión propia distinta de la actual' })
  revokeSession(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.account.revokeSession(request.user as AccessTokenPayload, id);
  }
}

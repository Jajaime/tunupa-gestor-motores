import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../auth/auth.types';
import { FleetService } from './fleet.service';

// Endpoint solo lectura: no se reutilizan los CRUD de /motors (ADMIN).
@ApiTags('fleet')
@Controller('fleet/motors')
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get()
  @ApiOperation({ summary: 'Listar motores autorizados para la sesión' })
  list(@Req() request: Request) {
    return this.fleet.list(request.user as AccessTokenPayload);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ficha técnica de un motor autorizado' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNotFoundResponse({ description: 'Motor no encontrado o sin acceso' })
  detail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ) {
    return this.fleet.detail(id, request.user as AccessTokenPayload);
  }
}

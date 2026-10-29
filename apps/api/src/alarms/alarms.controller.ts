import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../auth/auth.types';
import { AlarmsQueryDto } from './dto/alarms-query.dto';
import { AlarmsService } from './alarms.service';

@ApiTags('alarms')
@Controller('alarms')
export class AlarmsController {
  constructor(private readonly alarms: AlarmsService) {}

  @Get()
  @ApiOperation({
    summary: 'Alarmas autorizadas para la sesión, con filtros y paginación',
  })
  list(@Query() query: AlarmsQueryDto, @Req() request: Request) {
    return this.alarms.list(query, request.user as AccessTokenPayload);
  }

  @Get(':id')
  @ApiNotFoundResponse({ description: 'Alarma inexistente o no autorizada' })
  detail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ) {
    return this.alarms.detail(id, request.user as AccessTokenPayload);
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Reconocer una alarma activa (ADMIN u OPERATOR)' })
  acknowledge(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ) {
    return this.alarms.acknowledge(id, request.user as AccessTokenPayload);
  }
}

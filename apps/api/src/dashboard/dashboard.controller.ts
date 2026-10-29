import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../auth/auth.types';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  DashboardMotorSummary,
  DashboardService,
  TelemetryHistoryPoint,
} from './dashboard.service';
import { TelemetryHistoryQueryDto } from './dto/telemetry-history-query.dto';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('motors')
  @ApiOperation({ summary: 'Listar el resumen operativo de los motores' })
  @ApiOkResponse({
    description: 'Resumen de motores con dispositivo y última telemetría',
  })
  findMotorSummaries(@Req() request: Request): Promise<DashboardMotorSummary[]> {
    return this.dashboardService.findMotorSummaries(request.user as AccessTokenPayload);
  }

  @Get('motors/:id/history')
  @ApiOperation({ summary: 'Consultar el histórico de un motor' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Serie histórica cronológica' })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos' })
  @ApiNotFoundResponse({ description: 'Motor no encontrado' })
  findTelemetryHistory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: TelemetryHistoryQueryDto,
    @Req() request: Request,
  ): Promise<TelemetryHistoryPoint[]> {
    return this.dashboardService.findTelemetryHistory(id, query, request.user as AccessTokenPayload);
  }
}

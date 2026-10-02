import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
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
  findMotorSummaries(): Promise<DashboardMotorSummary[]> {
    return this.dashboardService.findMotorSummaries();
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
  ): Promise<TelemetryHistoryPoint[]> {
    return this.dashboardService.findTelemetryHistory(id, query);
  }
}

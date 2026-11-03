import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../auth/auth.types';
import { TrendsQueryDto } from './trends-query.dto';
import { TrendsService, type TrendPoint } from './trends.service';

@ApiTags('trends')
@Controller('trends/motors')
export class TrendsController {
  constructor(private readonly trends: TrendsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Series agregadas por motor autorizado (promedio, mínimo, máximo)',
  })
  @ApiBadRequestResponse({
    description: 'Fechas, variable o agrupación inválidas',
  })
  @ApiNotFoundResponse({ description: 'Motor inexistente o no autorizado' })
  history(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() filters: TrendsQueryDto,
    @Req() request: Request,
  ): Promise<TrendPoint[]> {
    return this.trends.history(id, filters, request.user as AccessTokenPayload);
  }
}

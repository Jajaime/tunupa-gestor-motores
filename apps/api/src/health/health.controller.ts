import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Comprobar el estado del backend y PostgreSQL',
  })
  @ApiOkResponse({
    description: 'Backend y PostgreSQL disponibles',
    schema: {
      example: {
        status: 'ok',
        database: {
          status: 'up',
          name: 'medicion_motor',
        },
        checkedAt: '2026-09-02T19:30:00.000Z',
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'PostgreSQL no está disponible',
  })
  check() {
    return this.healthService.check();
  }
}

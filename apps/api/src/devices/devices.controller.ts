import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../auth/auth.types';
import { AdminOnlyGuard } from '../clients-admin/admin-only.guard';
import { CreateDeviceDto, UpdateDeviceDto } from './dto/device.dto';
import { DevicesService } from './devices.service';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @ApiOperation({ summary: 'Dispositivos visibles para la sesión' })
  list(@Req() request: Request) {
    return this.devices.list(request.user as AccessTokenPayload);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar dispositivo autorizado' })
  detail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ) {
    return this.devices.detail(id, request.user as AccessTokenPayload);
  }

  @Post()
  @UseGuards(AdminOnlyGuard)
  @ApiOperation({ summary: 'Registrar un gateway asociado a un motor' })
  create(@Body() dto: CreateDeviceDto, @Req() request: Request) {
    return this.devices.create(dto, request.user as AccessTokenPayload);
  }

  @Patch(':id')
  @UseGuards(AdminOnlyGuard)
  @ApiOperation({
    summary: 'Actualizar datos técnicos (no cambia código, motor ni estado)',
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDeviceDto,
    @Req() request: Request,
  ) {
    return this.devices.update(id, dto, request.user as AccessTokenPayload);
  }
}

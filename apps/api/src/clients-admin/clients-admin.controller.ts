import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnlyGuard } from './admin-only.guard';
import { ClientsAdminService } from './clients-admin.service';
import { CreateClientDto } from './dto/create-client.dto';
import { CreatePlantDto } from './dto/create-plant.dto';
import { CreateClientUserDto } from './dto/create-client-user.dto';

@ApiTags('admin-clients')
@Controller('admin/clients')
@UseGuards(AdminOnlyGuard)
export class ClientsAdminController {
  constructor(private readonly clients: ClientsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Listar empresas registradas (solo ADMIN)' })
  list() {
    return this.clients.list();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Ver plantas y motores asociados a una empresa (solo ADMIN)',
  })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.clients.detail(id);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar una empresa (solo ADMIN)' })
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Post(':id/plants')
  @ApiOperation({
    summary: 'Registrar una planta para una empresa (solo ADMIN)',
  })
  createPlant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePlantDto,
  ) {
    return this.clients.createPlant(id, dto);
  }

  @Get(':id/users')
  @ApiOperation({
    summary: 'Listar usuarios vinculados a una empresa (solo ADMIN)',
  })
  listUsers(@Param('id', ParseUUIDPipe) id: string) {
    return this.clients.listUsers(id);
  }

  @Post(':id/users')
  @ApiOperation({
    summary: 'Crear usuario cliente y vincularlo a una empresa (solo ADMIN)',
  })
  createUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientUserDto,
  ) {
    return this.clients.createUser(id, dto);
  }
}

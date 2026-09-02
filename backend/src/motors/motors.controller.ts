import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CreateMotorDto } from './dto/create-motor.dto';
import { UpdateMotorDto } from './dto/update-motor.dto';
import { Motor } from './entities/motor.entity';
import { MotorsService } from './motors.service';

@ApiTags('motors')
@Controller('motors')
export class MotorsController {
  constructor(private readonly motorsService: MotorsService) {}

  @Post()
  @ApiOperation({
    summary: 'Registrar un motor',
  })
  @ApiCreatedResponse({
    description: 'Motor registrado correctamente',
    type: Motor,
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o planta inexistente',
  })
  @ApiConflictResponse({
    description: 'El código ya existe en la planta',
  })
  create(@Body() createMotorDto: CreateMotorDto): Promise<Motor> {
    return this.motorsService.create(createMotorDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar todos los motores',
  })
  @ApiOkResponse({
    description: 'Listado de motores',
    type: Motor,
    isArray: true,
  })
  findAll(): Promise<Motor[]> {
    return this.motorsService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un motor por identificador',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Motor encontrado',
    type: Motor,
  })
  @ApiBadRequestResponse({
    description: 'El identificador no es un UUID válido',
  })
  @ApiNotFoundResponse({
    description: 'Motor no encontrado',
  })
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<Motor> {
    return this.motorsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar parcialmente un motor',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Motor actualizado correctamente',
    type: Motor,
  })
  @ApiBadRequestResponse({
    description: 'Identificador o datos inválidos',
  })
  @ApiNotFoundResponse({
    description: 'Motor no encontrado',
  })
  @ApiConflictResponse({
    description: 'El código ya existe en la planta',
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateMotorDto: UpdateMotorDto,
  ): Promise<Motor> {
    return this.motorsService.update(id, updateMotorDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar un motor',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
  })
  @ApiNoContentResponse({
    description: 'Motor eliminado correctamente',
  })
  @ApiBadRequestResponse({
    description: 'El identificador no es un UUID válido',
  })
  @ApiNotFoundResponse({
    description: 'Motor no encontrado',
  })
  @ApiConflictResponse({
    description: 'El motor tiene dispositivos o alarmas asociados',
  })
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.motorsService.remove(id);
  }
}

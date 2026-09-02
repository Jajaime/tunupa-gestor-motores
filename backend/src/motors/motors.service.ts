import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateMotorDto } from './dto/create-motor.dto';
import { UpdateMotorDto } from './dto/update-motor.dto';
import { Motor } from './entities/motor.entity';

interface PostgresDriverError {
  code?: string;
  constraint?: string;
}

@Injectable()
export class MotorsService {
  constructor(
    @InjectRepository(Motor)
    private readonly motorsRepository: Repository<Motor>,
  ) {}

  async create(createMotorDto: CreateMotorDto): Promise<Motor> {
    const motor = this.motorsRepository.create(createMotorDto);

    try {
      return await this.motorsRepository.save(motor);
    } catch (error: unknown) {
      this.handleWriteError(error);
    }
  }

  findAll(): Promise<Motor[]> {
    return this.motorsRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<Motor> {
    const motor = await this.motorsRepository.findOneBy({ id });

    if (!motor) {
      throw new NotFoundException(`No existe un motor con id ${id}`);
    }

    return motor;
  }

  async update(id: string, updateMotorDto: UpdateMotorDto): Promise<Motor> {
    const motor = await this.motorsRepository.preload({
      id,
      ...updateMotorDto,
    });

    if (!motor) {
      throw new NotFoundException(`No existe un motor con id ${id}`);
    }

    try {
      return await this.motorsRepository.save(motor);
    } catch (error: unknown) {
      this.handleWriteError(error);
    }
  }

  async remove(id: string): Promise<void> {
    const motor = await this.findOne(id);

    try {
      await this.motorsRepository.remove(motor);
    } catch (error: unknown) {
      if (error instanceof QueryFailedError) {
        const driverError = error.driverError as PostgresDriverError;

        if (driverError.code === '23503') {
          throw new ConflictException(
            'No se puede eliminar el motor porque tiene dispositivos o alarmas asociados',
          );
        }
      }

      throw error;
    }
  }

  private handleWriteError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driverError = error.driverError as PostgresDriverError;

      if (driverError.code === '23505') {
        if (driverError.constraint === 'uq_motors_plant_code') {
          throw new ConflictException(
            'Ya existe un motor con ese código en la planta indicada',
          );
        }

        throw new ConflictException(
          'El motor entra en conflicto con un registro existente',
        );
      }

      if (driverError.code === '23503') {
        throw new BadRequestException('La planta indicada no existe');
      }

      if (driverError.code === '23514') {
        throw new BadRequestException(
          'Los datos del motor incumplen una restricción de la base de datos',
        );
      }
    }

    throw error;
  }
}

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryFailedError } from 'typeorm';
import { CreateMotorDto } from './dto/create-motor.dto';
import { Motor, MotorStatus } from './entities/motor.entity';
import { MotorsService } from './motors.service';

interface MockRepository {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOneBy: jest.Mock;
  preload: jest.Mock;
  remove: jest.Mock;
}

const plantId = '20000000-0000-4000-8000-000000000001';
const motorId = '30000000-0000-4000-8000-000000000001';

const motorFixture: Motor = {
  id: motorId,
  plantId,
  name: 'Bomba centrífuga de prueba',
  code: 'MOTOR-DEMO-001',
  manufacturer: 'Qatar Shop',
  model: 'Bomba periférica 0.5 HP',
  serialNumber: 'DEMO-MOTOR-SN-001',
  ratedPowerKw: 0.373,
  ratedVoltage: 220,
  ratedCurrent: 2.5,
  ratedFrequencyHz: 50,
  status: MotorStatus.ACTIVE,
  createdAt: new Date('2026-09-02T12:00:00.000Z'),
  updatedAt: new Date('2026-09-02T12:00:00.000Z'),
};

const createMotorDto: CreateMotorDto = {
  plantId,
  name: 'Bomba centrífuga de prueba',
  code: 'MOTOR-DEMO-001',
  ratedPowerKw: 0.373,
  ratedVoltage: 220,
  ratedCurrent: 2.5,
  ratedFrequencyHz: 50,
  status: MotorStatus.ACTIVE,
};

function createPostgresError(
  code: string,
  constraint?: string,
): QueryFailedError {
  const driverError = Object.assign(new Error('PostgreSQL error'), {
    code,
    constraint,
  });

  return new QueryFailedError('SQL de prueba', [], driverError);
}

describe('MotorsService', () => {
  let service: MotorsService;
  let repository: MockRepository;

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOneBy: jest.fn(),
      preload: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MotorsService,
        {
          provide: getRepositoryToken(Motor),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<MotorsService>(MotorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a motor', async () => {
    repository.create.mockReturnValue(motorFixture);
    repository.save.mockResolvedValue(motorFixture);

    await expect(service.create(createMotorDto)).resolves.toEqual(motorFixture);

    expect(repository.create).toHaveBeenCalledWith(createMotorDto);
    expect(repository.save).toHaveBeenCalledWith(motorFixture);
  });

  it('should list motors ordered by creation date', async () => {
    repository.find.mockResolvedValue([motorFixture]);

    await expect(service.findAll()).resolves.toEqual([motorFixture]);

    expect(repository.find).toHaveBeenCalledWith({
      order: {
        createdAt: 'DESC',
      },
    });
  });

  it('should find a motor by id', async () => {
    repository.findOneBy.mockResolvedValue(motorFixture);

    await expect(service.findOne(motorId)).resolves.toEqual(motorFixture);

    expect(repository.findOneBy).toHaveBeenCalledWith({
      id: motorId,
    });
  });

  it('should throw NotFoundException when motor does not exist', async () => {
    repository.findOneBy.mockResolvedValue(null);

    await expect(service.findOne(motorId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should update a motor', async () => {
    const updatedMotor = {
      ...motorFixture,
      name: 'Motor actualizado',
      status: MotorStatus.MAINTENANCE,
    };

    repository.preload.mockResolvedValue(updatedMotor);
    repository.save.mockResolvedValue(updatedMotor);

    await expect(
      service.update(motorId, {
        name: 'Motor actualizado',
        status: MotorStatus.MAINTENANCE,
      }),
    ).resolves.toEqual(updatedMotor);
  });

  it('should throw NotFoundException when updating an unknown motor', async () => {
    repository.preload.mockResolvedValue(undefined);

    await expect(
      service.update(motorId, {
        name: 'Motor inexistente',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should remove an existing motor', async () => {
    repository.findOneBy.mockResolvedValue(motorFixture);
    repository.remove.mockResolvedValue(motorFixture);

    await expect(service.remove(motorId)).resolves.toBeUndefined();

    expect(repository.remove).toHaveBeenCalledWith(motorFixture);
  });

  it('should translate duplicate plant code into ConflictException', async () => {
    repository.create.mockReturnValue(motorFixture);
    repository.save.mockRejectedValue(
      createPostgresError('23505', 'uq_mq_motors_plant_code'),
    );

    await expect(service.create(createMotorDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('should translate an unknown plant into BadRequestException', async () => {
    repository.create.mockReturnValue(motorFixture);
    repository.save.mockRejectedValue(
      createPostgresError('23503', 'fk_motors_plant'),
    );

    await expect(service.create(createMotorDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should prevent removing a motor with dependencies', async () => {
    repository.findOneBy.mockResolvedValue(motorFixture);
    repository.remove.mockRejectedValue(
      createPostgresError('23503', 'fk_devices_motor_plant'),
    );

    await expect(service.remove(motorId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { CreateMotorDto } from './dto/create-motor.dto';
import { Motor, MotorStatus } from './entities/motor.entity';
import { MotorsController } from './motors.controller';
import { MotorsService } from './motors.service';

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

describe('MotorsController', () => {
  let controller: MotorsController;

  const motorsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MotorsController],
      providers: [
        {
          provide: MotorsService,
          useValue: motorsService,
        },
      ],
    }).compile();

    controller = module.get<MotorsController>(MotorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create a motor', async () => {
    const dto: CreateMotorDto = {
      plantId,
      name: 'Bomba centrífuga de prueba',
      code: 'MOTOR-DEMO-001',
      status: MotorStatus.ACTIVE,
    };

    motorsService.create.mockResolvedValue(motorFixture);

    await expect(controller.create(dto)).resolves.toEqual(motorFixture);

    expect(motorsService.create).toHaveBeenCalledWith(dto);
  });

  it('should list all motors', async () => {
    motorsService.findAll.mockResolvedValue([motorFixture]);

    await expect(controller.findAll()).resolves.toEqual([motorFixture]);
  });

  it('should find a motor by id', async () => {
    motorsService.findOne.mockResolvedValue(motorFixture);

    await expect(controller.findOne(motorId)).resolves.toEqual(motorFixture);

    expect(motorsService.findOne).toHaveBeenCalledWith(motorId);
  });

  it('should update a motor', async () => {
    const dto = {
      status: MotorStatus.MAINTENANCE,
    };

    const updatedMotor = {
      ...motorFixture,
      status: MotorStatus.MAINTENANCE,
    };

    motorsService.update.mockResolvedValue(updatedMotor);

    await expect(controller.update(motorId, dto)).resolves.toEqual(
      updatedMotor,
    );

    expect(motorsService.update).toHaveBeenCalledWith(motorId, dto);
  });

  it('should remove a motor', async () => {
    motorsService.remove.mockResolvedValue(undefined);

    await expect(controller.remove(motorId)).resolves.toBeUndefined();

    expect(motorsService.remove).toHaveBeenCalledWith(motorId);
  });
});

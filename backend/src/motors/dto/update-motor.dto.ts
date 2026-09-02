import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateMotorDto } from './create-motor.dto';

export class UpdateMotorDto extends PartialType(
  OmitType(CreateMotorDto, ['plantId'] as const),
) {}

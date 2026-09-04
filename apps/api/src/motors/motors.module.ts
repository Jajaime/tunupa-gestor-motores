import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Motor } from './entities/motor.entity';
import { MotorsController } from './motors.controller';
import { MotorsService } from './motors.service';

@Module({
  imports: [TypeOrmModule.forFeature([Motor])],
  controllers: [MotorsController],
  providers: [MotorsService],
})
export class MotorsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Motor } from './entities/motor.entity';
import { MotorsController } from './motors.controller';
import { MotorsService } from './motors.service';
import { AdminOnlyGuard } from '../clients-admin/admin-only.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Motor])],
  controllers: [MotorsController],
  providers: [MotorsService, AdminOnlyGuard],
})
export class MotorsModule {}

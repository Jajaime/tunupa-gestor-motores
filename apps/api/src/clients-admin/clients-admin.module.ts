import { Module } from '@nestjs/common';
import { ClientsAdminController } from './clients-admin.controller';
import { ClientsAdminService } from './clients-admin.service';

@Module({
  controllers: [ClientsAdminController],
  providers: [ClientsAdminService],
})
export class ClientsAdminModule {}

import { Module } from '@nestjs/common';
import { RealtimeEventsModule } from './realtime-events.module';
import { AuthModule } from '../auth/auth.module';
import { DashboardGateway } from './dashboard.gateway';

@Module({
  imports: [AuthModule, RealtimeEventsModule],
  providers: [DashboardGateway],
})
export class RealtimeModule {}

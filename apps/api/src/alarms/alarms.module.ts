import { Module } from '@nestjs/common';
import { RealtimeEventsModule } from '../realtime/realtime-events.module';
import { AlarmsController } from './alarms.controller';
import { AlarmsService } from './alarms.service';

@Module({
  imports: [RealtimeEventsModule],
  controllers: [AlarmsController],
  providers: [AlarmsService],
})
export class AlarmsModule {}

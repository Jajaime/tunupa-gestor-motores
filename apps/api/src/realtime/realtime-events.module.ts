import { Module } from '@nestjs/common';
import { CommittedEventsService } from './committed-events.service';
@Module({
  providers: [CommittedEventsService],
  exports: [CommittedEventsService],
})
export class RealtimeEventsModule {}

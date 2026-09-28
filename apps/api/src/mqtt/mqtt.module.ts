import { Module } from '@nestjs/common';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { MqttConsumerService } from './mqtt-consumer.service';

@Module({
  imports: [TelemetryModule],
  providers: [MqttConsumerService],
  exports: [MqttConsumerService],
})
export class MqttModule {}

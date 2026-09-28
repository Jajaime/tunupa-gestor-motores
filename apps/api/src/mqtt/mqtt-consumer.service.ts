import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type MqttClient } from 'mqtt';
import { TelemetryValidatorService } from '../telemetry/telemetry-validator.service';
import { TelemetryIngestionService } from '../telemetry/telemetry-ingestion.service';

@Injectable()
export class MqttConsumerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MqttConsumerService.name);
  private client?: MqttClient;
  private processingQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly configService: ConfigService,
    private readonly telemetryValidator: TelemetryValidatorService,
    private readonly telemetryIngestion: TelemetryIngestionService,
  ) {}

  onApplicationBootstrap(): void {
    const url = this.configService.getOrThrow<string>('MQTT_URL');
    const username = this.configService.getOrThrow<string>('MQTT_USERNAME');
    const password = this.configService.getOrThrow<string>('MQTT_PASSWORD');

    this.client = connect(url, {
      username,
      password,
      clientId: `tunupa-api-${process.pid}`,
      clean: true,
      connectTimeout: 10_000,
      reconnectPeriod: 2_000,
      protocolVersion: 4,
    });

    this.client.on('connect', () => {
      this.logger.log(`Conectado al broker MQTT: ${url}`);
      void this.subscribeToTopics();
    });

    this.client.on('reconnect', () => {
      this.logger.warn('Intentando reconectar con Mosquitto...');
    });

    this.client.on('offline', () => {
      this.logger.warn('Conexión MQTT fuera de línea.');
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`Error MQTT: ${error.message}`);
    });

    this.client.on('message', (topic: string, payload: Buffer) => {
      this.processingQueue = this.processingQueue
        .then(() => this.processMessage(topic, payload))
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Error desconocido';

          this.logger.error(`Error procesando mensaje MQTT: ${message}`);
        });
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.processingQueue;

    if (!this.client) {
      return;
    }

    await this.client.endAsync();
    this.logger.log('Conexión MQTT cerrada correctamente.');
  }

  private async processMessage(topic: string, payload: Buffer): Promise<void> {
    const result = await this.telemetryValidator.validateMessage(
      topic,
      payload,
    );

    if (!result.valid) {
      this.logger.warn(
        `Mensaje MQTT rechazado: topic=${topic}; ${result.reason}`,
      );
      return;
    }

    if (result.kind === 'telemetry') {
      const processingResult = await this.telemetryIngestion.processTelemetry(
        topic,
        payload,
        result.value,
      );

      if (processingResult.duplicate) {
        this.logger.warn(
          `Mensaje MQTT duplicado omitido: ` +
            `messageId=${processingResult.messageId}`,
        );
        return;
      }

      this.logger.log(
        `Telemetría guardada: ` +
          `device=${processingResult.deviceCode}; ` +
          `messageId=${processingResult.messageId}; ` +
          `measurements=${processingResult.measurementsInserted}; ` +
          `status=${processingResult.operationalStatus}`,
      );

      return;
    }

    await this.telemetryIngestion.processStatus(result.value);

    this.logger.log(
      `Estado actualizado: ` +
        `device=${result.value.deviceCode}; ` +
        `status=${result.value.status}; ` +
        `reason=${result.value.reason}`,
    );
  }

  private async subscribeToTopics(): Promise<void> {
    if (!this.client) {
      return;
    }

    const telemetryTopic = this.configService.getOrThrow<string>(
      'MQTT_TELEMETRY_TOPIC',
    );

    const statusTopic =
      this.configService.getOrThrow<string>('MQTT_STATUS_TOPIC');

    try {
      await this.client.subscribeAsync([telemetryTopic, statusTopic], {
        qos: 1,
      });

      this.logger.log(`Suscrito a: ${telemetryTopic}`);
      this.logger.log(`Suscrito a: ${statusTopic}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';

      this.logger.error(`No fue posible suscribirse a MQTT: ${message}`);
    }
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { MotorsModule } from './motors/motors.module';
import { MqttModule } from './mqtt/mqtt.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
        APP_PORT: Joi.number().port().default(3001),
        WEB_ORIGIN: Joi.string().uri().default('http://localhost:3000'),
        POSTGRES_HOST: Joi.string().default('localhost'),
        POSTGRES_PORT: Joi.number().port().default(5432),
        POSTGRES_USER: Joi.string().required(),
        POSTGRES_PASSWORD: Joi.string().required(),
        POSTGRES_DB: Joi.string().required(),
        MQTT_URL: Joi.string()
          .pattern(/^mqtts?:\/\//)
          .default('mqtt://localhost:1883'),
        MQTT_USERNAME: Joi.string().required(),
        MQTT_PASSWORD: Joi.string().required(),
        MQTT_TELEMETRY_TOPIC: Joi.string().default(
          'tunupa/v1/devices/+/telemetry',
        ),
        MQTT_STATUS_TOPIC: Joi.string().default('tunupa/v1/devices/+/status'),
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('POSTGRES_HOST'),
        port: configService.getOrThrow<number>('POSTGRES_PORT'),
        username: configService.getOrThrow<string>('POSTGRES_USER'),
        password: configService.getOrThrow<string>('POSTGRES_PASSWORD'),
        database: configService.getOrThrow<string>('POSTGRES_DB'),
        autoLoadEntities: true,
        synchronize: false,
        logging: configService.get<string>('NODE_ENV') === 'development',
      }),
    }),
    HealthModule,
    MotorsModule,
    MqttModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

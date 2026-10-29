import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { MotorsModule } from './motors/motors.module';
import { MqttModule } from './mqtt/mqtt.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AuthModule } from './auth/auth.module';
import { ClientsAdminModule } from './clients-admin/clients-admin.module';
import { TenantAccessModule } from './tenant-access/tenant-access.module';
import { FleetModule } from './fleet/fleet.module';
import { AccessTokenGuard } from './auth/guards/access-token.guard';
import { CsrfGuard } from './auth/guards/csrf.guard';

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
        TELEMETRY_TIMEOUT_SECONDS: Joi.number()
          .integer()
          .min(5)
          .max(3600)
          .default(30),
        TELEMETRY_CHECK_INTERVAL_MS: Joi.number()
          .integer()
          .min(1000)
          .max(60000)
          .default(5000),
        AUTH_ACCESS_SECRET: Joi.string().min(32).required(),
        AUTH_ACCESS_TTL_SECONDS: Joi.number().integer().min(300).default(900),
        AUTH_REFRESH_TTL_DAYS: Joi.number().integer().min(1).max(30).default(7),
        AUTH_COOKIE_SECURE: Joi.boolean().default(false),
        AUTH_MAX_LOGIN_ATTEMPTS: Joi.number().integer().min(3).default(5),
        AUTH_LOCK_MINUTES: Joi.number().integer().min(1).default(15),
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
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    RealtimeModule,
    ClientsAdminModule,
    TenantAccessModule,
    FleetModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
})
export class AppModule {}

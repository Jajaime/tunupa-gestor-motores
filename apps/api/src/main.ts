import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RealtimeAdapter } from './realtime/realtime.adapter';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  app.enableShutdownHooks();
  app.useWebSocketAdapter(
    new RealtimeAdapter(app, configService.getOrThrow<string>('WEB_ORIGIN')),
  );
  const logger = new Logger('Bootstrap');
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  app.setGlobalPrefix('api/v1');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }));
  app.use(cookieParser());

  app.enableCors({
    origin: configService.getOrThrow<string>('WEB_ORIGIN'),
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Tunupa Gestor de Motores')
      .setDescription(
        'API para administrar motores eléctricos y recibir telemetría.',
      )
      .setVersion('1.0')
      .addTag('health', 'Estado del backend y sus dependencias')
      .addTag('motors', 'Administración de motores eléctricos')
      .addTag('dashboard', 'Resumen operativo e histórico de telemetría')
      .addTag('auth', 'Autenticación y administración de sesión')
      .addCookieAuth('tunupa_access')
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, swaggerDocument);
  }

  const port = configService.getOrThrow<number>('APP_PORT');

  await app.listen(port);

  logger.log(`Backend disponible en http://localhost:${port}/api/v1`);
  if (!isProduction) {
    logger.log(`Swagger disponible en http://localhost:${port}/docs`);
  }
}

void bootstrap();

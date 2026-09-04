import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tunupa Gestor de Motores')
    .setDescription(
      'API para administrar motores eléctricos y recibir telemetría.',
    )
    .setVersion('1.0')
    .addTag('health', 'Estado del backend y sus dependencias')
    .addTag('motors', 'Administración de motores eléctricos')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, swaggerDocument);

  const port = configService.getOrThrow<number>('APP_PORT');

  await app.listen(port);

  logger.log(`Backend disponible en http://localhost:${port}/api/v1`);
  logger.log(`Swagger disponible en http://localhost:${port}/docs`);
}

void bootstrap();

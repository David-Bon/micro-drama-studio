import 'reflect-metadata';
import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config } from './config';
import { DbModule } from './db/db.module';
import { RendersModule } from './renders/renders.module';

@Module({ imports: [DbModule, RendersModule] })
class ApiModule {}

async function bootstrap() {
  const app = await NestFactory.create(ApiModule);
  // whitelist + forbidNonWhitelisted: зайві поля в body → 400
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(config.port);
  console.log(`API listening on http://localhost:${config.port}`);
}
void bootstrap();

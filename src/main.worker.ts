import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DbModule } from './db/db.module';
import { RendersWorkerModule } from './renders/renders-worker.module';

@Module({ imports: [DbModule, RendersWorkerModule] })
class WorkerModule {}

// 🧠 Той самий кодбейс, інша точка входу. createApplicationContext —
// Nest без HTTP-сервера: тільки DI і модулі. Воркер можна масштабувати
// окремо від API, і важкий рендер ніколи не сповільнить HTTP-відповіді.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  // 🧠 При SIGTERM BullMQ чекає завершення поточних джобів. Якщо процес
  // вбили жорстко (kill -9), джоб стане "stalled" і повернеться в чергу.
  app.enableShutdownHooks();
  console.log('Render worker started');
}
void bootstrap();

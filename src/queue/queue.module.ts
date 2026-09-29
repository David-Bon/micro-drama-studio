import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { config } from '../config';

export const RENDER_QUEUE = 'render';

// 🧠 Черга — це "список справ" у Redis. API кладе туди задачу й одразу
// відповідає клієнту, а воркер забирає її, коли має вільні ресурси.
// Так API не блокується на хвилини, поки FFmpeg (а потім відеомодель) працює.
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        // Обов'язково для BullMQ-воркерів: блокуючі команди Redis
        // не мають падати через ліміт ретраїв ioredis.
        maxRetriesPerRequest: null,
      },
    }),
    BullModule.registerQueue({ name: RENDER_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}

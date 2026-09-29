import { Module } from '@nestjs/common';
import { MediaPaths } from '../media/media-paths';
import { QueueModule } from '../queue/queue.module';
import { RendersController } from './renders.controller';
import { RendersService } from './renders.service';

/** HTTP-частина: приймає запити, кладе джоби в чергу. Сама НЕ рендерить. */
@Module({
  imports: [QueueModule],
  controllers: [RendersController],
  providers: [RendersService, MediaPaths],
})
export class RendersModule {}

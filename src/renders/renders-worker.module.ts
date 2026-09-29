import { Module } from '@nestjs/common';
import { FfmpegService } from '../media/ffmpeg.service';
import { MediaPaths } from '../media/media-paths';
import { QueueModule } from '../queue/queue.module';
import { RenderProcessor } from './render.processor';

/** Воркер-частина: забирає джоби з черги й виконує важку роботу. */
@Module({
  imports: [QueueModule],
  providers: [RenderProcessor, FfmpegService, MediaPaths],
})
export class RendersWorkerModule {}

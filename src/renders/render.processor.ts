import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { eq } from 'drizzle-orm';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { config } from '../config';
import { DB, Db } from '../db/db.module';
import { renders } from '../db/schema';
import { FfmpegService } from '../media/ffmpeg.service';
import { MediaPaths } from '../media/media-paths';
import { toSrt } from '../media/subtitles';
import { RENDER_QUEUE } from '../queue/queue.module';
import type { RenderJobData } from './render.types';

// 🧠 concurrency — скільки джобів ОДИН воркер виконує паралельно.
// FFmpeg навантажує CPU, тож більше ≠ швидше. Масштабуємося кількістю
// воркер-контейнерів: docker compose up --scale worker=3
@Processor(RENDER_QUEUE, { concurrency: config.renderConcurrency })
export class RenderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenderProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ffmpeg: FfmpegService,
    private readonly paths: MediaPaths,
  ) {
    super();
  }

  async process(job: Job<RenderJobData>) {
    const { renderId } = job.data;
    const [render] = await this.db.select().from(renders).where(eq(renders.id, renderId));

    // UnrecoverableError = не ретраїти: повторна спроба нічого не змінить.
    if (!render) throw new UnrecoverableError(`Render ${renderId} not found`);

    // 🧠 Ідемпотентність: джоб може виконатися повторно (воркер упав
    // після рендеру, але до підтвердження в Redis). Якщо робота вже
    // зроблена — не робимо її вдруге. Коли це буде платна відеогенерація,
    // ця перевірка збереже реальні гроші.
    if (render.status === 'completed') return { outputPath: render.outputPath };

    await this.setState(renderId, {
      status: 'processing',
      attempts: job.attemptsMade + 1,
      error: null,
    });

    const workDir = path.join(this.paths.workDir, renderId);
    const tmpOutput = path.join(workDir, 'output.mp4');
    const finalOutput = path.join(this.paths.outputsDir, `${renderId}.mp4`);

    try {
      await mkdir(workDir, { recursive: true });
      await mkdir(this.paths.outputsDir, { recursive: true });

      const { clips, audio, subtitles } = render.input;
      let subtitlesPath: string | undefined;
      if (subtitles?.length) {
        subtitlesPath = path.join(workDir, 'subtitles.srt');
        await writeFile(subtitlesPath, toSrt(subtitles), 'utf8');
      }

      let lastReported = 0;
      await this.ffmpeg.assembleVertical(
        {
          clips: clips.map((c) => this.paths.resolveInput(c)),
          audio: audio ? this.paths.resolveInput(audio) : undefined,
          subtitlesPath,
          output: tmpOutput,
        },
        (percent) => {
          // Троттлінг: не пишемо в БД на кожен рядок прогресу FFmpeg.
          if (percent - lastReported < 5) return;
          lastReported = percent;
          void job.updateProgress(percent);
          void this.setState(renderId, { progress: percent }).catch(() => undefined);
        },
      );

      // 🧠 Атомарний запис: рендеримо в тимчасовий файл і лише потім
      // перейменовуємо. Ніхто не побачить напівзаписане відео в outputs.
      await rename(tmpOutput, finalOutput);
      await this.setState(renderId, { status: 'completed', progress: 100, outputPath: finalOutput });
      this.logger.log(`Render ${renderId} completed`);
      return { outputPath: finalOutput };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.setState(renderId, {
        status: isLastAttempt ? 'failed' : 'queued',
        error: message.slice(0, 2000),
      });
      this.logger.warn(`Render ${renderId} attempt ${job.attemptsMade + 1} failed: ${message}`);
      throw err; // BullMQ сам запланує ретрай з backoff
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private setState(id: string, patch: Partial<typeof renders.$inferInsert>) {
    return this.db
      .update(renders)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(renders.id, id));
  }
}

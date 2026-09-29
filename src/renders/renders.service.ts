import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { access } from 'node:fs/promises';
import { DB, Db } from '../db/db.module';
import { renders } from '../db/schema';
import { MediaPaths } from '../media/media-paths';
import { RENDER_QUEUE } from '../queue/queue.module';
import { CreateRenderDto } from './dto/create-render.dto';
import type { RenderJobData } from './render.types';

@Injectable()
export class RendersService {
  private readonly logger = new Logger(RendersService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(RENDER_QUEUE) private readonly queue: Queue<RenderJobData>,
    private readonly paths: MediaPaths,
  ) {}

  async create(dto: CreateRenderDto) {
    // Валідуємо на вході: краще 400 зараз, ніж failed-джоб через хвилину.
    const files = [...dto.clips, ...(dto.audio ? [dto.audio] : [])];
    for (const f of files) {
      try {
        await access(this.paths.resolveInput(f));
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException(`File not found in media/inputs: ${f}`);
      }
    }
    for (const cue of dto.subtitles ?? []) {
      if (cue.end <= cue.start) throw new BadRequestException('Subtitle end must be after start');
    }

    const [render] = await this.db
      .insert(renders)
      .values({ input: { clips: dto.clips, audio: dto.audio, subtitles: dto.subtitles } })
      .returning();

    // 🧠 Проблема "подвійного запису" (dual write): ми пишемо в Postgres,
    // а потім у Redis. Якщо процес впаде між цими рядками — запис
    // назавжди залишиться 'queued'. Тут ми хоча б позначаємо failed при
    // помилці черги; повноцінне рішення — патерн Transactional Outbox
    // (одне із завдань у README).
    try {
      await this.queue.add(
        'assemble',
        { renderId: render.id },
        {
          // 🧠 jobId = renderId робить додавання ідемпотентним:
          // повторний add з тим самим id не створить дубль.
          jobId: render.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 }, // 5с, 10с, 20с
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      );
    } catch (err) {
      await this.db
        .update(renders)
        .set({ status: 'failed', error: 'Failed to enqueue', updatedAt: new Date() })
        .where(eq(renders.id, render.id));
      this.logger.error(`Enqueue failed for ${render.id}`, err as Error);
      throw err;
    }

    return render;
  }

  async get(id: string) {
    const [render] = await this.db.select().from(renders).where(eq(renders.id, id));
    if (!render) throw new NotFoundException();
    return render;
  }
}

# Micro-Drama Studio

Пет-проєкт: AI-пайплайн «ідея → сценарій → згенеровані кліпи → вертикальний епізод».
**Тиждень 1** — інфраструктура: Nest (API + worker), Postgres, Redis/BullMQ, FFmpeg.

Коментарі з позначкою `🧠` у коді пояснюють концепції, які варто розуміти самому (і вміти пояснити на співбесіді).

## Архітектура

```
 HTTP ──► API (main.api.ts) ──► Postgres  (джерело правди: статус, прогрес, результат)
              │
              └─► Redis / BullMQ (черга "render")
                        │
                        ▼
              Worker (main.worker.ts) ──► FFmpeg ──► media/outputs/<id>.mp4
                        └──────────────► Postgres (оновлює статус і прогрес)
```

Один кодбейс, дві точки входу. API ніколи не виконує важкої роботи, а воркери масштабуються незалежно.

## Швидкий старт

Потрібні Node 22+, Docker і FFmpeg (`brew install ffmpeg` / `apt install ffmpeg`).

```bash
npm install
cp .env.example .env              # значення за замовчуванням уже підходять
docker compose up -d postgres redis
npm run sample-media              # тестові кліпи в media/inputs
set -a && source .env && set +a   # (або використовуй direnv)
npm run dev                       # tsc --watch + API + worker
```

Повністю в Docker (API і worker теж у контейнерах, FFmpeg уже встановлений в образі):

```bash
docker compose --profile app up --build
```

## Спробувати

```bash
curl -s -X POST localhost:3000/renders -H 'content-type: application/json' -d '{
  "clips": ["clip-landscape.mp4", "clip-square.mp4", "clip-vertical.mp4"],
  "audio": "music.m4a",
  "subtitles": [
    {"start": 0.5, "end": 3.5, "text": "Вона ще не знає, хто її новий бос..."},
    {"start": 4,   "end": 7,   "text": "Привіт. Давно не бачились."}
  ]
}'
# → 202 { "id": "…", "status": "queued", … }

curl -s localhost:3000/renders/<id>          # статус і прогрес
open http://localhost:3000/renders/<id>/file # готове відео 1080×1920
```

| Метод | Шлях | Опис |
|---|---|---|
| POST | `/renders` | створити рендер (шляхи відносно `media/inputs`) → 202 |
| GET | `/renders/:id` | статус: `queued` / `processing` / `completed` / `failed`, `progress` 0–100 |
| GET | `/renders/:id/file` | стрім MP4 (409, якщо ще не готово) |

Корисне для дебагу:

```bash
docker compose exec postgres psql -U studio -c "select id,status,progress,attempts,error from renders order by created_at desc limit 5;"
docker compose exec redis redis-cli keys 'bull:render:*'
```

## Завдання, щоб закріпити тиждень 1

Роби їх сам, без AI-асистента, — це і є навчання.

1. **Відмовостійкість.** Запусти рендер і вбий воркер (`Ctrl+C`, потім `kill -9`). Що стане з джобом у кожному випадку? Знайди в документації BullMQ, що таке *stalled jobs*.
2. **Ретраї.** Передай битий файл (перейменуй `.txt` у `.mp4`). Простеж у БД `attempts` і `error`, поясни, звідки інтервали між спробами.
3. **FFmpeg руками.** Скопіюй команду з debug-логу воркера й запусти в терміналі. Додай переходи між кліпами через фільтр `xfade`, а потім перенеси це в `buildAssembleArgs`.
4. **Масштабування.** `docker compose --profile app up --scale worker=3` і 10 рендерів одночасно. Як розподіляються джоби?
5. **Transactional Outbox.** Прибери проблему dual write у `RendersService.create`: пиши «подію» в таблицю `outbox` в одній транзакції з рендером, а окремий процес переносить її в чергу.
6. **Список рендерів.** `GET /renders?status=failed&limit=20` з курсорною пагінацією. Чому курсорна, а не `OFFSET`?

## Далі

- **Тиждень 2:** LangGraph.js — граф Showrunner → Writer → Storyboarder, чекпоінти в Postgres, human-in-the-loop, біблія серіалу в pgvector, міграції drizzle-kit.
- **Тиждень 3:** `VideoProvider` (mock + реальний API), QC через vision-модель із регенерацією, OpenTelemetry + Langfuse.
- **Тиждень 4:** Next.js UI зі схваленням сценарію та прогресом через SSE, демо.

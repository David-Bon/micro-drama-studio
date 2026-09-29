import * as path from 'node:path';

// 🧠 Уся конфігурація — зі змінних оточення (12-factor app).
// Один і той самий код працює локально й у Docker, змінюються лише env.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://studio:studio@localhost:5432/studio',
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
  mediaDir: path.resolve(process.env.MEDIA_DIR ?? './media'),
  renderConcurrency: Number(process.env.RENDER_CONCURRENCY ?? 2),
};

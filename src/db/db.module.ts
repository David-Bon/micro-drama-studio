import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config';
import * as schema from './schema';

export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');
export type Db = NodePgDatabase<typeof schema>;

// 🧠 Pool, а не одне з'єднання: Postgres обробляє один запит на з'єднання,
// тож паралельні HTTP-запити беруть вільні з'єднання з пулу.
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => new Pool({ connectionString: config.databaseUrl, max: 10 }),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Db => drizzle(pool, { schema }),
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // 🧠 Graceful shutdown: при SIGTERM (docker stop, деплой) закриваємо
  // з'єднання акуратно, а не обриваємо посеред запиту.
  async onApplicationShutdown() {
    await this.pool.end();
  }
}

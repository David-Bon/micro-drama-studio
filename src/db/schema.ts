import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { RenderInput } from '../renders/render.types';

// 🧠 Drizzle-схема — це TypeScript-опис таблиць, які вже створені в
// docker/postgres/init.sql. Вона дає типобезпечні запити без "магії" ORM:
// db.select().from(renders).where(...) майже дослівно перекладається в SQL.
// На тижні 2 перейдемо на міграції (drizzle-kit), коли схема почне змінюватись.

export const renderStatus = pgEnum('render_status', [
  'queued',
  'processing',
  'completed',
  'failed',
]);

export const renders = pgTable('renders', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: renderStatus('status').notNull().default('queued'),
  // 🧠 jsonb — гнучке поле для вхідних параметрів. Добре для даних, які
  // читаються цілком і не фільтруються. Якщо по полю треба шукати —
  // виносимо в окрему колонку з індексом.
  input: jsonb('input').$type<RenderInput>().notNull(),
  progress: integer('progress').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  outputPath: text('output_path'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Render = typeof renders.$inferSelect;

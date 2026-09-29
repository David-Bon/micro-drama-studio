-- Виконується один раз при першому старті порожнього тому postgres-data.
-- Щоб перезапустити: docker compose down -v (видалить дані!).

-- pgvector знадобиться на тижні 2 для "біблії серіалу" (семантичний пошук).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE render_status AS ENUM ('queued', 'processing', 'completed', 'failed');

CREATE TABLE renders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status      render_status NOT NULL DEFAULT 'queued',
  input       jsonb NOT NULL,
  progress    integer NOT NULL DEFAULT 0,
  attempts    integer NOT NULL DEFAULT 0,
  output_path text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Індекс під типовий запит "останні рендери з певним статусом".
CREATE INDEX renders_status_created_idx ON renders (status, created_at DESC);

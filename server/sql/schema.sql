-- Run this once against your local database, e.g.:
--   psql -d pr_synthesizer -f sql/schema.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS pr_reviews (
  id            SERIAL PRIMARY KEY,
  repo_name     TEXT NOT NULL,
  pr_number     INTEGER NOT NULL,
  pr_title      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'working', 'completed', 'failed')),
  summary       TEXT,
  high_count    INTEGER DEFAULT 0,
  medium_count  INTEGER DEFAULT 0,
  low_count     INTEGER DEFAULT 0,
  health_score  INTEGER DEFAULT NULL,
  current_step  TEXT DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS code_chunks (
  id            SERIAL PRIMARY KEY,
  repo_name     TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  chunk_text    TEXT NOT NULL,
  embedding     vector(3072),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS code_chunks_embedding_idx 
  ON code_chunks 
  USING hnsw (embedding vector_cosine_ops);



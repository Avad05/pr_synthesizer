-- Run this once against your local database, e.g.:
--   psql -d pr_synthesizer -f sql/schema.sql

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
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- This table will hold one row per PR review run.
-- In later phases:
--   - 'status' will move through submitted -> working -> completed/failed
--     as your A2A agents report progress (Phase 6).
--   - 'summary' will hold the synthesized findings from your agents (Phase 2+).

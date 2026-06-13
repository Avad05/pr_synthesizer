-- Run this once after schema.sql to get some dummy data on screen:
--   psql -d pr_synthesizer -f sql/seed.sql

INSERT INTO pr_reviews (repo_name, pr_number, pr_title, status, summary) VALUES
(
  'avadhut/pern-shop',
  42,
  'Add stock validation to checkout endpoint',
  'completed',
  'Security Agent: No issues found.\nDatabase Agent: checkout controller and orders table are consistent. No missing indexes detected.\nPerformance Agent: Checkout query runs in a single round trip. No N+1 patterns found.'
),
(
  'avadhut/pern-shop',
  43,
  'Refactor category controller',
  'working',
  NULL
),
(
  'avadhut/pern-shop',
  41,
  'Update dependency versions',
  'pending',
  NULL
),
(
  'avadhut/inventory-api',
  17,
  'Add bulk import for suppliers',
  'failed',
  'Database Agent: Migration would drop the suppliers_legacy table without a backup step. Flagged for manual review before merge.'
);

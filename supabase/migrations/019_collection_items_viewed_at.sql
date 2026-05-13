-- 019_collection_items_viewed_at.sql
-- Adds viewed_at to collection_items so the abandoned-payments cron can detect
-- items where the customer opened the payment portal but never completed.
--
-- Background: the cron previously queried `.lte("updated_at", cutoff)` but the
-- table never had updated_at — that path was silently broken since deploy
-- 2026-05-03. We're explicit about what "viewed" means: timestamp at which
-- status flipped to 'viewed' (i.e. customer hit the portal endpoint).

ALTER TABLE collection_items
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

-- Index for the cron query: WHERE status='viewed' AND viewed_at < cutoff
CREATE INDEX IF NOT EXISTS idx_collection_items_viewed_at
  ON collection_items(viewed_at)
  WHERE status = 'viewed';

-- Backfill existing 'viewed' rows so the cron doesn't ignore them after deploy.
-- We use created_at as a conservative proxy — these items have been viewed at
-- some point before the migration, so they're already past any reasonable
-- abandonment cutoff.
UPDATE collection_items
SET viewed_at = created_at
WHERE status = 'viewed' AND viewed_at IS NULL;

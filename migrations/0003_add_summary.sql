-- Migration 0003: Add summary column + backfill last_confirmed_at

ALTER TABLE memory_entries ADD COLUMN summary TEXT;

-- Backfill: start the 90-day decay clock for existing active entries
UPDATE memory_entries
SET last_confirmed_at = datetime('now')
WHERE status = 'active' AND last_confirmed_at IS NULL;

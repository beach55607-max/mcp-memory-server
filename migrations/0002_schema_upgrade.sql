-- Migration 0002: Schema upgrade for memory governance
-- Adds: status, scope, platform, confidence, superseded_by, last_confirmed_at, embedding_text

ALTER TABLE memory_entries ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE memory_entries ADD COLUMN scope TEXT NOT NULL DEFAULT 'global';
ALTER TABLE memory_entries ADD COLUMN platform TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE memory_entries ADD COLUMN confidence REAL NOT NULL DEFAULT 0.5;
ALTER TABLE memory_entries ADD COLUMN superseded_by TEXT;
ALTER TABLE memory_entries ADD COLUMN last_confirmed_at TEXT;
ALTER TABLE memory_entries ADD COLUMN embedding_text TEXT;

CREATE INDEX IF NOT EXISTS idx_memory_status ON memory_entries(status);
CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory_entries(scope);
CREATE INDEX IF NOT EXISTS idx_memory_platform ON memory_entries(platform);

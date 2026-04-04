CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  repo TEXT,
  source TEXT,
  batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_entries(type);
CREATE INDEX IF NOT EXISTS idx_memory_repo ON memory_entries(repo);
CREATE INDEX IF NOT EXISTS idx_memory_created ON memory_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_batch ON memory_entries(batch_id);

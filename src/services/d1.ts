/**
 * D1 CRUD for memory_entries
 */

export interface MemoryEntry {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string | null;
  repo: string | null;
  source: string | null;
  batch_id: string | null;
  created_at: string;
  updated_at: string;
  session_id: string | null;
}

export async function upsertEntry(db: D1Database, entry: MemoryEntry): Promise<void> {
  await db.prepare(
    `INSERT OR REPLACE INTO memory_entries (id, type, title, content, tags, repo, source, batch_id, created_at, updated_at, session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    entry.id, entry.type, entry.title, entry.content,
    entry.tags, entry.repo, entry.source, entry.batch_id,
    entry.created_at, entry.updated_at, entry.session_id
  ).run();
}

export async function getEntry(db: D1Database, id: string): Promise<MemoryEntry | null> {
  return await db.prepare('SELECT * FROM memory_entries WHERE id = ?').bind(id).first<MemoryEntry>();
}

export async function getEntriesByIds(db: D1Database, ids: string[]): Promise<MemoryEntry[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.prepare(`SELECT * FROM memory_entries WHERE id IN (${placeholders})`).bind(...ids).all<MemoryEntry>();
  return result.results || [];
}

export async function deleteEntry(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM memory_entries WHERE id = ?').bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function listEntries(db: D1Database, opts: {
  type?: string;
  repo?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: MemoryEntry[]; total: number }> {
  const conditions: string[] = [];
  const binds: any[] = [];

  if (opts.type) { conditions.push('type = ?'); binds.push(opts.type); }
  if (opts.repo) { conditions.push('repo = ?'); binds.push(opts.repo); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(opts.limit || 20, 100);
  const offset = opts.offset || 0;

  const countResult = await db.prepare(`SELECT COUNT(*) as total FROM memory_entries ${where}`).bind(...binds).first<{ total: number }>();
  const total = countResult?.total || 0;

  const result = await db.prepare(
    `SELECT * FROM memory_entries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all<MemoryEntry>();

  return { entries: result.results || [], total };
}

export async function entryExists(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 FROM memory_entries WHERE id = ?').bind(id).first();
  return row !== null;
}

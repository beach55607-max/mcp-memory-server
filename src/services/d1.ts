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
  status: string;
  scope: string;
  platform: string;
  confidence: number;
  superseded_by: string | null;
  last_confirmed_at: string | null;
  embedding_text: string | null;
  summary: string | null;
}

export async function upsertEntry(db: D1Database, entry: MemoryEntry): Promise<void> {
  await db.prepare(
    `INSERT INTO memory_entries (id, type, title, content, tags, repo, source, batch_id, created_at, updated_at, session_id, status, scope, platform, confidence, superseded_by, last_confirmed_at, embedding_text, summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type, title = excluded.title, content = excluded.content,
       tags = excluded.tags, repo = excluded.repo, source = excluded.source,
       batch_id = COALESCE(excluded.batch_id, batch_id),
       updated_at = excluded.updated_at, session_id = excluded.session_id,
       status = COALESCE(memory_entries.status, excluded.status),
       scope = excluded.scope, platform = excluded.platform,
       confidence = excluded.confidence,
       superseded_by = COALESCE(memory_entries.superseded_by, excluded.superseded_by),
       last_confirmed_at = COALESCE(excluded.last_confirmed_at, memory_entries.last_confirmed_at),
       embedding_text = excluded.embedding_text,
       summary = COALESCE(excluded.summary, memory_entries.summary)`
  ).bind(
    entry.id, entry.type, entry.title, entry.content,
    entry.tags, entry.repo, entry.source, entry.batch_id,
    entry.created_at, entry.updated_at, entry.session_id,
    entry.status, entry.scope, entry.platform, entry.confidence,
    entry.superseded_by, entry.last_confirmed_at, entry.embedding_text,
    entry.summary,
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
  status?: string;
  scope?: string;
  limit?: number;
  cursor?: string;
  offset?: number;
}): Promise<{ entries: MemoryEntry[]; total: number; next_cursor: string | null }> {
  const baseConditions: string[] = [];
  const baseBinds: any[] = [];

  if (opts.type) { baseConditions.push('type = ?'); baseBinds.push(opts.type); }
  if (opts.repo) { baseConditions.push('repo = ?'); baseBinds.push(opts.repo); }
  if (opts.status === 'all') { /* no status filter */ }
  else if (opts.status) { baseConditions.push('status = ?'); baseBinds.push(opts.status); }
  else { baseConditions.push("status = 'active'"); }
  if (opts.scope) { baseConditions.push('scope = ?'); baseBinds.push(opts.scope); }

  const countWhere = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')}` : '';
  const countResult = await db.prepare(`SELECT COUNT(*) as total FROM memory_entries ${countWhere}`).bind(...baseBinds).first<{ total: number }>();

  const queryConditions = [...baseConditions];
  const queryBinds = [...baseBinds];
  if (opts.cursor) {
    const parts = opts.cursor.split('|');
    if (parts.length === 2) {
      queryConditions.push('(created_at < ? OR (created_at = ? AND id < ?))');
      queryBinds.push(parts[0], parts[0], parts[1]);
    } else {
      queryConditions.push('created_at < ?');
      queryBinds.push(opts.cursor);
    }
  }

  const where = queryConditions.length > 0 ? `WHERE ${queryConditions.join(' AND ')}` : '';
  const limit = Math.min(opts.limit || 20, 100);
  const total = countResult?.total || 0;

  let sql: string;
  let sqlBinds: any[];
  if (opts.cursor || !opts.offset) {
    sql = `SELECT * FROM memory_entries ${where} ORDER BY created_at DESC, id DESC LIMIT ?`;
    sqlBinds = [...queryBinds, limit];
  } else {
    const safeOffset = Math.min(opts.offset, 10000);
    sql = `SELECT * FROM memory_entries ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
    sqlBinds = [...queryBinds, limit, safeOffset];
  }

  const result = await db.prepare(sql).bind(...sqlBinds).all<MemoryEntry>();
  const entries = result.results || [];
  const last = entries.length === limit ? entries[entries.length - 1] : null;
  const next_cursor = last ? `${last.created_at}|${last.id}` : null;

  return { entries, total, next_cursor };
}

export async function supersedEntry(db: D1Database, oldId: string, newId: string, vectorize?: VectorizeIndex): Promise<void> {
  await db.prepare(
    `UPDATE memory_entries SET status = 'legacy', superseded_by = ?, updated_at = ? WHERE id = ?`
  ).bind(newId, new Date().toISOString(), oldId).run();
  // Best-effort vectorize cleanup — remove superseded entry from vector index
  if (vectorize) {
    try {
      await vectorize.deleteByIds([oldId]);
    } catch (err: any) {
      console.log(JSON.stringify({ event: 'vectorize_supersede_cleanup_failed', oldId, error: err.message }));
    }
  }
}

export async function entryExists(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 FROM memory_entries WHERE id = ?').bind(id).first();
  return row !== null;
}

export async function sessionExists(db: D1Database, sessionId: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 FROM memory_entries WHERE session_id = ? LIMIT 1').bind(sessionId).first();
  return row !== null;
}

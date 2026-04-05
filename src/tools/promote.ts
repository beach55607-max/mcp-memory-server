/**
 * memory.promote — Promote a memory to Absolute Truth (confidence=1.0)
 * Immutable entries are protected from: cron decay, dedup, AI judge, consolidation, auto-supersede
 * Only active entries can be promoted. Legacy entries superseded by cron cannot be revived.
 */

import { getEntry } from '../services/d1.js';
import type { Env } from '../index.js';

export async function handlePromote(env: Env, input: Record<string, any>): Promise<{ result: any; isError?: boolean }> {
  if (env.WRITE_ENABLED !== 'true') {
    return { result: { error: 'SERVICE_DISABLED', message: 'Write operations disabled' }, isError: true };
  }

  if (!input.id || typeof input.id !== 'string') {
    return { result: { error: 'VALIDATION_ERROR', message: 'id is required' }, isError: true };
  }

  const id = input.id as string;

  const entry = await getEntry(env.DB, id);
  if (!entry) {
    return { result: { error: 'NOT_FOUND', message: 'Entry not found' }, isError: true };
  }

  if (entry.confidence >= 1.0) {
    return { result: { id, status: 'already_promoted', confidence: 1.0 } };
  }

  // Guard: only active entries can be promoted
  if (entry.status !== 'active') {
    return { result: { error: 'INVALID_STATE', message: `Cannot promote ${entry.status} entry. Only active entries can be promoted.` }, isError: true };
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE memory_entries SET confidence = 1.0, updated_at = ?, last_confirmed_at = ? WHERE id = ?',
  ).bind(now, now, id).run();

  console.log(JSON.stringify({ event: 'memory_promoted', id, promoted_at: now }));

  return { result: { id, status: 'promoted', confidence: 1.0, promoted_at: now } };
}

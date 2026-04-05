/**
 * memory.delete — Delete a memory entry by ID
 */

import { deleteEntry, getEntry } from '../services/d1.js';
import { deleteVector } from '../services/vectorize.js';
import type { Env } from '../index.js';

export async function handleDelete(env: Env, input: Record<string, any>): Promise<{ result: any; isError?: boolean }> {
  if (env.WRITE_ENABLED !== 'true') {
    return { result: { error: 'SERVICE_DISABLED', message: 'Write operations disabled' }, isError: true };
  }

  if (!input.id || typeof input.id !== 'string') {
    return { result: { error: 'VALIDATION_ERROR', message: 'id is required' }, isError: true };
  }

  const id = input.id as string;

  if (!/^[0-9a-f]{64}$/.test(id)) {
    return { result: { error: 'VALIDATION_ERROR', message: 'id must be a 64-character hex string' }, isError: true };
  }

  const entry = await getEntry(env.DB, id);
  if (!entry) {
    return { result: { error: 'NOT_FOUND', message: 'Entry not found' }, isError: true };
  }

  await deleteEntry(env.DB, id);

  // Clean up reverse references (entries that point to this one via superseded_by)
  try {
    await env.DB.prepare(
      'UPDATE memory_entries SET superseded_by = NULL WHERE superseded_by = ?'
    ).bind(id).run();
  } catch (err: any) {
    console.log(JSON.stringify({ event: 'reverse_ref_cleanup_failed', id, error: err.message }));
  }

  // Vectorize delete with retry
  let vectorDeleted = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await deleteVector(env.VECTORIZE, id);
      vectorDeleted = true;
      break;
    } catch (err: any) {
      console.log(JSON.stringify({
        event: 'vector_delete_failed', id, attempt, error: err.message,
      }));
    }
  }

  return { result: { status: 'deleted', vector_cleaned: vectorDeleted } };
}

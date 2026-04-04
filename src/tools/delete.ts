/**
 * memory.delete — Delete a memory entry
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

  // Check exists
  const entry = await getEntry(env.DB, id);
  if (!entry) {
    return { result: { error: 'NOT_FOUND', message: `Entry ${id} not found` }, isError: true };
  }

  // D1 delete
  await deleteEntry(env.DB, id);

  // Vectorize delete (best effort)
  try {
    await deleteVector(env.VECTORIZE, id);
  } catch {
    // Orphan vector won't affect search (D1 entry gone, join skips it)
  }

  return { result: { status: 'deleted' } };
}

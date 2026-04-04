/**
 * memory.save — Save a memory entry
 */

import { getEmbedding } from '../services/embedding.js';
import { upsertEntry } from '../services/d1.js';
import { upsertVector } from '../services/vectorize.js';
import { generateId } from '../services/hash.js';
import type { Env } from '../index.js';

const VALID_TYPES = ['knowledge', 'session', 'feedback', 'project'];
const MAX_TITLE = 200;
const MAX_CONTENT = 50000;
const MAX_TAGS = 20;

export async function handleSave(env: Env, input: Record<string, any>): Promise<{ result: any; isError?: boolean }> {
  // Kill switch
  if (env.WRITE_ENABLED !== 'true') {
    return { result: { error: 'SERVICE_DISABLED', message: 'Write operations disabled' }, isError: true };
  }

  // Validation
  const errors: string[] = [];
  if (!input.title || typeof input.title !== 'string') errors.push('title');
  if (!input.content || typeof input.content !== 'string') errors.push('content');
  if (!input.type || !VALID_TYPES.includes(input.type)) errors.push('type');
  if (input.title && input.title.length > MAX_TITLE) errors.push('title (too long)');
  if (input.content && input.content.length > MAX_CONTENT) errors.push('content (too long)');
  if (input.tags) {
    // Accept string (JSON) or array
    if (typeof input.tags === 'string') {
      try { input.tags = JSON.parse(input.tags); } catch { errors.push('tags (invalid JSON)'); }
    }
    if (Array.isArray(input.tags) && input.tags.length > MAX_TAGS) errors.push('tags (too many)');
    if (!Array.isArray(input.tags) && typeof input.tags !== 'string') errors.push('tags');
  }

  if (errors.length > 0) {
    return { result: { error: 'VALIDATION_ERROR', message: 'Invalid fields', fields: errors }, isError: true };
  }

  const title = input.title as string;
  const content = input.content as string;
  const type = input.type as string;
  const repo = (input.repo as string) || null;
  const tags = input.tags ? JSON.stringify(input.tags) : null;
  const source = (input.source as string) || 'manual';
  const sessionId = (input.session_id as string) || null;

  try {
    const id = await generateId(type, title, content, repo, sessionId);
    const now = new Date().toISOString();

    // Embedding
    const embeddingText = `${title}\n${content.substring(0, 500)}`;
    const embedding = await getEmbedding(env.AI, embeddingText);

    // D1
    await upsertEntry(env.DB, {
      id, type, title, content, tags, repo, source,
      batch_id: null, created_at: now, updated_at: now, session_id: sessionId,
    });

    // Vectorize
    const metadata: Record<string, string> = { type };
    if (repo) metadata.repo = repo;
    await upsertVector(env.VECTORIZE, id, embedding, metadata);

    return { result: { id, status: 'saved' } };
  } catch (err: any) {
    return { result: { error: 'SAVE_FAILED', message: err.message }, isError: true };
  }
}

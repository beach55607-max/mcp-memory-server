/**
 * memory.save — Save a memory entry
 * Pipeline: validate -> infer scope -> embed -> find supersede candidate -> D1 -> Vectorize -> summary -> supersede
 */

import { getEmbedding } from '../services/embedding.js';
import { upsertEntry, getEntriesByIds, supersedEntry } from '../services/d1.js';
import { upsertVector, queryVectors } from '../services/vectorize.js';
import { generateId } from '../services/hash.js';
import { generateSummary, confirmSupersede } from '../services/ai.js';
import { sanitizeContent, isValidUUID } from '../services/sanitize.js';
import type { Env } from '../index.js';

const VALID_TYPES = ['knowledge', 'session', 'feedback', 'project'];
const VALID_SCOPES = ['global', 'project', 'thread'];
const VALID_PLATFORMS = ['vscode', 'desktop', 'web', 'mobile', 'chatgpt', 'codex', 'batch-import', 'unknown'];
const MAX_TITLE = 200;
const MAX_CONTENT = 50000;
const MAX_TAGS = 20;
const SUPERSEDE_THRESHOLD = 0.92;

function inferScope(input: Record<string, any>): string {
  if (input.scope && VALID_SCOPES.includes(input.scope)) return input.scope;
  if (input.session_id) return 'thread';
  if (input.repo) return 'project';
  return 'global';
}

async function findSupersedeCandidate(
  env: Env, embedding: number[], newId: string,
  type: string, scope: string, repo: string | null, sessionId: string | null,
): Promise<{ id: string; title: string; content: string; score: number } | null> {
  try {
    const matches = await queryVectors(env.VECTORIZE, embedding, {
      topK: 5, filter: { type: { $eq: type } },
    });
    if (!matches.matches?.length) return null;

    const candidates = matches.matches.filter(m => m.id !== newId && m.score > SUPERSEDE_THRESHOLD);
    if (!candidates.length) return null;

    const entries = await getEntriesByIds(env.DB, candidates.map(c => c.id));
    const active = entries.filter(e =>
      e.status === 'active' && e.scope === scope && e.confidence < 1.0 &&
      (scope === 'global' ||
       (scope === 'project' && e.repo === repo) ||
       (scope === 'thread' && e.session_id === sessionId)),
    );
    if (!active.length) return null;

    const best = candidates.find(c => active.some(e => e.id === c.id));
    if (!best) return null;
    const entry = active.find(e => e.id === best.id)!;
    return { id: entry.id, title: entry.title, content: entry.content, score: best.score };
  } catch {
    return null;
  }
}

export async function handleSave(env: Env, input: Record<string, any>): Promise<{ result: any; isError?: boolean }> {
  if (env.WRITE_ENABLED !== 'true') {
    return { result: { error: 'SERVICE_DISABLED', message: 'Write operations disabled' }, isError: true };
  }

  const errors: string[] = [];
  if (!input.title || typeof input.title !== 'string') errors.push('title');
  if (!input.content || typeof input.content !== 'string') errors.push('content');
  if (!input.type || !VALID_TYPES.includes(input.type)) errors.push('type');
  if (input.title && input.title.length > MAX_TITLE) errors.push('title (too long)');
  if (input.content && input.content.length > MAX_CONTENT) errors.push('content (too long)');
  if (input.scope && !VALID_SCOPES.includes(input.scope)) errors.push('scope');
  if (input.platform && !VALID_PLATFORMS.includes(input.platform)) errors.push('platform');
  if (input.confidence !== undefined && (typeof input.confidence !== 'number' || input.confidence < 0 || input.confidence > 1)) errors.push('confidence');
  if (input.session_id && typeof input.session_id === 'string' && !isValidUUID(input.session_id)) errors.push('session_id (invalid UUID)');
  if (input.tags) {
    if (typeof input.tags === 'string') {
      try { input.tags = JSON.parse(input.tags); } catch { errors.push('tags (invalid JSON)'); }
    }
    if (Array.isArray(input.tags) && input.tags.length > MAX_TAGS) errors.push('tags (too many)');
    if (!Array.isArray(input.tags) && typeof input.tags !== 'string') errors.push('tags');
  }
  if (errors.length > 0) {
    return { result: { error: 'VALIDATION_ERROR', message: 'Invalid fields', fields: errors }, isError: true };
  }

  const title = sanitizeContent(input.title as string);
  const content = sanitizeContent(input.content as string);
  const type = input.type as string;
  const repo = (input.repo as string) || null;
  const tags = input.tags ? JSON.stringify(input.tags) : null;
  const source = (input.source as string) || 'manual';
  const sessionId = (input.session_id as string) || null;
  const batchId = (input.batch_id as string) || null;
  const platform = (input.platform as string) || 'unknown';
  const confidence = (input.confidence as number) ?? 0.5;
  const scope = inferScope(input);

  try {
    const id = await generateId(type, title, content, repo, sessionId);
    const now = new Date().toISOString();

    // Embedding (title + first 2000 chars for better semantic coverage)
    const embeddingText = `${title}\n${content.substring(0, 2000)}`;
    const embedding = await getEmbedding(env.AI, embeddingText);

    // Find supersede candidate before writes
    let supersedeCandidate: { id: string; title: string; content: string; score: number } | null = null;
    if (env.SUPERSEDE_ENABLED === 'true') {
      supersedeCandidate = await findSupersedeCandidate(env, embedding, id, type, scope, repo, sessionId);
    }

    // D1 upsert
    await upsertEntry(env.DB, {
      id, type, title, content, tags, repo, source,
      batch_id: batchId, created_at: now, updated_at: now, session_id: sessionId,
      status: 'active', scope, platform, confidence,
      superseded_by: null, last_confirmed_at: now, embedding_text: embeddingText,
      summary: null,
    });

    // Vectorize upsert
    const metadata: Record<string, string> = { type, scope, status: 'active' };
    if (repo) metadata.repo = repo;
    await upsertVector(env.VECTORIZE, id, embedding, metadata);

    // Best-effort summary generation
    const warnings: string[] = [];
    if (env.SUMMARY_ENABLED === 'true') {
      const summary = await generateSummary(env.AI, title, content);
      if (summary) {
        try {
          await env.DB.prepare('UPDATE memory_entries SET summary = ? WHERE id = ?').bind(summary, id).run();
        } catch (err: any) {
          warnings.push(`summary_update_failed: ${err.message}`);
        }
      } else {
        warnings.push('summary_generation_failed');
      }
    }

    // Best-effort auto-supersede
    let superseded: string | null = null;
    if (supersedeCandidate && env.SUPERSEDE_ENABLED === 'true') {
      const confirmed = await confirmSupersede(env.AI, supersedeCandidate.title, supersedeCandidate.content, title, content);
      if (confirmed?.supersedes) {
        await supersedEntry(env.DB, supersedeCandidate.id, id, env.VECTORIZE);
        superseded = supersedeCandidate.id;
      } else if (!confirmed) {
        warnings.push('supersede_confirmation_failed');
      }
    }

    const result: Record<string, any> = { id, status: 'saved' };
    if (superseded) result.superseded = superseded;
    if (warnings.length > 0) result.warnings = warnings;
    return { result };
  } catch (err: any) {
    console.log(JSON.stringify({ event: 'save_failed', error: err?.message }));
    return { result: { error: 'SAVE_FAILED', message: 'Failed to save memory entry' }, isError: true };
  }
}

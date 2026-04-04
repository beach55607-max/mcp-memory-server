/**
 * memory.search — Semantic search
 */

import { getEmbedding } from '../services/embedding.js';
import { getEntriesByIds } from '../services/d1.js';
import { queryVectors } from '../services/vectorize.js';
import type { Env } from '../index.js';

const MAX_LIMIT = 20;
const MAX_QUERY = 1000;

export async function handleSearch(env: Env, input: Record<string, any>): Promise<{ result: any; isError?: boolean }> {
  // Validation
  if (!input.query || typeof input.query !== 'string') {
    return { result: { error: 'VALIDATION_ERROR', message: 'query is required' }, isError: true };
  }
  if (input.query.length > MAX_QUERY) {
    return { result: { error: 'VALIDATION_ERROR', message: 'query too long' }, isError: true };
  }

  const query = input.query as string;
  const limit = Math.min(Math.max((input.limit as number) || 5, 1), MAX_LIMIT);
  const typeFilter = input.type as string | undefined;
  const repoFilter = input.repo as string | undefined;

  try {
    // Embedding
    const embedding = await getEmbedding(env.AI, query);

    // Build Vectorize filter
    const filter: Record<string, any> = {};
    if (typeFilter) filter.type = { $eq: typeFilter };
    if (repoFilter) filter.repo = { $eq: repoFilter };
    const hasFilter = Object.keys(filter).length > 0;

    // Vectorize query
    const matches = await queryVectors(env.VECTORIZE, embedding, {
      topK: limit,
      filter: hasFilter ? filter : undefined,
    });

    if (!matches.matches || matches.matches.length === 0) {
      return { result: { results: [] } };
    }

    // D1 fetch full content
    const ids = matches.matches.map(m => m.id);
    const entries = await getEntriesByIds(env.DB, ids);

    // Join scores + entries, skip D1 misses
    const entryMap = new Map(entries.map(e => [e.id, e]));
    const results = matches.matches
      .map(m => {
        const entry = entryMap.get(m.id);
        if (!entry) return null;
        return {
          id: entry.id,
          title: entry.title,
          content: entry.content,
          type: entry.type,
          repo: entry.repo,
          score: m.score,
          created_at: entry.created_at,
        };
      })
      .filter(Boolean);

    return { result: { results } };
  } catch (err: any) {
    return { result: { error: 'SEARCH_FAILED', message: err.message }, isError: true };
  }
}

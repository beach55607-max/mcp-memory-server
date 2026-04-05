/**
 * memory.search — Semantic search with conflict auto-resolution
 * feedback/session: newer wins, older -> legacy (synchronous)
 * knowledge/project: report conflict, don't auto-resolve
 * Absolute Truth (confidence=1.0) always wins
 */

import { getEmbedding, getEmbeddings } from '../services/embedding.js';
import { getEntriesByIds, supersedEntry } from '../services/d1.js';
import { queryVectors } from '../services/vectorize.js';
import { cosineSim } from '../services/math.js';
import type { Env } from '../index.js';

const MAX_LIMIT = 20;
const MAX_QUERY = 1000;
const CONFLICT_SIM_THRESHOLD = 0.85;

export async function handleSearch(env: Env, input: Record<string, any>): Promise<{ result: any; isError?: boolean }> {
  if (!input.query || typeof input.query !== 'string') {
    return { result: { error: 'VALIDATION_ERROR', message: 'query is required' }, isError: true };
  }
  if (input.query.length > MAX_QUERY) {
    return { result: { error: 'VALIDATION_ERROR', message: 'query too long' }, isError: true };
  }
  if (input.full_content !== undefined && typeof input.full_content !== 'boolean') {
    return { result: { error: 'VALIDATION_ERROR', message: 'full_content must be boolean' }, isError: true };
  }

  const query = input.query as string;
  const limit = Math.min(Math.max((input.limit as number) || 5, 1), MAX_LIMIT);
  const typeFilter = input.type as string | undefined;
  const repoFilter = input.repo as string | undefined;
  const scopeFilter = input.scope as string | undefined;
  const includeLegacy = input.include_legacy === true;
  const fullContent = input.full_content !== false;

  try {
    const embedding = await getEmbedding(env.AI, query);

    const filter: Record<string, any> = {};
    if (typeFilter) filter.type = { $eq: typeFilter };
    if (repoFilter) filter.repo = { $eq: repoFilter };
    const hasFilter = Object.keys(filter).length > 0;

    const matches = await queryVectors(env.VECTORIZE, embedding, {
      topK: limit * 3,
      filter: hasFilter ? filter : undefined,
    });

    if (!matches.matches || matches.matches.length === 0) {
      return { result: { results: [], conflicts: [] } };
    }

    const ids = matches.matches.map(m => m.id);
    const entries = await getEntriesByIds(env.DB, ids);
    const entryMap = new Map(entries.map(e => [e.id, e]));

    const conflicts: Array<{ active: string; superseded: string; reason: string; auto_resolved: boolean }> = [];
    const supersededIds = new Set<string>();

    let results = matches.matches
      .map(m => {
        const entry = entryMap.get(m.id);
        if (!entry) return null;
        if (!includeLegacy && entry.status === 'legacy') return null;
        if (scopeFilter && entry.scope !== scopeFilter) return null;

        if (entry.superseded_by) {
          conflicts.push({
            active: entry.superseded_by, superseded: entry.id,
            reason: 'same scope same type semantic overlap', auto_resolved: false,
          });
        }

        const result: any = {
          id: entry.id, title: entry.title,
          summary: entry.summary || (entry.content ? entry.content.substring(0, 200) + (entry.content.length > 200 ? '...' : '') : null),
          type: entry.type, repo: entry.repo, scope: entry.scope, platform: entry.platform,
          confidence: entry.confidence, score: m.score,
          has_conflict: !!entry.superseded_by,
          created_at: entry.created_at, last_confirmed_at: entry.last_confirmed_at,
          _repo: entry.repo, _session_id: entry.session_id,
          _embedding_text: entry.embedding_text,
        };
        if (fullContent) result.content = entry.content;
        return result;
      })
      .filter(Boolean);

    results.sort((a: any, b: any) => (b.score * (1 + b.confidence) / 2) - (a.score * (1 + a.confidence) / 2));
    results = results.slice(0, limit);

    // Conflict auto-resolution
    if (env.WRITE_ENABLED === 'true' && results.length >= 2) {
      const groups = new Map<string, any[]>();
      for (const r of results) {
        const key = `${r.type}|${r.scope}|${r._repo || ''}|${r._session_id || ''}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      }

      for (const group of groups.values()) {
        if (group.length < 2) continue;

        const texts = group.map((r: any) => r._embedding_text || `${r.title}\n${(r.content || r.summary || '').substring(0, 2000)}`);
        let embeddings: number[][];
        try {
          embeddings = await getEmbeddings(env.AI, texts);
        } catch {
          continue;
        }

        for (let i = 0; i < group.length - 1; i++) {
          if (supersededIds.has(group[i].id)) continue;
          for (let j = i + 1; j < group.length; j++) {
            if (supersededIds.has(group[j].id)) continue;

            const sim = cosineSim(embeddings[i], embeddings[j]);
            if (sim < CONFLICT_SIM_THRESHOLD) continue;

            const older = group[i].created_at < group[j].created_at ? group[i] : group[j];
            const newer = group[i].created_at < group[j].created_at ? group[j] : group[i];

            // Immutable protection
            if (older.confidence >= 1.0 && newer.confidence >= 1.0) {
              conflicts.push({ active: newer.id, superseded: older.id, reason: 'both immutable — manual review', auto_resolved: false });
              continue;
            }
            if (older.confidence >= 1.0) {
              if (['feedback', 'session'].includes(newer.type)) {
                await supersedEntry(env.DB, newer.id, older.id, env.VECTORIZE);
                supersededIds.add(newer.id);
                conflicts.push({ active: older.id, superseded: newer.id, reason: 'auto-resolved: immutable wins', auto_resolved: true });
              } else {
                conflicts.push({ active: older.id, superseded: newer.id, reason: 'immutable wins — manual review', auto_resolved: false });
              }
              continue;
            }
            if (newer.confidence >= 1.0) {
              await supersedEntry(env.DB, older.id, newer.id, env.VECTORIZE);
              supersededIds.add(older.id);
              conflicts.push({ active: newer.id, superseded: older.id, reason: 'auto-resolved: immutable wins', auto_resolved: true });
              continue;
            }

            if (['feedback', 'session'].includes(older.type)) {
              await supersedEntry(env.DB, older.id, newer.id, env.VECTORIZE);
              supersededIds.add(older.id);
              conflicts.push({ active: newer.id, superseded: older.id, reason: 'auto-resolved: newer wins', auto_resolved: true });
            } else {
              conflicts.push({ active: newer.id, superseded: older.id, reason: 'manual review needed', auto_resolved: false });
            }
          }
        }
      }

      if (supersededIds.size > 0) {
        results = results.filter((r: any) => !supersededIds.has(r.id));
      }
    }

    for (const r of results) {
      delete r._repo;
      delete r._session_id;
      delete r._embedding_text;
    }

    return { result: { results, conflicts } };
  } catch (err: any) {
    console.log(JSON.stringify({ event: 'search_failed', error: err?.message }));
    return { result: { error: 'SEARCH_FAILED', message: 'Failed to search memories' }, isError: true };
  }
}

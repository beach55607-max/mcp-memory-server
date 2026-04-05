/**
 * memory.auto_inject — Load relevant memories at conversation start
 * Absolute Truth (confidence=1.0) always injected, not subject to limit
 */

import { getEmbedding } from '../services/embedding.js';
import { getEntriesByIds } from '../services/d1.js';
import { queryVectors } from '../services/vectorize.js';
import type { Env } from '../index.js';

const MAX_LIMIT = 10;
const MAX_CONTEXT = 5000;

export async function handleAutoInject(env: Env, input: Record<string, any>): Promise<{ result: any; isError?: boolean }> {
  if (!input.context || typeof input.context !== 'string') {
    return { result: { error: 'VALIDATION_ERROR', message: 'context is required' }, isError: true };
  }
  if (input.context.length > MAX_CONTEXT) {
    return { result: { error: 'VALIDATION_ERROR', message: 'context too long (max 5000)' }, isError: true };
  }

  const context = input.context as string;
  const repo = (input.repo as string) || undefined;
  const limit = Math.min(Math.max((input.limit as number) || 5, 1), MAX_LIMIT);

  try {
    // 1. Get all Absolute Truth entries (forced injection)
    const absoluteTruths = await env.DB.prepare(`
      SELECT * FROM memory_entries WHERE status = 'active' AND confidence >= 1.0
      ORDER BY updated_at DESC LIMIT 20
    `).all<any>();
    const atEntries = absoluteTruths.results || [];

    // 2. Semantic search for relevant normal entries
    const embedding = await getEmbedding(env.AI, context);
    const filter: Record<string, any> = {};
    if (repo) filter.repo = { $eq: repo };
    const hasFilter = Object.keys(filter).length > 0;

    const matches = await queryVectors(env.VECTORIZE, embedding, {
      topK: limit * 2,
      filter: hasFilter ? filter : undefined,
    });

    let normalEntries: any[] = [];
    if (matches.matches?.length) {
      const ids = matches.matches.map(m => m.id);
      const entries = await getEntriesByIds(env.DB, ids);
      const entryMap = new Map(entries.map(e => [e.id, e]));

      normalEntries = matches.matches
        .map(m => {
          const entry = entryMap.get(m.id);
          if (!entry || entry.status !== 'active') return null;
          return { ...entry, score: m.score };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => (b.score * (1 + b.confidence) / 2) - (a.score * (1 + a.confidence) / 2));
    }

    // 3. Dedup: remove normal entries already in Absolute Truth
    const atIds = new Set(atEntries.map((e: any) => e.id));
    normalEntries = normalEntries.filter((e: any) => !atIds.has(e.id)).slice(0, limit);

    // 4. Build response
    const memories = [
      ...atEntries.map((e: any) => ({
        id: e.id, title: e.title,
        summary: e.summary || (e.content ? e.content.substring(0, 200) : ''),
        type: e.type, scope: e.scope, confidence: e.confidence,
        is_absolute_truth: true,
      })),
      ...normalEntries.map((e: any) => ({
        id: e.id, title: e.title,
        summary: e.summary || (e.content ? e.content.substring(0, 200) : ''),
        type: e.type, scope: e.scope, confidence: e.confidence, score: e.score,
        is_absolute_truth: false,
      })),
    ];

    // 5. Build inject_prompt
    const atLines = atEntries.map((e: any) => `- [IMMUTABLE] ${e.title}: ${e.summary || e.content?.substring(0, 150) || ''}`);
    const normalLines = normalEntries.map((e: any) => `- [${e.type}] ${e.title}: ${e.summary || e.content?.substring(0, 150) || ''}`);

    let injectPrompt = '';
    if (atLines.length > 0) {
      injectPrompt += `## Absolute Truths (immutable — do not contradict)\n${atLines.join('\n')}\n\n`;
    }
    if (normalLines.length > 0) {
      injectPrompt += `## Relevant Memories\n${normalLines.join('\n')}`;
    }

    return { result: { memories, inject_prompt: injectPrompt } };
  } catch (err: any) {
    console.log(JSON.stringify({ event: 'auto_inject_failed', error: err?.message }));
    return { result: { error: 'AUTO_INJECT_FAILED', message: 'Failed to load memories' }, isError: true };
  }
}

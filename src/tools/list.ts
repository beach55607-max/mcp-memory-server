/**
 * memory.list — List memory entries with filters, summary, and cursor pagination
 */

import { listEntries } from '../services/d1.js';
import type { Env } from '../index.js';

export async function handleList(env: Env, input: Record<string, any>): Promise<{ result: any; isError?: boolean }> {
  try {
    const { entries, total, next_cursor } = await listEntries(env.DB, {
      type: input.type as string | undefined,
      repo: input.repo as string | undefined,
      status: input.status as string | undefined,
      scope: input.scope as string | undefined,
      limit: input.limit as number | undefined,
      cursor: input.cursor as string | undefined,
      offset: input.offset as number | undefined,
    });

    return {
      result: {
        entries: entries.map(e => ({
          id: e.id, title: e.title, type: e.type,
          summary: e.summary || null,
          repo: e.repo, source: e.source,
          status: e.status, scope: e.scope, platform: e.platform,
          confidence: e.confidence,
          created_at: e.created_at,
        })),
        total,
        next_cursor,
        limit: Math.min(input.limit || 20, 100),
      },
    };
  } catch (err: any) {
    console.log(JSON.stringify({ event: 'list_failed', error: err?.message }));
    return { result: { error: 'LIST_FAILED', message: 'Failed to list memories' }, isError: true };
  }
}

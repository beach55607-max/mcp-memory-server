/**
 * memory.list — List memory entries
 */

import { listEntries } from '../services/d1.js';
import type { Env } from '../index.js';

export async function handleList(env: Env, input: Record<string, any>): Promise<{ result: any; isError?: boolean }> {
  try {
    const { entries, total } = await listEntries(env.DB, {
      type: input.type as string | undefined,
      repo: input.repo as string | undefined,
      limit: input.limit as number | undefined,
      offset: input.offset as number | undefined,
    });

    return {
      result: {
        entries: entries.map(e => ({
          id: e.id, title: e.title, type: e.type,
          repo: e.repo, source: e.source, created_at: e.created_at,
        })),
        total,
        limit: input.limit || 20,
        offset: input.offset || 0,
      },
    };
  } catch (err: any) {
    return { result: { error: 'LIST_FAILED', message: err.message }, isError: true };
  }
}

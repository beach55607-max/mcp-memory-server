/**
 * memory.extract — Extract saveable memories from a conversation
 * confidence >= 0.7 -> auto-save; < 0.7 -> return but don't save
 */

import { extractMemories } from '../services/ai.js';
import { handleSave } from './save.js';
import { generateId } from '../services/hash.js';
import { entryExists } from '../services/d1.js';
import type { Env } from '../index.js';

const MAX_CONVERSATION = 10000;
const AUTO_SAVE_THRESHOLD = 0.7;

export async function handleExtract(env: Env, input: Record<string, any>): Promise<{ result: any; isError?: boolean }> {
  if (!input.conversation || typeof input.conversation !== 'string') {
    return { result: { error: 'VALIDATION_ERROR', message: 'conversation is required' }, isError: true };
  }
  if (input.conversation.length > MAX_CONVERSATION) {
    return { result: { error: 'VALIDATION_ERROR', message: 'conversation too long (max 10000)' }, isError: true };
  }

  const conversation = input.conversation as string;
  const repo = (input.repo as string) || undefined;
  const platform = (input.platform as string) || 'unknown';

  try {
    const extracted = await extractMemories(env.AI, conversation);
    if (!extracted || extracted.length === 0) {
      return { result: { extracted: [], auto_saved: 0, needs_review: 0 } };
    }

    let autoSaved = 0;
    let needsReview = 0;
    const saveResults = new Map<number, boolean | string>();

    for (let i = 0; i < extracted.length; i++) {
      const mem = extracted[i];
      if (mem.confidence >= AUTO_SAVE_THRESHOLD && env.WRITE_ENABLED === 'true') {
        // Check if identical memory already exists (deterministic ID)
        const existingId = await generateId(mem.type, mem.title, mem.content, repo || null, null);
        if (await entryExists(env.DB, existingId)) {
          saveResults.set(i, 'skipped');
          continue;
        }
        const saveResult = await handleSave(env, {
          title: mem.title,
          content: mem.content,
          type: mem.type,
          confidence: mem.confidence,
          source: 'auto-extract',
          repo,
          platform,
        });
        const success = !saveResult.isError;
        saveResults.set(i, success);
        if (success) autoSaved++;
        else needsReview++;
      } else {
        saveResults.set(i, false);
        needsReview++;
      }
    }

    return {
      result: {
        extracted: extracted.map((m, i) => ({
          title: m.title,
          content: m.content,
          type: m.type,
          confidence: m.confidence,
          reason: m.reason,
          auto_saved: saveResults.get(i) === true,
          skipped_duplicate: saveResults.get(i) === 'skipped',
        })),
        auto_saved: autoSaved,
        needs_review: needsReview,
      },
    };
  } catch (err: any) {
    console.log(JSON.stringify({ event: 'extract_failed', error: err?.message }));
    return { result: { error: 'EXTRACT_FAILED', message: 'Failed to extract memories' }, isError: true };
  }
}

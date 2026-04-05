/**
 * Workers AI text generation service
 * Used for: summary generation, relevance judgment, supersede confirmation, consolidation, memory extraction
 * Model: @cf/meta/llama-3.1-8b-instruct
 * All functions are best-effort: failure returns null, caller handles gracefully
 */

const TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

interface AiResult {
  response?: string;
}

async function runTextModel(ai: Ai, system: string, user: string, timeoutMs = 15000, maxTokens = 512): Promise<string | null> {
  try {
    const aiPromise = ai.run(TEXT_MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
    }) as Promise<AiResult>;

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs),
    );

    const result = await Promise.race([aiPromise, timeoutPromise]);
    if (!result) {
      console.log(JSON.stringify({ event: 'ai_text_generation_timeout', model: TEXT_MODEL, timeoutMs }));
      return null;
    }
    return (result as AiResult).response?.trim() || null;
  } catch (err: any) {
    console.log(JSON.stringify({
      event: 'ai_text_generation_failed',
      model: TEXT_MODEL,
      error: err.message,
    }));
    return null;
  }
}

/** Generate a 1-2 sentence summary of a memory entry */
export async function generateSummary(ai: Ai, title: string, content: string): Promise<string | null> {
  const system = 'You are a memory summarizer. Output a concise 1-2 sentence summary in the same language as the input. No explanation, just the summary.';
  const user = `Title: ${title}\nContent: ${content.substring(0, 3000)}`;
  const result = await runTextModel(ai, system, user);
  if (result && result.length > 500) return result.substring(0, 500);
  return result;
}

/** Judge if a memory entry is still relevant (for cron cleanup) */
export async function judgeRelevance(
  ai: Ai, type: string, title: string, content: string, createdAt: string, lastConfirmedAt: string | null,
): Promise<{ relevant: boolean; reason: string } | null> {
  const system = 'You are a memory relevance judge. Given a memory entry, decide if it is still relevant and useful. Reply with JSON only: { "relevant": true/false, "reason": "..." }';
  const user = `Type: ${type}\nTitle: ${title}\nContent: ${content.substring(0, 1000)}\nCreated: ${createdAt}\nLast confirmed: ${lastConfirmedAt || 'never'}`;
  const result = await runTextModel(ai, system, user);
  if (!result) return null;
  try {
    const parsed = JSON.parse(result);
    if (typeof parsed.relevant !== 'boolean') return null;
    return { relevant: parsed.relevant, reason: parsed.reason || '' };
  } catch {
    return null;
  }
}

/** Confirm if a new memory supersedes an old one */
export async function confirmSupersede(
  ai: Ai, oldTitle: string, oldContent: string, newTitle: string, newContent: string,
): Promise<{ supersedes: boolean; reason: string } | null> {
  const system = 'Compare two memory entries. Are they about the same topic where the new one replaces the old one? Reply JSON only: { "supersedes": true/false, "reason": "..." }';
  const user = `OLD — Title: ${oldTitle} | Content: ${oldContent.substring(0, 500)}\nNEW — Title: ${newTitle} | Content: ${newContent.substring(0, 500)}`;
  const result = await runTextModel(ai, system, user);
  if (!result) return null;
  try {
    const parsed = JSON.parse(result);
    if (typeof parsed.supersedes !== 'boolean') return null;
    return { supersedes: parsed.supersedes, reason: parsed.reason || '' };
  } catch {
    return null;
  }
}

/** Generate a consolidated memory from multiple related entries */
export async function generateConsolidation(
  ai: Ai, entries: Array<{ title: string; content: string }>,
): Promise<{ title: string; content: string } | null> {
  const system = 'You are merging related memory entries into one consolidated entry. Combine all information without losing facts. Output JSON only: { "title": "...", "content": "..." }. Same language as input. Be concise but complete.';
  const user = entries.map((e, i) => `Entry ${i + 1}: ${e.title} — ${e.content.substring(0, 500)}`).join('\n');
  const result = await runTextModel(ai, system, user);
  if (!result) return null;
  try {
    const parsed = JSON.parse(result);
    if (!parsed.title || !parsed.content) return null;
    return { title: parsed.title, content: parsed.content };
  } catch {
    return null;
  }
}

/** Extract saveable memories from a conversation */
export async function extractMemories(
  ai: Ai, conversation: string,
): Promise<Array<{ title: string; content: string; type: string; confidence: number; reason: string }> | null> {
  const system = `Extract memories from this text. Output JSON array. Example: [{"title":"x","content":"y","type":"feedback","confidence":0.8,"reason":"z"}]. Types: feedback, knowledge, project. If nothing, output [].`;
  const user = conversation.substring(0, 10000);
  const result = await runTextModel(ai, system, user, 25000);
  if (!result) return null;
  try {
    let cleaned = result.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (e: any) => e.title && e.content && e.type && typeof e.confidence === 'number',
    );
  } catch {
    return null;
  }
}

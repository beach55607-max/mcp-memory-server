/**
 * Cron handler — daily memory governance
 * Phase A: Rule-based cleanup (decay + dedup)
 * Phase B: AI relevance judgment
 * Phase C: Autonomous consolidation
 * All operations: active -> legacy only, never DELETE
 * Absolute Truth (confidence=1.0) protected at all phases
 */

import { supersedEntry, upsertEntry } from './d1.js';
import { judgeRelevance, generateConsolidation } from './ai.js';
import { getEmbedding, getEmbeddings } from './embedding.js';
import { upsertVector } from './vectorize.js';
import { generateId } from './hash.js';
import { cosineSim } from './math.js';
import type { Env } from '../index.js';

// Defaults — override via env vars (no redeploy needed)
const CLAMPS: Record<string, [number, number]> = {
  DECAY_DAYS: [1, 365],
  AI_SAMPLE_SIZE: [1, 100],
  ARCHIVE_CAP: [1, 500],
  RECENT_DAYS: [1, 90],
  CONSOLIDATION_SIM: [0.5, 1.0],
  MAX_CLUSTER_SIZE: [2, 20],
  MAX_CONSOLIDATION_GROUPS: [1, 50],
};

function getNum(env: any, key: string, fallback: number): number {
  const v = env?.[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (isNaN(n)) return fallback;
  const clamp = CLAMPS[key];
  if (clamp) return Math.max(clamp[0], Math.min(clamp[1], n));
  return n;
}

const DEFAULTS = {
  DECAY_DAYS: 90,
  AI_SAMPLE_SIZE: 20,
  ARCHIVE_CAP: 50,
  RECENT_DAYS: 7,
  CONSOLIDATION_SIM: 0.85,
  MAX_CLUSTER_SIZE: 5,
  MAX_CONSOLIDATION_GROUPS: 3,
};

interface CronResult {
  decayed: number;
  deduped: number;
  ai_judged: number;
  ai_archived: number;
  consolidated_groups: number;
  consolidated_entries: number;
  errors: number;
  capped: boolean;
}

/** Phase A1: Decay — last_confirmed_at > N days -> legacy */
async function archiveDecayed(db: D1Database, env: Env): Promise<number> {
  const decayDays = getNum(env, 'DECAY_DAYS', DEFAULTS.DECAY_DAYS);
  const cutoff = new Date(Date.now() - decayDays * 86400000).toISOString();
  const result = await db.prepare(`
    UPDATE memory_entries
    SET status = 'legacy', updated_at = datetime('now')
    WHERE status = 'active'
      AND confidence < 1.0
      AND last_confirmed_at IS NOT NULL
      AND last_confirmed_at < ?
  `).bind(cutoff).run();
  return result.meta?.changes ?? 0;
}

/** Phase A2: Dedup — same type + same title (exact match) -> older -> legacy */
async function deduplicateEntries(db: D1Database, vectorize?: VectorizeIndex): Promise<number> {
  const dupes = await db.prepare(`
    SELECT m1.id as old_id, m2.id as new_id
    FROM memory_entries m1
    JOIN memory_entries m2
      ON m1.type = m2.type AND m1.title = m2.title
      AND m1.status = 'active' AND m2.status = 'active'
      AND m1.confidence < 1.0 AND m2.confidence < 1.0
      AND m1.created_at < m2.created_at
    LIMIT 100
  `).all<{ old_id: string; new_id: string }>();

  let count = 0;
  for (const { old_id, new_id } of dupes.results || []) {
    await supersedEntry(db, old_id, new_id, vectorize);
    count++;
  }
  return count;
}

/** Phase B: AI relevance judgment — sample oldest entries, ask AI */
async function aiJudgeRelevance(env: Env, archiveBudget: number): Promise<{ judged: number; archived: number; errors: number }> {
  const result = { judged: 0, archived: 0, errors: 0 };
  if (archiveBudget <= 0) return result;

  const recentDays = getNum(env, 'RECENT_DAYS', DEFAULTS.RECENT_DAYS);
  const aiSampleSize = getNum(env, 'AI_SAMPLE_SIZE', DEFAULTS.AI_SAMPLE_SIZE);
  const recentCutoff = new Date(Date.now() - recentDays * 86400000).toISOString();
  const entries = await env.DB.prepare(`
    SELECT id, type, title, content, created_at, last_confirmed_at
    FROM memory_entries
    WHERE status = 'active'
      AND confidence < 1.0
      AND created_at < ?
    ORDER BY created_at ASC
    LIMIT ?
  `).bind(recentCutoff, aiSampleSize).all<{ id: string; type: string; title: string; content: string; created_at: string; last_confirmed_at: string | null }>();

  for (const entry of entries.results || []) {
    if (result.archived >= archiveBudget) break;

    const judgment = await judgeRelevance(env.AI, entry.type, entry.title, entry.content, entry.created_at, entry.last_confirmed_at);
    result.judged++;

    if (!judgment) {
      result.errors++;
      continue;
    }

    if (!judgment.relevant) {
      await env.DB.prepare(`
        UPDATE memory_entries SET status = 'legacy', updated_at = datetime('now') WHERE id = ?
      `).bind(entry.id).run();
      result.archived++;
    }
  }

  return result;
}

/** Phase C: Autonomous Consolidation — cluster similar entries within same boundary, merge via AI */
async function consolidateMemories(env: Env): Promise<{ groups: number; entries: number; errors: number }> {
  const result = { groups: 0, entries: 0, errors: 0 };

  const recentDays = getNum(env, 'RECENT_DAYS', DEFAULTS.RECENT_DAYS);
  const maxGroups = getNum(env, 'MAX_CONSOLIDATION_GROUPS', DEFAULTS.MAX_CONSOLIDATION_GROUPS);
  const maxCluster = getNum(env, 'MAX_CLUSTER_SIZE', DEFAULTS.MAX_CLUSTER_SIZE);
  const consolSim = getNum(env, 'CONSOLIDATION_SIM', DEFAULTS.CONSOLIDATION_SIM);
  const consolCutoff = new Date(Date.now() - recentDays * 86400000).toISOString();
  const rows = await env.DB.prepare(`
    SELECT id, type, title, content, scope, repo, session_id, confidence, embedding_text
    FROM memory_entries
    WHERE status = 'active' AND confidence < 1.0
      AND created_at < ?
    ORDER BY type, scope, repo, session_id, created_at ASC
  `).bind(consolCutoff).all<any>();

  if (!rows.results || rows.results.length < 2) return result;

  const boundaryGroups = new Map<string, any[]>();
  for (const row of rows.results) {
    const key = `${row.type}|${row.scope}|${row.repo || ''}|${row.session_id || ''}`;
    if (!boundaryGroups.has(key)) boundaryGroups.set(key, []);
    boundaryGroups.get(key)!.push(row);
  }

  for (const [, group] of boundaryGroups) {
    if (result.groups >= maxGroups) break;
    if (group.length < 2) continue;

    const texts = group.map((e: any) => e.embedding_text || `${e.title}\n${e.content?.substring(0, 2000) || ''}`);
    let embeddings: number[][];
    try {
      embeddings = await getEmbeddings(env.AI, texts);
    } catch {
      result.errors++;
      continue;
    }

    const used = new Set<number>();
    for (let i = 0; i < group.length && result.groups < maxGroups; i++) {
      if (used.has(i)) continue;
      const cluster = [i];
      for (let j = i + 1; j < group.length && cluster.length < maxCluster; j++) {
        if (used.has(j)) continue;
        if (cluster.every(k => cosineSim(embeddings[k], embeddings[j]) > consolSim)) {
          cluster.push(j);
        }
      }
      if (cluster.length < 2) continue;

      const clusterEntries = cluster.map(idx => group[idx]);
      const merged = await generateConsolidation(env.AI, clusterEntries);
      if (!merged) { result.errors++; continue; }

      const ref = clusterEntries[0];
      try {
        const newId = await generateId(ref.type, merged.title, merged.content, ref.repo, ref.session_id);
        const embText = `${merged.title}\n${merged.content.substring(0, 2000)}`;
        const emb = await getEmbedding(env.AI, embText);

        await upsertEntry(env.DB, {
          id: newId, type: ref.type, title: merged.title, content: merged.content,
          tags: null, repo: ref.repo, source: 'consolidation', batch_id: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          session_id: ref.session_id, status: 'active', scope: ref.scope,
          platform: 'unknown',
          confidence: Math.max(...clusterEntries.map((e: any) => e.confidence)),
          superseded_by: null, last_confirmed_at: new Date().toISOString(),
          embedding_text: embText, summary: null,
        });
        const vecMeta: Record<string, string> = { type: ref.type, scope: ref.scope, status: 'active' };
        if (ref.repo) vecMeta.repo = ref.repo;
        await upsertVector(env.VECTORIZE, newId, emb, vecMeta);

        for (const old of clusterEntries) {
          await supersedEntry(env.DB, old.id, newId, env.VECTORIZE);
        }

        cluster.forEach(idx => used.add(idx));
        result.groups++;
        result.entries += clusterEntries.length;
      } catch {
        result.errors++;
      }
    }
  }

  return result;
}

/** Main cron handler */
export async function handleCron(env: Env): Promise<CronResult> {
  const result: CronResult = { decayed: 0, deduped: 0, ai_judged: 0, ai_archived: 0, consolidated_groups: 0, consolidated_entries: 0, errors: 0, capped: false };

  try {
    result.decayed = await archiveDecayed(env.DB, env);
    result.deduped = await deduplicateEntries(env.DB, env.VECTORIZE);

    const archiveCap = getNum(env, 'ARCHIVE_CAP', DEFAULTS.ARCHIVE_CAP);
    const totalArchived = result.decayed + result.deduped;
    const archiveBudget = Math.max(0, archiveCap - totalArchived);

    const aiResult = await aiJudgeRelevance(env, archiveBudget);
    result.ai_judged = aiResult.judged;
    result.ai_archived = aiResult.archived;
    result.errors = aiResult.errors;
    result.capped = totalArchived + aiResult.archived >= archiveCap;

    const consolResult = await consolidateMemories(env);
    result.consolidated_groups = consolResult.groups;
    result.consolidated_entries = consolResult.entries;
    result.errors += consolResult.errors;
  } catch {
    result.errors++;
  }

  console.log(JSON.stringify({ event: 'cron_completed', ...result, timestamp: new Date().toISOString() }));
  return result;
}

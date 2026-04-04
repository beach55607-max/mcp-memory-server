/**
 * Batch import — import knowledge files into MCP Memory Server
 *
 * Usage:
 *   MCP_MEMORY_API=https://your-worker.workers.dev \
 *   KNOWLEDGE_DIR=~/.claude/knowledge \
 *   node scripts/batch-import.mjs
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const API_BASE = process.env.MCP_MEMORY_API;
const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR
  || join(process.env.HOME || process.env.USERPROFILE || '', '.claude/knowledge');
const BATCH_ID = `import-${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 16)}`;

if (!API_BASE) {
  console.error('Error: MCP_MEMORY_API environment variable is required.');
  process.exit(1);
}

const manifest = {
  batch_id: BATCH_ID,
  total: 0,
  imported: 0,
  skipped: 0,
  skip_reasons: { empty: 0, superseded: 0, short: 0, duplicate: 0, error: 0 },
  imported_ids: [],
};

// ─── API call ───
async function saveEntry(entry) {
  const res = await fetch(`${API_BASE}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return await res.json();
}

// ─── Knowledge import ───
async function importKnowledge() {
  console.log('\n=== Importing Knowledge ===');
  console.log(`Source: ${KNOWLEDGE_DIR}`);
  const files = readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.md') && f !== 'KNOWLEDGE.md');

  for (const f of files) {
    manifest.total++;
    const raw = readFileSync(join(KNOWLEDGE_DIR, f), 'utf-8');

    // Parse frontmatter
    const topicMatch = raw.match(/^topic:\s*(.+)$/m);
    const tagsMatch = raw.match(/^tags:\s*\[(.+)\]$/m);
    const repoMatch = raw.match(/^repo:\s*(.+)$/m);
    const statusMatch = raw.match(/^status:\s*(.+)$/m);

    const title = topicMatch ? topicMatch[1].trim() : f.replace('.md', '');
    const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim().replace(/"/g, '')) : [];
    const repo = repoMatch ? repoMatch[1].trim() : null;
    const status = statusMatch ? statusMatch[1].trim() : 'active';

    // Skip superseded
    if (status === 'superseded') {
      manifest.skipped++;
      manifest.skip_reasons.superseded++;
      continue;
    }

    // Content = after frontmatter
    const fmEnd = raw.indexOf('---', 3);
    const content = fmEnd > 0 ? raw.substring(fmEnd + 3).trim() : raw;

    if (!content || content.length < 10) {
      manifest.skipped++;
      manifest.skip_reasons.empty++;
      continue;
    }

    try {
      const result = await saveEntry({
        title, content: content.substring(0, 5000), type: 'knowledge',
        tags: JSON.stringify(tags), repo, source: 'batch-import',
      });
      if (result.id) {
        manifest.imported++;
        manifest.imported_ids.push(result.id);
        process.stdout.write('.');
      } else {
        manifest.skipped++;
        manifest.skip_reasons.error++;
        console.log(`\n  SKIP ${f}: ${result.error}`);
      }
    } catch (e) {
      manifest.skipped++;
      manifest.skip_reasons.error++;
    }

    // Rate limiting
    if (manifest.imported % 10 === 0) await sleep(1000);
  }
  console.log(`\nKnowledge: ${manifest.imported} imported`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ───
async function main() {
  console.log(`=== Batch Import ===`);
  console.log(`Batch ID: ${BATCH_ID}`);
  console.log(`API: ${API_BASE}`);

  await importKnowledge();

  console.log('\n=== Manifest ===');
  console.log(`Total: ${manifest.total}`);
  console.log(`Imported: ${manifest.imported}`);
  console.log(`Skipped: ${manifest.skipped}`);
  console.log(`Skip reasons:`, manifest.skip_reasons);
}

main().catch(e => { console.error(e); process.exit(1); });

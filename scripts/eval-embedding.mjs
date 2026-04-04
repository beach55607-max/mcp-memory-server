/**
 * Embedding quality evaluation
 * Tests semantic search accuracy against a gold set using Cloudflare Workers AI bge-m3
 *
 * Usage:
 *   CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_API_TOKEN=xxx \
 *   KNOWLEDGE_DIR=~/.claude/knowledge \
 *   node scripts/eval-embedding.mjs
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const MODEL = '@cf/baai/bge-m3';
const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR
  || join(process.env.HOME || process.env.USERPROFILE || '', '.claude/knowledge');
const GOLD_SET_PATH = join(__dirname, '../tests/gold-set.json');

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

async function getEmbedding(texts) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (!json.success) throw new Error(`API failed: ${JSON.stringify(json.errors)}`);
  return json.result.data;
}

function cosine(a, b) {
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; nA += a[i]*a[i]; nB += b[i]*b[i]; }
  return dot / (Math.sqrt(nA) * Math.sqrt(nB));
}

function loadKnowledge() {
  const files = readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.md') && f !== 'KNOWLEDGE.md');
  return files.map(f => {
    const raw = readFileSync(join(KNOWLEDGE_DIR, f), 'utf-8');
    const topicMatch = raw.match(/^topic:\s*(.+)$/m);
    const title = topicMatch ? topicMatch[1].trim() : f.replace('.md', '');
    const idx = raw.indexOf('---', 3);
    const content = idx > 0 ? raw.substring(idx + 3).trim().substring(0, 500) : raw.substring(0, 500);
    return { filename: f, title, content: `${title}\n${content}` };
  });
}

function tagSearch(query, files) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const scored = files.map(f => {
    const text = (f.title + ' ' + f.content + ' ' + f.filename).toLowerCase();
    let score = 0;
    for (const w of words) if (text.includes(w)) score++;
    return { filename: f.filename, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).filter(s => s.score > 0).map(s => s.filename);
}

async function main() {
  console.log('=== Embedding Quality Evaluation ===\n');

  const goldSet = JSON.parse(readFileSync(GOLD_SET_PATH, 'utf-8'));
  const queries = goldSet.queries;
  const knowledgeFiles = loadKnowledge();
  console.log(`Gold set: ${queries.length} queries | Corpus: ${knowledgeFiles.length} files\n`);

  // Embed corpus in batches
  console.log('Embedding corpus...');
  const corpus = [];
  for (let i = 0; i < knowledgeFiles.length; i += 10) {
    const batch = knowledgeFiles.slice(i, i + 10);
    const embs = await getEmbedding(batch.map(f => f.content));
    for (let j = 0; j < batch.length; j++) {
      corpus.push({ ...batch[j], emb: embs[j] });
    }
    console.log(`  ${Math.min(i + 10, knowledgeFiles.length)}/${knowledgeFiles.length}`);
  }

  // Embed queries
  console.log('Embedding queries...');
  const qEmbs = await getEmbedding(queries.map(q => q.query));

  // Evaluate
  console.log('\n=== Results ===\n');
  let embHits = 0, tagHits = 0, negPass = 0, mrr = 0;

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const scored = corpus.map(c => ({ filename: c.filename, title: c.title, score: cosine(qEmbs[i], c.emb) }));
    scored.sort((a, b) => b.score - a.score);
    const top3 = scored.slice(0, 3);
    const tagTop3 = tagSearch(q.query, knowledgeFiles);

    if (q.type === 'negative') {
      const pass = top3[0].score < 0.5;
      if (pass) negPass++;
      console.log(`[${q.id}] ${pass ? 'PASS' : 'FAIL'} NEG "${q.query}" -> ${top3[0].score.toFixed(3)}`);
    } else {
      const eHit = top3.some(t => t.filename === q.expected_file);
      const tHit = tagTop3.includes(q.expected_file);
      if (eHit) embHits++;
      if (tHit) tagHits++;
      const rank = scored.findIndex(s => s.filename === q.expected_file) + 1;
      if (rank > 0 && rank <= 3) mrr += 1 / rank;
      console.log(`[${q.id}] ${eHit ? 'PASS' : 'FAIL'} "${q.query}"`);
      console.log(`  EMB: ${top3.map(t => `${t.filename.replace('.md','')}(${t.score.toFixed(3)})`).join(', ')}`);
      console.log(`  TAG: ${tagTop3.map(f=>f.replace('.md','')).join(', ') || '(none)'}`);
      console.log(`  Expected: ${q.expected_file?.replace('.md','')} -> E:${eHit?'HIT':'MISS'} T:${tHit?'HIT':'MISS'}`);
    }
  }

  const pos = queries.filter(q => q.type !== 'negative').length;
  const r3e = embHits / pos, r3t = tagHits / pos;
  console.log('\n=== Summary ===');
  console.log(`Recall@3 EMB: ${(r3e*100).toFixed(1)}% (${embHits}/${pos})`);
  console.log(`Recall@3 TAG: ${(r3t*100).toFixed(1)}% (${tagHits}/${pos})`);
  console.log(`MRR@3:        ${(mrr/pos).toFixed(3)}`);
  console.log(`Negative:     ${negPass}/${queries.filter(q=>q.type==='negative').length}`);
  console.log(`\nGate: Recall@3 >= 80% AND > tag matching`);
  console.log(`Result: ${r3e >= 0.8 && r3e > r3t ? 'PASS' : 'FAIL'}`);
}

main().catch(e => { console.error(e); process.exit(1); });

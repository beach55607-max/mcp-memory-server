/**
 * Structural test — validates code contracts without Cloudflare credentials.
 * Run: node scripts/test-structure.mjs
 * Exit: 0 = PASS, 1 = FAIL
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let pass = 0, fail = 0;

function check(name, ok) {
  if (ok) { console.log(`  PASS ${name}`); pass++; }
  else { console.log(`  FAIL ${name}`); fail++; }
}

console.log('=== Structural Tests ===\n');

// 1. Gold set structure
console.log('[gold-set.json]');
const gs = JSON.parse(readFileSync(join(root, 'tests/gold-set.json'), 'utf-8'));
check('has queries array', Array.isArray(gs.queries));
check('has knowledge type', gs.queries.some(q => q.type === 'knowledge'));
check('has negative type', gs.queries.some(q => q.type === 'negative'));
check('all queries have id + query + type', gs.queries.every(q => q.id && q.query && q.type));

// 2. Migration files
console.log('\n[migrations]');
check('0001_init.sql exists', existsSync(join(root, 'migrations/0001_init.sql')));
check('0002_schema_upgrade.sql exists', existsSync(join(root, 'migrations/0002_schema_upgrade.sql')));
check('0003_add_summary.sql exists', existsSync(join(root, 'migrations/0003_add_summary.sql')));

check('setup.sh exists', existsSync(join(root, 'setup.sh')));

// 3. Source file exports
console.log('\n[source files]');
const srcFiles = [
  'src/index.ts', 'src/tools/save.ts', 'src/tools/search.ts',
  'src/tools/delete.ts', 'src/tools/list.ts', 'src/tools/promote.ts',
  'src/tools/auto-inject.ts', 'src/tools/extract.ts',
  'src/services/d1.ts', 'src/services/embedding.ts',
  'src/services/hash.ts', 'src/services/vectorize.ts',
  'src/services/ai.ts', 'src/services/cron.ts',
  'src/services/sanitize.ts', 'src/services/math.ts', 'src/auth/handler.ts',
];
for (const f of srcFiles) {
  check(`${f} exists`, existsSync(join(root, f)));
}

// 4. Wrangler config (uses .example for public version)
console.log('\n[wrangler.toml.example]');
const wrangler = readFileSync(join(root, 'wrangler.toml.example'), 'utf-8');
check('has AI binding', wrangler.includes('binding = "AI"'));
check('has DB binding', wrangler.includes('binding = "DB"'));
check('has VECTORIZE binding', wrangler.includes('binding = "VECTORIZE"'));
check('has OAUTH_KV binding', wrangler.includes('binding = "OAUTH_KV"'));
check('has cron trigger', wrangler.includes('crons'));
check('has MCP_ENABLED', wrangler.includes('MCP_ENABLED'));
check('has WRITE_ENABLED', wrangler.includes('WRITE_ENABLED'));
check('has CRON_ENABLED', wrangler.includes('CRON_ENABLED'));

// 5. Validation constants consistency
console.log('\n[validation constants]');
const saveSrc = readFileSync(join(root, 'src/tools/save.ts'), 'utf-8');
check('MAX_TITLE = 200', saveSrc.includes('MAX_TITLE = 200'));
check('MAX_CONTENT = 50000', saveSrc.includes('MAX_CONTENT = 50000'));
check('MAX_TAGS = 20', saveSrc.includes('MAX_TAGS = 20'));
check('VALID_TYPES includes knowledge/session/feedback/project',
  saveSrc.includes("'knowledge'") && saveSrc.includes("'session'") &&
  saveSrc.includes("'feedback'") && saveSrc.includes("'project'"));

// 6. CORS config (should NOT be wildcard)
console.log('\n[security]');
const indexSrc = readFileSync(join(root, 'src/index.ts'), 'utf-8');
const wildcardCorsCount = (indexSrc.match(/Allow-Origin.*\*/g) || []).length;
check('CORS not wildcard (*)', wildcardCorsCount === 0);

// Summary
console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);

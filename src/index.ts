/**
 * MCP Memory Server — OAuth 2.1 + MCP Streamable HTTP + REST API
 * Phase 2: Memory governance, automation, conflict resolution
 */

import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { handleSave } from './tools/save.js';
import { handleSearch } from './tools/search.js';
import { handleDelete } from './tools/delete.js';
import { handleList } from './tools/list.js';
import { entryExists, sessionExists } from './services/d1.js';
import { handleAuthorize } from './auth/handler.js';
import { handleCron } from './services/cron.js';
import { handlePromote } from './tools/promote.js';
import { handleAutoInject } from './tools/auto-inject.js';
import { handleExtract } from './tools/extract.js';

export interface Env {
  AI: Ai;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: any;
  MCP_ENABLED: string;
  WRITE_ENABLED: string;
  API_SECRET: string;
  ALLOWED_ORIGINS: string;
  DEV_MODE: string;
  CRON_ENABLED: string;
  SUMMARY_ENABLED: string;
  SUPERSEDE_ENABLED: string;
}

// No default origins — users must configure ALLOWED_ORIGINS in wrangler.toml
// Example: ALLOWED_ORIGINS = "https://claude.ai,https://chatgpt.com"
const DEFAULT_ALLOWED_ORIGINS: string[] = [];

function getAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : DEFAULT_ALLOWED_ORIGINS;
  if (env.DEV_MODE === 'true' && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
    return origin;
  }
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const allowed = getAllowedOrigin(request, env);
  if (!allowed) return {};
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
  };
}

function createServer(env: Env): McpServer {
  const server = new McpServer({ name: 'mcp-memory-server', version: '2.0.0' });

  server.tool(
    'memory_save',
    'Save a memory entry for later semantic retrieval',
    {
      title: z.string().describe('One-line summary'),
      content: z.string().describe('Full content'),
      type: z.string().describe('knowledge | session | feedback | project'),
      tags: z.string().optional().describe('Optional JSON array of tags'),
      repo: z.string().optional().describe('Optional repo name'),
      source: z.string().optional().describe('Optional source'),
      session_id: z.string().optional().describe('Optional session UUID'),
      scope: z.string().optional().describe('global | project | thread (default: global)'),
      platform: z.string().optional().describe('vscode | desktop | web | mobile | chatgpt | codex (default: unknown)'),
      confidence: z.number().optional().describe('0.0-1.0 confidence level (default: 0.5)'),
    },
    async (params: any) => {
      let parsedTags: any;
      if (params.tags) {
        try { parsedTags = JSON.parse(params.tags); } catch { parsedTags = params.tags; }
      }
      const input = { ...params, tags: parsedTags };
      const { result, isError } = await handleSave(env, input);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError };
    },
  );

  server.tool(
    'memory_search',
    'Semantic search across all stored memories',
    {
      query: z.string().describe('Natural language search query'),
      limit: z.number().optional().describe('Max results (1-20, default 5)'),
      type: z.string().optional().describe('Optional filter by type'),
      repo: z.string().optional().describe('Optional filter by repo'),
      scope: z.string().optional().describe('Optional filter by scope'),
      include_legacy: z.boolean().optional().describe('Include legacy/archived memories (default: false)'),
      full_content: z.boolean().optional().describe('Return full content (default: true). Set false for token-saving summary-only mode.'),
    },
    async (params: any) => {
      const { result, isError } = await handleSearch(env, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError };
    },
  );

  server.tool(
    'memory_delete',
    'Delete a memory entry by ID',
    { id: z.string().describe('Memory entry ID') },
    async (params: any) => {
      const { result, isError } = await handleDelete(env, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError };
    },
  );

  server.tool(
    'memory_list',
    'List memory entries with optional filters',
    {
      type: z.string().optional().describe('Optional filter by type'),
      repo: z.string().optional().describe('Optional filter by repo'),
      status: z.string().optional().describe('active | legacy | all (default: active)'),
      scope: z.string().optional().describe('Optional filter by scope'),
      limit: z.number().optional().describe('Max results (1-100, default 20)'),
      cursor: z.string().optional().describe('Cursor for pagination (created_at of last item). Preferred over offset.'),
      offset: z.number().optional().describe('Legacy pagination offset. Use cursor instead.'),
    },
    async (params: any) => {
      const { result, isError } = await handleList(env, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError };
    },
  );

  server.tool(
    'memory_promote',
    'Promote a memory entry to Absolute Truth (confidence=1.0). Immutable entries are protected from automated cleanup.',
    { id: z.string().describe('Memory entry ID to promote') },
    async (params: any) => {
      const { result, isError } = await handlePromote(env, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError };
    },
  );

  server.tool(
    'memory_auto_inject',
    'Load relevant memories for current conversation context. Absolute Truth entries are always included.',
    {
      context: z.string().describe('Current conversation context or task description'),
      repo: z.string().optional().describe('Current repo name'),
      platform: z.string().optional().describe('Current platform'),
      limit: z.number().optional().describe('Max normal memories (1-10, default 5). Absolute Truths are always added on top.'),
    },
    async (params: any) => {
      const { result, isError } = await handleAutoInject(env, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError };
    },
  );

  server.tool(
    'memory_extract',
    'Extract saveable memories from a conversation. Auto-saves high-confidence extractions.',
    {
      conversation: z.string().describe('Conversation content to extract memories from (max 10000 chars)'),
      repo: z.string().optional().describe('Current repo name'),
      platform: z.string().optional().describe('Current platform'),
    },
    async (params: any) => {
      const { result, isError } = await handleExtract(env, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError };
    },
  );

  return server;
}

const mcpHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!env.DB || !env.AI || !env.VECTORIZE) {
      const detail = env.DEV_MODE === 'true'
        ? { hasDB: !!env.DB, hasAI: !!env.AI, hasVectorize: !!env.VECTORIZE }
        : {};
      return new Response(JSON.stringify({ error: 'ENV_MISSING', ...detail }), { status: 500 });
    }
    const server = createServer(env);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};

const defaultHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      const allowed = getAllowedOrigin(request, env);
      return new Response(null, {
        headers: {
          ...(allowed ? { 'Access-Control-Allow-Origin': allowed, 'Vary': 'Origin' } : {}),
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        },
      });
    }

    if (url.pathname === '/health') {
      return json(request, env, {
        status: 'ok', version: '2.0.0',
        mcp_enabled: env.MCP_ENABLED === 'true',
        write_enabled: env.WRITE_ENABLED === 'true',
        cron_enabled: env.CRON_ENABLED === 'true',
      });
    }

    if (url.pathname === '/authorize') {
      return handleAuthorize(request, env);
    }

    if (env.MCP_ENABLED !== 'true') {
      return json(request, env, { error: 'SERVICE_DISABLED' }, 503);
    }

    // REST API — protected by shared secret
    if (request.method === 'POST' && url.pathname.startsWith('/api/')) {
      if (!env.API_SECRET && env.DEV_MODE !== 'true') {
        return json(request, env, { error: 'CONFIG_ERROR', message: 'API_SECRET must be set in production' }, 500);
      }
      if (env.API_SECRET && request.headers.get('X-API-Key') !== env.API_SECRET) {
        return json(request, env, { error: 'UNAUTHORIZED', message: 'Invalid or missing X-API-Key' }, 401);
      }
    }
    if (request.method === 'POST') {
      try {
        const body = await request.json() as Record<string, any>;
        if (url.pathname === '/api/save') { const r = await handleSave(env, body); return json(request, env, r.result, r.isError ? 400 : 200); }
        if (url.pathname === '/api/search') { const r = await handleSearch(env, body); return json(request, env, r.result, r.isError ? 400 : 200); }
        if (url.pathname === '/api/delete') { const r = await handleDelete(env, body); return json(request, env, r.result, r.isError ? 404 : 200); }
        if (url.pathname === '/api/list') { const r = await handleList(env, body); return json(request, env, r.result, r.isError ? 400 : 200); }
        if (url.pathname === '/api/promote') { const r = await handlePromote(env, body); return json(request, env, r.result, r.isError ? 400 : 200); }
        if (url.pathname === '/api/auto-inject') { const r = await handleAutoInject(env, body); return json(request, env, r.result, r.isError ? 400 : 200); }
        if (url.pathname === '/api/extract') { const r = await handleExtract(env, body); return json(request, env, r.result, r.isError ? 400 : 200); }
        if (url.pathname === '/api/exists') {
          const id = body.id;
          if (!id || typeof id !== 'string') return json(request, env, { error: 'VALIDATION_ERROR', message: 'id is required' }, 400);
          return json(request, env, { exists: await entryExists(env.DB, id) });
        }
        if (url.pathname === '/api/exists-session') {
          const sid = body.session_id;
          if (!sid || typeof sid !== 'string') return json(request, env, { error: 'VALIDATION_ERROR', message: 'session_id is required' }, 400);
          return json(request, env, { exists: await sessionExists(env.DB, sid) });
        }
      } catch (err: any) {
        console.log(JSON.stringify({ event: 'rest_api_error', error: err?.message }));
        return json(request, env, { error: 'INTERNAL', message: 'Request processing failed' }, 500);
      }
    }

    return json(request, env, { error: 'Not found' }, 404);
  },
};

const oauthProvider = new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: mcpHandler,
  defaultHandler: defaultHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  scopesSupported: ['memory:read', 'memory:write'],
  allowPlainPKCE: false,
  accessTokenTTL: 3600,
  refreshTokenTTL: 604800,
});

export default {
  fetch: oauthProvider.fetch.bind(oauthProvider),
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (env.CRON_ENABLED !== 'true') {
      console.log(JSON.stringify({ event: 'cron_skipped', reason: 'CRON_ENABLED is not true' }));
      return;
    }
    if (env.WRITE_ENABLED !== 'true') {
      console.log(JSON.stringify({ event: 'cron_skipped', reason: 'WRITE_ENABLED is not true' }));
      return;
    }
    ctx.waitUntil(handleCron(env));
  },
};

function json(request: Request, env: Env, data: any, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders(request, env) });
}

/**
 * MCP Memory Server — Dual mode: REST API + MCP Streamable HTTP
 * Powered by Cloudflare Workers + D1 + Vectorize + Workers AI (bge-m3)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpHandler } from 'agents/mcp';
import { handleSave } from './tools/save.js';
import { handleSearch } from './tools/search.js';
import { handleDelete } from './tools/delete.js';
import { handleList } from './tools/list.js';

export interface Env {
  AI: Ai;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  OAUTH_KV: KVNamespace;
  MCP_ENABLED: string;
  WRITE_ENABLED: string;
}

let _env: Env;

function createServer(): McpServer {
  const server = new McpServer({ name: 'mcp-memory-server', version: '1.0.0' });

  server.tool(
    'memory_save',
    'Save a memory entry for later semantic retrieval',
    {
      title: { type: 'string', description: 'One-line summary' },
      content: { type: 'string', description: 'Full content' },
      type: { type: 'string', description: 'knowledge | session | feedback | project' },
      tags: { type: 'string', description: 'Optional JSON array of tags' },
      repo: { type: 'string', description: 'Optional repo name' },
      source: { type: 'string', description: 'Optional source' },
      session_id: { type: 'string', description: 'Optional session UUID' },
    },
    async (params: any) => {
      const input = { ...params, tags: params.tags ? JSON.parse(params.tags) : undefined };
      const { result, isError } = await handleSave(_env, input);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError };
    },
  );

  server.tool(
    'memory_search',
    'Semantic search across all stored memories',
    {
      query: { type: 'string', description: 'Natural language search query' },
      limit: { type: 'number', description: 'Max results (1-20, default 5)' },
      type: { type: 'string', description: 'Optional filter by type' },
      repo: { type: 'string', description: 'Optional filter by repo' },
    },
    async (params: any) => {
      const { result, isError } = await handleSearch(_env, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError };
    },
  );

  server.tool(
    'memory_delete',
    'Delete a memory entry by ID',
    { id: { type: 'string', description: 'Memory entry ID' } },
    async (params: any) => {
      const { result, isError } = await handleDelete(_env, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError };
    },
  );

  server.tool(
    'memory_list',
    'List memory entries with optional filters',
    {
      type: { type: 'string', description: 'Optional filter by type' },
      repo: { type: 'string', description: 'Optional filter by repo' },
      limit: { type: 'number', description: 'Max results (1-100, default 20)' },
      offset: { type: 'number', description: 'Pagination offset' },
    },
    async (params: any) => {
      const { result, isError } = await handleList(_env, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError };
    },
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    _env = env;

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Health
    if (url.pathname === '/health') {
      return json({ status: 'ok', version: '1.0.0', mcp_enabled: env.MCP_ENABLED === 'true', write_enabled: env.WRITE_ENABLED === 'true' });
    }

    // Kill switch
    if (env.MCP_ENABLED !== 'true') {
      return json({ error: 'SERVICE_DISABLED' }, 503);
    }

    // MCP Streamable HTTP endpoint (for Claude Code / Claude.ai / ChatGPT / Cursor etc.)
    if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
      const server = createServer();
      const handler = createMcpHandler(server, {
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: true,
      });
      return handler(request, env, ctx);
    }

    // REST API (for direct testing / batch import)
    if (request.method === 'POST') {
      try {
        const body = await request.json() as Record<string, any>;
        if (url.pathname === '/api/save') return json((await handleSave(env, body)).result);
        if (url.pathname === '/api/search') return json((await handleSearch(env, body)).result);
        if (url.pathname === '/api/delete') {
          const r = await handleDelete(env, body);
          return json(r.result, r.isError ? 404 : 200);
        }
        if (url.pathname === '/api/list') return json((await handleList(env, body)).result);
      } catch (e: any) {
        return json({ error: 'INTERNAL', message: e.message }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};

function json(data: any, status = 200): Response {
  return Response.json(data, { status, headers: { 'Access-Control-Allow-Origin': '*' } });
}

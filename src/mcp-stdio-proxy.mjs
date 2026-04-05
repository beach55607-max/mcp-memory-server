#!/usr/bin/env node
/**
 * MCP stdio proxy — runs locally, forwards to your deployed REST API
 * Supports all 7 tools including governance features
 *
 * Usage:
 *   MCP_MEMORY_API=https://your-worker.workers.dev \
 *   MCP_MEMORY_API_KEY=your-secret \
 *   node src/mcp-stdio-proxy.mjs
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = process.env.MCP_MEMORY_API;
const API_KEY = process.env.MCP_MEMORY_API_KEY || '';

if (!API_BASE) {
  console.error('Error: MCP_MEMORY_API environment variable is required.');
  console.error('Set it to your deployed worker URL, e.g.:');
  console.error('  MCP_MEMORY_API=https://mcp-memory-server.your-subdomain.workers.dev');
  process.exit(1);
}

const server = new McpServer({ name: 'mcp-memory-server', version: '2.0.0' });

async function callApi(endpoint, args) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  const result = await res.json();
  return { data: result, isError: !res.ok || !!result.error };
}

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
  async (params) => {
    const { data, isError } = await callApi('/api/save', params);
    return { content: [{ type: 'text', text: JSON.stringify(data) }], isError };
  },
);

server.tool(
  'memory_search',
  'Semantic search across all stored memories using natural language query',
  {
    query: z.string().describe('Natural language search query'),
    limit: z.number().optional().describe('Max results (1-20, default 5)'),
    type: z.string().optional().describe('Optional filter by type'),
    repo: z.string().optional().describe('Optional filter by repo'),
    scope: z.string().optional().describe('Optional filter by scope'),
    include_legacy: z.boolean().optional().describe('Include legacy/archived memories (default: false)'),
    full_content: z.boolean().optional().describe('Return full content (default: true). Set false for summary-only mode.'),
  },
  async (params) => {
    const { data, isError } = await callApi('/api/search', params);
    return { content: [{ type: 'text', text: JSON.stringify(data) }], isError };
  },
);

server.tool(
  'memory_delete',
  'Delete a memory entry by ID',
  { id: z.string().describe('Memory entry ID to delete') },
  async (params) => {
    const { data, isError } = await callApi('/api/delete', params);
    return { content: [{ type: 'text', text: JSON.stringify(data) }], isError };
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
    offset: z.number().optional().describe('Pagination offset (default 0)'),
  },
  async (params) => {
    const { data, isError } = await callApi('/api/list', params);
    return { content: [{ type: 'text', text: JSON.stringify(data) }], isError };
  },
);

server.tool(
  'memory_promote',
  'Promote a memory entry to Absolute Truth (confidence=1.0). Immutable entries are protected from automated cleanup.',
  { id: z.string().describe('Memory entry ID to promote') },
  async (params) => {
    const { data, isError } = await callApi('/api/promote', params);
    return { content: [{ type: 'text', text: JSON.stringify(data) }], isError };
  },
);

server.tool(
  'memory_auto_inject',
  'Load relevant memories for current conversation context. Absolute Truth entries are always included.',
  {
    context: z.string().describe('Current conversation context or task description'),
    repo: z.string().optional().describe('Current repo name'),
    platform: z.string().optional().describe('Current platform'),
    limit: z.number().optional().describe('Max normal memories (1-10, default 5)'),
  },
  async (params) => {
    const { data, isError } = await callApi('/api/auto-inject', params);
    return { content: [{ type: 'text', text: JSON.stringify(data) }], isError };
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
  async (params) => {
    const { data, isError } = await callApi('/api/extract', params);
    return { content: [{ type: 'text', text: JSON.stringify(data) }], isError };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

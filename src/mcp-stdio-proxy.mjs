#!/usr/bin/env node
/**
 * MCP stdio proxy — runs locally, forwards to your deployed REST API
 *
 * Usage:
 *   MCP_MEMORY_API=https://your-worker.your-subdomain.workers.dev node src/mcp-stdio-proxy.mjs
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = process.env.MCP_MEMORY_API;

if (!API_BASE) {
  console.error('Error: MCP_MEMORY_API environment variable is required.');
  console.error('Set it to your deployed worker URL, e.g.:');
  console.error('  MCP_MEMORY_API=https://mcp-memory-server.your-subdomain.workers.dev');
  process.exit(1);
}

const server = new McpServer({ name: 'mcp-memory-server', version: '1.0.0' });

async function callApi(endpoint, args) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return await res.json();
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
  },
  async (params) => {
    const result = await callApi('/api/save', params);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
  },
  async (params) => {
    const result = await callApi('/api/search', params);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'memory_delete',
  'Delete a memory entry by ID',
  { id: z.string().describe('Memory entry ID to delete') },
  async (params) => {
    const result = await callApi('/api/delete', params);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'memory_list',
  'List memory entries with optional filters',
  {
    type: z.string().optional().describe('Optional filter by type'),
    repo: z.string().optional().describe('Optional filter by repo'),
    limit: z.number().optional().describe('Max results (1-100, default 20)'),
    offset: z.number().optional().describe('Pagination offset (default 0)'),
  },
  async (params) => {
    const result = await callApi('/api/list', params);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

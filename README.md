# MCP Memory Server

A semantic memory server for AI coding agents. Store knowledge, search by meaning, and let your AI assistant remember across sessions.

Built on **Cloudflare Workers** + **D1** (SQLite) + **Vectorize** (vector search) + **Workers AI** (bge-m3 embeddings).

Supports any MCP-compatible client: Claude Code, Claude.ai, ChatGPT, Gemini CLI, Cursor, VS Code + Copilot, Windsurf, and more.

## What It Does

Your AI coding agent can:

- **`memory_save`** — Save a memory with title, content, type, tags, and optional repo/session metadata
- **`memory_search`** — Semantic search: find relevant memories using natural language, not keywords
- **`memory_list`** — List and filter memories by type or repo
- **`memory_delete`** — Delete a memory by ID

Memories are embedded with [bge-m3](https://huggingface.co/BAAI/bge-m3) (multilingual, 1024 dimensions) and stored in Cloudflare Vectorize for fast semantic retrieval.

### Memory Types

| Type | Use Case |
|------|----------|
| `knowledge` | Architecture decisions, gotchas, domain knowledge |
| `session` | Session summaries, what was done and why |
| `feedback` | User preferences, workflow corrections |
| `project` | Ongoing initiatives, deadlines, stakeholder context |

## Deploy

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (Workers Free plan works)
- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm install -g wrangler`

### Steps

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/mcp-memory-server.git
cd mcp-memory-server

# 2. Install dependencies
npm install

# 3. Create Cloudflare resources
wrangler d1 create memory-db
wrangler vectorize create memory-index --dimensions=1024 --metric=cosine
wrangler kv namespace create OAUTH_KV

# 4. Configure
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml — fill in the IDs from step 3

# 5. Initialize database
npm run db:init

# 6. Deploy
npm run deploy
```

Your server is now live at `https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev`.

### Verify

```bash
curl https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/health
# {"status":"ok","version":"1.0.0","mcp_enabled":true,"write_enabled":true}
```

## Connect Your AI Client

### Claude.ai (Web + Mobile)

> **Important:** Set up on the **web version** first. Once configured, it automatically works on the iOS / Android app.

1. Go to [claude.ai](https://claude.ai) → **Settings** → **Integrations**
2. Add a new **remote MCP server**
3. Enter your server URL: `https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`
4. Open Claude on your phone — the memory tools are now available

### ChatGPT (Web + Mobile)

> **Important:** Enable **Developer Mode** on the **web version** first. Once configured, it works on the mobile app.

1. Go to [chatgpt.com](https://chatgpt.com) → **Settings** → **Connectors** → **Advanced**
2. Toggle on **Developer Mode**
3. Go to **Connectors** tab → Add a new MCP server
4. Enter your server URL: `https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`
5. Open ChatGPT on your phone — the memory tools are now available

Requires Pro, Plus, Business, Enterprise, or Education plan.

### Claude Code (CLI)

Add to your Claude Code settings (`~/.claude.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "memory": {
      "type": "url",
      "url": "https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp"
    }
  }
}
```

Or use the stdio proxy for local development:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["path/to/mcp-memory-server/src/mcp-stdio-proxy.mjs"],
      "env": {
        "MCP_MEMORY_API": "https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev"
      }
    }
  }
}
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "memory": {
      "uri": "https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp"
    }
  }
}
```

Gemini CLI supports stdio, SSE, and Streamable HTTP transports, plus OAuth 2.0 for remote servers.

### Cursor

1. Open **Cursor Settings** → **MCP**
2. Add a new server:
   - **Transport**: `streamable-http`
   - **URL**: `https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`

Or add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "memory": {
      "transport": "streamable-http",
      "url": "https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp"
    }
  }
}
```

### VS Code + GitHub Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "memory": {
      "type": "http",
      "url": "https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp"
    }
  }
}
```

Requires VS Code 1.99+ with GitHub Copilot extension.

### Windsurf

1. Open **Windsurf Settings** → **MCP**
2. Add your server URL: `https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`

### JetBrains IDEs (IntelliJ, WebStorm, PyCharm, etc.)

**Settings** → **Tools** → **MCP Server** → Add your server URL.

Works via GitHub Copilot plugin or Windsurf plugin for JetBrains.

### Other Clients

Any MCP-compatible client that supports **Streamable HTTP** transport can connect to:

```
https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp
```

Clients that only support **stdio** can use the included proxy:

```bash
MCP_MEMORY_API=https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev \
  node src/mcp-stdio-proxy.mjs
```

## Architecture

```
Client (Claude / ChatGPT / Cursor / ...)
  │
  ├── MCP Streamable HTTP ──→ /mcp endpoint
  │                              │
  └── REST API ──────────────→ /api/* endpoints
                                 │
                          ┌──────┴──────┐
                          │  Workers AI  │  bge-m3 embedding
                          └──────┬──────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                ┌───┴───┐  ┌────┴────┐  ┌────┴────┐
                │  D1   │  │Vectorize│  │ KV      │
                │(SQLite)│  │(vectors)│  │(OAuth)  │
                └───────┘  └─────────┘  └─────────┘
```

### How Semantic Search Works

1. When you **save** a memory, the title + first 500 chars of content are embedded into a 1024-dimension vector using bge-m3
2. The full content is stored in D1 (SQLite); the vector is stored in Vectorize
3. When you **search**, your query is embedded with the same model, and Vectorize returns the nearest vectors
4. Full content is fetched from D1 and returned with similarity scores

### Deterministic IDs

Each memory gets a SHA-256 ID based on `type + title + content + repo + session_id`. Saving the same memory twice updates it instead of creating a duplicate (upsert).

## Scripts

### Batch Import

Import knowledge files (markdown with frontmatter) into the server:

```bash
MCP_MEMORY_API=https://your-worker.workers.dev \
KNOWLEDGE_DIR=~/.claude/knowledge \
  node scripts/batch-import.mjs
```

### Embedding Evaluation

Test search quality against a gold set:

```bash
CLOUDFLARE_ACCOUNT_ID=xxx \
CLOUDFLARE_API_TOKEN=xxx \
  node scripts/eval-embedding.mjs
```

Edit `tests/gold-set.json` to add your own domain-specific test queries.

## REST API

For testing or integrations that don't use MCP:

| Method | Endpoint | Body |
|--------|----------|------|
| POST | `/api/save` | `{ title, content, type, tags?, repo?, source?, session_id? }` |
| POST | `/api/search` | `{ query, limit?, type?, repo? }` |
| POST | `/api/delete` | `{ id }` |
| POST | `/api/list` | `{ type?, repo?, limit?, offset? }` |
| GET | `/health` | — |

## Configuration

### Environment Variables (wrangler.toml)

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_ENABLED` | `"true"` | Kill switch — set to `"false"` to disable the entire server |
| `WRITE_ENABLED` | `"true"` | Write kill switch — set to `"false"` to make the server read-only |

## Security

This server has **no built-in authentication**. Anyone who knows your Worker URL can read, write, and delete memories via the REST API.

For a personal knowledge base this is usually acceptable. For shared or sensitive use cases:

- **Recommended:** Put [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/) in front of your Worker to require login
- **Alternative:** Add a Bearer token check in the `fetch` handler
- **CORS:** The server returns `Access-Control-Allow-Origin: *` by default. If you need to restrict which websites can call your API, modify the CORS headers in `src/index.ts`
- **Kill switch:** Set `WRITE_ENABLED = "false"` in `wrangler.toml` to make the server read-only

## Cost

On Cloudflare Workers Free plan:

| Resource | Free Tier |
|----------|-----------|
| Workers | 100K requests/day |
| D1 | 5M rows read, 100K rows written/day |
| Vectorize | 30M queried dimensions, 10M stored dimensions/month |
| Workers AI | 10K neurons/day (bge-m3) |

For a personal knowledge base, the free tier is more than enough.

## License

MIT

# MCP Memory Server

給 AI coding agent 用的語意記憶伺服器。儲存知識、用自然語言搜尋、讓 AI 助理跨 session 記住你的 context。

基於 **Cloudflare Workers** + **D1**（SQLite）+ **Vectorize**（向量搜尋）+ **Workers AI**（bge-m3 embedding）。

支援所有 MCP 相容客戶端：Claude Code、Claude.ai、ChatGPT、Gemini CLI、Cursor、VS Code + Copilot、Windsurf 等。

## 功能

你的 AI coding agent 可以：

- **`memory_save`** — 儲存一筆記憶（含標題、內容、類型、標籤、repo / session 等 metadata）
- **`memory_search`** — 語意搜尋：用自然語言找到相關記憶，不是關鍵字比對
- **`memory_list`** — 列出並篩選記憶（依類型或 repo）
- **`memory_delete`** — 依 ID 刪除記憶

記憶會用 [bge-m3](https://huggingface.co/BAAI/bge-m3)（多語言、1024 維）做 embedding，存入 Cloudflare Vectorize 做快速語意檢索。

### 記憶類型

| 類型 | 用途 |
|------|------|
| `knowledge` | 架構決策、踩坑教訓、領域知識 |
| `session` | Session 摘要、做了什麼、為什麼 |
| `feedback` | 使用者偏好、工作流程修正 |
| `project` | 進行中的專案、截止日、利害關係人 context |

## 部署

### 前置條件

- [Cloudflare 帳號](https://dash.cloudflare.com/sign-up)（Workers Free 方案即可）
- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)：`npm install -g wrangler`

### 步驟

```bash
# 1. Clone
git clone https://github.com/beach55607-max/mcp-memory-server.git
cd mcp-memory-server

# 2. 安裝依賴
npm install

# 3. 建立 Cloudflare 資源
wrangler d1 create memory-db
wrangler vectorize create memory-index --dimensions=1024 --metric=cosine
wrangler kv namespace create OAUTH_KV

# 4. 設定
cp wrangler.toml.example wrangler.toml
# 編輯 wrangler.toml — 填入步驟 3 產生的 ID

# 5. 初始化資料庫
npm run db:init

# 6. 部署
npm run deploy
```

部署完成後，你的 server 會在 `https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev`。

### 驗證

```bash
curl https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/health
# {"status":"ok","version":"1.0.0","mcp_enabled":true,"write_enabled":true}
```

## 連接你的 AI 客戶端

### Claude.ai（Web + 手機）

> **重要：** 必須先在**網頁版**設定。設定完成後，iOS / Android app 自動可用。

1. 到 [claude.ai](https://claude.ai) → **Settings** → **Integrations**
2. 新增一個 **remote MCP server**
3. 輸入你的 server URL：`https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`
4. 打開手機上的 Claude — memory tools 已可使用

### ChatGPT（Web + 手機）

> **重要：** 必須先在**網頁版**開啟 **Developer Mode** 並新增 MCP server。設定完成後，手機 app 自動可用。

1. 到 [chatgpt.com](https://chatgpt.com) → **Settings** → **Connectors** → **Advanced**
2. 開啟 **Developer Mode**
3. 到 **Connectors** 分頁 → 新增 MCP server
4. 輸入你的 server URL：`https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`
5. 打開手機上的 ChatGPT — memory tools 已可使用

需要 Pro、Plus、Business、Enterprise 或 Education 方案。

### Claude Code（CLI）

在 Claude Code 設定檔（`~/.claude.json` 或專案 `.claude/settings.json`）加入：

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

或用 stdio proxy 做本地開發：

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

在 `~/.gemini/settings.json` 加入：

```json
{
  "mcpServers": {
    "memory": {
      "uri": "https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp"
    }
  }
}
```

Gemini CLI 支援 stdio、SSE、Streamable HTTP 三種傳輸協定，加上 OAuth 2.0 做遠端認證。

### Cursor

1. 開啟 **Cursor Settings** → **MCP**
2. 新增 server：
   - **Transport**：`streamable-http`
   - **URL**：`https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`

或在 `.cursor/mcp.json` 加入：

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

在 `.vscode/mcp.json` 加入：

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

需要 VS Code 1.99+ 搭配 GitHub Copilot extension。

### Windsurf

1. 開啟 **Windsurf Settings** → **MCP**
2. 加入你的 server URL：`https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`

### JetBrains IDEs（IntelliJ、WebStorm、PyCharm 等）

**Settings** → **Tools** → **MCP Server** → 加入你的 server URL。

透過 GitHub Copilot plugin 或 Windsurf plugin for JetBrains 使用。

### 其他客戶端

任何支援 **Streamable HTTP** 的 MCP 客戶端都可以連接：

```
https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp
```

只支援 **stdio** 的客戶端可以用附帶的 proxy：

```bash
MCP_MEMORY_API=https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev \
  node src/mcp-stdio-proxy.mjs
```

## 架構

```
客戶端（Claude / ChatGPT / Cursor / ...）
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
                │(SQLite)│  │(向量)   │  │(OAuth)  │
                └───────┘  └─────────┘  └─────────┘
```

### 語意搜尋原理

1. **儲存**時，標題 + 內容前 500 字會被 bge-m3 轉為 1024 維向量
2. 完整內容存入 D1（SQLite），向量存入 Vectorize
3. **搜尋**時，你的 query 用同一個模型做 embedding，Vectorize 回傳最近的向量
4. 從 D1 取出完整內容，附上相似度分數回傳

### 確定性 ID

每筆記憶的 ID = SHA-256(`type + title + content + repo + session_id`)。同一筆記憶儲存兩次會更新而非建立副本（upsert），且 `created_at` 保留原始值。

## 工具腳本

### 批次匯入

把知識檔（含 frontmatter 的 markdown）匯入 server：

```bash
MCP_MEMORY_API=https://your-worker.workers.dev \
KNOWLEDGE_DIR=~/.claude/knowledge \
  node scripts/batch-import.mjs
```

### Embedding 品質驗證

用 gold set 測試搜尋品質：

```bash
CLOUDFLARE_ACCOUNT_ID=xxx \
CLOUDFLARE_API_TOKEN=xxx \
  node scripts/eval-embedding.mjs
```

編輯 `tests/gold-set.json` 加入你自己的領域測試查詢。

## REST API

給不使用 MCP 的測試或整合用：

| Method | Endpoint | Body |
|--------|----------|------|
| POST | `/api/save` | `{ title, content, type, tags?, repo?, source?, session_id? }` |
| POST | `/api/search` | `{ query, limit?, type?, repo? }` |
| POST | `/api/delete` | `{ id }` |
| POST | `/api/list` | `{ type?, repo?, limit?, offset? }` |
| GET | `/health` | — |

## 設定

### 環境變數（wrangler.toml）

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `MCP_ENABLED` | `"true"` | 總開關 — 設為 `"false"` 停用整個 server |
| `WRITE_ENABLED` | `"true"` | 寫入開關 — 設為 `"false"` 讓 server 變成唯讀 |

## 安全性

此 server **沒有內建認證**。任何知道你 Worker URL 的人都可以透過 REST API 讀寫刪除記憶。

個人知識庫通常可以接受。如果需要更嚴格的存取控制：

- **建議：** 在 Worker 前面加 [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/) 要求登入
- **替代方案：** 在 `fetch` handler 裡加 Bearer token 驗證
- **CORS：** Server 預設回傳 `Access-Control-Allow-Origin: *`。如需限制哪些網站可以呼叫你的 API，修改 `src/index.ts` 的 CORS headers
- **緊急開關：** 在 `wrangler.toml` 設定 `WRITE_ENABLED = "false"` 讓 server 變成唯讀

## 費用

Cloudflare Workers Free 方案：

| 資源 | 免費額度 |
|------|---------|
| Workers | 100K requests/天 |
| D1 | 5M rows 讀取、100K rows 寫入/天 |
| Vectorize | 30M queried dimensions、10M stored dimensions/月 |
| Workers AI | 10K neurons/天（bge-m3） |

個人知識庫，免費額度綽綽有餘。

## 相關專案

如果你還需要 **AI 工程治理 skill**（boundary-first、spec planning、adversarial review），看 [ai-dev-toolkit](https://github.com/beach55607-max/ai-dev-toolkit)。

---

## English Summary

> Architecture diagrams, code blocks, and config examples are language-neutral — refer to the Chinese section above.

### What Is This

A semantic memory server for AI coding agents. Store knowledge, search by meaning, and let your AI assistant remember across sessions.

Built on **Cloudflare Workers** + **D1** (SQLite) + **Vectorize** (vector search) + **Workers AI** (bge-m3 embeddings).

### Tools

- **`memory_save`** — Save a memory with title, content, type, tags, and optional repo/session metadata
- **`memory_search`** — Semantic search: find relevant memories using natural language, not keywords
- **`memory_list`** — List and filter memories by type or repo
- **`memory_delete`** — Delete a memory by ID

### Memory Types

| Type | Use Case |
|------|----------|
| `knowledge` | Architecture decisions, gotchas, domain knowledge |
| `session` | Session summaries, what was done and why |
| `feedback` | User preferences, workflow corrections |
| `project` | Ongoing initiatives, deadlines, stakeholder context |

### Deploy

```bash
git clone https://github.com/beach55607-max/mcp-memory-server.git && cd mcp-memory-server
npm install
wrangler d1 create memory-db
wrangler vectorize create memory-index --dimensions=1024 --metric=cosine
wrangler kv namespace create OAUTH_KV
cp wrangler.toml.example wrangler.toml  # fill in your IDs
npm run db:init && npm run deploy
```

### Connect Your AI Client

| Platform | Setup Location | Mobile |
|----------|---------------|--------|
| **Claude.ai** | Web → Settings → Integrations → Add remote MCP server | Auto-syncs to iOS / Android after web setup |
| **ChatGPT** | Web → Settings → Connectors → Advanced → Enable Developer Mode → Add MCP server | Auto-syncs to mobile after web setup. Requires Pro/Plus/Business/Enterprise/Education |
| **Claude Code** | `~/.claude.json` → `mcpServers` → `type: "url"` | — |
| **Gemini CLI** | `~/.gemini/settings.json` → `mcpServers` → `uri` | — |
| **Cursor** | Settings → MCP → Transport: `streamable-http` | — |
| **VS Code + Copilot** | `.vscode/mcp.json` → `servers` → `type: "http"` | — |
| **Windsurf** | Settings → MCP → Add URL | — |
| **JetBrains** | Settings → Tools → MCP Server | — |
| **stdio-only clients** | Use the included `src/mcp-stdio-proxy.mjs` | — |

Server URL for all platforms: `https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`

### How Semantic Search Works

1. On **save**, title + first 500 chars are embedded into a 1024-dim vector (bge-m3)
2. Full content → D1 (SQLite); vector → Vectorize
3. On **search**, query is embedded with the same model, Vectorize returns nearest vectors
4. Full content is fetched from D1 and returned with similarity scores

### Deterministic IDs

Each memory gets a SHA-256 ID from `type + title + content + repo + session_id`. Same memory saved twice = upsert (update, preserving original `created_at`).

### Security

No built-in authentication. Anyone with your Worker URL can read/write/delete.

- **Recommended:** Add [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/) for login
- **Alternative:** Add Bearer token check in the `fetch` handler
- **CORS:** Returns `Access-Control-Allow-Origin: *` by default
- **Kill switch:** Set `WRITE_ENABLED = "false"` for read-only mode

### Cost

Cloudflare Workers Free plan covers a personal knowledge base easily: 100K requests/day, 5M D1 rows read/day, 10K AI neurons/day.

### Related

Need **AI engineering governance skills** (boundary-first, spec planning, adversarial review)? See [ai-dev-toolkit](https://github.com/beach55607-max/ai-dev-toolkit).

## License

MIT

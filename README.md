# MCP Memory Server

讓你的 AI coding agent 擁有跨 session 的長期記憶。一次部署到 Cloudflare Workers，所有平台通用。

## 解決什麼問題

AI coding agent（Claude Code、ChatGPT、Cursor 等）每次對話都從零開始。你上次的架構決策、踩過的坑、偏好的工作方式 — 全部忘光。

這個 server 讓你的 AI agent 可以：

- **記住** — 自動儲存對話中的重要發現、決策、偏好
- **回想** — 用自然語言搜尋，不是關鍵字比對
- **整理** — 自動歸檔過期記憶、去重、合併相似內容
- **保護** — 重要知識標記為「絕對真理」，永遠不被自動清理

### 使用前 vs 使用後

| 使用前 | 使用後 |
|--------|--------|
| 每次都要重新解釋專案架構 | Agent 自動載入相關記憶 |
| 同樣的 bug 踩兩次 | 踩坑教訓被記住，下次自動避開 |
| 「上次那個問題怎麼修的？」→ 翻對話紀錄 | 語意搜尋秒找到 |
| 換平台（Claude → ChatGPT）就失去所有 context | 所有平台共享同一份記憶 |
| 記憶越積越多，找不到有用的 | 每日自動整理：過期歸檔、重複去除、AI 判斷相關性 |

## 為什麼用 Cloudflare

| 特點 | 說明 |
|------|------|
| **免費** | Workers Free 方案包含 D1、Vectorize、Workers AI — 個人使用不花錢 |
| **全球部署** | 邊緣節點，哪裡用就哪裡快 |
| **Serverless** | 不用管 server、不用 Docker、不用 VPS |
| **安全** | OAuth 2.1 認證 + API 密鑰 + CORS 白名單 |
| **AI 內建** | Workers AI 直接用 — embedding + 文字生成，不需要另外接 OpenAI |

## 部署（三步）

**前置條件：** [Cloudflare 帳號](https://dash.cloudflare.com/sign-up)（免費）+ [Node.js](https://nodejs.org/) 18+ + [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)（`npm install -g wrangler`）

```bash
# 1. 登入 Cloudflare（只需做一次）
wrangler login

# 2. Clone
git clone https://github.com/beach55607-max/mcp-memory-server.git
cd mcp-memory-server

# 3. 自動設定 + 部署
bash setup.sh
```

`setup.sh` 會自動完成：安裝依賴 → 建立 D1/Vectorize/KV → 產生 wrangler.toml → 設定 API 密鑰 → 執行 migration → 部署。

部署完成後你會看到：

```
Your server is live at: https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev
MCP endpoint: https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp
```

### 部署後必做

設定 `ALLOWED_ORIGINS`，指定哪些網站可以連你的 server：

```bash
# 在 Cloudflare Dashboard → Workers → 你的 Worker → Settings → Variables
# 或直接改 wrangler.toml 後重新部署
ALLOWED_ORIGINS = "https://claude.ai,https://chatgpt.com"
```

## 連接你的 AI 客戶端

### Claude.ai（Web + 手機）

> **重要：** 先在**網頁版**設定 → 手機自動可用。

1. [claude.ai](https://claude.ai) → **Settings** → **Integrations**
2. 新增 **remote MCP server**
3. 貼上 `https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`
4. 打開手機 Claude — memory tools 已可使用

### ChatGPT（Web + 手機）

> **重要：** 先在**網頁版**開啟 **Developer Mode** → 手機自動可用。

1. [chatgpt.com](https://chatgpt.com) → **Settings** → **Connectors** → **Advanced**
2. 開啟 **Developer Mode**
3. **Connectors** → 新增 MCP server → 貼上 URL
4. 打開手機 ChatGPT — memory tools 已可使用

需要 Pro / Plus / Business / Enterprise / Education 方案。

### Claude Code（CLI）

`~/.claude.json`：

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

### Gemini CLI

`~/.gemini/settings.json`：

```json
{
  "mcpServers": {
    "memory": {
      "uri": "https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp"
    }
  }
}
```

### Cursor

Settings → MCP → Transport: `streamable-http` → URL: `https://...YOUR.../mcp`

### VS Code + GitHub Copilot

`.vscode/mcp.json`：

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

### Windsurf / JetBrains

Settings → MCP → 加入 server URL。

### stdio-only 客戶端

```bash
MCP_MEMORY_API=https://your-worker.workers.dev \
MCP_MEMORY_API_KEY=your-secret \
  node src/mcp-stdio-proxy.mjs
```

## 使用指南

### 日常使用

連上之後，你的 AI agent 會多出 7 個工具。你不需要手動呼叫 — 大多數場景 AI 會自己判斷何時使用。

**對話開始時**（自動）：
Agent 呼叫 `memory_auto_inject` 載入相關記憶。「絕對真理」一定會被載入。

**對話中**（按需）：
- 你告訴 agent「記住這個」→ agent 呼叫 `memory_save`
- 你問「上次那個問題怎麼解的」→ agent 呼叫 `memory_search`
- 你覺得某條記憶很重要永遠不能忘 → 告訴 agent「promote 這條」→ `memory_promote`

**對話結束時**（自動）：
Agent 呼叫 `memory_extract` 從對話中萃取值得記住的內容。高信心度的自動存入，低信心度的問你。

**背景自動**（每日 UTC 03:00）：
Cron 自動整理：90 天沒確認的歸檔、重複的去除、AI 判斷不相關的清掉、相似的合併。

### 記憶類型怎麼選

| 類型 | 什麼時候用 | 範例 |
|------|-----------|------|
| `knowledge` | 技術知識、架構決策 | 「D1 不支援 JOIN，要用 batch query」 |
| `feedback` | 你的偏好、工作風格 | 「不要用 emoji、回答要簡潔」 |
| `session` | 這次做了什麼 | 「修了 auth bug，改了 3 個檔案」 |
| `project` | 專案狀態、截止日 | 「v2.0 要在 4/15 前完成」 |

### 絕對真理

`memory_promote` 可以把一條記憶升級為「絕對真理」（confidence=1.0）。效果：

- 每次對話開始**一定會被載入**（不受數量限制）
- **不會被自動清理**（cron 衰減、去重、合併全跳過）
- 衝突時**永遠贏**
- 只有 active 狀態的記憶才能被 promote

適合用在：公司規定、團隊約定、永遠不能搞錯的事實。

## 7 個 MCP 工具詳細

| 工具 | 說明 | 重要參數 |
|------|------|---------|
| `memory_save` | 儲存記憶 | `title`, `content`, `type`, `confidence`, `scope`, `platform` |
| `memory_search` | 語意搜尋 | `query`, `full_content`（false=只回摘要，省 token） |
| `memory_list` | 列出記憶 | `status`（active/legacy/all）, `cursor`（分頁） |
| `memory_delete` | 刪除記憶 | `id` |
| `memory_promote` | 升級為絕對真理 | `id` |
| `memory_auto_inject` | 載入相關記憶 | `context`（描述當前任務） |
| `memory_extract` | 從對話萃取 | `conversation`（最多 10000 字） |

## 架構

```
客戶端（Claude / ChatGPT / Cursor / ...）
  │
  ├── MCP Streamable HTTP ──→ /mcp (OAuth 2.1)
  │
  └── REST API ──────────────→ /api/* (API_SECRET)
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                ┌───┴───┐  ┌────┴────┐  ┌────┴────┐
                │  D1   │  │Vectorize│  │Workers AI│
                │(SQLite)│  │(向量)   │  │bge-m3   │
                └───────┘  └─────────┘  │llama-3.1│
                                        └─────────┘
                    │
                ┌───┴───┐
                │  KV   │
                │(OAuth)│
                └───────┘

Cron（每日 UTC 03:00）──→ 衰減 → 去重 → AI 判斷 → 自動合併
```

### Cloudflare 資源用量（免費額度）

| 資源 | 用途 | 免費額度 |
|------|------|---------|
| Workers | HTTP server + cron | 100K requests/天 |
| D1 | 記憶儲存 | 5M rows 讀、100K rows 寫/天 |
| Vectorize | 語意向量索引 | 30M queried、10M stored dimensions/月 |
| Workers AI | bge-m3 embedding + llama-3.1-8b 文字生成 | 10K neurons/天（共享） |
| KV | OAuth token | 100K reads、1K writes/天 |

AI 功能超額時 graceful 降級 — 跳過摘要/判斷，不影響核心 CRUD。

## 安全性

| 層級 | 機制 |
|------|------|
| MCP 端點 | OAuth 2.1（PKCE S256，scope 白名單：`memory:read`, `memory:write`） |
| REST API | `API_SECRET` 共享密鑰（生產環境必須設定） |
| CORS | Origin 白名單（不使用 wildcard `*`），需設定 `ALLOWED_ORIGINS` |
| Input | 消毒 script/iframe/object/embed/event handlers/javascript: URI |

**重要提醒：**
- `API_SECRET` 必須設定（`wrangler secret put API_SECRET`）
- `DEV_MODE` 永遠不要在生產環境開啟
- 建議加 [Cloudflare Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- 詳見 [SECURITY.md](SECURITY.md)

## 環境變數

### 核心

| 變數 | 預設 | 說明 |
|------|------|------|
| `MCP_ENABLED` | `"true"` | 總開關 |
| `WRITE_ENABLED` | `"true"` | 寫入開關 |
| `ALLOWED_ORIGINS` | `""` | CORS 允許的來源（逗號分隔） |
| `DEV_MODE` | `"false"` | 開發模式 — **生產環境永遠不要開** |

### AI 功能

| 變數 | 預設 | 說明 |
|------|------|------|
| `CRON_ENABLED` | `"true"` | 每日治理 cron |
| `SUMMARY_ENABLED` | `"true"` | AI 摘要（消耗 neurons） |
| `SUPERSEDE_ENABLED` | `"true"` | 自動取代相似記憶 |

### Cron 調參（免部署）

| 變數 | 預設 | 範圍 | 說明 |
|------|------|------|------|
| `DECAY_DAYS` | 90 | 1-365 | 幾天未確認就歸檔 |
| `AI_SAMPLE_SIZE` | 20 | 1-100 | 每次 cron AI 判斷幾筆 |
| `ARCHIVE_CAP` | 50 | 1-500 | 每次 cron 最多歸檔幾筆 |
| `CONSOLIDATION_SIM` | 0.85 | 0.5-1.0 | 合併相似度門檻 |

### 密鑰

| 變數 | 設定方式 |
|------|---------|
| `API_SECRET` | `wrangler secret put API_SECRET` |

## REST API

| Method | Endpoint | 說明 | 認證 |
|--------|----------|------|------|
| POST | `/api/save` | 儲存記憶 | X-API-Key |
| POST | `/api/search` | 語意搜尋 | X-API-Key |
| POST | `/api/list` | 列出記憶 | X-API-Key |
| POST | `/api/delete` | 刪除記憶 | X-API-Key |
| POST | `/api/promote` | 升級為絕對真理 | X-API-Key |
| POST | `/api/auto-inject` | 載入相關記憶 | X-API-Key |
| POST | `/api/extract` | 從對話萃取 | X-API-Key |
| POST | `/api/exists` | 檢查 ID 是否存在 | X-API-Key |
| POST | `/api/exists-session` | 檢查 session 是否存在 | X-API-Key |
| GET | `/health` | 健康檢查 | 公開 |

## 工具腳本

```bash
# 批次匯入知識庫
MCP_MEMORY_API=https://your-worker.workers.dev \
MCP_MEMORY_API_KEY=your-secret \
  node scripts/batch-import.mjs

# Embedding 品質驗證
CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_API_TOKEN=xxx \
  node scripts/eval-embedding.mjs

# Structural test（37 項檢查）
npm run test:check
```

## 相關專案

- [ai-dev-toolkit](https://github.com/beach55607-max/ai-dev-toolkit) — AI 工程治理 skill（boundary-first、spec planning、adversarial review）

---

## English Summary

> Architecture diagrams, code blocks, and config examples are language-neutral — refer to the Chinese section above.

### What Is This

A semantic memory server for AI coding agents. Deploy once to **Cloudflare Workers** (free tier), use from any MCP-compatible client. Your AI remembers across sessions, platforms, and projects.

**The problem:** AI agents start fresh every conversation. Architecture decisions, debugging lessons, your preferences — all forgotten.

**The solution:** This server gives your AI agent persistent semantic memory with automatic governance: decay stale memories, deduplicate, AI-judge relevance, consolidate similar entries.

### Why Cloudflare

Free (D1 + Vectorize + Workers AI included), global edge deployment, serverless (no Docker/VPS), built-in AI models (no external API keys needed for embedding + text generation).

### Deploy (3 steps)

```bash
wrangler login                    # one-time Cloudflare auth
git clone https://github.com/beach55607-max/mcp-memory-server.git && cd mcp-memory-server
bash setup.sh                     # auto: install → create resources → config → migrate → deploy
```

### 7 MCP Tools

| Tool | Description |
|------|-------------|
| `memory_save` | Save with auto-summary, scope inference, conflict detection, dedup |
| `memory_search` | Semantic search with summary-only mode and conflict auto-resolution |
| `memory_list` | List with filters, cursor pagination |
| `memory_delete` | Delete with vector cleanup + reverse reference cleanup |
| `memory_promote` | Promote to Absolute Truth (confidence=1.0), protected from cleanup |
| `memory_auto_inject` | Load relevant memories at conversation start. Absolute Truths always included |
| `memory_extract` | AI extracts memories from conversation. Auto-saves high confidence (with dedup) |

### How It Works In Practice

1. **Conversation starts** → agent calls `memory_auto_inject` → loads relevant memories + Absolute Truths
2. **During conversation** → you say "remember this" → agent calls `memory_save`
3. **Conversation ends** → agent calls `memory_extract` → saves key findings automatically
4. **Daily (UTC 03:00)** → cron archives stale entries, deduplicates, AI judges relevance, consolidates similar

### Connect Your AI Client

| Platform | Setup | Mobile |
|----------|-------|--------|
| **Claude.ai** | Web → Settings → Integrations → Add remote MCP server | Auto-syncs to iOS/Android after web setup |
| **ChatGPT** | Web → Settings → Connectors → Advanced → Enable Developer Mode → Add MCP | Auto-syncs to mobile (Pro/Plus/Business/Enterprise/Education) |
| **Claude Code** | `~/.claude.json` → `mcpServers` → `type: "url"` | — |
| **Gemini CLI** | `~/.gemini/settings.json` → `mcpServers` → `uri` | — |
| **Cursor** | Settings → MCP → Transport: `streamable-http` | — |
| **VS Code + Copilot** | `.vscode/mcp.json` → `servers` → `type: "http"` | — |
| **Windsurf / JetBrains** | Settings → MCP → Add URL | — |
| **stdio-only** | `src/mcp-stdio-proxy.mjs` with `MCP_MEMORY_API` + `MCP_MEMORY_API_KEY` | — |

### Security

- OAuth 2.1 on MCP endpoint (PKCE S256, scope whitelist)
- API_SECRET required for REST API in production
- CORS origin allowlist (no wildcard). Configure `ALLOWED_ORIGINS`
- Input sanitization (script/iframe/object/embed/event handlers/javascript: URI)
- See [SECURITY.md](SECURITY.md)

### Related

[ai-dev-toolkit](https://github.com/beach55607-max/ai-dev-toolkit) — AI engineering governance skills (boundary-first, spec planning, adversarial review)

## License

MIT

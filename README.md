# MCP Memory Server

Long-term memory for AI coding agents — works with **Claude Code, ChatGPT, Cursor, Gemini CLI, VS Code Copilot, Windsurf, Claude Desktop, Codex CLI**. Deploy once to Cloudflare Workers (free tier), use everywhere.

讓你的 AI coding agent 擁有跨 session 的長期記憶。一次部署，所有 MCP 平台通用。

## 解決什麼問題

AI coding agent（Claude Code、ChatGPT、Cursor 等）每次對話都從零開始。你上次的架構決策、踩過的坑、偏好的工作方式 — 全部忘光。

這個 server 讓你的 AI agent 可以：

- **記住** — AI 主動判斷並儲存對話中的重要發現、決策、偏好
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
你的 server 已上線：https://mcp-memory-server.你的子網域.workers.dev
MCP 端點：https://mcp-memory-server.你的子網域.workers.dev/mcp
```

### 部署後必做

設定 `ALLOWED_ORIGINS`，指定哪些網站可以連你的 server：

```bash
# 在 Cloudflare Dashboard → Workers → 你的 Worker → Settings → Variables
# 或直接改 wrangler.toml 後重新部署
ALLOWED_ORIGINS = "https://claude.ai,https://chatgpt.com"
```

## 記憶怎麼存入

| 什麼 | 自動程度 | 原理 |
|------|---------|------|
| 對話開始載入記憶 | 自動 | system prompt 指示 AI 呼叫 `memory_auto_inject` |
| 對話中存重要發現 | AI 判斷 | system prompt 定義觸發條件，AI 自己決定要不要存 |
| 使用者說「記住」 | 使用者觸發 | AI 收到指令後呼叫 `memory_save`，confidence=1.0 |
| 每日清理/去重/合併 | 全自動 | Cron job（UTC 03:00），不需人工 |
| Session 結束存入 | 不保證 | 靠 hook 或 AI 主動，平台限制多 |

**主要機制是 AI 主動存**（需在 system prompt 設定觸發條件）。不是「裝好就自動存」— AI 需要被告知什麼時候該存。

詳細四層架構：

| 層級 | 機制 | 平台 | 說明 |
|:----:|------|------|------|
| **1** | **AI 主動存** | 所有平台 | AI 在對話中判斷什麼重要，主動呼叫 `memory_save`。靠 system prompt 驅動 |
| 2 | Push hook | Claude Code | `git push` 後提示 AI 回顧並存入（PostToolUse command hook） |
| 3 | Stop hook | Claude Code | session 結束時提示 AI 存入（command type，不保證觸發） |
| 4 | Codex wrapper | Codex CLI | bash script 在 Codex 結束後透過 REST API 存入。僅限 Codex 獨立運行且無 workspace 記憶指示時需要；有 AGENTS.md 的 workspace 中 Codex 走 Layer 1 |

**Supersede 保護**：`source=auto-extract` 的記憶不可取代其他來源的記憶，確保弱 AI 判斷不會覆蓋強 AI 或人類的決定。

## 連接你的 AI 客戶端

以下範例中，請把 `你的子網域` 替換成你的 Cloudflare Workers 子網域，`你的密碼` 替換成你在 setup.sh 設定的 API_SECRET。

### Claude.ai（Web + 手機）

> **重要：** 先在**網頁版**設定 → 手機自動可用。

1. [claude.ai](https://claude.ai) → **Settings** → **Integrations**
2. 新增 **remote MCP server**
3. 貼上 `https://mcp-memory-server.你的子網域.workers.dev/mcp`
4. 打開手機 Claude — memory tools 已可使用

### ChatGPT（Web + 手機）

> **重要：** 先在**網頁版**開啟 **Developer Mode** → 手機自動可用。

1. [chatgpt.com](https://chatgpt.com) → **Settings** → **Connectors** → **Advanced**
2. 開啟 **Developer Mode**
3. **Connectors** → 新增 MCP server → 貼上 `https://mcp-memory-server.你的子網域.workers.dev/mcp`
4. 打開手機 ChatGPT — memory tools 已可使用

需要 Pro / Plus / Business / Enterprise / Education 方案。

### Claude Code（CLI）

**方式 A：遠端連接（Streamable HTTP）** — 直接連你的 Worker：

```json
// ~/.claude.json 或 .claude/settings.json
{
  "mcpServers": {
    "memory": {
      "type": "url",
      "url": "https://mcp-memory-server.你的子網域.workers.dev/mcp"
    }
  }
}
```

**方式 B：stdio proxy** — 透過本地 proxy 轉發到 REST API：

CLI 一行加入（注意 `-e` 和 `-s` 要在 name 之前，command 用 `--` 隔開）：

```bash
claude mcp add \
  -e MCP_MEMORY_API=https://mcp-memory-server.你的子網域.workers.dev \
  -e MCP_MEMORY_API_KEY=你的密碼 \
  -s user \
  memory -- node /path/to/mcp-memory-server/src/mcp-stdio-proxy.mjs
```

或手動編輯 `~/.claude.json`：

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/mcp-memory-server/src/mcp-stdio-proxy.mjs"],
      "env": {
        "MCP_MEMORY_API": "https://mcp-memory-server.你的子網域.workers.dev",
        "MCP_MEMORY_API_KEY": "你的密碼"
      }
    }
  }
}
```

### Codex CLI

```bash
codex mcp add memory \
  --env MCP_MEMORY_API=https://mcp-memory-server.你的子網域.workers.dev \
  --env MCP_MEMORY_API_KEY=你的密碼 \
  -- node /path/to/mcp-memory-server/src/mcp-stdio-proxy.mjs
```

### Gemini CLI

`~/.gemini/settings.json`：

```json
{
  "mcpServers": {
    "memory": {
      "uri": "https://mcp-memory-server.你的子網域.workers.dev/mcp"
    }
  }
}
```

### Cursor

Settings → MCP → Transport: `streamable-http` → URL: `https://mcp-memory-server.你的子網域.workers.dev/mcp`

或 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "memory": {
      "transport": "streamable-http",
      "url": "https://mcp-memory-server.你的子網域.workers.dev/mcp"
    }
  }
}
```

### VS Code + GitHub Copilot

`.vscode/mcp.json`：

```json
{
  "servers": {
    "memory": {
      "type": "http",
      "url": "https://mcp-memory-server.你的子網域.workers.dev/mcp"
    }
  }
}
```

需要 VS Code 1.99+ 搭配 GitHub Copilot extension。

### Windsurf / JetBrains

Settings → MCP → 加入 `https://mcp-memory-server.你的子網域.workers.dev/mcp`。

### 其他 stdio-only 客戶端

```bash
MCP_MEMORY_API=https://mcp-memory-server.你的子網域.workers.dev \
MCP_MEMORY_API_KEY=你的密碼 \
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

**對話結束時**（最佳做法）：
Agent 主動呼叫 `memory_save` 存入本次重要發現。`memory_extract` 仍可手動使用，但**主要機制是 AI 主動存**，不依賴 session 結束時的自動萃取。

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

| 工具 | 說明 | 全部參數 |
|------|------|---------|
| `memory_save` | 儲存記憶（自動摘要、scope 推斷、衝突偵測、去重） | `title`\*, `content`\*, `type`\*, `tags?`, `repo?`, `source?`, `session_id?`, `scope?`, `platform?`, `confidence?` |
| `memory_search` | 語意搜尋（摘要模式、衝突自動解決） | `query`\*, `limit?`, `type?`, `repo?`, `scope?`, `include_legacy?`, `full_content?` |
| `memory_list` | 列出記憶（cursor 分頁） | `type?`, `repo?`, `status?`, `scope?`, `limit?`, `cursor?`, `offset?` |
| `memory_delete` | 刪除記憶（向量清理 + 反向引用清理） | `id`\* |
| `memory_promote` | 升級為絕對真理（僅 active 可升級） | `id`\* |
| `memory_auto_inject` | 載入相關記憶（絕對真理強制注入） | `context`\*, `repo?`, `platform?`, `limit?` |
| `memory_extract` | 從對話萃取記憶（含查重、高信心自動存入） | `conversation`\*, `repo?`, `platform?` |

\* = 必填，? = 選填

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
MCP_MEMORY_API=https://mcp-memory-server.你的子網域.workers.dev \
MCP_MEMORY_API_KEY=你的密碼 \
  node scripts/batch-import.mjs

# Embedding 品質驗證
CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_API_TOKEN=xxx \
  node scripts/eval-embedding.mjs

# Structural test（38 項檢查）
npm run test:check
```

## 已知限制

### Codex CLI exec 模式下 MCP tool call 會失敗

**影響版本**：codex-cli 0.117.0（2026-04-05 確認）

Codex CLI 的非互動模式（`codex exec --full-auto`、`codex:codex-rescue`）對 MCP tool call 強制要求 user approval。非互動模式下無人批准 → 自動 cancel，顯示 `user cancelled MCP tool call`。

**這不是 MCP Memory Server 的問題，是 Codex CLI 的已知限制。**

| 使用方式 | MCP memory tools | 狀態 |
|---------|:----------------:|:----:|
| `codex`（互動模式） | 手動批准後正常 | OK |
| `codex exec --full-auto` | 自動 cancel | 不可用 |
| 從 Claude Code 呼叫 Codex | 記憶由 Claude Code 負責 | OK |

**Workaround**：
- 互動模式下手動批准 MCP 呼叫
- 在有 workspace instructions（AGENTS.md / CLAUDE.md）的環境中，Codex 互動模式會自己判斷何時存記憶
- `codex exec --dangerously-bypass-approvals-and-sandbox` 可繞過，但風險高，不建議日常使用

## 更新紀錄

| 版本 | 日期 | 變更 |
|------|------|------|
| v2.1 | 2026-04-05 | 記憶存入機制重設計：四層架構（AI 主動存為主）、supersede source 保護、Stop hook 改 command type、Codex wrapper script |
| v2.0 | 2026-04-05 | Phase 2 公開發布：記憶治理 + 自動化 13 項功能、OAuth 2.1、6 平台支援 |
| v1.0 | 2026-04-02 | 初版：7 MCP 工具、D1 + Vectorize、基礎 CRUD |

## 相關專案

- [ai-dev-toolkit](https://github.com/beach55607-max/ai-dev-toolkit) — AI 工程治理 skill（boundary-first、spec planning、adversarial review）

---

## English Summary

### What Is This

A semantic memory server for AI coding agents. Deploy once to **Cloudflare Workers** (free tier), use from any MCP-compatible client. Your AI remembers across sessions, platforms, and projects.

**The problem:** AI agents start fresh every conversation. Architecture decisions, debugging lessons, your preferences — all forgotten.

**The solution:** This server gives your AI agent persistent semantic memory with automatic governance: decay stale memories, deduplicate, AI-judge relevance, consolidate similar entries.

### Why Cloudflare

| Feature | Details |
|---------|---------|
| **Free** | Workers Free plan includes D1, Vectorize, Workers AI — personal use costs nothing |
| **Global** | Edge deployment, fast from anywhere |
| **Serverless** | No Docker, no VPS, no server management |
| **Secure** | OAuth 2.1 + API key + CORS allowlist |
| **AI built-in** | Workers AI for embedding + text generation — no external API keys needed |

### Deploy (3 steps)

```bash
wrangler login                    # one-time Cloudflare auth
git clone https://github.com/beach55607-max/mcp-memory-server.git && cd mcp-memory-server
bash setup.sh                     # auto: install → create resources → config → migrate → deploy
```

After deploy, set `ALLOWED_ORIGINS` to specify which websites can access your server:

```
ALLOWED_ORIGINS = "https://claude.ai,https://chatgpt.com"
```

### 7 MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `memory_save` | Save with auto-summary, scope inference, conflict detection, dedup | `title`\*, `content`\*, `type`\*, `tags?`, `repo?`, `source?`, `session_id?`, `scope?`, `platform?`, `confidence?` |
| `memory_search` | Semantic search with summary-only mode and conflict auto-resolution | `query`\*, `limit?`, `type?`, `repo?`, `scope?`, `include_legacy?`, `full_content?` |
| `memory_list` | List with filters, cursor pagination | `type?`, `repo?`, `status?`, `scope?`, `limit?`, `cursor?`, `offset?` |
| `memory_delete` | Delete with vector cleanup + reverse reference cleanup | `id`\* |
| `memory_promote` | Promote to Absolute Truth (confidence=1.0). Active entries only | `id`\* |
| `memory_auto_inject` | Load relevant memories at conversation start. Absolute Truths always included | `context`\*, `repo?`, `platform?`, `limit?` |
| `memory_extract` | AI extracts memories from conversation. Auto-saves high confidence (with dedup) | `conversation`\*, `repo?`, `platform?` |

\* = required, ? = optional

### How Memories Are Saved

| What | Automation Level | How |
|------|-----------------|-----|
| Load memories at conversation start | Automatic | System prompt instructs AI to call `memory_auto_inject` |
| Save important findings during conversation | AI judgment | System prompt defines triggers; AI decides when to save |
| User says "remember this" | User-triggered | AI calls `memory_save` with confidence=1.0 |
| Daily cleanup / dedup / consolidation | Fully automatic | Cron job (UTC 03:00), no human intervention |
| Save at session end | Not guaranteed | Depends on hooks or AI initiative; platform limitations apply |

The primary mechanism is **AI proactive save** (requires system prompt configuration). It's not "install and it auto-saves" — AI needs to be told when to save.

4-layer architecture:

| Layer | Mechanism | Platform | Description |
|:-----:|-----------|----------|-------------|
| **1** | **AI proactive save** | All platforms | AI decides what's important and calls `memory_save`. Driven by system prompt |
| 2 | Push hook | Claude Code | After `git push`, prompts AI to review and save (PostToolUse command hook) |
| 3 | Stop hook | Claude Code | On session end, prompts AI to save (command type, not guaranteed) |
| 4 | Codex wrapper | Codex CLI | Bash script saves session summary via REST API. Only needed when Codex runs standalone without workspace memory instructions; in workspaces with AGENTS.md, Codex uses Layer 1 |

**Supersede protection**: memories with `source=auto-extract` cannot supersede memories from other sources. This ensures weak AI judgments don't overwrite decisions made by strong AI or humans.

### Connect Your AI Client

In the examples below, replace `YOUR_SUBDOMAIN` with your Cloudflare Workers subdomain, and `your-secret` with the API_SECRET you set during setup.

#### Claude.ai (Web + Mobile)

> **Important:** Set up on the **web version** first. Once configured, it automatically works on the iOS / Android app.

1. Go to [claude.ai](https://claude.ai) → **Settings** → **Integrations**
2. Add a new **remote MCP server**
3. Enter: `https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`
4. Open Claude on your phone — memory tools are now available

#### ChatGPT (Web + Mobile)

> **Important:** Enable **Developer Mode** on the **web version** first. Once configured, it works on the mobile app.

1. Go to [chatgpt.com](https://chatgpt.com) → **Settings** → **Connectors** → **Advanced**
2. Toggle on **Developer Mode**
3. Go to **Connectors** → Add MCP server → Enter: `https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`
4. Open ChatGPT on your phone — memory tools are now available

Requires Pro, Plus, Business, Enterprise, or Education plan.

#### Claude Code (CLI)

**Option A: Remote (Streamable HTTP)** — connect directly to your Worker:

```json
// ~/.claude.json or .claude/settings.json
{
  "mcpServers": {
    "memory": {
      "type": "url",
      "url": "https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp"
    }
  }
}
```

**Option B: stdio proxy** — local proxy forwarding to REST API:

```bash
claude mcp add \
  -e MCP_MEMORY_API=https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev \
  -e MCP_MEMORY_API_KEY=your-secret \
  -s user \
  memory -- node /path/to/mcp-memory-server/src/mcp-stdio-proxy.mjs
```

Note: `-e` and `-s` must come before the name, command is after `--`.

#### Codex CLI

```bash
codex mcp add memory \
  --env MCP_MEMORY_API=https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev \
  --env MCP_MEMORY_API_KEY=your-secret \
  -- node /path/to/mcp-memory-server/src/mcp-stdio-proxy.mjs
```

#### Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "memory": {
      "uri": "https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp"
    }
  }
}
```

#### Cursor

Settings → MCP → Transport: `streamable-http` → URL: `https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`

#### VS Code + GitHub Copilot

`.vscode/mcp.json`:

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

#### Windsurf / JetBrains

Settings → MCP → Add `https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev/mcp`.

#### Other stdio-only clients

```bash
MCP_MEMORY_API=https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev \
MCP_MEMORY_API_KEY=your-secret \
  node src/mcp-stdio-proxy.mjs
```

### Security

- **OAuth 2.1** on MCP endpoint (PKCE S256, scope whitelist: `memory:read`, `memory:write`)
- **API_SECRET** required for REST API in production (`wrangler secret put API_SECRET`)
- **CORS** origin allowlist (no wildcard `*`). Configure `ALLOWED_ORIGINS`
- **Input sanitization**: strips script/iframe/object/embed/event handlers/javascript: URI
- **DEV_MODE**: never enable in production (bypasses API_SECRET, allows localhost CORS)
- **Rate limiting**: configure [Cloudflare Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/) after deployment
- See [SECURITY.md](SECURITY.md)

### Scripts

```bash
# Batch import knowledge files
MCP_MEMORY_API=https://mcp-memory-server.YOUR_SUBDOMAIN.workers.dev \
MCP_MEMORY_API_KEY=your-secret \
  node scripts/batch-import.mjs

# Embedding quality evaluation
CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_API_TOKEN=xxx \
  node scripts/eval-embedding.mjs

# Structural test (38 checks)
npm run test:check
```

### Related

[ai-dev-toolkit](https://github.com/beach55607-max/ai-dev-toolkit) — AI engineering governance skills (boundary-first, spec planning, adversarial review)

## Known Limitations

### Codex CLI exec mode: MCP tool calls fail

**Affected version**: codex-cli 0.117.0 (confirmed 2026-04-05)

Codex CLI's non-interactive mode (`codex exec --full-auto`, `codex:codex-rescue`) requires user approval for MCP tool calls. In non-interactive mode, no one can approve → auto-cancel with `user cancelled MCP tool call`.

**This is a Codex CLI limitation, not a Memory Server issue.**

| Usage | MCP memory tools | Status |
|-------|:----------------:|:------:|
| `codex` (interactive) | Manually approve → works | OK |
| `codex exec --full-auto` | Auto-cancel | Broken |
| Called from Claude Code | Claude Code handles memory | OK |

**Workarounds**:

- Use interactive mode and approve MCP calls manually
- In workspaces with AGENTS.md / CLAUDE.md, Codex interactive mode will proactively save via Layer 1
- `codex exec --dangerously-bypass-approvals-and-sandbox` bypasses all approval (use with caution)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v2.1 | 2026-04-05 | Memory save redesign: 4-layer architecture (AI proactive save as primary), supersede source protection, Stop hook changed to command type, Codex wrapper script |
| v2.0 | 2026-04-05 | Phase 2 public release: memory governance + 13 automation features, OAuth 2.1, 6-platform support |
| v1.0 | 2026-04-02 | Initial release: 7 MCP tools, D1 + Vectorize, basic CRUD |

## License

MIT

#!/usr/bin/env bash
# setup.sh — Automated setup for MCP Memory Server
# Prerequisites: Cloudflare account + wrangler login
# Usage: bash setup.sh
set -euo pipefail

echo "=== MCP Memory Server Setup ==="
echo ""

# --- Check prerequisites ---
if ! command -v wrangler &> /dev/null; then
  echo "Error: wrangler CLI not found."
  echo "Install: npm install -g wrangler"
  exit 1
fi

if ! command -v node &> /dev/null; then
  echo "Error: Node.js not found."
  echo "Install: https://nodejs.org/"
  exit 1
fi

# Check wrangler login
if ! wrangler whoami &> /dev/null; then
  echo "Not logged in to Cloudflare. Running wrangler login..."
  wrangler login
fi

echo "Logged in as: $(wrangler whoami 2>&1 | head -1)"
echo ""

# --- Install dependencies ---
echo "[1/6] Installing dependencies..."
npm install --silent
echo "  Done."

# --- Create Cloudflare resources ---
echo "[2/6] Creating Cloudflare resources..."

# D1 Database
echo "  Creating D1 database..."
D1_OUTPUT=$(wrangler d1 create memory-db 2>&1) || true
D1_ID=$(echo "$D1_OUTPUT" | grep -oP 'database_id\s*=\s*"\K[^"]+' || echo "")
if [ -z "$D1_ID" ]; then
  # Database might already exist
  D1_ID=$(echo "$D1_OUTPUT" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || echo "")
fi
if [ -z "$D1_ID" ]; then
  echo "  Warning: Could not extract D1 database ID. You may need to fill it manually."
  echo "  Output was: $D1_OUTPUT"
  D1_ID="<FILL_MANUALLY>"
fi
echo "  D1 database ID: $D1_ID"

# Vectorize Index
echo "  Creating Vectorize index..."
wrangler vectorize create memory-index --dimensions=1024 --metric=cosine 2>&1 || echo "  (index may already exist)"

# KV Namespace
echo "  Creating KV namespace..."
KV_OUTPUT=$(wrangler kv namespace create OAUTH_KV 2>&1) || true
KV_ID=$(echo "$KV_OUTPUT" | grep -oP 'id\s*=\s*"\K[^"]+' || echo "")
if [ -z "$KV_ID" ]; then
  KV_ID=$(echo "$KV_OUTPUT" | grep -oP '[0-9a-f]{32}' | head -1 || echo "")
fi
if [ -z "$KV_ID" ]; then
  echo "  Warning: Could not extract KV namespace ID. You may need to fill it manually."
  echo "  Output was: $KV_OUTPUT"
  KV_ID="<FILL_MANUALLY>"
fi
echo "  KV namespace ID: $KV_ID"

# --- Generate wrangler.toml ---
echo "[3/6] Generating wrangler.toml..."
if [ -f wrangler.toml ]; then
  echo "  wrangler.toml already exists. Backing up to wrangler.toml.bak"
  cp wrangler.toml wrangler.toml.bak
fi

sed \
  -e "s/<YOUR_D1_DATABASE_ID>/$D1_ID/" \
  -e "s/<YOUR_KV_NAMESPACE_ID>/$KV_ID/" \
  wrangler.toml.example > wrangler.toml

echo "  Generated wrangler.toml with your resource IDs."

# --- Set API_SECRET ---
echo "[4/6] Setting API_SECRET..."
echo "  This protects your REST API endpoints."
echo "  Enter a secret (or press Enter to generate one):"
read -r USER_SECRET
if [ -z "$USER_SECRET" ]; then
  USER_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "  Generated: $USER_SECRET"
  echo "  Save this somewhere safe — you'll need it for batch-import and stdio proxy."
fi
echo "$USER_SECRET" | wrangler secret put API_SECRET 2>&1
echo "  API_SECRET set."

# --- Run migrations ---
echo "[5/6] Running database migrations..."
wrangler d1 execute memory-db --remote --file=migrations/0001_init.sql 2>&1
echo "  Migration 0001 applied."
wrangler d1 execute memory-db --remote --file=migrations/0002_schema_upgrade.sql 2>&1
echo "  Migration 0002 applied."
wrangler d1 execute memory-db --remote --file=migrations/0003_add_summary.sql 2>&1
echo "  Migration 0003 applied."

# --- Deploy ---
echo "[6/6] Deploying to Cloudflare Workers..."
DEPLOY_OUTPUT=$(npm run deploy 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract URL
WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oP 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1 || echo "")

echo ""
echo "=== Setup Complete ==="
echo ""
if [ -n "$WORKER_URL" ]; then
  echo "Your server is live at: $WORKER_URL"
  echo ""
  echo "Health check:  curl $WORKER_URL/health"
  echo "MCP endpoint:  $WORKER_URL/mcp"
  echo ""
  echo "Next steps:"
  echo "  1. Set ALLOWED_ORIGINS in Cloudflare Dashboard or wrangler.toml"
  echo "     Example: ALLOWED_ORIGINS = \"https://claude.ai,https://chatgpt.com\""
  echo "  2. Connect your AI client (see README.md for instructions)"
  echo "  3. (Recommended) Set up Cloudflare Rate Limiting rules"
else
  echo "Deploy output did not contain a worker URL."
  echo "Check the output above for your worker URL."
fi
echo ""
echo "API_SECRET for batch-import / stdio proxy: $USER_SECRET"

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Injective buildathon — scaffold setup (no project implementation)"

if ! command -v node >/dev/null; then
  echo "Install Node.js 20+"
  exit 1
fi
echo "Node: $(node --version)"

if ! command -v git >/dev/null; then
  echo "Install git"
  exit 1
fi

if [ ! -d .git ]; then
  git init -b main
fi

mkdir -p vendor

if [ ! -d vendor/mcp-server/.git ]; then
  echo "==> Cloning InjectiveLabs/mcp-server into vendor/mcp-server"
  git clone --depth 1 https://github.com/InjectiveLabs/mcp-server.git vendor/mcp-server
else
  echo "==> vendor/mcp-server already present (git pull skipped)"
fi

echo "==> Building trading MCP server"
npm install --prefix vendor/mcp-server
npm run build --prefix vendor/mcp-server

bash "$ROOT/scripts/install-skills.sh"

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "==> Created .env from .env.example (INJECTIVE_NETWORK=testnet)"
fi

echo ""
echo "Next:"
echo "  1. Reload Cursor so .cursor/mcp.json is picked up"
echo "  2. Run: npm run doctor"
echo "  3. Read brainstorm/AGENTPROOF.md before writing app code"
echo "Done."

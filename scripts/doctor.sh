#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ok=true

check() {
  if "$@" >/dev/null 2>&1; then
    echo "OK   $*"
  else
    echo "FAIL $*"
    ok=false
  fi
}

echo "==> Injective scaffold doctor"
command -v node >/dev/null && echo "OK   node $(node -v)" || { echo "FAIL node"; ok=false; }
command -v git >/dev/null && echo "OK   git" || { echo "FAIL git"; ok=false; }

[ -f vendor/mcp-server/dist/mcp/server.js ] && echo "OK   trading MCP built" || echo "WARN trading MCP not built (npm run setup)"
[ -d .agents/skills/injective-mcp-servers ] && echo "OK   injective-mcp-servers skill" || echo "WARN skills missing (npm run skills:install)"

if [ -x scripts/validate-gateway-deploy.sh ]; then
  bash scripts/validate-gateway-deploy.sh && echo "OK   gateway deploy script validation" || { echo "FAIL gateway deploy script validation"; ok=false; }
else
  echo "WARN validate-gateway-deploy.sh not executable"
fi

if [ -f .env ]; then
  # shellcheck disable=SC1091
  source .env
  echo "INFO INJECTIVE_NETWORK=${INJECTIVE_NETWORK:-unset}"
else
  echo "WARN no .env (copy .env.example)"
fi

$ok && echo "==> All critical checks passed" || echo "==> Fix failures above"

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/apps/intentguard/.env.agent"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
: "${INTENTGUARD_GATEWAY_URL:?Set INTENTGUARD_GATEWAY_URL in apps/intentguard/.env.agent}"
: "${INTENTGUARD_AGENT_TOKEN:?Set INTENTGUARD_AGENT_TOKEN (agt_…) in apps/intentguard/.env.agent}"
exec node --experimental-strip-types "$ROOT/apps/intentguard/src/mcp/agent-server.ts"

#!/usr/bin/env bash
# Minimal curl reference — export INTENTGUARD_URL and AGENT_TOKEN (agt_…) first.
set -euo pipefail
BASE="${INTENTGUARD_URL:-http://127.0.0.1:8787}"
BASE="${BASE%/}"
AGT="${AGENT_TOKEN:?Set AGENT_TOKEN=agt_…}"

curl -sS "$BASE/health" | jq .
curl -sS -H "Authorization: Bearer $AGT" "$BASE/v1/agent/session" | jq .

INTENT='{
  "intent": {
    "marketId": "0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e",
    "margin": "2",
    "leverage": 2,
    "price": "10",
    "quantity": "1",
    "side": "long"
  }
}'

curl -sS -X POST "$BASE/v1/propose" \
  -H "Authorization: Bearer $AGT" \
  -H "Content-Type: application/json" \
  -d "$INTENT" | jq .

if [[ "${EXECUTE:-0}" == "1" ]]; then
  curl -sS -X POST "$BASE/v1/execute" \
    -H "Authorization: Bearer $AGT" \
    -H "Content-Type: application/json" \
    -d "$INTENT" | jq .
fi

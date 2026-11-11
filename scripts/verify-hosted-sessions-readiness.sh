#!/usr/bin/env bash
# Read-only: hosted session readiness via IntentGuard web proxy (no local owner key).
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-project-bf77a013-c0b3-413c-a75}"
REGION="${GCP_REGION:-us-central1}"
WEB_SERVICE="${INTENTGUARD_WEB_SERVICE:-fence}"

WEB_URL="${INTENTGUARD_WEB_URL:-}"
if [[ -z "$WEB_URL" ]]; then
  WEB_URL="$(gcloud run services describe "$WEB_SERVICE" \
    --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
fi

BASE="${WEB_URL}/api/gateway"

SESSIONS=(
  "sess_0a495f1fa18134a1"
  "sess_d3eccbb463f5f63f"
  "sess_3ae6eaf5e65ff651"
  "sess_928286f99c496a03"
  "sess_f48c6ceb96e131ae"
)

echo "Web: $WEB_URL"
echo "Gateway proxy: $BASE"
curl -fsS "${BASE}/health" | python3 -c "import json,sys; h=json.load(sys.stdin); print('health ok=',h.get('ok'),'execute=',h.get('executeEnabled'),'readiness_gate=',h.get('requireExecuteReadiness'))"
echo ""

for sid in "${SESSIONS[@]}"; do
  echo "=== $sid ==="
  curl -fsS "${BASE}/v1/sessions/${sid}/readiness" | python3 -c "
import json,sys
d=json.load(sys.stdin)
c=d.get('checks',{})
print('overall', d.get('overallStatus'))
for k in ('grants','granteeGas','subaccountCollateral','market'):
  ch=c.get(k,{})
  print(f'  {k}:', ch.get('status'), '-', (ch.get('summary') or '')[:72])
"
done

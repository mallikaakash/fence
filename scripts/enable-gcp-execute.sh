#!/usr/bin/env bash
# Enable MsgExec on Cloud Run gateway (testnet).
# Standard Keplr sessions: grantee signs MsgExec; owner hex secret is optional (address validation only).
# Always pass gateway --max-instances 1 on every services update.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/gateway-cloudrun-scale.sh
source "$ROOT/scripts/lib/gateway-cloudrun-scale.sh"
# shellcheck source=lib/gateway-cloudrun-env.sh
source "$ROOT/scripts/lib/gateway-cloudrun-env.sh"

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${INTENTGUARD_GW_SERVICE:-intentguard-gateway}"
BUCKET="${INTENTGUARD_GCS_BUCKET:-intentguard-state-${PROJECT_ID}}"
GW_STATE_ENV="${GW_GATEWAY_ENV_CSV},INTENTGUARD_GCS_STATE_BUCKET=${BUCKET},INTENTGUARD_GCS_STATE_OBJECT=intentguard/state.json"
SECRET_NAME="${INTENTGUARD_OWNER_KEY_SECRET:-intentguard-owner-private-key}"

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "Set GCP_PROJECT_ID" >&2
  exit 1
fi

SECRET_ARGS=()
if gcloud secrets describe "$SECRET_NAME" --project "$PROJECT_ID" &>/dev/null; then
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --project "$PROJECT_ID" \
    --member "serviceAccount:${RUNTIME_SA}" \
    --role roles/secretmanager.secretAccessor \
    --quiet &>/dev/null || true
  SECRET_ARGS=(--update-secrets "INTENTGUARD_OWNER_PRIVATE_KEY_HEX=${SECRET_NAME}:latest")
else
  echo "Note: $SECRET_NAME not found — skipping optional owner hex mount (Keplr sessions do not need it)." >&2
fi

gcloud run services update "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --quiet \
  "${GW_CLOUDRUN_SCALE_FLAGS[@]}" \
  --update-env-vars "${GW_STATE_ENV}" \
  "${SECRET_ARGS[@]}"

echo "Gateway execute enabled. Verify:"
echo "  curl -sS https://YOUR_WEB/api/gateway/health | jq .executeEnabled"

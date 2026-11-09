#!/usr/bin/env bash
# Enable MsgExec on Cloud Run gateway (testnet). Owner hex stays in Secret Manager only.
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${INTENTGUARD_GW_SERVICE:-intentguard-gateway}"
SECRET_NAME="${INTENTGUARD_OWNER_KEY_SECRET:-intentguard-owner-private-key}"

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "Set GCP_PROJECT_ID" >&2
  exit 1
fi

if ! gcloud secrets describe "$SECRET_NAME" --project "$PROJECT_ID" &>/dev/null; then
  echo "Create owner key secret first (never commit):" >&2
  echo "  openssl rand -hex 32  # wrong — use your funded owner wallet hex" >&2
  echo "  printf '%s' \"\$OWNER_HEX\" | gcloud secrets create $SECRET_NAME --data-file=-" >&2
  exit 1
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --project "$PROJECT_ID" \
  --member "serviceAccount:${RUNTIME_SA}" \
  --role roles/secretmanager.secretAccessor \
  --quiet &>/dev/null || true

gcloud run services update "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --quiet \
  --update-env-vars "INTENTGUARD_EXECUTE=1,INJECTIVE_NETWORK=testnet" \
  --update-secrets "INTENTGUARD_OWNER_PRIVATE_KEY_HEX=${SECRET_NAME}:latest"

echo "Gateway execute enabled. Verify:"
echo "  curl -sS https://YOUR_WEB/api/gateway/health | jq .executeEnabled"

#!/usr/bin/env bash
# Deploy IntentGuard gateway + web to Google Cloud Run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IG="$ROOT/apps/intentguard"
WEB="$ROOT/apps/intentguard/web"

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"
BUCKET="${INTENTGUARD_GCS_BUCKET:-intentguard-state-${PROJECT_ID}}"
GW_SERVICE="${INTENTGUARD_GW_SERVICE:-intentguard-gateway}"
WEB_SERVICE="${INTENTGUARD_WEB_SERVICE:-intentguard-web}"

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "Set GCP_PROJECT_ID or: gcloud config set project YOUR_PROJECT" >&2
  exit 1
fi

echo "Project: $PROJECT_ID  Region: $REGION  State bucket: gs://$BUCKET"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com \
  --project "$PROJECT_ID"

if ! gcloud storage buckets describe "gs://$BUCKET" --project "$PROJECT_ID" &>/dev/null; then
  gcloud storage buckets create "gs://$BUCKET" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --uniform-bucket-level-access
fi

# Secrets (create once; reuse on redeploy)
DATA_KEY="${INTENTGUARD_DATA_KEY:-}"
OWNER_KEY="${INTENTGUARD_OWNER_API_KEY:-}"
if [[ -f "$IG/.env.deploy" ]]; then
  # shellcheck disable=SC1091
  source "$IG/.env.deploy"
  DATA_KEY="${DATA_KEY:-$INTENTGUARD_DATA_KEY}"
  OWNER_KEY="${OWNER_KEY:-$INTENTGUARD_OWNER_API_KEY}"
fi
if [[ -z "$DATA_KEY" ]]; then DATA_KEY="$(openssl rand -hex 32)"; fi
if [[ -z "$OWNER_KEY" ]]; then OWNER_KEY="own_$(openssl rand -hex 24)"; fi

ensure_secret() {
  local name="$1" val="$2"
  if ! gcloud secrets describe "$name" --project "$PROJECT_ID" &>/dev/null; then
    printf '%s' "$val" | gcloud secrets create "$name" \
      --project "$PROJECT_ID" \
      --data-file=-
  else
    printf '%s' "$val" | gcloud secrets versions add "$name" \
      --project "$PROJECT_ID" \
      --data-file=-
  fi
}

ensure_secret intentguard-data-key "$DATA_KEY"
ensure_secret intentguard-owner-api-key "$OWNER_KEY"

# Save local copy for your records (gitignored)
cat > "$IG/.env.deploy" <<EOF
INTENTGUARD_DATA_KEY=$DATA_KEY
INTENTGUARD_OWNER_API_KEY=$OWNER_KEY
INTENTGUARD_REQUIRE_DATA_KEY=1
EOF
chmod 600 "$IG/.env.deploy"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
# Cloud Run revisions use the default compute service account unless overridden.
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
BUILD_SA="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"

for secret in intentguard-data-key intentguard-owner-api-key; do
  for sa in "$RUNTIME_SA" "$BUILD_SA"; do
    gcloud secrets add-iam-policy-binding "$secret" \
      --project "$PROJECT_ID" \
      --member "serviceAccount:${sa}" \
      --role "roles/secretmanager.secretAccessor" \
      --quiet &>/dev/null || true
  done
done

echo "Deploying gateway ($GW_SERVICE)…"
cd "$IG"
gcloud run deploy "$GW_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source . \
  --quiet \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 3 \
  --set-env-vars "DOCKER=1,INJECTIVE_NETWORK=testnet,INTENTGUARD_REQUIRE_DATA_KEY=1,INTENTGUARD_DATA_DIR=/data/.intentguard,INTENTGUARD_REQUIRE_ONCHAIN_GRANT=1" \
  --set-secrets "INTENTGUARD_DATA_KEY=intentguard-data-key:latest,INTENTGUARD_OWNER_API_KEY=intentguard-owner-api-key:latest" \
  --add-volume "name=igdata,type=cloud-storage,bucket=${BUCKET}" \
  --add-volume-mount "volume=igdata,mount-path=/data"

GW_URL="$(gcloud run services describe "$GW_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
echo "Gateway URL: $GW_URL"

echo "Deploying web ($WEB_SERVICE)…"
cd "$WEB"
gcloud run deploy "$WEB_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source . \
  --quiet \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --set-env-vars "INTENTGUARD_GATEWAY_URL=${GW_URL},NEXT_PUBLIC_INTENTGUARD_PROXY_DEFAULT=1" \
  --set-secrets "INTENTGUARD_OWNER_API_KEY=intentguard-owner-api-key:latest"

WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
echo "Web URL: $WEB_URL"

# CORS for browser calls that hit gateway directly (agents use gateway URL; console uses proxy)
cd "$IG"
gcloud run services update "$GW_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --quiet \
  --update-env-vars "INTENTGUARD_CORS_ORIGINS=${WEB_URL}"

echo ""
echo "Verify:"
echo "  curl -sS ${WEB_URL}/api/hosted/status"
echo "  curl -sS ${WEB_URL}/api/gateway/health"
echo "  open ${WEB_URL}/console"

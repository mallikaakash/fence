#!/usr/bin/env bash
# Deploy IntentGuard gateway + web to Google Cloud Run.
# INTENTGUARD_DEPLOY_TARGET: full (default) | gateway | web
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/gateway-cloudrun-scale.sh
source "$ROOT/scripts/lib/gateway-cloudrun-scale.sh"
# shellcheck source=lib/intentguard-deploy-lib.sh
source "$ROOT/scripts/lib/intentguard-deploy-lib.sh"

IG="$ROOT/apps/intentguard"
WEB="$ROOT/apps/intentguard/web"

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"
BUCKET="${INTENTGUARD_GCS_BUCKET:-intentguard-state-${PROJECT_ID}}"
GW_SERVICE="${INTENTGUARD_GW_SERVICE:-intentguard-gateway}"
WEB_SERVICE="${INTENTGUARD_WEB_SERVICE:-fence}"

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "Set GCP_PROJECT_ID or: gcloud config set project YOUR_PROJECT" >&2
  exit 1
fi

intentguard_resolve_deploy_target

echo "Project: $PROJECT_ID  Region: $REGION  State bucket: gs://$BUCKET"

case "$DEPLOY_TARGET" in
  full | gateway)
    intentguard_ensure_apis_and_bucket
    PROJECT_NUMBER="$(intentguard_project_number)"
    RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
    BUILD_SA="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"
    intentguard_prepare_secrets_for_gateway
    ;;
  web)
  intentguard_run_gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
    artifactregistry.googleapis.com secretmanager.googleapis.com \
    --project "$PROJECT_ID"
    intentguard_prepare_secrets_for_web_only
    ;;
esac

# Production image deploys below do NOT enable execution maintenance by default.
# For rollouts with live execute, follow docs/DEPLOY-GCP.md § "Deploy / rollback — pause executes".
GW_URL=""
WEB_URL=""

case "$DEPLOY_TARGET" in
  full)
    intentguard_deploy_gateway_service
    intentguard_discover_gateway_url
    echo "Gateway URL: $GW_URL"
    intentguard_deploy_web_service
    intentguard_discover_web_url
    echo "Web URL: $WEB_URL"
    intentguard_update_gateway_cors
    ;;
  gateway)
    intentguard_deploy_gateway_service
    intentguard_discover_gateway_url
    echo "Gateway URL: $GW_URL"
    intentguard_discover_web_url
    echo "Web URL (existing, for CORS): $WEB_URL"
    intentguard_update_gateway_cors
    ;;
  web)
    intentguard_discover_gateway_url
    if [[ -z "$GW_URL" ]]; then
      echo "Gateway URL required for web deploy — is $GW_SERVICE deployed?" >&2
      exit 1
    fi
    echo "Gateway URL (unchanged): $GW_URL"
    intentguard_deploy_web_service
    intentguard_discover_web_url
    echo "Web URL: $WEB_URL"
    intentguard_update_gateway_cors
    ;;
esac

echo ""
echo "Deploy target completed: ${DEPLOY_TARGET}"
echo "Local script check (no GCP): bash scripts/validate-gateway-deploy.sh"
echo ""
echo "Verify (after deploy completes):"
echo "  bash scripts/verify-gateway-cloudrun-live.sh  # read-only; needs GCP auth"
if [[ "$DEPLOY_TARGET" != "web" ]]; then
  echo "  # Expect service max=1, revision maxScale=1, single traffic target"
fi
if [[ -n "${WEB_URL:-}" ]]; then
  echo "  curl -sS ${WEB_URL}/api/hosted/status"
  echo "  curl -sS ${WEB_URL}/api/gateway/health"
  echo "  open ${WEB_URL}/console"
fi

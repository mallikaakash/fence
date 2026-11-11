# Shared IntentGuard GCP deploy helpers. Source from deploy-intentguard-gcp.sh only.
# shellcheck shell=bash

intentguard_resolve_deploy_target() {
  DEPLOY_TARGET="${INTENTGUARD_DEPLOY_TARGET:-full}"
  case "$DEPLOY_TARGET" in
    full | gateway | web) ;;
    *)
      echo "Invalid INTENTGUARD_DEPLOY_TARGET=${DEPLOY_TARGET} (use full, gateway, or web)" >&2
      exit 1
      ;;
  esac
  echo "IntentGuard deploy target: ${DEPLOY_TARGET}"
}

intentguard_run_gcloud() {
  if [[ "${INTENTGUARD_DEPLOY_DRY_RUN:-}" == "1" ]]; then
    echo "[dry-run] gcloud $*"
    return 0
  fi
  gcloud "$@"
}

intentguard_project_number() {
  if [[ "${INTENTGUARD_DEPLOY_DRY_RUN:-}" == "1" ]]; then
    echo "123456789000"
    return 0
  fi
  gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)'
}

intentguard_ensure_secret() {
  local name="$1" val="$2"
  if ! intentguard_run_gcloud secrets describe "$name" --project "$PROJECT_ID" &>/dev/null; then
    printf '%s' "$val" | intentguard_run_gcloud secrets create "$name" \
      --project "$PROJECT_ID" \
      --data-file=-
    return 0
  fi
  if [[ "${INTENTGUARD_DEPLOY_ROTATE_SECRETS:-}" == "1" ]]; then
    printf '%s' "$val" | intentguard_run_gcloud secrets versions add "$name" \
      --project "$PROJECT_ID" \
      --data-file=-
  else
    echo "Secret ${name} exists — keeping current version (set INTENTGUARD_DEPLOY_ROTATE_SECRETS=1 to rotate)"
  fi
}

intentguard_bind_secret_accessors() {
  local secret="$1"
  for sa in "$RUNTIME_SA" "$BUILD_SA"; do
    intentguard_run_gcloud secrets add-iam-policy-binding "$secret" \
      --project "$PROJECT_ID" \
      --member "serviceAccount:${sa}" \
      --role "roles/secretmanager.secretAccessor" \
      --quiet &>/dev/null || true
  done
}

intentguard_prepare_secrets_for_gateway() {
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

  if ! intentguard_run_gcloud secrets describe intentguard-data-key --project "$PROJECT_ID" &>/dev/null; then
    [[ -n "$DATA_KEY" ]] || DATA_KEY="$(openssl rand -hex 32)"
  fi
  if ! intentguard_run_gcloud secrets describe intentguard-owner-api-key --project "$PROJECT_ID" &>/dev/null; then
    [[ -n "$OWNER_KEY" ]] || OWNER_KEY="own_$(openssl rand -hex 24)"
  fi
  intentguard_ensure_secret intentguard-data-key "$DATA_KEY"
  intentguard_ensure_secret intentguard-owner-api-key "$OWNER_KEY"

  cat > "$IG/.env.deploy" <<EOF
INTENTGUARD_DATA_KEY=$DATA_KEY
INTENTGUARD_OWNER_API_KEY=$OWNER_KEY
INTENTGUARD_REQUIRE_DATA_KEY=1
EOF
  chmod 600 "$IG/.env.deploy"

  for secret in intentguard-data-key intentguard-owner-api-key; do
    intentguard_bind_secret_accessors "$secret"
  done
}

intentguard_prepare_secrets_for_web_only() {
  OWNER_KEY="${INTENTGUARD_OWNER_API_KEY:-}"
  if [[ -f "$IG/.env.deploy" ]]; then
    # shellcheck disable=SC1091
    source "$IG/.env.deploy"
    OWNER_KEY="${OWNER_KEY:-$INTENTGUARD_OWNER_API_KEY}"
  fi
  if ! intentguard_run_gcloud secrets describe intentguard-owner-api-key --project "$PROJECT_ID" &>/dev/null; then
    if [[ -z "$OWNER_KEY" ]]; then OWNER_KEY="own_$(openssl rand -hex 24)"; fi
    intentguard_ensure_secret intentguard-owner-api-key "$OWNER_KEY"
    PROJECT_NUMBER="$(intentguard_project_number)"
    RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
    BUILD_SA="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"
    intentguard_bind_secret_accessors intentguard-owner-api-key
  else
    echo "Web-only deploy: reusing existing intentguard-owner-api-key (no rotation)"
  fi
}

intentguard_ensure_apis_and_bucket() {
  intentguard_run_gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
    artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com \
    --project "$PROJECT_ID"

  if ! intentguard_run_gcloud storage buckets describe "gs://$BUCKET" --project "$PROJECT_ID" &>/dev/null; then
    intentguard_run_gcloud storage buckets create "gs://$BUCKET" \
      --project "$PROJECT_ID" \
      --location "$REGION" \
      --uniform-bucket-level-access
  fi
}

# MARK: intentguard_deploy_gateway_service
intentguard_deploy_gateway_service() {
  echo "Deploying gateway ($GW_SERVICE)…"
  cd "$IG"
  intentguard_run_gcloud run deploy "$GW_SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --source . \
    --quiet \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --cpu 1 \
    "${GW_CLOUDRUN_SCALE_FLAGS[@]}" \
    --set-env-vars "DOCKER=1,INJECTIVE_NETWORK=testnet,INTENTGUARD_EXECUTE=1,INTENTGUARD_REQUIRE_DATA_KEY=1,INTENTGUARD_DATA_DIR=/data/.intentguard,INTENTGUARD_REQUIRE_ONCHAIN_GRANT=1,INTENTGUARD_REQUIRE_EXECUTE_READINESS=1,INTENTGUARD_STATE_BACKEND=gcs,INTENTGUARD_REQUIRE_GCS_STATE=1,INTENTGUARD_GCS_STATE_BUCKET=${BUCKET},INTENTGUARD_GCS_STATE_OBJECT=intentguard/state.json" \
    --set-secrets "INTENTGUARD_DATA_KEY=intentguard-data-key:latest,INTENTGUARD_OWNER_API_KEY=intentguard-owner-api-key:latest" \
    --add-volume "name=igdata,type=cloud-storage,bucket=${BUCKET}" \
    --add-volume-mount "volume=igdata,mount-path=/data"
}

# MARK: intentguard_deploy_web_service
intentguard_deploy_web_service() {
  echo "Deploying web ($WEB_SERVICE)…"
  cd "$WEB"
  intentguard_run_gcloud run deploy "$WEB_SERVICE" \
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
}

# MARK: intentguard_update_gateway_cors
intentguard_update_gateway_cors() {
  cd "$IG"
  intentguard_run_gcloud run services update "$GW_SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --quiet \
    "${GW_CLOUDRUN_SCALE_FLAGS[@]}" \
    --update-env-vars "INTENTGUARD_CORS_ORIGINS=${WEB_URL}"
}

intentguard_discover_gateway_url() {
  if [[ "${INTENTGUARD_DEPLOY_DRY_RUN:-}" == "1" ]]; then
    GW_URL="https://intentguard-gateway-mock.example.run.app"
    return 0
  fi
  GW_URL="$(gcloud run services describe "$GW_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
}

intentguard_discover_web_url() {
  if [[ "${INTENTGUARD_DEPLOY_DRY_RUN:-}" == "1" ]]; then
    WEB_URL="https://intentguard-web-mock.example.run.app"
    return 0
  fi
  WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
}

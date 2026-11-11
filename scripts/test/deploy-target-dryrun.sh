#!/usr/bin/env bash
# Mocked deploy-target checks (no GCP mutations). Run: bash scripts/test/deploy-target-dryrun.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IG="$ROOT/apps/intentguard"
ENV_BACKUP=""
if [[ -f "$IG/.env.deploy" ]]; then
  ENV_BACKUP="$(mktemp)"
  cp "$IG/.env.deploy" "$ENV_BACKUP"
fi

cleanup() {
  if [[ -n "$ENV_BACKUP" && -f "$ENV_BACKUP" ]]; then
    cp "$ENV_BACKUP" "$IG/.env.deploy"
    rm -f "$ENV_BACKUP"
  fi
}
trap cleanup EXIT

gcloud() {
  if [[ "$*" == *"config get-value project"* ]]; then
    echo "project-mock"
    return 0
  fi
  if [[ "$*" == *"secrets describe"* ]]; then
    return 0
  fi
  if [[ "$*" == *"secrets versions add"* ]]; then
    echo "unexpected secret rotation in mock" >&2
    return 1
  fi
  if [[ "$*" == *"services describe"* ]]; then
    echo "https://intentguard-mock.run.app"
    return 0
  fi
  if [[ "$*" == *"storage buckets describe"* ]]; then
    return 0
  fi
  # Other calls are dry-run echoed from lib when INTENTGUARD_DEPLOY_DRY_RUN=1
  return 0
}
export -f gcloud

export INTENTGUARD_DEPLOY_DRY_RUN=1
export GCP_PROJECT_ID=project-mock
export INTENTGUARD_GCS_BUCKET=intentguard-state-project-mock

if ! OUT_INVALID="$(INTENTGUARD_DEPLOY_TARGET=both bash "$ROOT/scripts/deploy-intentguard-gcp.sh" 2>&1)"; then
  echo "$OUT_INVALID" | rg -q "Invalid INTENTGUARD_DEPLOY_TARGET"
else
  echo "invalid target should fail" >&2
  exit 1
fi

log="$(mktemp)"
for target in full gateway web; do
  rm -f "$IG/.env.deploy"
  OUT="$(INTENTGUARD_DEPLOY_TARGET="$target" bash "$ROOT/scripts/deploy-intentguard-gcp.sh" 2>&1 | tee "$log")" || {
    echo "target $target failed" >&2
    cat "$log" >&2
    exit 1
  }
  if [[ "$target" == "full" ]]; then
    echo "$OUT" | rg -q "Deploying gateway"
    echo "$OUT" | rg -q "Deploying web"
  fi
  if [[ "$target" == "gateway" ]]; then
    echo "$OUT" | rg -q "Deploying gateway"
    if echo "$OUT" | rg -q "Deploying web"; then
      echo "gateway target must not deploy web" >&2
      exit 1
    fi
  fi
  if [[ "$target" == "web" ]]; then
    echo "$OUT" | rg -q "Deploying web"
    if echo "$OUT" | rg -q "Deploying gateway"; then
      echo "web target must not deploy gateway" >&2
      exit 1
    fi
    echo "$OUT" | rg -q "INTENTGUARD_CORS_ORIGINS"
    if [[ -f "$IG/.env.deploy" ]]; then
      echo "web-only must not rewrite .env.deploy" >&2
      exit 1
    fi
  fi
  if echo "$OUT" | rg -q "secrets versions add"; then
    echo "routine deploy must not add secret versions" >&2
    exit 1
  fi
done

echo "deploy-target dry-run mock: OK"

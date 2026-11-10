#!/usr/bin/env bash
# Static validation of gateway Cloud Run scripts (no GCP API calls).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/intentguard"
node --experimental-strip-types src/cli/validate-gateway-deploy.ts

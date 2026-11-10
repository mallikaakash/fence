#!/usr/bin/env bash
# Read-only Cloud Run inspect for intentguard-gateway scale/traffic (no mutations).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/intentguard"
exec node --experimental-strip-types src/cli/verify-gateway-cloudrun-live.ts

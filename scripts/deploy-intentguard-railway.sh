#!/usr/bin/env bash
# Deploy IntentGuard sidecar to Railway and point Vercel at the public URL.
# Prereq: railway login (or RAILWAY_TOKEN), vercel login in apps/intentguard/web
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IG="$ROOT/apps/intentguard"
WEB="$ROOT/apps/intentguard/web"
VERCEL_PROD_URL="${VERCEL_PROD_URL:-https://web-psi-nine-39.vercel.app}"

if ! railway whoami &>/dev/null; then
  echo "Run: railway login   (finish OAuth in the browser)" >&2
  exit 1
fi

if [[ ! -f "$IG/.env.deploy" ]]; then
  DATA_KEY="$(openssl rand -hex 32)"
  OWNER_KEY="own_$(openssl rand -hex 24)"
  CORS="${VERCEL_PROD_URL}"
  cat > "$IG/.env.deploy" <<EOF
INTENTGUARD_OWNER_API_KEY=$OWNER_KEY
INTENTGUARD_DATA_KEY=$DATA_KEY
INTENTGUARD_CORS_ORIGINS=$CORS
INTENTGUARD_REQUIRE_DATA_KEY=1
EOF
  chmod 600 "$IG/.env.deploy"
  echo "Created $IG/.env.deploy"
fi

# shellcheck disable=SC1091
set -a && source "$IG/.env.deploy" && set +a

cd "$IG"
if [[ ! -f .railway/link.json ]] && [[ ! -f railway.toml ]]; then
  railway up -y --name intentguard-gateway -m "IntentGuard sidecar initial deploy"
else
  railway up -y --detach -m "IntentGuard sidecar deploy"
fi

echo "Set production variables on the Railway service (dashboard or CLI after link):"
echo "  DOCKER=1"
echo "  INJECTIVE_NETWORK=testnet"
echo "  INTENTGUARD_REQUIRE_DATA_KEY=1"
echo "  INTENTGUARD_DATA_KEY=(from .env.deploy)"
echo "  INTENTGUARD_OWNER_API_KEY=(from .env.deploy)"
echo "  INTENTGUARD_CORS_ORIGINS=$VERCEL_PROD_URL"
echo "Attach a volume mounted at /data (INTENTGUARD_DATA_DIR=/data/.intentguard in Dockerfile)."

if railway domain 2>/dev/null | tee /tmp/rw-domain.txt; then
  GW_URL="$(grep -Eo 'https://[^ ]+' /tmp/rw-domain.txt | head -1 || true)"
  if [[ -n "${GW_URL:-}" ]]; then
    cd "$WEB"
    printf '%s' "$GW_URL" | vercel env add INTENTGUARD_GATEWAY_URL production 2>/dev/null || \
      printf '%s' "$GW_URL" | vercel env add INTENTGUARD_GATEWAY_URL production --force
    OWNER_KEY="$(grep '^INTENTGUARD_OWNER_API_KEY=' "$IG/.env.deploy" | cut -d= -f2-)"
    printf '%s' "$OWNER_KEY" | vercel env add INTENTGUARD_OWNER_API_KEY production 2>/dev/null || \
      printf '%s' "$OWNER_KEY" | vercel env add INTENTGUARD_OWNER_API_KEY production --force
    printf '%s' "1" | vercel env add NEXT_PUBLIC_INTENTGUARD_PROXY_DEFAULT production 2>/dev/null || true
    vercel deploy --prod --yes
    echo "Vercel wired to $GW_URL"
    curl -sS "${VERCEL_PROD_URL}/api/gateway/health" | head -c 200
    echo
  fi
fi

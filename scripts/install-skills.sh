#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKILLS=(
  injective-cli
  injective-evm-developer
  injective-mcp-servers
  injective-trading-account
  injective-trading-tokens
  injective-trading-market-data
  injective-trading-chain-analysis
  injective-trading-staking
  injective-trading-bridge
  injective-trading-frontend-ux
  injective-trading-autosign
  injective-rfq-integrations
  injective-frontend-wallet
  injective-faucet
)

echo "==> Installing Injective agent skills (project-local)"
for skill in "${SKILLS[@]}"; do
  echo "    $skill"
  npx --yes skills add InjectiveLabs/agent-skills --skill "$skill" -y -p
done

echo "==> Done. Skills live under .agents/skills/"

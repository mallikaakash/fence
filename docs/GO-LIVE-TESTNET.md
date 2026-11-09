# IntentGuard — go live on testnet (real execute)

You already have **hosted GCP**, **typed MsgGrant**, and **propose** working. To make it a **real product** (orders hit Injective), finish these steps once.

## What changes

| Layer | Propose-only (now) | Live product |
|--------|-------------------|--------------|
| Gateway | `execute=off` | `INTENTGUARD_EXECUTE=1` + owner hex in Secret Manager |
| Agent | `POST /v1/propose` | Same + `POST /v1/execute` after allow |
| UI | Console + `/trade` policy tests | **Execute in-policy test intent** + **Execute on-chain** on `/trade` |
| Wallets | Owner Keplr for MsgGrant | + grantee INJ (gas) + USDT in trading subaccount |

## 1. Owner private key on GCP (never in browser, never in chat)

The hex must be for the **same** `inj1…` you used for MsgGrant (`inj1aaxw59…`).

```bash
export GCP_PROJECT_ID=project-bf77a013-c0b3-413c-a75   # your project
# Export hex from Keplr (Settings → your account → export private key) locally only:
export OWNER_HEX='…'   # do not paste into Slack/Discord

printf '%s' "$OWNER_HEX" | gcloud secrets create intentguard-owner-private-key \
  --project "$GCP_PROJECT_ID" \
  --data-file=-

chmod +x scripts/enable-gcp-execute.sh
./scripts/enable-gcp-execute.sh
```

Verify:

```bash
curl -sS https://intentguard-web-2lcs3sivbq-uc.a.run.app/api/gateway/health | jq .executeEnabled
# true
```

## 2. Fund grantee (MsgExec gas)

Each session has a **grantee** `inj1…` (Console → Sessions). The gateway holds that key; agents never see it.

1. Copy grantee address from your active session.
2. Send **~0.5–2 INJ** from your owner wallet (Keplr **Send**) or use the [testnet faucet](https://testnet.faucet.injective.network/) on the grantee address.

## 3. Margin in trading subaccount

Execute uses your **owner subaccount** (shown in onboarding / grant plan).

1. In Keplr, keep **USDT (testnet)** on the owner `inj1…`.
2. Deposit into the exchange subaccount (Helix testnet UI or `MsgDeposit` via CLI/skills).

Without margin, execute may pass policy but fail at broadcast with an exchange error.

## 4. Run one live order

1. Console → **Execute in-policy test intent** (orange section).
2. Or `/trade` → sidecar propose **In-policy** → **Execute on-chain**.

Success looks like: `broadcast: true`, `txHash`, and an entry on `/history` (live activity).

## 5. Production hygiene (optional but recommended)

- Redeploy web after code changes: `./scripts/deploy-intentguard-gcp.sh`
- `cd apps/intentguard && npm run production:verify`
- Custom domain: [DEPLOY-GCP.md](./DEPLOY-GCP.md)
- Network policy: **testnet only** — [NETWORK.md](./NETWORK.md)

## Still not on-chain (by design v0.2)

- **Notional / leverage limits** — gateway-enforced, not in typed AuthZ (see [PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md)).
- **Horizontal scale** — single gateway writer; use one Cloud Run min instance for stability.

## If execute fails

| Symptom | Likely fix |
|---------|------------|
| `503 execute disabled` | Run `enable-gcp-execute.sh` |
| `owner key does not match session owner` | Secret hex must match Keplr owner used for MsgGrant |
| `on-chain typed grant missing` | **Check grant** → ready; re-sign MsgGrant if needed |
| `insufficient funds` / gas | Fund grantee INJ |
| Exchange / margin errors | Deposit USDT to subaccount |

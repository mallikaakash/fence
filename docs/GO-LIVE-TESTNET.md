# IntentGuard — go live on testnet (real execute)

You already have **hosted GCP**, **typed MsgGrant**, and **propose** working. To make it a **real product** (orders hit Injective), finish these steps once.

**Single-writer:** Gateway `state.json` on GCS allows **one process writer**. Configure **service `--max 1`** and **revision `--max-instances 1`** on `intentguard-gateway` (scripts do both). Rollouts must use maintenance + **serial writer** steps — see [DEPLOY-GCP.md](./DEPLOY-GCP.md) § Single-Writer Guarantee.

## What changes

| Layer | Propose-only (now) | Live product |
|--------|-------------------|--------------|
| Gateway | `execute=off` | `INTENTGUARD_EXECUTE=1` on gateway |
| Agent | `POST /v1/propose` | Same + `POST /v1/execute` after allow |
| UI | Console + `/trade` policy tests | **Execute in-policy test intent** + **Execute on-chain** on `/trade` |
| Wallets | Owner Keplr for MsgGrant | **Grantee INJ (MsgExec gas)** + quote collateral in owner trading subaccount |

### Who signs what (Route A)

| Wallet | Role |
|--------|------|
| **Owner** (`inj1…` in Keplr) | Signs **typed MsgGrant**; inner order fields use owner address + subaccount |
| **Session grantee** (gateway-held) | Signs **outer MsgExec** — needs **INJ** for fees |
| **Owner private key on gateway** | **Optional** for standard Keplr sessions — not required for MsgExec broadcast |

## 1. Enable execute on the gateway

```bash
export GCP_PROJECT_ID=your-project-id
chmod +x scripts/enable-gcp-execute.sh
./scripts/enable-gcp-execute.sh
```

This sets `INTENTGUARD_EXECUTE=1` and **preserves service `--max 1` + revision `--max-instances 1`**.  
If `intentguard-owner-private-key` exists in Secret Manager, it is mounted **optionally** (address validation only — not the chain signer).

Verify:

```bash
curl -sS https://intentguard-web-2lcs3sivbq-uc.a.run.app/api/gateway/health | jq '{executeEnabled, executionMaintenance}'
```

After redeploying the latest gateway image, expect **`executionMaintenance`** in health (boolean). Older revisions may omit it until redeployed.

### Optional: owner hex in Secret Manager

Only needed if you want the gateway to validate a configured hex against the session owner address (legacy paths). **Not** the MsgExec signer.

```bash
# Never commit or paste OWNER_HEX in chat:
printf '%s' "$OWNER_HEX" | gcloud secrets create intentguard-owner-private-key \
  --project "$GCP_PROJECT_ID" \
  --data-file=-
```

## 2. Fund grantee (MsgExec gas)

Each session has a **grantee** `inj1…` (Console → Sessions). The gateway holds that key; agents never see it.

1. Copy grantee address from your active session.
2. Send **~0.5–2 INJ** to the grantee (Keplr **Send** or [testnet faucet](https://testnet.faucet.injective.network/) / [GCP faucet](https://cloud.google.com/application/web3/faucet/injective/testnet)).

Link audit: [TESTNET-LINKS.md](./TESTNET-LINKS.md).

## 3. Margin in trading subaccount

Execute uses your **owner subaccount** (shown in onboarding / grant plan).

1. Hold **USDC** (testnet quote) on the owner `inj1…` as needed.
2. Deposit into the exchange subaccount ([Helix testnet](https://testnet.helixapp.com/)).

Without margin, execute may pass policy but fail at broadcast with an exchange error.

## 4. Run one live order

1. Console → **Execute in-policy test intent**.
2. Or `/trade` → **In-policy** → **Place protected trade**.

Success requires **tx hash** + order/exposure verification — not HTTP 200 alone.

## 5. Production hygiene

**Deploy / rollback:** Use both execution maintenance and **state write freeze** before gateway image rollouts on shared GCS — see [DEPLOY-GCP.md](./DEPLOY-GCP.md) § State Write Freeze.


- Before/after deploy: `bash scripts/validate-gateway-deploy.sh` (local, no GCP)
- Optional live read-only: `bash scripts/verify-gateway-cloudrun-live.sh` (requires `gcloud` auth; no mutations)
- Verify live scale: [DEPLOY-GCP.md](./DEPLOY-GCP.md) § Single-Writer Guarantee
- `cd apps/intentguard && npm run production:verify`

## Still not on-chain (by design v0.2)

- **Notional / leverage limits** — gateway-enforced, not in typed AuthZ.
- **Horizontal scale** — never run multiple gateway instances against one GCS state bucket.

## If execute fails

| Symptom | Likely fix |
|---------|------------|
| `503 execute disabled` | Run `enable-gcp-execute.sh` |
| `owner key does not match session owner` | Optional secret hex must match Keplr owner (or remove secret) |
| `on-chain typed grant missing` | Re-sign MsgGrant; check grant status |
| `insufficient funds` / gas | Fund **grantee** INJ |
| Exchange / margin errors | Deposit quote to subaccount |

# IntentGuard hosted — operator runbook

Testnet only. GCP services: `fence` (web), `intentguard-gateway`.

## Deploy

```bash
./scripts/deploy-intentguard-gcp.sh
```

Redeploy gateway when policy/execute code changes; web when UI changes.

## Health

| Check | URL |
|--------|-----|
| Web proxy | `GET /api/hosted/status` → `proxyConfigured: true` |
| Gateway | `GET /api/gateway/health` → `ok`, `executeEnabled`, `network: testnet` |
| Ready (optional) | Gateway `GET /health/ready` (LCD probe if `INTENTGUARD_READY_LCD=1`) |

## Common user failures

| Symptom | Cause | Fix |
|---------|--------|-----|
| Execute: insufficient funds / 0 inj | Assistant has no gas | Protect Done → send ~0.2 INJ to assistant |
| Execute: margin / subaccount | No Helix testnet USDT | Deposit on Helix testnet, same wallet |
| Grant pending | MsgGrant not confirmed | Wait; retry Approve in Keplr |
| 429 from API | Rate limit | Back off `retryAfterSeconds`; tune env limits |

## Sidecar down

- Cloud Run logs for `intentguard-gateway`
- State bucket mounted at `/data` — sessions persist in `.intentguard` on volume
- Web still serves Protect UI; live propose/execute fail until gateway healthy

## Grant expiry / revoke

- User **Revoke** in Protect or owner `POST /v1/sessions/{id}/revoke`
- On-chain `MsgRevoke` via Keplr — further execute fails (`requireOnChainGrant`)

## Secrets

- `intentguard-data-key`, `intentguard-owner-api-key` in GCP Secret Manager
- Never commit `.env.deploy`, grantee keys, or `agt_` in public repos

## Abuse

- Defaults: 120 req/min/IP; 90 propose/min/agent; 30 execute/min/agent
- Override: `INTENTGUARD_*_RATE_*` env on gateway revision

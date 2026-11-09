# IntentGuard — product architecture

## Deployment model (recommended)

**Sidecar gateway** — customer runs `npm run gateway` next to their agent (Docker/K8s). Grantee key and audit state stay on their infra; you ship software, not custody day one.

| Role | Access |
|------|--------|
| **Owner** | `Authorization: Bearer own_…` — create session, revoke, audit |
| **Agent** | `Authorization: Bearer agt_…` — `POST /v1/propose` only |

State: `apps/intentguard/.intentguard/` (gitignored) — sessions + audit JSON.

Customer install guide: [INSTALL.md](./INSTALL.md)  
Buyer paths & wedges: [GETTING-STARTED.md](./GETTING-STARTED.md) · [PRICING.md](./PRICING.md)  
Hosted web: [VERCEL.md](./VERCEL.md) — `/start` onboarding, grant auditor, optional gateway proxy.

## Quick start

```bash
cd apps/intentguard
npm run gateway
# Owner key printed once → .intentguard/config.json
```

```bash
# Create session (owner)
curl -sS -X POST http://127.0.0.1:8787/v1/sessions \
  -H "Authorization: Bearer $OWNER_KEY" \
  -H "content-type: application/json" \
  -d '{
    "ownerInjectiveAddress": "inj1…",
    "subaccountIndex": 1,
    "policy": {
      "version": 1,
      "marketIds": ["0xdc70164…"],
      "maxMarginPerOrder": "100",
      "maxOrderNotional": "50",
      "maxLeverage": 5,
      "dailyMarginBudget": "500"
    }
  }'
```

Response includes `grantPlan` (typed AuthZ spec), `agentApiToken`, and `granteeAddress` for on-chain MsgGrant.

```bash
# Agent proposes (no chain broadcast in v0.1 API — policy gate only)
curl -sS -X POST http://127.0.0.1:8787/v1/propose \
  -H "Authorization: Bearer agt_…" \
  -H "content-type: application/json" \
  -d '{
    "intent": {
      "marketId": "0xdc70164…",
      "margin": "5",
      "leverage": 2,
      "price": "1",
      "quantity": "2"
    }
  }'
```

```bash
# Revoke (owner) — clears grantee key in sidecar; still run MsgRevoke on-chain
curl -sS -X POST http://127.0.0.1:8787/v1/sessions/sess_…/revoke \
  -H "Authorization: Bearer $OWNER_KEY"
```

OpenAPI stub: `GET /v1/openapi.json`

## Wedge vs full product

| Tier | What ships | Buyer value |
|------|------------|-------------|
| **Grant Auditor** | `GET /v1/audit/grants?granter=inj1…` + web UI | Risk scan without integration |
| **Sidecar v0.1** (now) | Sessions, policy propose, grant plan, audit, owner web console | Agent integration in days |
| **v0.1 execute** | `POST /v1/execute` when `INTENTGUARD_EXECUTE=1` + owner key on sidecar | Testnet/mainnet MsgExec after typed grant |
| **v0.2** | Webhooks, KMS, hosted multi-tenant | Production ops at scale |
| **Hosted** | Same API, your VPC | Convenience + SLAs |

## Next engineering (after sidecar validates)

1. **Execute path** — optional env `INTENTGUARD_EXECUTE=1` + owner/grantee keystores for MsgExec (integrator-controlled).
2. **Webhooks** — `propose_denied`, `session_revoked`.
3. **Owner console** — `/console` + optional Vercel `/api/gateway` proxy (`INTENTGUARD_GATEWAY_URL`); local keys remain default for self-serve.
4. **Design partner** — one team on mainnet with real agent traffic.

## What we are not claiming yet

- Aggregate portfolio risk / partial-fill budgets  
- Hosted HSM / SOC2  
- Route B vault as default  

Route A sidecar + typed grants + notional policy is the product core.

## Release verification (v0.1.x)

```bash
cd apps/intentguard
npm run check && npm test
npm run product:smoke && npm run security:verify && npm run e2e:protocol && npm run gtm:verify
npm run web:build
```

From repo root: `npm run intentguard:smoke`, `intentguard:security`, `intentguard:e2e`, `intentguard:gtm`.

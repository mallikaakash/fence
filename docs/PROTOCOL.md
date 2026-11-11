# IntentGuard — Injective protocol scope (v0)

## What Route A covers on-chain

| Capability | On-chain (typed AuthZ) | Gateway (off-chain) |
|------------|------------------------|---------------------|
| Market allowlist | `market_ids` in `CreateDerivativeLimitOrderAuthz` | Re-check before sign |
| Subaccount scope | `subaccount_id` in typed grant | Session-bound MsgExec |
| Order type | **Limit** create + cancel only | — |
| Max notional / leverage | Not in AuthZ | Policy engine |
| Daily margin budget | Not in AuthZ | Execute accounting |

Not in v0: market orders, spot, RFQ settlement, `BatchUpdateOrders`, bank `MsgSend`.

## Grant verification API

`GET /v1/sessions/:id/grant-status` (owner) decodes LCD grants and checks:

1. `CreateDerivativeLimitOrderAuthz` exists for session **grantee**
2. Not expired
3. `subaccount_id` matches session
4. On-chain `market_ids` ⊇ session policy `marketIds`

## Owner broadcast helpers

| Tool | Purpose |
|------|---------|
| `GET /v1/sessions/:id/grant-tx-plan` | MsgGrant JSON for wallet |
| `npm run grant:instructions` | Human steps |
| `npm run grant:broadcast` | Owner key → testnet MsgGrant tx |

## Validation

```bash
npm run e2e:protocol           # offline LCD + tx-plan checks (default CI)
npm run e2e:protocol:live      # + live testnet typed grant scope (needs on-chain grants)
INTENTGUARD_E2E_LIVE=1 npm run e2e:protocol
```

Live test uses public spike granter/grantee (`inj1yrvzt…` → `inj1cu9m…`) on testnet. If typed grants are missing, exit code **2** with `BLOCKED: testnet AuthZ grants missing` (not a pass). Provision grants via `grant-tx-plan` / owner wallet first.

Default CI runs **offline only**; optional workflow_dispatch job `protocol-e2e-live` runs live checks when grants exist.

## References

- [Injective typed AuthZ](https://docs.injective.network/)
- Repo spike: `web/public/spike/allowed-order.json`

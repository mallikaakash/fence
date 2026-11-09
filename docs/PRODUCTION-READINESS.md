# IntentGuard — production readiness audit (engineering report)

**Product:** Injective-native agent policy sidecar (Route A), not a generic CRUD SaaS.  
**Persistence:** Gateway `state.json` + encrypted grantee keys (file or GCS volume on Cloud Run).  
**No SQL database** — by design for v0.1.x single-node gateway.

## What was already production-grade

| Area | Implementation |
|------|----------------|
| Gateway HTTP API | Auth (owner `own_…` / agent `agt_…`), rate limits, CORS, encryption at rest, audit log |
| Policy engine | Shared core; unit tests |
| `POST /v1/propose` | Real session policy; dry-run only |
| `POST /v1/execute` | Real Injective MsgExec via `@injectivelabs/sdk-ts` when `INTENTGUARD_EXECUTE=1` |
| Grant audit | Live LCD (`/api/audit`, gateway `/v1/audit/grants`) |
| Typed grant planner | `buildGrantTx` + `grant:broadcast` CLI |
| On-chain grant verify | `verifySessionGrantOnChain` before execute |
| Deploy | Docker, Cloud Run script, health probes, structured logs |
| Verify train | `product:smoke`, `security:verify`, `e2e:protocol`, `agent:verify`, CI workflow |

## What was demo / misleading (addressed in this pass)

| Item | Before | After |
|------|--------|--------|
| `POST /api/propose` (web) | `wouldBroadcast: true` on allow | `mode: offline_policy_mirror`, `wouldBroadcast: false` always |
| `/trade` simulator | Default offline unless toggled | Defaults to live sidecar when proxy + agent token configured |
| Owner `inj1…` | Manual paste only | Keplr/Leap connect fills address (read-only connect) |
| `/history` | Implied live proofs | Labeled archived testnet spike evidence |
| IsolatedGranteeSigner HMAC | Comment looked like “fake chain” | Documented as pre-broadcast approval gate; chain sign is in `msgExec.ts` |

## Intentionally offline (not bugs)

| Surface | Why |
|---------|-----|
| `npm run demo` / `demo:pitch` | Sales / rehearsal CLIs, not production paths |
| MCP `intentguard_propose` (offline) | Policy without sidecar; documented |
| `/api/propose` | Local policy mirror when browser has no agent token — not chain |
| `signer.signApprovedPayload` HMAC | Approval binding before SDK grantee broadcast |

## Injective / Web3 — real vs operator-assisted

| Capability | Status |
|------------|--------|
| Read grants from chain | **Real** (LCD) |
| MsgExec execute path | **Real** (testnet/mainnet via `INJECTIVE_NETWORK`) |
| Browser wallet connect | **Real** address + chain ID (Keplr/Leap) |
| Browser broadcast MsgGrant | **Real** — Console → Grant tx plan → **Sign & broadcast MsgGrant (Keplr)** (`web/src/lib/chain/broadcast-typed-grants.ts`); CLI `grant:broadcast` still supported |
| Agent wallet | **N/A** — agents use `agt_…` HTTP only, never chain keys |

## Blockers requiring human action

1. **Funded testnet/mainnet owner wallet** — for typed MsgGrant + subaccount margin  
2. **`INTENTGUARD_EXECUTE=1` + owner hex on gateway only** — never on web/Vercel env for hosted console  
3. **Mainnet** — set `INJECTIVE_NETWORK=mainnet` and re-audit grants; not enabled by default  
4. **Horizontal scaling** — single writer store; not supported v0.1.x  

## Definition of done (IntentGuard v0.2.0 product slice)

- [x] Hosted stack on GCP Cloud Run (web + gateway) documented  
- [x] No misleading “would broadcast” from offline web API  
- [x] Console/trade prefer live gateway when configured  
- [x] Wallet connect for owner address on testnet  
- [x] `npm run production:verify` aggregates release checks  
- [x] In-browser MsgGrant (Keplr + sdk-ts; funded wallet required)  
- [ ] Mainnet pilot sign-off (business decision — set `INJECTIVE_NETWORK=mainnet` on gateway when ready)  

## Run verification

```bash
cd apps/intentguard
npm run production:verify
```

Deploy: [DEPLOY-GCP.md](./DEPLOY-GCP.md)

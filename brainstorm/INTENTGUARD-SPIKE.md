# IntentGuard — 48h spike (kill switch)

**Diligence lock:** [DILIGENCE.md](./DILIGENCE.md)  
**Decision:** Route **A** (typed AuthZ + isolated signer) is the delivery target. Route **B** (Exchange Precompile vault) is a parallel challenger.

Goal: prove **non-bypassable** bounded autonomy on testnet, or kill IntentGuard as hero.

## Architecture for the spike

```
Owner (granter)
  → funds dedicated trading subaccount (collateral ceiling only)
  → signs typed MsgGrant: CreateDerivativeLimitOrderAuthz
       + CancelDerivativeOrderAuthz
       with exact subaccount_id + market_ids[]
  → signs MsgRevoke when done

Agent
  → propose_trade only (no grantee key, no MsgExec, no raw broadcast)

IntentGuard gateway
  → decode order · market allowlist · notional · margin · leverage · expiry
  → if deny: reason, no sign

Isolated signing service (security-critical)
  → holds ephemeral grantee key
  → re-validates canonical payload (hash + policy version + nonce)
  → signs MsgExec only — no generic sign(bytes)

Injective AuthZ + exchange
  → on-chain type / market / subaccount / expiry check
```

**Hard rules**

1. Agent process never receives the grantee private key.
2. Do **not** use stock AutoSign `GenericAuthorization` as the security foundation — construct typed grants (Hummingbot `msg_grant_typed` pattern).
3. Funding ceiling ≠ notional ceiling. Enforce per-order notional in the gateway; keep collateral limited on the subaccount.
4. No dashboard until the acceptance checklist passes.

## Offline foundation (already done)

| # | Test | Status |
|---|------|--------|
| T1 | Policy unit tests | **Done** |
| T2 | Agent credential ≠ raw key; env leak detected | **Done** |
| T3–T6 | Allow / deny / market allowlist / revoke (simulated) | **Done** |
| T7 | Offline demo | **Done** |
| T8 | Grant auditor scores GenericAuthorization risk | **Done** |

## Day 1 — Route A: native AuthZ + signing model

| Time | Test | Pass condition |
|------|------|----------------|
| 0–4h | Owner + ephemeral grantee keys | Separate addresses; key never in agent env |
| 4–8h | Typed derivative AuthZ grant on testnet | On-chain grant includes exact `subaccount_id` + `market_ids[]` |
| 8–12h | Permitted MsgExec (limit order) | Allowed order succeeds |
| 12–16h | Wrong-market + wrong-subaccount MsgExec | Both fail at **chain** AuthZ |
| 16–20h | MsgRevoke | Subsequent MsgExec fails |
| 20–24h | Agent signs MsgExec with its own EOA | **Must fail** (agent is not grantee) |

Also: confirm grant overwrite monitoring (same granter/grantee/msg relationship can replace a grant).

## Day 2 — Financial limits + bypass + Route B probe

| Time | Test | Pass condition |
|------|------|----------------|
| 24–28h | Decode actual order message | market, price, qty, subaccount extracted |
| 28–32h | Max notional before sign | Oversized proposal rejected; no broadcast |
| 32–36h | Funded subaccount only | Limited collateral; **no** agent withdrawal / bank grant |
| 36–40h | MCP / raw signing bypass | Agent cannot sign or broadcast delegated actions alone |
| 40–44h | Replay / concurrent proposals | Stale or duplicate proposals cannot exceed limits |
| 44–48h | Route B challenger | One contract-originated order via Exchange Precompile `0x…65`; EOA cannot spoof vault as exchange actor — **or** explicitly defer B |

## Acceptance checklist (7/7 required to continue)

Live testnet run **2026-11-09** (owner `inj1yrvzt…`, grantee `inj1cu9mv…`):

- [x] **Typed market authorization** — wrong market → `requested market is unauthorized`  
- [x] **Subaccount authorization** — unauthorized subaccount → `requested subaccount is unauthorized`  
- [x] **Isolated grantee signing** — grantee key only in gitignored `.spike/keystore.json`  
- [x] **Notional enforcement** — oversized `price×qty` denied at policy stage (`signed:false`, `broadcast:false`) via `proposeAndExecLimitOrder`  
- [x] **Funding containment** — Circle USDC → MsgDeposit to **subaccount index 1** (v1.10 bank↔nonce-0 merge; deposits to 0 invalid — [Trading Account](https://docs.injective.network/developers/concepts/trading-account))  
- [x] **Revocation** — post-revoke → `authorization not found`  
- [x] **No alternate path** — non-grantee MsgExec fails  

**Allowed live order:** MsgExec tx `411EC04566E138288ED8FDCEDE1BC1F4E958866E22FBC9FE73CBDE3D55FE4D18` (INJ/USDC limit via typed AuthZ + isolated signer).

Evidence: `apps/intentguard/.spike/allowed-order.json` · grant `F0852EA9…`

## Decision rule

| Outcome | Action |
|---------|--------|
| All 7 pass | Continue IntentGuard on Route A |
| AuthZ works; aggregate exposure unreliable | Ship narrower **per-order** MVP; do **not** claim portfolio risk |
| Agent can access grantee key or alternate MsgExec path | **Kill** architecture → AgentPay Control (unless Route B fully passes non-bypass) |
| Route B works cleanly + stronger on-chain enforcement | Seriously consider promoting Policy Vault as primary layer |
| Precompile path fails | Keep Route A; document B as roadmap |

## Demo script (after checklist)

1. Limited authority (typed grant + policy)  
2. Allowed Injective limit order succeeds  
3. Prohibited market / oversized notional blocked with reason  
4. Revoke → further trades fail  
5. (Addon) OptionLens proposes → IntentGuard allows/blocks  

## Stop conditions (absolute)

- Agent can `MsgExec` with a key it holds → **FAIL**  
- Only soft “please don’t” checks without key isolation → **FAIL**  
- Positioning as GenericAuthorization UI with no market/size bounds → **FAIL** (rebuild)

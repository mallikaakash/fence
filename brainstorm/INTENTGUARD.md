# IntentGuard — product + architecture (diligence-aligned)

**One-liner:** Injective-native execution policy for AI trading agents — typed exchange AuthZ + isolated signing + order economics, so an agent can propose trades without receiving authority to execute outside its mandate.

**Diligence:** [DILIGENCE.md](./DILIGENCE.md) · **Spike:** [INTENTGUARD-SPIKE.md](./INTENTGUARD-SPIKE.md)

Maps to gap **#2** (policy UX) and **#6** (trust / over-broad grants) in [docs/LANDSCAPE.md](../docs/LANDSCAPE.md).

---

## 1. The real problem (verified)

Official autosign / MCP `authz_grant` issues **`GenericAuthorization` per message type** + expiry. That is **not** IntentGuard.

What a session key holding `MsgCreateDerivativeMarketOrder` under GenericAuthorization can do:

| Can do | Why it matters |
|--------|----------------|
| Trade **any** market of that message type | No `market_ids` in GenericAuthorization |
| Any **size** up to collateral / margin rules | AuthZ has no notional field |
| Any **leverage** up to market max | Same |
| Thin-book / prompt-injection drains | "No withdrawals" ≠ "no loss" |

**Injective already has better primitives** — typed `Create*OrderAuthz` with `subaccount_id` + `market_ids[]` (Hummingbot builds these). Stock AutoSign does **not** expose those fields. IntentGuard must construct typed grants **and** enforce order notional / leverage off those grants (or in a Policy Vault).

Do **not** sell "first way to restrict markets" — Hummingbot already does typed market scoping. Sell **financial semantics** (notional, leverage, exposure, isolated signer, audit).

---

## 2. Design principles

1. **Agent never holds the grantee MsgExec key.** Proposal ≠ execution authority.
2. **Typed AuthZ for markets + subaccount; gateway/vault for notional & leverage.** Do not pretend AuthZ alone caps order size.
3. **Funding ceiling ≠ notional ceiling.** Dedicated subaccount contains collateral; gateway enforces `price × quantity`.
4. **Always allow de-risking.** Cancels / reduce-only never blocked by budget rules.
5. **Every decision has a reason.** Rejected proposals explain which invariant failed.
6. **Revoke on-chain first**, then clear local signer material.
7. **No dashboard until the 7-point spike checklist passes.**

---

## 3. Architecture (BUILD WITH CHANGES)

### Route A — AuthZ Gateway (**baseline delivery**)

```
Owner wallet → typed MsgGrant / MsgRevoke + funded subaccount
AI agent → propose_trade only (no grantee key)
IntentGuard gateway → decode + notional/leverage/market/expiry checks
Isolated signer → holds grantee key; re-validates; signs MsgExec only
Injective AuthZ → on-chain type / market_ids / subaccount / expiry
```

**Defensible claim:** An agent without the grantee key and without an alternate signing route cannot independently submit MsgExec under the owner's grant. Market/subaccount are also enforced on-chain. Notional/leverage depend on gateway/signer integrity (say that honestly).

v0 grant set (narrow):

- `CreateDerivativeLimitOrderAuthz` (subaccount + markets)
- `CancelDerivativeOrderAuthz` (same)

Do **not** grant market orders, batch updates, margin adds, or bank sends until required.

### Route B — Exchange Precompile Policy Vault (**challenger**)

Solidity vault owns the exchange account; agent EOA calls only guarded methods; vault validates then calls Exchange Precompile `0x…65` (direct access). Stronger if proven: policy and exchange call share one on-chain transaction; agent never needs MsgExec.

Spike in parallel. Promote only if testnet non-bypass is stronger than Route A. See [INTENTGUARD-SPIKE.md](./INTENTGUARD-SPIKE.md).

### What we are not building first

Generic multichain wallet · AuthZ-only UI · AUM product · full portfolio drawdown engine · options execution · dashboard before kill-switch pass.

---

## 4. Product surface (ordered)

| Priority | Component | Role |
|----------|-----------|------|
| P0 | Typed grant planner + isolated MsgExec signer | Core security path |
| P0 | Policy engine (markets, notional, leverage, expiry) | Gateway economics |
| P0 | Bypass / revoke test suite | Kill-switch evidence |
| P1 | Grant Auditor | Scores GenericAuthorization / over-broad grants |
| P1 | IntentGuard MCP (`propose_trade`, explain rejection) | Agent integration |
| P2 | Policy Vault (precompile) | If Route B wins |
| Later | Policy Composer (NL), hosted monitoring dashboard | After enforcement proven |

Example v0 policy schema (application-level; not an Injective proto):

```json
{
  "version": 1,
  "owner": "0xOWNER",
  "agent": "0xAGENT",
  "allowedMarkets": ["0xAPPROVED_MARKET_ID"],
  "allowedOrderTypes": ["DERIVATIVE_LIMIT"],
  "maxOrderNotional": "100",
  "maxLeverage": "3",
  "maxCollateral": "250",
  "maxOutstandingOrders": 1,
  "expiryTimestamp": 1794700800
}
```

---

## 5. Demo script (≈3 minutes)

Must use a **real** Injective order path after checklist pass.

1. **Authority:** typed grant + policy (markets, notional cap) shown.
2. **Fund:** limited collateral into dedicated subaccount (or vault).
3. **Allow:** agent proposes valid limit order → gateway signs → order on exchange.
4. **Deny:** wrong market or oversized notional → rejected; no order.
5. **Revoke:** owner MsgRevoke → further proposes fail; audit trail shown.
6. **(Addon)** OptionLens proposes hedge → IntentGuard allows/blocks (no options execution in v0).

---

## 6. Competitive landscape

| Product | Threat | IntentGuard differentiation |
|---------|--------|------------------------------|
| Official AutoSign / MCP | High adjacent | Typed grants + notional + isolated signer (AutoSign is msg-type only) |
| Hummingbot Injective connector | High adjacent | Higher-level financial guardrails on top of typed AuthZ they already use |
| Sup / Praxis (Sui) | Pattern | Own Injective CLOB / order / position semantics |
| Openfort / Privy | Very high category | Exchange-aware execution, not generic wallet policy |
| Polygon Agent Controls | Payments | Trading markets / notional / margin, not payment budgets |

Positioning: **Injective exchange-aware financial policy**, not "another agent wallet."

---

## 7. Technical spikes

See [INTENTGUARD-SPIKE.md](./INTENTGUARD-SPIKE.md) for the full 48h matrix and 7-point acceptance checklist.

Summary: Day 1 = typed AuthZ + MsgExec isolation; Day 2 = notional + bypass + Precompile challenger.

---

## 8. Risks (ranked)

| Rank | Risk | Mitigation |
|------|------|------------|
| 1 | Agent obtains grantee key / alternate MsgExec path | Isolated signer; no agent key env; bypass suite |
| 2 | Positioned as AuthZ UI | Lead with notional + isolation; Hummingbot already has market scoping |
| 3 | Funding ≠ notional confusion on perps | Three independent limits documented |
| 4 | Precompile vault unproven | Route A baseline; B is challenger |
| 5 | Openfort/Privy already enough | One-day competitive probe; own exchange semantics |
| 6 | Tiny Injective beachhead | Accept niche ARR; expand chains later |
| 7 | Aggregate exposure / partial fills wrong | v0: per-order + outstanding-order cap; no daily-loss claim |

---

## 9. Pitch (60 seconds)

1. Injective agents can trade via AuthZ — but stock AutoSign only scopes **message types**.
2. Typed exchange AuthZ can lock **markets + subaccount**; it still cannot cap **order notional**. And if the agent holds the grantee key, policy is theater.
3. IntentGuard: typed grants + isolated signer + financial policy — agent proposes, never executes outside mandate.
4. Live: allowed order lands; oversized/wrong-market dies; revoke kills the session.
5. Next: design partners, optional Policy Vault if precompile wins, OptionLens as the vertical demo.

---

## 10. Open decisions (post-spike)

1. Promote Route B Policy Vault if non-bypass is stronger — else keep A.
2. Ship Grant Auditor publicly regardless? (yes)
3. NL compiler only after enforcement proven.
4. Hosted monitoring pricing ($99–299 / $500–1.5k hypotheses) after 2 design partners.
5. Optional FeeGrant for grantee gas (docs FeeGrant examples) — backlog.
6. Prefer Indexer (`api.injective.exchange`) for post-exec order/balance proof — see `chain/verify.ts`.

Official docs/SDK inventory: [docs/RESOURCES.md](../docs/RESOURCES.md).

# IntentGuard — diligence lock (9 Nov 2026)

Source: ChatGPT deep diligence + our founder note. **Decision: BUILD WITH CHANGES.**

## Verdict

Do **not** build a generic AuthZ UI or agent-wallet clone of Sup/Openfort/Privy.

Build an **Injective-native financial execution policy layer**: typed exchange AuthZ + isolated grantee signer + order economics + dedicated funded subaccount. Optionally challenge with Exchange Precompile Policy Vault.

## What we accept as true (High confidence)

1. Typed exchange AuthZ exists: `Create*OrderAuthz` / `BatchUpdateOrdersAuthz` encode **`subaccount_id` + `market_ids[]`**.
2. Hummingbot already constructs these via `msg_grant_typed` ([account_delegation_script.py](https://github.com/hummingbot/hummingbot/blob/master/hummingbot/connector/exchange/injective_v2/account_delegation_script.py)).
3. Official MCP `authz_grant` / autosign skill uses **GenericAuthorization** (msg type + expiry only) — **not** full typed scoping. Do not rely on stock AutoSign for our security claim.
4. Typed AuthZ does **not** encode max notional / qty / leverage / cumulative loss → need gateway and/or Policy Vault.
5. Funding ceiling ≠ notional ceiling (perps). Track **collateral**, **per-order notional**, and (later) **aggregate exposure** separately.
6. Agent must **never** hold the **grantee** MsgExec key (owner/granter key is separate).
7. Category competitors (Sup, Praxis, Openfort, Privy, Polygon) raise the bar; adjacent Injective threats are **Hummingbot + official AutoSign**.
8. Huge agentic-commerce TAMs are **not** IntentGuard TAM. Beachhead = Injective agent/bot builders + small desks; charge for **control infra**, not AUM.
9. OptionLens = Demo Day vertical only. AgentPay = kill-switch pivot, not default hero.
10. **No dashboard until enforcement boundary is proven.**

## Architecture decision (refined)

| Route | What | Role |
|-------|------|------|
| **A — AuthZ Gateway (baseline delivery)** | Typed grants (markets + subaccount) → agent proposes → gateway validates notional/leverage → **isolated signer** holds grantee key → MsgExec | Ship this first |
| **B — Precompile Policy Vault (challenger)** | Solidity vault owns exchange account; agent EOA calls only guarded methods; vault calls `0x…65` Exchange Precompile | Spike in parallel; replace A only if stronger + proven |

**Defensible claim (Route A):** An agent without the grantee key and without an alternate signing route cannot independently MsgExec under the owner’s grant; market/subaccount are also checked on-chain; notional/leverage depend on gateway/signer integrity.

**Stronger claim (Route B, if proven):** Agent cannot trade the vault’s exchange account outside Solidity-encoded rules (assuming precompile authenticates the calling contract).

## Do not sell

- “First way to restrict markets” (Hummingbot already does typed grants).
- “AuthZ UI.”
- “Guaranteed max loss” without honest derivatives caveats.
- Trillion-dollar TAM slides as if they were IntentGuard revenue.

## Kill / pivot rules

**48h technical kill** → AgentPay Control if:

- Agent can obtain/use grantee key or another MsgExec path; **or**
- Typed AuthZ + isolated signer cannot be demonstrated; **and** Precompile vault also fails non-bypass.

**Business kill (after discovery)** if:

- &lt;2 design partners will integrate; AuthZ alone “already solves it”; Openfort/Privy solve the exact case; no willingness to discuss paid pilot.

## Customer discovery (this week)

- 10–12 interviews (don’t pitch first).
- ≥5 Injective agent builders, ≥3 financial operators.
- Goal: 2 integration commitments + 1 real policy scenario test.
- Interview scripts: see ChatGPT diligence §2.3 (repo keeps questions in [CUSTOMER-DISCOVERY.md](./CUSTOMER-DISCOVERY.md)).

## Code status vs diligence

| Built in `apps/intentguard` | Maps to diligence |
|-----------------------------|-------------------|
| Policy engine (markets, margin, notional, leverage, budget) | Gateway-layer order economics |
| Gateway session; agent API token ≠ key | Key isolation |
| Typed AuthZ grant planner (`CreateDerivativeLimitOrderAuthz` + cancel) | Route A grant construction (offline) |
| IsolatedGranteeSigner (approval-bound; no `sign(bytes)`) | Grantee key never on agent path |
| Allow → deny → revoke demo | Demo beats (offline) |
| Grant auditor: GenericAuthorization vs typed AuthZ | “Stock AutoSign is dangerous” narrative |
| LCD grant fetch CLI | Discovery / Auditor product wedge |

| Live spike progress (9 Nov 2026) | Status |
|----------------------------------|--------|
| Live typed MsgGrant on testnet | **Done** |
| Wrong-market / wrong-subaccount AuthZ | **Done** |
| Revoke blocks MsgExec | **Done** |
| Notional deny before broadcast | **Done** (`proposeAndExecLimitOrder`) |
| USDC fund + deposit + allowed MsgExec order | **Done** (tx `411EC045…`; subaccount index **1** — index 0 merged with bank post-v1.10) |
| Official Discord docs/SDK audit | **Done** — [docs/RESOURCES.md](../docs/RESOURCES.md); indexer verify wired |
| Precompile smoke + vault skeleton (Route B) | **Done** — [ROUTE-B.md](../docs/ROUTE-B.md); promote only if wired |
| Thin demo UX (`demo:pitch`, [DEMO.md](../docs/DEMO.md), `demo/index.html`) | **Done** |
| MCP policy tools (`intentguard-policy`) | **Done** — propose / plan_grant / audit_grants |
| FeeGrant | **Documented** — [FEEGRANT.md](../docs/FEEGRANT.md); prefund grantee in spike |

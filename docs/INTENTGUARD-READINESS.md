# IntentGuard execute readiness (Phase 2A.1 / 2A.1.1)

Readiness is an **informational pre-flight** check. It is **not** authorization to trade, **not** a guarantee that `/v1/execute` will succeed, and **not** a guarantee that an order will fill.

## Supported network

**Injective testnet only** for readiness chain queries. Requests with `?mainnet=1` receive **HTTP 400** — the gateway does not mix testnet/mainnet endpoints.

Deployed IntentGuard remains `INJECTIVE_NETWORK=testnet`. Query timeout default: `INTENTGUARD_READINESS_QUERY_TIMEOUT_MS` (default **12000** ms, single attempt, no retries).

## API

```
GET /v1/sessions/:sessionId/readiness
Authorization: Bearer own_…
```

Optional query:

- `marketId` — must be in the session policy when set; defaults to the first policy market

| HTTP | Meaning |
|------|---------|
| 200 | Structured readiness payload |
| 400 | Unsupported network (`mainnet=1`) |
| 401 | Missing/invalid owner API key |
| 404 | Unknown session |
| 410 | Session revoked |

`checkedAt` is set **after** all checks finish (completion time of the assessment).

## What each check proves — and does not

### grants (wallet permission)

**Proves:** Typed **limit + cancel** AuthZ grants exist for the session grantee, match session **subaccount**, and cover **all** policy markets (session-wide LCD read).

**Does not prove:** Per-intent policy compliance, agent token validity, or that execute will broadcast.

### granteeGas

**Proves:** Grantee `inj1…` bank balance has at least `INTENTGUARD_READINESS_MIN_GRANTEE_INJ` (default **0.2** INJ) on the same testnet used for readiness.

**Does not prove:** Fee sufficiency for a specific tx size/gas price, or owner wallet gas.

### market

**Proves:** Selected market exists on the testnet indexer, is **active**, is in policy, and has **both** active typed limit and cancel grants for that **market + subaccount** (or full session grant ready). Market **ready** also requires the grants check to be **ready** (no contradictory green market).

**Does not prove:** Liquidity, tick/min notional compliance, or oracle health.

### subaccountCollateral

**Proves:** Policy `maxMarginPerOrder` is a **valid positive decimal** and subaccount **available** balance in the market **quote denom** is at least that amount (integer-safe conversion).

**Does not prove:** This is **not an order simulation** — it ignores fees, open orders, positions, funding, notional caps, `minNotional`, daily budget, leverage on a concrete intent, or wrong-token deposits (shows as insufficient quote balance).

## Data sources (all testnet-aligned)

| Check | Source |
|-------|--------|
| **grants** | LCD `cosmos/authz/v1beta1/grants/granter/{granter}` (timeout wrapped) |
| **granteeGas** | `ChainGrpcBankApi.fetchBalances` → LCD fallback on same network |
| **subaccountCollateral** | Indexer `fetchSubaccountBalance(subaccountId, quoteDenom)` |
| **market** | Indexer `fetchMarkets()` |

## Failure states

- **action_required** — verified gap the user can fix.
- **unavailable** — query failed or timed out; **overall** cannot be `ready`.
- **ready** — all four checks passed on the last completed assessment (still not a fill guarantee).

## Readiness vs execution

| | Readiness | `/v1/execute` |
|---|-----------|----------------|
| Auth | Owner API key | Agent token `agt_…` |
| Grants | Read-only LCD | Re-verified on chain |
| Policy | Collateral hint from `maxMarginPerOrder` only | Full enforcement |
| Broadcast | Never | When enabled + allowed |

## Manual testnet verification

1. Local gateway + setup flow; create session with subaccount index **1**.
2. `curl -H "Authorization: Bearer $OWN" http://127.0.0.1:8787/v1/sessions/$SID/readiness`
3. Walk grants → gas → USDC on subaccount 1 → overall `ready`.
4. UI **Refresh** on `/protection` and `/trade` — no automatic execute.

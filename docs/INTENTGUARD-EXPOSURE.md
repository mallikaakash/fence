# IntentGuard exposure (Phase 2A.2)

IntentGuard Exposure is a **read-only indexer-based snapshot**. It is **not** an atomic view of chain state, a complete risk engine, a liquidation predictor, or a guarantee of current execution conditions.

## API

```
GET /v1/sessions/:sessionId/exposure
Authorization: Bearer own_…
```

| HTTP | Meaning |
|------|---------|
| 200 | Exposure payload |
| 400 | `mainnet=1` or `subaccountId` query (forbidden) |
| 401 | Owner auth required |
| 404 | Unknown session |
| 410 | Session revoked |

The gateway always uses the **session’s configured `subaccountId`**. Callers cannot override subaccount.

**Network:** testnet only (same as readiness). `?mainnet=1` → 400.

**Timeout:** `INTENTGUARD_READINESS_QUERY_TIMEOUT_MS` (default 12s) applied **per indexer page** (`fetchPositions` / `fetchSubaccountOrdersList`).

## Indexer methods & pagination (SDK 1.20.66)

| Data | SDK | Notes |
|------|-----|--------|
| Positions | `IndexerGrpcDerivativesApi.fetchPositions({ subaccountId, pagination: { skip, limit } })` | Proto `PositionsRequest.skip` / `limit` |
| Open orders | `IndexerGrpcDerivativesApi.fetchSubaccountOrdersList({ subaccountId, pagination: { skip, limit } })` | Same skip/limit contract |
| Market metadata | `IndexerGrpcDerivativesApi.fetchMarkets()` | Ticker, quote denom/symbol for normalization |

**Response paging (`ExchangePagination` / proto `Paging`):**

- `total` — total rows in the indexer for the query (when reported)
- `from` / `to` — window indices returned on this page
- `next` — `string[]` navigation tokens when the indexer provides cursor-style continuation
- IntentGuard advances **`skip` to the number of unique rows collected** (offset pagination per proto). It continues while `total` (if known) exceeds collected count, a full `limit` page was returned, or non-empty `next` tokens are present.
- Duplicate rows across pages are dropped by key (position: `marketId:subaccountId`, order: `orderHash`).
- Hitting `50` pages × `100` rows, duplicate-only pages, or a failing later page → `paginationComplete: false` and `overallStatus: partial` (earlier rows retained when possible).

## Order state semantics

**Confirmed open (included in `openOrders` + notional totals):**

- `BOOKED`
- `PARTIAL_FILLED` (underscore / hyphen / any casing)

**Confirmed closed (not returned as open):**

- `FILLED`, `CANCELLED` / `CANCELED`, `EXPIRED`

**Unknown (listed in `unknownStateOrders`, excluded from open counts and notionals):**

- Empty state, future enum values, or any string not in the allowlists above.

The API includes `summary.unknownOrderStateCount` and `warnings[]` when unknown states appear.

## Response (summary)

- `overallStatus`: `available` \| `partial` \| `unavailable`
- `positions[]`, `openOrders[]`, `unknownStateOrders[]` — normalized fields only
- `summary.byQuoteDenom[]` — long/short/gross position notionals and **confirmed** open-order notionals **per quote denom** (never mixed)
- `dataSources.positions` / `openOrders` — per-source status, `checkedAt`, error, `paginationComplete`
- `warnings[]` — unknown states, incomplete pagination, etc.
- `retrievedAt` — completion time of the assessment

## Notional methodology

- **Position:** `|quantity| × reference price` where reference is **mark price** if present, else **entry price**. Missing price → `notional.status: unavailable` (never a fabricated zero).
- **Open order (confirmed states only):** **remaining quantity** × **limit price** (`quantity − fillQuantity` when both parse).
- Aggregation uses integer decimal math (`exposure/decimal.ts`), display at 6 decimal places.
- Reduce-only orders are listed; they still contribute to open-order notional (pending reduce intent).

## Freshness & partial states

- Query failure with **no rows** → source `unavailable`, empty list **does not** mean zero exposure (UI must use `dataSources`).
- Query failure after some pages → source `available`, `paginationComplete: false`, rows preserved, warning surfaced.
- One source ok, one failed → `overallStatus: partial`.
- Incomplete pagination → `partial` with `paginationComplete: false`.

## Oracle / indexer limitations

- If `fetchPositions` fails on the first page (e.g. testnet `oracle data not found`), the positions source is `unavailable` and `positions[]` is empty — quantity cannot be shown without a successful indexer response.
- Indexer lag vs chain / Helix is expected.

## Security

Single-owner gateway API key; no grantee keys or agent tokens in response.

## Manual verification (testnet)

```bash
curl -s -H "Authorization: Bearer $OWN" \
  "http://127.0.0.1:8787/v1/sessions/$SID/exposure" | jq .overallStatus,.summary,.warnings
```

Compare with Helix testnet UI for the same subaccount (expect indexer lag).

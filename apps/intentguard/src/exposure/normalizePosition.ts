import type { DerivativePositionRow } from "../chain/exposureIndexer.ts";
import type { NormalizedPosition } from "./types.ts";
import type { MarketMetaMap } from "./marketMeta.ts";
import { marketMetaForId } from "./marketMeta.ts";
import { computePositionNotional } from "./calculateExposure.ts";

function resolveDirection(row: DerivativePositionRow): "long" | "short" | "unknown" {
  const d = String(row.direction ?? "").toLowerCase();
  if (d.includes("buy") || d === "long") return "long";
  if (d.includes("sell") || d === "short") return "short";
  const q = parseFloat(String(row.quantity ?? "0"));
  if (q > 0) return "long";
  if (q < 0) return "short";
  return "unknown";
}

export function normalizePosition(
  row: DerivativePositionRow,
  marketMap: MarketMetaMap,
): NormalizedPosition | null {
  const marketId = String(row.marketId ?? "");
  const quantity = String(row.quantity ?? "");
  if (!marketId || !quantity || quantity === "0") return null;

  const meta = marketMetaForId(marketMap, marketId);
  const direction = resolveDirection(row);

  const normalized: NormalizedPosition = {
    marketId,
    ticker: meta?.ticker,
    direction,
    quantity,
    entryPrice: row.entryPrice ? String(row.entryPrice) : undefined,
    markPrice: row.markPrice ? String(row.markPrice) : undefined,
    margin: row.margin ? String(row.margin) : undefined,
    liquidationPrice: row.liquidationPrice
      ? String(row.liquidationPrice)
      : undefined,
    unrealizedPnl:
      row.unrealizedPnl !== undefined
        ? String(row.unrealizedPnl)
        : row.pnl !== undefined
          ? String(row.pnl)
          : undefined,
    quoteDenom: meta?.quoteDenom,
    quoteSymbol: meta?.quoteSymbol,
  };

  normalized.notional = computePositionNotional(normalized);
  return normalized;
}

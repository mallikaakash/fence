import type { DerivativeOrderRow } from "../chain/exposureIndexer.ts";
import type { NormalizedOpenOrder, NormalizedUnknownStateOrder } from "./types.ts";
import type { MarketMetaMap } from "./marketMeta.ts";
import { marketMetaForId } from "./marketMeta.ts";
import { computeOrderNotional } from "./calculateExposure.ts";
import {
  classifyDerivativeOrderState,
  isConfirmedOpenDerivativeOrderState,
} from "./orderState.ts";

export { classifyDerivativeOrderState, isConfirmedOpenDerivativeOrderState };

export function derivativeOrderStateRaw(row: DerivativeOrderRow): string {
  return String(row.state ?? row.orderState ?? "");
}

function normalizeOrderBase(
  row: DerivativeOrderRow,
  marketMap: MarketMetaMap,
): Omit<NormalizedOpenOrder, "notional"> | null {
  const marketId = String(row.marketId ?? "");
  const orderHash = String(row.orderHash ?? row.order_hash ?? "");
  if (!marketId || !orderHash) return null;

  const meta = marketMetaForId(marketMap, marketId);
  const orderType = String(row.orderType ?? row.order_type ?? "");
  const directionRaw = String(row.orderSide ?? row.tradeDirection ?? row.direction ?? "").toLowerCase();
  const direction =
    directionRaw.includes("buy") || directionRaw === "1"
      ? "buy"
      : directionRaw.includes("sell") || directionRaw === "2"
        ? "sell"
        : orderType.toLowerCase().includes("buy")
          ? "buy"
          : orderType.toLowerCase().includes("sell")
            ? "sell"
            : "unknown";

  const price = String(row.price ?? "");
  const quantity = String(row.quantity ?? row.qty ?? "");
  if (!quantity) return null;

  const fillQuantity = row.fillQuantity ?? row.fill_quantity;
  const reduceOnly = Boolean(row.isReduceOnly ?? row.reduceOnly ?? row.is_reduce_only);
  const state = derivativeOrderStateRaw(row);

  return {
    orderHash,
    marketId,
    ticker: meta?.ticker,
    direction,
    limitPrice: price || undefined,
    quantity,
    fillQuantity: fillQuantity !== undefined ? String(fillQuantity) : undefined,
    reduceOnly,
    orderType: orderType || undefined,
    state,
    quoteDenom: meta?.quoteDenom,
    quoteSymbol: meta?.quoteSymbol,
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
  };
}

export function normalizeOpenOrder(
  row: DerivativeOrderRow,
  marketMap: MarketMetaMap,
): NormalizedOpenOrder | null {
  const state = derivativeOrderStateRaw(row);
  if (!isConfirmedOpenDerivativeOrderState(state)) return null;

  const base = normalizeOrderBase(row, marketMap);
  if (!base) return null;

  const normalized: NormalizedOpenOrder = {
    ...base,
    notional: undefined,
  };
  normalized.notional = computeOrderNotional(normalized);
  return normalized;
}

/** Observable row for unrecognized states — excluded from open-order totals. */
export function normalizeUnknownStateOrder(
  row: DerivativeOrderRow,
  marketMap: MarketMetaMap,
): NormalizedUnknownStateOrder | null {
  const state = derivativeOrderStateRaw(row);
  if (classifyDerivativeOrderState(state) !== "unknown") return null;

  const base = normalizeOrderBase(row, marketMap);
  if (!base) return null;

  return {
    ...base,
    stateClassification: "unknown",
    notional: undefined,
  };
}

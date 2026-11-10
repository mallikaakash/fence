import type { DerivativeMarketSnapshot } from "../chain/market.ts";

export type MarketMetaMap = Map<
  string,
  Pick<DerivativeMarketSnapshot, "ticker" | "quoteDenom" | "quoteSymbol" | "quoteDecimals">
>;

export function marketMetaForId(
  map: MarketMetaMap,
  marketId: string,
): MarketMetaMap extends Map<string, infer V> ? V | undefined : never {
  const key = marketId.toLowerCase();
  for (const [k, v] of map) {
    if (k.toLowerCase() === key) return v;
  }
  return undefined;
}

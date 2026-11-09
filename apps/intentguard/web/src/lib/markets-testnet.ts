import { SPIKE_MARKET_ID } from "@/lib/constants";

/** Popular Injective testnet perp markets for the Protect flow (on-chain allowlist). */
export const TESTNET_PERP_MARKETS: {
  id: string;
  label: string;
  symbol: string;
}[] = [
  {
    id: SPIKE_MARKET_ID,
    label: "INJ / USDT perp",
    symbol: "INJ",
  },
  {
    id: "0xfd704649cf3a516c0c145ab0111717c44640d8dbe52a462ae35cadf2f6df1515",
    label: "BTC / USDT perp",
    symbol: "BTC",
  },
];

export function defaultSelectedMarketIds(): string[] {
  return TESTNET_PERP_MARKETS.map((m) => m.id);
}

export function marketLabelById(marketId: string): string {
  return TESTNET_PERP_MARKETS.find((m) => m.id === marketId)?.label ?? "Unknown market";
}

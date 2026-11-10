import { IndexerGrpcDerivativesApi } from "@injectivelabs/sdk-ts";
import { indexerEndpointForNetwork } from "./network.ts";
import { readinessQueryTimeoutMs, withQueryTimeout } from "./queryTimeout.ts";

export type DerivativeMarketSnapshot = {
  marketId: string;
  ticker: string;
  quoteDenom: string;
  quoteSymbol: string;
  quoteDecimals: number;
  marketStatus: string;
  isPerpetual: boolean;
  indexerEndpoint: string;
};

export type DerivativeMarketQuery =
  | { status: "ok"; market: DerivativeMarketSnapshot }
  | { status: "not_found"; marketId: string }
  | { status: "unavailable"; error: string; indexerEndpoint: string };

/**
 * Resolve derivative market metadata (quote denom, status) from the Injective indexer.
 */
export async function fetchDerivativeMarketById(
  marketId: string,
  network: "testnet" | "mainnet" = "testnet",
  timeoutMs: number = readinessQueryTimeoutMs(),
): Promise<DerivativeMarketQuery> {
  const indexerEndpoint = indexerEndpointForNetwork(network);
  const api = new IndexerGrpcDerivativesApi(indexerEndpoint);
  try {
    const markets = await withQueryTimeout("indexer.markets", timeoutMs, () =>
      api.fetchMarkets(),
    );
    const match = markets.find(
      (m) =>
        (m.marketId ?? "").toLowerCase() === marketId.toLowerCase() ||
        (m as { market_id?: string }).market_id?.toLowerCase() ===
          marketId.toLowerCase(),
    );
    if (!match) {
      return { status: "not_found", marketId };
    }
    const quoteDecimals = Number(match.quoteToken?.decimals ?? 6);
    return {
      status: "ok",
      market: {
        marketId: match.marketId,
        ticker: match.ticker,
        quoteDenom: match.quoteDenom,
        quoteSymbol: match.quoteToken?.symbol ?? "quote",
        quoteDecimals: Number.isFinite(quoteDecimals) ? quoteDecimals : 6,
        marketStatus: String(match.marketStatus ?? "unknown"),
        isPerpetual: Boolean(
          (match as { isPerpetual?: boolean }).isPerpetual,
        ),
        indexerEndpoint,
      },
    };
  } catch (e) {
    return {
      status: "unavailable",
      error: e instanceof Error ? e.message : String(e),
      indexerEndpoint,
    };
  }
}

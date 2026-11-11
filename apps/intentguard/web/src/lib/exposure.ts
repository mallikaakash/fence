export type ExposureOverallStatus = "available" | "partial" | "unavailable";

export type DataSourceSlice = {
  status: string;
  checkedAt: string;
  error: string | null;
  paginationComplete?: boolean;
};

export type SessionExposureJson = {
  sessionId: string;
  overallStatus: ExposureOverallStatus;
  positions: Array<{
    marketId: string;
    ticker?: string;
    direction: string;
    quantity: string;
    markPrice?: string;
    entryPrice?: string;
    margin?: string;
    unrealizedPnl?: string;
    quoteSymbol?: string;
    notional?: { status: string; human?: string; reason?: string };
  }>;
  openOrders: Array<{
    orderHash: string;
    marketId: string;
    ticker?: string;
    direction: string;
    limitPrice?: string;
    quantity: string;
    reduceOnly?: boolean;
    state: string;
    quoteSymbol?: string;
    notional?: { status: string; human?: string; reason?: string };
  }>;
  unknownStateOrders?: Array<{
    orderHash: string;
    marketId: string;
    ticker?: string;
    direction: string;
    limitPrice?: string;
    quantity: string;
    state: string;
    stateClassification: string;
    quoteSymbol?: string;
  }>;
  summary: {
    positionCount: number;
    openOrderCount: number;
    unknownOrderStateCount?: number;
    byQuoteDenom: Array<{
      quoteDenom: string;
      quoteSymbol?: string;
      longPositionNotional: { status: string; human?: string };
      shortPositionNotional: { status: string; human?: string };
      grossPositionNotional: { status: string; human?: string };
      openOrderNotional: { status: string; human?: string };
    }>;
  };
  warnings?: string[];
  dataSources: {
    positions: DataSourceSlice;
    openOrders: DataSourceSlice;
  };
  retrievedAt: string;
  disclaimer: string;
};

export function exposureHeadline(status: ExposureOverallStatus): string {
  if (status === "available") return "Exposure snapshot loaded from the indexer.";
  if (status === "partial")
    return "Some exposure data is missing — see warnings below.";
  return "Could not load exposure from the indexer.";
}

export function exposurePanelClass(status: ExposureOverallStatus): string {
  if (status === "available") return "border-white/15 text-white/80";
  if (status === "partial") return "border-amber-500/40 text-amber-100";
  return "border-amber-500/30 text-amber-200";
}

export type ExposureListKind = "positions" | "openOrders";

export function exposureSectionCaption(params: {
  kind: ExposureListKind;
  source: DataSourceSlice;
  itemCount: number;
  overallStatus: ExposureOverallStatus;
}): string {
  const { kind, source, itemCount, overallStatus } = params;
  const label = kind === "positions" ? "positions" : "open orders";

  if (source.status !== "available") {
    const reason = source.error ? ` (${source.error})` : "";
    return `${kind === "positions" ? "Position" : "Open-order"} data unavailable.${reason}`;
  }

  if (overallStatus === "partial" && source.paginationComplete === false) {
    return `Indexer snapshot incomplete — confirmed ${label} below may not be exhaustive.`;
  }

  if (itemCount === 0) {
    return kind === "positions"
      ? "No open positions reported by the indexer."
      : "No confirmed open limit orders reported by the indexer.";
  }

  return "";
}

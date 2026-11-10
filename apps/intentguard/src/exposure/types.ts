export type ExposureOverallStatus = "available" | "partial" | "unavailable";

export type SourceStatus = "available" | "unavailable";

export type NotionalSnapshot =
  | {
      status: "available";
      human: string;
      quoteDenom: string;
      referencePrice: string;
      referencePriceField: "markPrice" | "entryPrice" | "limitPrice";
    }
  | {
      status: "unavailable";
      quoteDenom?: string;
      reason: string;
    };

export type NormalizedPosition = {
  marketId: string;
  ticker?: string;
  direction: "long" | "short" | "unknown";
  quantity: string;
  entryPrice?: string;
  markPrice?: string;
  margin?: string;
  liquidationPrice?: string;
  unrealizedPnl?: string;
  quoteDenom?: string;
  quoteSymbol?: string;
  notional?: NotionalSnapshot;
};

export type NormalizedOpenOrder = {
  orderHash: string;
  marketId: string;
  ticker?: string;
  direction: "buy" | "sell" | "unknown";
  limitPrice?: string;
  quantity: string;
  fillQuantity?: string;
  reduceOnly?: boolean;
  orderType?: string;
  state: string;
  quoteDenom?: string;
  quoteSymbol?: string;
  updatedAt?: string;
  notional?: NotionalSnapshot;
};

/** Indexer order with unrecognized state — listed for diagnosis, not counted as open. */
export type NormalizedUnknownStateOrder = Omit<NormalizedOpenOrder, "notional"> & {
  stateClassification: "unknown";
  notional?: undefined;
};

export type QuoteDenomExposure = {
  quoteDenom: string;
  quoteSymbol?: string;
  longPositionNotional: NotionalSnapshot;
  shortPositionNotional: NotionalSnapshot;
  grossPositionNotional: NotionalSnapshot;
  openOrderNotional: NotionalSnapshot;
};

export type MarketBreakdownRow = {
  marketId: string;
  ticker?: string;
  quoteDenom?: string;
  positionCount: number;
  openOrderCount: number;
  hasLong: boolean;
  hasShort: boolean;
};

export type SessionExposureResponse = {
  sessionId: string;
  overallStatus: ExposureOverallStatus;
  positions: NormalizedPosition[];
  openOrders: NormalizedOpenOrder[];
  /** Orders with unrecognized indexer state (not counted in open-order totals). */
  unknownStateOrders: NormalizedUnknownStateOrder[];
  summary: {
    positionCount: number;
    openOrderCount: number;
    unknownOrderStateCount: number;
    /** Notional grouped per quote asset — never mixed across denoms. */
    byQuoteDenom: QuoteDenomExposure[];
  };
  /** Human-readable exposure warnings (unknown states, incomplete pagination, etc.). */
  warnings: string[];
  marketBreakdown: MarketBreakdownRow[];
  dataSources: {
    positions: {
      status: SourceStatus;
      checkedAt: string;
      error: string | null;
      paginationComplete: boolean;
    };
    openOrders: {
      status: SourceStatus;
      checkedAt: string;
      error: string | null;
      paginationComplete: boolean;
    };
  };
  subaccount: { subaccountId: string };
  disclaimer: string;
  retrievedAt: string;
};

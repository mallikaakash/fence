/** Human-authored trading policy (v1). Amounts are decimal strings in quote units (e.g. USDT). */
export type IntentGuardPolicy = {
  version: 1;
  /** Allowed Injective market ids (hex). Empty = deny all. */
  marketIds: string[];
  /** Max margin / collateral committed per order. Not the same as order notional. */
  maxMarginPerOrder: string;
  /**
   * Max order notional = price × quantity (quote units).
   * Independent of funding ceiling — required when price+quantity are on the intent.
   */
  maxOrderNotional?: string;
  /** Max leverage as a positive number (e.g. 3). */
  maxLeverage: number;
  /** Rolling daily margin budget (same units as maxMarginPerOrder). */
  dailyMarginBudget: string;
  /** Optional ISO expiry; if past, all non-reduce-only intents deny. */
  expiresAt?: string;
  /** Closing / reducing risk always allowed when true (default true). */
  reduceOnlyAlwaysAllowed?: boolean;
};

export type TradeIntent = {
  marketId: string;
  /** Margin / collateral for the order (quote units). */
  margin: string;
  /** Absolute leverage requested. */
  leverage: number;
  /** Limit price (quote). With quantity, enables notional check. */
  price?: string;
  /** Order quantity (base). With price, enables notional check. */
  quantity?: string;
  /** If true, intent only reduces exposure. */
  reduceOnly?: boolean;
  /** Optional label for logs. */
  side?: "buy" | "sell" | "long" | "short";
};

export type PolicyDecision =
  | { allow: true; reasons: string[] }
  | { allow: false; reasons: string[] };

export type EvaluateOptions = {
  /** Margin already used today (same units). */
  dailyMarginUsed?: string;
  /** Clock override for tests (ms). */
  nowMs?: number;
};

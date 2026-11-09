/**
 * v0 Msg types we may grant — limit orders + cancel only.
 * No market orders, batch updates, margin adds, or bank sends.
 */
export const V0_TRADING_MSG_TYPES = [
  "/injective.exchange.v1beta1.MsgCreateDerivativeLimitOrder",
  "/injective.exchange.v1beta1.MsgCancelDerivativeOrder",
] as const;

/** @deprecated Prefer V0_TRADING_MSG_TYPES — kept for export stability. */
export const SAFE_TRADING_MSG_TYPES = V0_TRADING_MSG_TYPES;

/**
 * Injective typed exchange AuthZ type URLs (protobuf Authorization implementations).
 * These encode subaccount_id + market_ids[] — unlike GenericAuthorization.
 */
export const TYPED_EXCHANGE_AUTHZ = {
  CreateDerivativeLimitOrderAuthz:
    "/injective.exchange.v1beta1.CreateDerivativeLimitOrderAuthz",
  CreateDerivativeMarketOrderAuthz:
    "/injective.exchange.v1beta1.CreateDerivativeMarketOrderAuthz",
  CancelDerivativeOrderAuthz:
    "/injective.exchange.v1beta1.CancelDerivativeOrderAuthz",
  BatchUpdateOrdersAuthz: "/injective.exchange.v1beta1.BatchUpdateOrdersAuthz",
  CreateSpotLimitOrderAuthz:
    "/injective.exchange.v1beta1.CreateSpotLimitOrderAuthz",
  CreateSpotMarketOrderAuthz:
    "/injective.exchange.v1beta1.CreateSpotMarketOrderAuthz",
  GenericExchangeAuthorization:
    "/injective.exchange.v1beta1.GenericExchangeAuthorization",
} as const;

/** Hummingbot `msg_grant_typed` msg_type strings for composer. */
export const HUMMINGBOT_TYPED_MSG = {
  CreateDerivativeLimitOrderAuthz: "CreateDerivativeLimitOrderAuthz",
  CancelDerivativeOrderAuthz: "CancelDerivativeOrderAuthz",
  CreateDerivativeMarketOrderAuthz: "CreateDerivativeMarketOrderAuthz",
  BatchUpdateOrdersAuthz: "BatchUpdateOrdersAuthz",
} as const;

export const DANGEROUS_MSG_TYPE_SUBSTRINGS = [
  "MsgSend",
  "MsgWithdraw",
  "MsgTransfer",
  "MsgMultiSend",
  "MsgDelegate",
  "MsgExec",
] as const;

export type GrantRiskFinding = {
  severity: "critical" | "high" | "medium" | "info";
  code: string;
  message: string;
};

export type GrantAuditReport = {
  granter: string;
  grantCount: number;
  score: number;
  findings: GrantRiskFinding[];
  grants: Array<{
    grantee: string;
    authorizationType: string;
    msgTypeUrl?: string;
    expiration?: string;
    subaccountId?: string;
    marketIds?: string[];
  }>;
};

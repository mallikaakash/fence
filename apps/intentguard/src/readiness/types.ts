export type ReadinessOverallStatus = "ready" | "action_required" | "unavailable";

export type ReadinessCheckStatus = "ready" | "action_required" | "unavailable";

export type ReadinessCheck = {
  status: ReadinessCheckStatus;
  summary: string;
  instructions?: string[];
  details?: Record<string, unknown>;
};

export type SessionReadinessResponse = {
  sessionId: string;
  overallStatus: ReadinessOverallStatus;
  sessionActive: boolean;
  sessionIssues: string[];
  checks: {
    grants: ReadinessCheck;
    granteeGas: ReadinessCheck;
    subaccountCollateral: ReadinessCheck;
    market: ReadinessCheck;
  };
  market: {
    marketId: string;
    ticker?: string;
    quoteDenom?: string;
    quoteSymbol?: string;
    marketStatus?: string;
  };
  subaccount: {
    subaccountId?: string;
    subaccountIndex?: number;
    ownerAddress?: string;
    granteeAddress?: string;
  };
  policyHints: {
    minCollateralQuote: string;
    note: string;
  };
  checkedAt: string;
  /** Informational — readiness does not authorize execution. */
  disclaimer: string;
  executeEnabled?: boolean;
};

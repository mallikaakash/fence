export type ReadinessCheckStatus = "ready" | "action_required" | "unavailable";

export type ReadinessCheck = {
  status: ReadinessCheckStatus;
  summary: string;
  instructions?: string[];
  details?: Record<string, unknown>;
};

export type SessionReadinessJson = {
  sessionId: string;
  overallStatus: ReadinessCheckStatus;
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
  };
  policyHints: {
    minCollateralQuote: string;
    note: string;
  };
  checkedAt: string;
  disclaimer: string;
  executeEnabled?: boolean;
};

export function overallHeadline(status: ReadinessCheckStatus): string {
  if (status === "ready") {
    return "Your trading setup looks ready for a pre-flight check.";
  }
  if (status === "unavailable") {
    return "We could not fully verify readiness — retry after a moment.";
  }
  return "Your trading setup is almost ready.";
}

export function statusColor(status: ReadinessCheckStatus): string {
  if (status === "ready") return "text-green-300 border-green-500/40";
  if (status === "unavailable") return "text-amber-200 border-amber-500/40";
  return "text-amber-100 border-amber-500/30";
}

import type { SessionGrantStatus } from "../authz/verifySessionGrant.ts";
import { subaccountsMatch } from "../authz/parseLcdAuthz.ts";

const TYPED_LIMIT =
  /CreateDerivativeLimitOrderAuthz|create_derivative_limit_order_authz/i;
const TYPED_CANCEL =
  /CancelDerivativeOrderAuthz|cancel_derivative_order_authz/i;

function normMarket(id: string): string {
  return id.toLowerCase().replace(/^0x/, "");
}

function isActiveExpiration(expiration?: string): boolean {
  if (!expiration) return true;
  const t = Date.parse(expiration);
  return !Number.isFinite(t) || t >= Date.now();
}

type GrantRow = SessionGrantStatus["grantsSummary"][number];

function grantRowCoversMarket(
  row: GrantRow,
  pattern: RegExp,
  subaccountId: string,
  marketId: string,
): boolean {
  if (!pattern.test(row.authorizationType)) return false;
  if (!row.subaccountId || !row.marketIds?.length) return false;
  if (!subaccountsMatch(row.subaccountId, subaccountId)) return false;
  if (!isActiveExpiration(row.expiration)) return false;
  const want = normMarket(marketId);
  return row.marketIds.some((m) => normMarket(m) === want);
}

/**
 * Per-market typed grant coverage: active limit + cancel for session subaccount.
 * Session-wide `grantStatus.ready` still implies all policy markets (used when true).
 */
export function marketTypedGrantCoverage(params: {
  grantStatus: SessionGrantStatus;
  policyMarketIds: string[];
  subaccountId: string;
  marketId: string;
}): { covered: boolean; limitOk: boolean; cancelOk: boolean; usedSessionReady: boolean } {
  const { grantStatus, marketId, subaccountId, policyMarketIds } = params;
  const inPolicy = policyMarketIds.some(
    (m) => normMarket(m) === normMarket(marketId),
  );
  if (!inPolicy) {
    return { covered: false, limitOk: false, cancelOk: false, usedSessionReady: false };
  }

  if (grantStatus.ready) {
    return { covered: true, limitOk: true, cancelOk: true, usedSessionReady: true };
  }

  const rows = grantStatus.grantsSummary ?? [];
  const limitOk = rows.some((r) =>
    grantRowCoversMarket(r, TYPED_LIMIT, subaccountId, marketId),
  );
  const cancelOk = rows.some((r) =>
    grantRowCoversMarket(r, TYPED_CANCEL, subaccountId, marketId),
  );
  return {
    covered: limitOk && cancelOk,
    limitOk,
    cancelOk,
    usedSessionReady: false,
  };
}

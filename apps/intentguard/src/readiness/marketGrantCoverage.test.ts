import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { marketTypedGrantCoverage } from "./marketGrantCoverage.ts";
import type { SessionGrantStatus } from "../authz/verifySessionGrant.ts";
import { SPIKE_ALLOWED_MARKET_ID } from "../chain/network.ts";

const SUB = "0xaaa0000000000000000000000000000000000000000000000000000000000001";

function status(partial: Partial<SessionGrantStatus>): SessionGrantStatus {
  return {
    granter: "inj1granter",
    grantee: "inj1grantee",
    network: "testnet",
    ready: false,
    limitReady: false,
    cancelReady: false,
    scopeMatch: false,
    matchingGrants: 0,
    issues: [],
    userFacingIssues: [],
    endpoint: "https://lcd",
    grantsSummary: [],
    onChainLimitScopes: [],
    ...partial,
  };
}

describe("marketTypedGrantCoverage", () => {
  it("requires both limit and cancel for the market and subaccount", () => {
    const gs = status({
      grantsSummary: [
        {
          authorizationType: "CreateDerivativeLimitOrderAuthz",
          subaccountId: SUB,
          marketIds: [SPIKE_ALLOWED_MARKET_ID],
        },
      ],
    });
    const r = marketTypedGrantCoverage({
      grantStatus: gs,
      policyMarketIds: [SPIKE_ALLOWED_MARKET_ID],
      subaccountId: SUB,
      marketId: SPIKE_ALLOWED_MARKET_ID,
    });
    assert.equal(r.limitOk, true);
    assert.equal(r.cancelOk, false);
    assert.equal(r.covered, false);
  });

  it("rejects subaccount mismatch", () => {
    const gs = status({
      grantsSummary: [
        {
          authorizationType: "CreateDerivativeLimitOrderAuthz",
          subaccountId: "0xwrong",
          marketIds: [SPIKE_ALLOWED_MARKET_ID],
        },
        {
          authorizationType: "CancelDerivativeOrderAuthz",
          subaccountId: "0xwrong",
          marketIds: [SPIKE_ALLOWED_MARKET_ID],
        },
      ],
    });
    const r = marketTypedGrantCoverage({
      grantStatus: gs,
      policyMarketIds: [SPIKE_ALLOWED_MARKET_ID],
      subaccountId: SUB,
      marketId: SPIKE_ALLOWED_MARKET_ID,
    });
    assert.equal(r.covered, false);
  });
});

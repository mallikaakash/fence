import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GatewaySession } from "../gateway/session.ts";
import type { SessionReadinessResponse } from "../readiness/types.ts";
import { assertExecuteReadinessForBroadcast } from "./executeReadinessGate.ts";
import { SPIKE_ALLOWED_MARKET_ID } from "../chain/network.ts";

function session(): GatewaySession {
  return {
    sessionId: "sess_gate",
    agentApiToken: "agt_gate",
    granteeAddress: "inj1grantee",
    granteePrivateKeyHex: "a".repeat(64),
    policy: {
      version: 1,
      marketIds: [SPIKE_ALLOWED_MARKET_ID],
      maxMarginPerOrder: "50",
      maxOrderNotional: "500",
      maxLeverage: 5,
      dailyMarginBudget: "500",
    },
    dailyMarginUsed: "0",
    revoked: false,
    createdAt: new Date().toISOString(),
    ownerInjectiveAddress: "inj1owner",
    subaccountId:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890000001",
    subaccountIndex: 1,
  };
}

const ready: SessionReadinessResponse = {
  sessionId: "sess_gate",
  overallStatus: "ready",
  sessionActive: true,
  sessionIssues: [],
  checks: {
    grants: { status: "ready", summary: "ok" },
    granteeGas: { status: "ready", summary: "ok" },
    subaccountCollateral: { status: "ready", summary: "ok" },
    market: { status: "ready", summary: "ok" },
  },
  market: { marketId: SPIKE_ALLOWED_MARKET_ID },
  subaccount: {},
  policyHints: { minCollateralQuote: "50", note: "" },
  checkedAt: new Date().toISOString(),
  disclaimer: "",
};

describe("executeReadinessGate", () => {
  it("passes when overall ready", async () => {
    const out = await assertExecuteReadinessForBroadcast({
      session: session(),
      network: "testnet",
      marketId: SPIKE_ALLOWED_MARKET_ID,
      assess: async () => ready,
    });
    assert.equal(out.ok, true);
  });

  it("fails when collateral missing", async () => {
    const out = await assertExecuteReadinessForBroadcast({
      session: session(),
      network: "testnet",
      marketId: SPIKE_ALLOWED_MARKET_ID,
      assess: async () => ({
        ...ready,
        overallStatus: "action_required",
        checks: {
          ...ready.checks,
          subaccountCollateral: {
            status: "action_required",
            summary: "needs USDC",
          },
        },
      }),
    });
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.errorCode, "execute_readiness_not_ready");
      assert.match(out.blockers.join(" "), /subaccountCollateral/);
    }
  });
});

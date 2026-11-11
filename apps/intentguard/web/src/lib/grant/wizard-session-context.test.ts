import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionFromGatewayPublicView } from "./wizard-session-context.ts";

describe("sessionFromGatewayPublicView", () => {
  it("returns null when subaccount or policy missing", () => {
    assert.equal(
      sessionFromGatewayPublicView({
        sessionId: "sess_x",
        granteeAddress: "inj1g",
        ownerInjectiveAddress: "inj1o",
      }),
      null,
    );
  });

  it("maps full session for GrantApprovalPanel", () => {
    const ctx = sessionFromGatewayPublicView({
      sessionId: "sess_x",
      granteeAddress: "inj1grantee",
      ownerInjectiveAddress: "inj1owner",
      subaccountId: "0xabc0001",
      policy: {
        marketIds: ["0xmarket"],
        maxMarginPerOrder: "10",
        maxOrderNotional: "10",
        maxLeverage: 2,
        dailyMarginBudget: "100",
      },
    });
    assert.ok(ctx);
    assert.equal(ctx!.sessionId, "sess_x");
    assert.equal(ctx!.policy.marketIds.length, 1);
  });
});

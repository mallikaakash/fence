import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planTradingGrant } from "./planGrant.ts";
import { TYPED_EXCHANGE_AUTHZ } from "./types.ts";
import type { IntentGuardPolicy } from "../policy/types.ts";

const policy: IntentGuardPolicy = {
  version: 1,
  marketIds: ["0xabc", "0xdef"],
  maxMarginPerOrder: "100",
  maxOrderNotional: "250",
  maxLeverage: 3,
  dailyMarginBudget: "500",
};

describe("planTradingGrant (typed AuthZ)", () => {
  it("emits typed grants with subaccount + market_ids, not GenericAuthorization", () => {
    const plan = planTradingGrant({
      granteeAddress: "inj1grantee",
      policy,
      subaccountId: "0xowner0000000000000000000000000000000000000000000000000000000001",
    });

    assert.equal(plan.mode, "typed_exchange_authz");
    assert.equal(plan.typedGrants.length, 2);
    for (const g of plan.typedGrants) {
      assert.equal(g.subaccountId, plan.subaccountId);
      assert.deepEqual(g.marketIds, ["0xabc", "0xdef"]);
      assert.doesNotMatch(g.authorizationTypeUrl, /GenericAuthorization/);
    }
    assert.equal(
      plan.typedGrants[0].authorizationTypeUrl,
      TYPED_EXCHANGE_AUTHZ.CreateDerivativeLimitOrderAuthz,
    );
    assert.equal(
      plan.typedGrants[1].authorizationTypeUrl,
      TYPED_EXCHANGE_AUTHZ.CancelDerivativeOrderAuthz,
    );
    assert.match(plan.defensibleClaim, /grantee signing key/i);
    assert.ok(plan.gatewayEnforced.includes("per-order notional (price × quantity) when provided"));
  });

  it("refuses empty market list", () => {
    assert.throws(
      () =>
        planTradingGrant({
          granteeAddress: "inj1g",
          policy: { ...policy, marketIds: [] },
          subaccountId: "0xsub",
        }),
      /empty marketIds/,
    );
  });

  it("refuses missing subaccount", () => {
    assert.throws(
      () =>
        planTradingGrant({
          granteeAddress: "inj1g",
          policy,
          subaccountId: "  ",
        }),
      /subaccountId/,
    );
  });

  it("can omit cancel grant", () => {
    const plan = planTradingGrant({
      granteeAddress: "inj1g",
      policy,
      subaccountId: "0xsub",
      includeCancel: false,
    });
    assert.equal(plan.typedGrants.length, 1);
  });
});

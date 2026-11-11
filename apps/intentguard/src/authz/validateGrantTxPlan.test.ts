import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGrantTxPlan } from "./buildGrantTx.ts";
import { planTradingGrant } from "./planGrant.ts";
import {
  validateGrantTxPlanAgainstSession,
  type WireMsgGrant,
} from "./validateGrantTxPlan.ts";

const policy = {
  version: 1 as const,
  marketIds: [
    "0x4ca0f92fc28be0c91aac85684d25837d8d0d9ccd8d3225fdde9fb054d64544cf",
  ],
  maxMarginPerOrder: "100",
  maxOrderNotional: "50",
  maxLeverage: 5,
  dailyMarginBudget: "500",
};

describe("validateGrantTxPlanAgainstSession", () => {
  it("accepts matching plan and tx", () => {
    const plan = planTradingGrant({
      granteeAddress: "inj1grantee",
      subaccountId: "0xef4cea0000000000000000000000000000000001",
      policy,
      expirySeconds: 3600,
    });
    const built = buildGrantTxPlan({
      granter: "inj1owner",
      grantee: "inj1grantee",
      plan,
    });
    const txPlan = {
      expirationUnix: built.expirationUnix,
      expirationIso: built.expirationIso,
      msgGrants: built.msgGrants as WireMsgGrant[],
    };
    const v = validateGrantTxPlanAgainstSession({
      sessionId: "sess_x",
      ownerInjectiveAddress: "inj1owner",
      granteeAddress: "inj1grantee",
      subaccountId: "0xef4cea0000000000000000000000000000000001",
      policy,
      grantPlan: plan,
      txPlan,
    });
    assert.equal(v.ok, true);
  });

  it("rejects granter mismatch", () => {
    const plan = planTradingGrant({
      granteeAddress: "inj1grantee",
      subaccountId: "0xef4cea0000000000000000000000000000000001",
      policy,
      expirySeconds: 3600,
    });
    const built = buildGrantTxPlan({
      granter: "inj1wrong",
      grantee: "inj1grantee",
      plan,
    });
    const txPlan = {
      expirationUnix: built.expirationUnix,
      expirationIso: built.expirationIso,
      msgGrants: built.msgGrants as WireMsgGrant[],
    };
    const v = validateGrantTxPlanAgainstSession({
      sessionId: "sess_x",
      ownerInjectiveAddress: "inj1owner",
      granteeAddress: "inj1grantee",
      subaccountId: "0xef4cea0000000000000000000000000000000001",
      policy,
      grantPlan: plan,
      txPlan,
    });
    assert.equal(v.ok, false);
    if (!v.ok) assert.ok(v.errors.some((e) => e.includes("granter")));
  });

  it("rejects past expiration", () => {
    const plan = planTradingGrant({
      granteeAddress: "inj1grantee",
      subaccountId: "0xef4cea0000000000000000000000000000000001",
      policy,
      expirySeconds: 3600,
    });
    const built = buildGrantTxPlan({
      granter: "inj1owner",
      grantee: "inj1grantee",
      plan,
    });
    const txPlan = {
      expirationUnix: built.expirationUnix,
      expirationIso: built.expirationIso,
      msgGrants: built.msgGrants as WireMsgGrant[],
    };
    const v = validateGrantTxPlanAgainstSession({
      sessionId: "sess_x",
      ownerInjectiveAddress: "inj1owner",
      granteeAddress: "inj1grantee",
      subaccountId: "0xef4cea0000000000000000000000000000000001",
      policy,
      grantPlan: plan,
      txPlan,
      nowMs: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    });
    assert.equal(v.ok, false);
  });
});

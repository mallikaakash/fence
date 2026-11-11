import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sessionFingerprint,
  validatePreSignGrant,
  type GrantTxPlanResponse,
  type SessionGrantContext,
} from "./grant-plan-validation.ts";

const session: SessionGrantContext = {
  sessionId: "sess_test",
  ownerInjectiveAddress: "inj1owneraaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  granteeAddress: "inj1granteeaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  subaccountId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0001",
  policy: {
    marketIds: ["0x4ca0f92fc28be0c91aac85684d25837d8d0d9ccd8d3225fdde9fb054d64544cf"],
    maxMarginPerOrder: "100",
    maxOrderNotional: "50",
    maxLeverage: 5,
    dailyMarginBudget: "500",
  },
};

function envelope(
  overrides: Partial<GrantTxPlanResponse> = {},
): GrantTxPlanResponse {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    sessionId: session.sessionId,
    expirySeconds: 3600,
    grantPlan: {
      granteeAddress: session.granteeAddress,
      subaccountId: session.subaccountId,
      marketIds: session.policy.marketIds,
      expirySeconds: 3600,
    },
    txPlan: {
      expirationUnix: exp,
      expirationIso: new Date(exp * 1000).toISOString(),
      msgGrants: [
        {
          granter: session.ownerInjectiveAddress,
          grantee: session.granteeAddress,
          expiration: exp,
          authorization: {
            typeUrl: "/injective.exchange.v1beta1.CreateDerivativeLimitOrderAuthz",
            value: { 0: 1 },
          },
        },
        {
          granter: session.ownerInjectiveAddress,
          grantee: session.granteeAddress,
          expiration: exp,
          authorization: {
            typeUrl: "/injective.exchange.v1beta1.CancelDerivativeOrderAuthz",
            value: { 0: 1 },
          },
        },
      ],
    },
    ...overrides,
  };
}

describe("validatePreSignGrant", () => {
  it("rejects wrong wallet", () => {
    const v = validatePreSignGrant({
      network: "testnet",
      connectedWallet: "inj1otheraaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      session,
      planEnvelope: envelope(),
      expirySecondsChosen: 3600,
      sessionSnapshotAtFetch: session,
    });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("owner")));
  });

  it("rejects mainnet", () => {
    const v = validatePreSignGrant({
      network: "mainnet",
      connectedWallet: session.ownerInjectiveAddress,
      session,
      planEnvelope: envelope(),
      expirySecondsChosen: 3600,
      sessionSnapshotAtFetch: session,
    });
    assert.equal(v.ok, false);
  });

  it("rejects stale session", () => {
    const snap = { ...session };
    const changed = { ...session, granteeAddress: "inj1changedaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
    const v = validatePreSignGrant({
      network: "testnet",
      connectedWallet: session.ownerInjectiveAddress,
      session: changed,
      planEnvelope: envelope(),
      expirySecondsChosen: 3600,
      sessionSnapshotAtFetch: snap,
    });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("re-fetch")));
  });

  it("rejects missing authorization", () => {
    const env = envelope();
    env.txPlan.msgGrants = env.txPlan.msgGrants.slice(0, 1);
    const v = validatePreSignGrant({
      network: "testnet",
      connectedWallet: session.ownerInjectiveAddress,
      session,
      planEnvelope: env,
      expirySecondsChosen: 3600,
      sessionSnapshotAtFetch: session,
    });
    assert.equal(v.ok, false);
  });

  it("accepts valid envelope", () => {
    const v = validatePreSignGrant({
      network: "testnet",
      connectedWallet: session.ownerInjectiveAddress,
      session,
      planEnvelope: envelope(),
      expirySecondsChosen: 3600,
      sessionSnapshotAtFetch: session,
    });
    assert.equal(v.ok, true);
  });
});

describe("sessionFingerprint", () => {
  it("changes when markets change", () => {
    const a = sessionFingerprint(session);
    const b = sessionFingerprint({
      ...session,
      policy: { ...session.policy, marketIds: [...session.policy.marketIds, "0x02"] },
    });
    assert.notEqual(a, b);
  });
});

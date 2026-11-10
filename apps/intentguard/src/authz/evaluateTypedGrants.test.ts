import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateTypedGrantsForSession } from "./evaluateTypedGrants.ts";
import type { RawGrant } from "./score.ts";

const SUB = "0x0000000000000000000000000000000000000001000000000000000000000001";
const M1 = "0xmarket1";
const M2 = "0xmarket2";

function limitGrant(overrides: Partial<RawGrant> = {}): RawGrant {
  return {
    grantee: "inj1grantee",
    authorizationType:
      "/injective.exchange.v1beta1.CreateDerivativeLimitOrderAuthz",
    msgTypeUrl: undefined,
    expiration: new Date(Date.now() + 86_400_000).toISOString(),
    subaccountId: SUB,
    marketIds: [M1, M2],
    ...overrides,
  };
}

function cancelGrant(overrides: Partial<RawGrant> = {}): RawGrant {
  return {
    grantee: "inj1grantee",
    authorizationType:
      "/injective.exchange.v1beta1.CancelDerivativeOrderAuthz",
    msgTypeUrl: undefined,
    expiration: new Date(Date.now() + 86_400_000).toISOString(),
    subaccountId: SUB,
    marketIds: [M1, M2],
    ...overrides,
  };
}

describe("evaluateTypedGrantsForSession", () => {
  it("ready when both grants present and scoped", () => {
    const r = evaluateTypedGrantsForSession({
      grantsForGrantee: [limitGrant(), cancelGrant()],
      subaccountId: SUB,
      policyMarketIds: [M1],
    });
    assert.equal(r.ready, true);
    assert.equal(r.limitReady, true);
    assert.equal(r.cancelReady, true);
    assert.equal(r.userFacingIssues.length, 0);
  });

  it("not ready when limit grant missing", () => {
    const r = evaluateTypedGrantsForSession({
      grantsForGrantee: [cancelGrant()],
      subaccountId: SUB,
      policyMarketIds: [M1],
    });
    assert.equal(r.ready, false);
    assert.equal(r.limitReady, false);
    assert.equal(r.cancelReady, true);
    assert.ok(r.userFacingIssues.some((u) => /Place-order/.test(u)));
  });

  it("not ready when cancel grant missing", () => {
    const r = evaluateTypedGrantsForSession({
      grantsForGrantee: [limitGrant()],
      subaccountId: SUB,
      policyMarketIds: [M1],
    });
    assert.equal(r.ready, false);
    assert.equal(r.cancelReady, false);
    assert.ok(r.userFacingIssues.some((u) => /Cancel-order/.test(u)));
  });

  it("not ready for wrong grantee scope (wrong markets)", () => {
    const r = evaluateTypedGrantsForSession({
      grantsForGrantee: [
        limitGrant({ marketIds: [M1] }),
        cancelGrant({ marketIds: [M1] }),
      ],
      subaccountId: SUB,
      policyMarketIds: [M2],
    });
    assert.equal(r.ready, false);
    assert.equal(r.limitReady, false);
    assert.equal(r.cancelReady, false);
  });

  it("not ready when grantee does not match expected", () => {
    const r = evaluateTypedGrantsForSession({
      grantsForGrantee: [
        limitGrant({ grantee: "inj1other" }),
        cancelGrant({ grantee: "inj1other" }),
      ],
      expectedGrantee: "inj1grantee",
      subaccountId: SUB,
      policyMarketIds: [M1],
    });
    assert.equal(r.ready, false);
    assert.equal(r.limitReady, false);
    assert.equal(r.cancelReady, false);
  });

  it("not ready when subaccount mismatches session", () => {
    const r = evaluateTypedGrantsForSession({
      grantsForGrantee: [
        limitGrant({ subaccountId: "0xwrong" }),
        cancelGrant({ subaccountId: "0xwrong" }),
      ],
      subaccountId: SUB,
      policyMarketIds: [M1],
    });
    assert.equal(r.ready, false);
  });

  it("not ready for generic authorization instead of typed", () => {
    const r = evaluateTypedGrantsForSession({
      grantsForGrantee: [
        {
          grantee: "inj1grantee",
          authorizationType: "/cosmos.authz.v1beta1.GenericAuthorization",
          msgTypeUrl: undefined,
          expiration: new Date(Date.now() + 86_400_000).toISOString(),
          subaccountId: SUB,
          marketIds: [M1],
        },
      ],
      expectedGrantee: "inj1grantee",
      subaccountId: SUB,
      policyMarketIds: [M1],
    });
    assert.equal(r.ready, false);
    assert.ok(r.issues.some((i) => /generic|missing/.test(i)));
  });

  it("ready when both grants valid (explicit grantee filter)", () => {
    const r = evaluateTypedGrantsForSession({
      grantsForGrantee: [limitGrant(), cancelGrant()],
      expectedGrantee: "inj1grantee",
      subaccountId: SUB,
      policyMarketIds: [M1, M2],
    });
    assert.equal(r.ready, true);
  });

  it("not ready when grant expired", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const r = evaluateTypedGrantsForSession({
      grantsForGrantee: [
        limitGrant({ expiration: past }),
        cancelGrant({ expiration: past }),
      ],
      subaccountId: SUB,
      policyMarketIds: [M1],
    });
    assert.equal(r.ready, false);
    assert.ok(r.userFacingIssues.some((u) => /expired/i.test(u)));
  });
});

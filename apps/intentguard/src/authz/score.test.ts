import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreGrants } from "./score.ts";

describe("scoreGrants", () => {
  it("penalizes generic trading grants and MsgSend", () => {
    const report = scoreGrants("inj1me", [
      {
        grantee: "inj1bot",
        authorizationType: "/cosmos.authz.v1beta1.GenericAuthorization",
        msgTypeUrl: "/injective.exchange.v1beta1.MsgCreateDerivativeMarketOrder",
      },
      {
        grantee: "inj1bad",
        authorizationType: "/cosmos.authz.v1beta1.GenericAuthorization",
        msgTypeUrl: "/cosmos.bank.v1beta1.MsgSend",
      },
    ]);
    assert.ok(report.score < 50);
    assert.ok(report.findings.some((f) => f.code === "generic_authorization"));
    assert.ok(report.findings.some((f) => f.code === "dangerous_msg"));
  });

  it("recognizes typed AuthZ scope but flags missing notional", () => {
    const report = scoreGrants("inj1me", [
      {
        grantee: "inj1gateway",
        authorizationType:
          "/injective.exchange.v1beta1.CreateDerivativeLimitOrderAuthz",
        subaccountId: "0xsub1",
        marketIds: ["0xbtc"],
        expiration: new Date(Date.now() + 86400_000).toISOString(),
      },
    ]);
    assert.ok(report.findings.some((f) => f.code === "typed_authz_scoped"));
    assert.ok(report.findings.some((f) => f.code === "typed_authz_no_notional"));
    assert.ok(report.score > 80);
  });
});

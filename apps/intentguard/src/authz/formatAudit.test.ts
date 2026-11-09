import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatGrantAuditReport } from "./formatAudit.ts";
import { scoreGrants } from "./score.ts";

describe("formatGrantAuditReport", () => {
  it("summarizes high-risk GenericAuthorization", () => {
    const report = scoreGrants("inj1x", [
      {
        grantee: "inj1bot",
        authorizationType: "/cosmos.authz.v1beta1.GenericAuthorization",
        msgTypeUrl: "/injective.exchange.v1beta1.MsgCreateDerivativeMarketOrder",
      },
    ]);
    const text = formatGrantAuditReport(report);
    assert.match(text, /GenericAuthorization/);
    assert.match(text, /Stock-style grants/);
  });
});

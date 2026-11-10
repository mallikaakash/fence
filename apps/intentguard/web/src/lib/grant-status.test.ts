import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGrantStatusJson } from "./grant-status.ts";

describe("parseGrantStatusJson", () => {
  it("requires both grants when limitReady and cancelReady present", () => {
    const p = parseGrantStatusJson({
      grantStatus: {
        ready: true,
        limitReady: true,
        cancelReady: false,
        userFacingIssues: ["Cancel-order permission is missing"],
      },
    });
    assert.equal(p.ready, false);
    assert.equal(p.cancelReady, false);
  });

  it("treats legacy ready-only payload as full permission", () => {
    const p = parseGrantStatusJson({
      grantStatus: { ready: true },
    });
    assert.equal(p.ready, true);
    assert.equal(p.limitReady, true);
    assert.equal(p.cancelReady, true);
  });
});

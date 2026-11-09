import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifySessionGrantOnChain } from "./verifySessionGrant.ts";

describe("verifySessionGrantOnChain (local validation)", () => {
  it("fails fast without owner address", async () => {
    const s = await verifySessionGrantOnChain({
      session: {
        granteeAddress: "inj1abc",
        ownerInjectiveAddress: undefined,
        revoked: false,
      },
    });
    assert.equal(s.ready, false);
    assert.match(s.issues.join(" "), /ownerInjectiveAddress/);
  });

  it("fails when session revoked", async () => {
    const s = await verifySessionGrantOnChain({
      session: {
        granteeAddress: "inj1abc",
        ownerInjectiveAddress: "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz",
        revoked: true,
      },
    });
    assert.equal(s.ready, false);
    assert.ok(s.issues.includes("session revoked"));
  });
});

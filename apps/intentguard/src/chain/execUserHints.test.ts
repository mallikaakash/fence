import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { humanizeBroadcastError } from "./execUserHints.ts";

describe("humanizeBroadcastError", () => {
  it("detects grantee gas", () => {
    const h = humanizeBroadcastError("insufficient funds for fee");
    assert.equal(h.code, "grantee_gas");
  });

  it("detects margin", () => {
    const h = humanizeBroadcastError("insufficient margin in subaccount");
    assert.equal(h.code, "subaccount_margin");
  });
});

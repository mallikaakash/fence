import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyWalletFromGrantStatus, lcdClassToWalletOutcome } from "./wallet-lcd-state.ts";

describe("classifyWalletFromGrantStatus", () => {
  it("both grants absent → cleared", () => {
    assert.equal(
      classifyWalletFromGrantStatus({
        ready: false,
        limitReady: false,
        cancelReady: false,
        userFacingIssues: [],
      }),
      "cleared",
    );
  });

  it("limit only → incomplete", () => {
    assert.equal(
      classifyWalletFromGrantStatus({
        ready: false,
        limitReady: true,
        cancelReady: false,
        userFacingIssues: [],
      }),
      "incomplete_on_chain",
    );
  });

  it("both present → incomplete", () => {
    assert.equal(
      classifyWalletFromGrantStatus({
        ready: true,
        limitReady: true,
        cancelReady: true,
        userFacingIssues: [],
      }),
      "incomplete_on_chain",
    );
  });
});

describe("lcdClassToWalletOutcome", () => {
  it("inconclusive → pending_confirmation", () => {
    assert.equal(lcdClassToWalletOutcome("inconclusive"), "pending_confirmation");
  });
});

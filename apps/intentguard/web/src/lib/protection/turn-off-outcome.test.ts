import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTurnOffMessage,
  resultFromDimensions,
  type TurnOffDimensions,
} from "./turn-off-outcome.ts";

function dim(overrides: Partial<TurnOffDimensions>): TurnOffDimensions {
  return {
    txHashes: [],
    txsAttempted: 0,
    txsExpected: 2,
    wallet: "failed",
    session: "preserved",
    ...overrides,
  };
}

describe("buildTurnOffMessage", () => {
  it("no broadcast — session preserved", () => {
    const m = buildTurnOffMessage(
      dim({ wallet: "failed", session: "preserved", broadcastError: "User rejected" }),
    );
    assert.equal(m.isCompleteSuccess, false);
    assert.match(m.message, /unchanged|not revoked/i);
    assert.equal(m.canRetrySession, false);
  });

  it("first revoke broadcast, second fails — still attempts session story", () => {
    const m = buildTurnOffMessage(
      dim({
        txHashes: ["abc"],
        txsAttempted: 1,
        wallet: "incomplete_on_chain",
        session: "ended",
      }),
    );
    assert.equal(m.isCompleteSuccess, false);
    assert.match(m.message, /session ended/i);
    assert.match(m.message, /incomplete/i);
  });

  it("full success", () => {
    const m = buildTurnOffMessage(
      dim({
        txHashes: ["a", "b"],
        txsAttempted: 2,
        wallet: "cleared",
        session: "ended",
      }),
    );
    assert.equal(m.isCompleteSuccess, true);
    assert.match(m.message, /Wallet permission revoked/i);
    assert.match(m.message, /session ended/i);
  });

  it("gateway cleanup failure after broadcast", () => {
    const m = buildTurnOffMessage(
      dim({
        txHashes: ["a"],
        txsAttempted: 1,
        wallet: "broadcast_only",
        session: "failed",
        sessionError: "503",
      }),
    );
    assert.equal(m.canRetrySession, true);
    assert.match(m.message, /Retry session cleanup/i);
  });

  it("session ended but wallet still active on LCD", () => {
    const m = buildTurnOffMessage(
      dim({
        txHashes: ["a", "b"],
        txsAttempted: 2,
        wallet: "incomplete_on_chain",
        session: "ended",
      }),
    );
    assert.equal(m.isCompleteSuccess, false);
    assert.match(m.message, /wallet permission revocation is incomplete/i);
  });
});

describe("resultFromDimensions", () => {
  it("never reports ok:true unless wallet cleared and session ended", () => {
    const partial = resultFromDimensions(
      dim({
        txHashes: ["x"],
        txsAttempted: 1,
        wallet: "incomplete_on_chain",
        session: "ended",
      }),
      "sess_1",
    );
    assert.equal(partial.ok, false);

    const full = resultFromDimensions(
      dim({
        txHashes: ["x", "y"],
        txsAttempted: 2,
        wallet: "cleared",
        session: "ended",
      }),
    );
    assert.equal(full.ok, true);
  });
});

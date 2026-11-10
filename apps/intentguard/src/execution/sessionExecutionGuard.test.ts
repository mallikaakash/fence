import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SessionExecutionGuard } from "./sessionExecutionGuard.ts";

describe("SessionExecutionGuard revoke coordination", () => {
  it("signalRevoke during claimed sets abort flag", () => {
    const guard = new SessionExecutionGuard();
    guard.tryAcquire("sess_1", "prp_1", "hash_1");
    assert.equal(guard.signalRevokeDuringExecute("sess_1"), "claimed");
    assert.equal(guard.shouldAbortForRevokeSignal("sess_1"), true);
  });

  it("signalRevoke during broadcasting does not claim pre-broadcast abort", () => {
    const guard = new SessionExecutionGuard();
    guard.tryAcquire("sess_2", "prp_2", "hash_2");
    guard.enterBroadcasting("sess_2");
    assert.equal(guard.signalRevokeDuringExecute("sess_2"), "broadcasting");
    assert.equal(guard.shouldAbortForRevokeSignal("sess_2"), false);
  });
});

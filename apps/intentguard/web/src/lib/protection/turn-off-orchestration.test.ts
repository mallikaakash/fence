import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  orchestrateTurnOffProtection,
  type TurnOffOrchestrationDeps,
  type OrchestrationTrace,
} from "./turn-off-orchestration.ts";

const settings = { baseUrl: "http://test", ownerApiKey: "", agentApiToken: "agt_x" };
const sessionId = "sess_test";

function deps(over: Partial<TurnOffOrchestrationDeps>): TurnOffOrchestrationDeps {
  return {
    broadcastRevokes: async () => ({ txHashes: [] }),
    endGatewaySession: async () => ({ ended: true }),
    pollWalletAfterBroadcast: async () => "cleared",
    snapshotWallet: async () => "pending_confirmation",
    clearLocal: () => {},
    ...over,
  };
}

describe("orchestrateTurnOffProtection", () => {
  it("zero broadcasts preserves session", async () => {
    const out = await orchestrateTurnOffProtection({
      sessionId,
      settings,
      deps: deps({}),
      txHashes: [],
      txsAttempted: 0,
    });
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.dimensions.session, "preserved");
  });

  it("partial broadcast triggers immediate gateway cleanup before poll", async () => {
    const order: string[] = [];
    const trace: OrchestrationTrace = {
      gatewayRevokeCalled: false,
      gatewayRevokeBeforePoll: false,
      pollCalled: false,
      clearLocalCalled: false,
    };
    const d = deps({
      endGatewaySession: async () => {
        order.push("gateway");
        return { ended: true };
      },
      pollWalletAfterBroadcast: async () => {
        order.push("poll");
        return "pending_confirmation";
      },
      clearLocal: () => order.push("clear"),
    });
    await orchestrateTurnOffProtection({
      sessionId,
      settings,
      deps: d,
      txHashes: ["abc"],
      txsAttempted: 1,
      trace,
    });
    assert.deepEqual(order, ["gateway", "clear", "poll"]);
    assert.equal(trace.gatewayRevokeCalled, true);
    assert.equal(trace.gatewayRevokeBeforePoll, true);
    assert.equal(trace.clearLocalCalled, true);
  });

  it("gateway failure preserves retry session id", async () => {
    const out = await orchestrateTurnOffProtection({
      sessionId,
      settings,
      deps: deps({
        endGatewaySession: async () => ({ ended: false, error: "503" }),
      }),
      txHashes: ["tx1", "tx2"],
      txsAttempted: 2,
    });
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.canRetrySession, true);
      assert.equal(out.sessionId, sessionId);
    }
  });

  it("successful cleanup clears local credentials", async () => {
    let cleared = false;
    await orchestrateTurnOffProtection({
      sessionId,
      settings,
      deps: deps({ clearLocal: () => { cleared = true; } }),
      txHashes: ["a", "b"],
      txsAttempted: 2,
    });
    assert.equal(cleared, true);
  });

  it("LCD timeout cannot produce full success", async () => {
    const out = await orchestrateTurnOffProtection({
      sessionId,
      settings,
      deps: deps({
        pollWalletAfterBroadcast: async () => "pending_confirmation",
      }),
      txHashes: ["a", "b"],
      txsAttempted: 2,
    });
    assert.notEqual(out.ok, true);
  });

  it("repeated cleanup is idempotent", async () => {
    let calls = 0;
    const d = deps({
      endGatewaySession: async () => {
        calls += 1;
        return { ended: true };
      },
    });
    await orchestrateTurnOffProtection({
      sessionId,
      settings,
      deps: d,
      txHashes: ["a"],
      txsAttempted: 1,
    });
    await orchestrateTurnOffProtection({
      sessionId,
      settings,
      deps: d,
      txHashes: ["a"],
      txsAttempted: 1,
    });
    assert.equal(calls, 2);
  });
});

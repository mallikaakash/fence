import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IntentGuardGateway } from "./session.ts";
import type { IntentGuardPolicy } from "../policy/types.ts";

const policy: IntentGuardPolicy = {
  version: 1,
  marketIds: ["0xETH"],
  maxMarginPerOrder: "100",
  maxLeverage: 3,
  dailyMarginBudget: "200",
};

describe("IntentGuardGateway", () => {
  it("runs allow → deny → revoke demo path", () => {
    const gw = new IntentGuardGateway();
    const { view, agent } = gw.createSession({
      policy,
      granteePrivateKeyHex:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      granteeAddress: "inj1gateway",
    });

    assert.equal(gw.debugHasGranteeKey(view.sessionId), true);
    assert.equal("granteePrivateKeyHex" in (agent as object), false);

    const allow = gw.propose(agent, {
      marketId: "0xETH",
      margin: "50",
      leverage: 2,
    });
    assert.equal(allow.status, "allowed");

    // daily used 50; budget 200 — still room, then oversize margin hits per-order cap
    const denySize = gw.propose(agent, {
      marketId: "0xETH",
      margin: "150",
      leverage: 2,
    });
    assert.equal(denySize.status, "denied");

    const denyMarket = gw.propose(agent, {
      marketId: "0xBAD",
      margin: "10",
      leverage: 1,
    });
    assert.equal(denyMarket.status, "denied");

    gw.revoke(view.sessionId);
    const after = gw.propose(agent, {
      marketId: "0xETH",
      margin: "10",
      leverage: 1,
    });
    assert.equal(after.status, "denied");
    assert.equal(gw.debugHasGranteeKey(view.sessionId), false);
  });

  it("denies propose when agent token expired", () => {
    const gw = new IntentGuardGateway();
    const { agent } = gw.createSession({
      policy,
      granteePrivateKeyHex: "c".repeat(64),
      granteeAddress: "inj1gateway",
      agentTokenTtlMs: -1,
    });
    const denied = gw.propose(agent, {
      marketId: "0xETH",
      margin: "1",
      leverage: 1,
    });
    assert.equal(denied.status, "denied");
    assert.match(denied.decisionReasons.join(" "), /expired/i);
  });
});


import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertAgentHasNoSigningKey,
  isGranteeMaterialExposedToAgent,
} from "./keys.ts";
import { proposeTrade } from "./propose.ts";
import type { IntentGuardPolicy } from "../policy/types.ts";

const policy: IntentGuardPolicy = {
  version: 1,
  marketIds: ["0xETH"],
  maxMarginPerOrder: "100",
  maxLeverage: 3,
  dailyMarginBudget: "300",
};

describe("non-bypass key rules", () => {
  it("rejects agent credential that looks like a private key (T2)", () => {
    assert.throws(
      () =>
        assertAgentHasNoSigningKey({
          role: "agent",
          apiToken:
            "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        }),
      /must not be a raw private key/,
    );
  });

  it("detects grantee key leaked into agent env (T2)", () => {
    assert.equal(
      isGranteeMaterialExposedToAgent({
        INTENTGUARD_GRANTEE_PRIVATE_KEY:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      }),
      true,
    );
    assert.equal(
      isGranteeMaterialExposedToAgent({ INTENTGUARD_AGENT_TOKEN: "sess_abc" }),
      false,
    );
  });

  it("denies before would-sign on bad market (T4)", () => {
    const result = proposeTrade({
      agent: { role: "agent", apiToken: "sess_ok" },
      policy,
      intent: { marketId: "0xBAD", margin: "10", leverage: 1 },
    });
    assert.equal(result.status, "denied");
    assert.equal(result.wouldSign, false);
    assert.equal(result.signed, false);
  });

  it("allows path only marks wouldSign (T3 stub)", () => {
    const result = proposeTrade({
      agent: { role: "agent", apiToken: "sess_ok" },
      policy,
      intent: { marketId: "0xETH", margin: "10", leverage: 2 },
    });
    assert.equal(result.status, "allowed");
    assert.equal(result.wouldSign, true);
    assert.equal(result.signed, false);
  });
});

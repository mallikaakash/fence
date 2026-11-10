import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IntentGuardGateway } from "../gateway/session.ts";
import { executeAgentIntent } from "./execute.ts";
import type { IntentGuardPolicy } from "../policy/types.ts";

const policy: IntentGuardPolicy = {
  version: 1,
  marketIds: ["0xETH"],
  maxMarginPerOrder: "100",
  maxLeverage: 3,
  dailyMarginBudget: "200",
};

describe("executeAgentIntent agent token expiry", () => {
  it("denies execute when agent token expired", async () => {
    const gw = new IntentGuardGateway();
    const { agent } = gw.createSession({
      policy,
      granteePrivateKeyHex: "d".repeat(64),
      granteeAddress: "inj1gateway",
      ownerInjectiveAddress: "inj1owner1234567890123456789012345678901234",
      agentTokenTtlMs: -1,
    });

    const out = await executeAgentIntent({
      gateway: gw,
      agentApiToken: agent.apiToken,
      intent: { marketId: "0xETH", margin: "1", leverage: 1 },
      requireOnChainGrant: false,
    });

    assert.equal(out.status, "denied");
    assert.ok(
      out.reasons?.some((r) => /expired/i.test(r)),
      out.reasons?.join("; "),
    );
  });
});

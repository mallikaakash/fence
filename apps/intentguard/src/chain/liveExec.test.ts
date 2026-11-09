import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IsolatedGranteeSigner } from "../gateway/signer.ts";
import type { IntentGuardPolicy } from "../policy/types.ts";
import { proposeAndExecLimitOrder } from "./liveExec.ts";
import type { SpikeWallet } from "./keys.ts";

const policy: IntentGuardPolicy = {
  version: 1,
  marketIds: ["0xallowed"],
  maxMarginPerOrder: "100",
  maxOrderNotional: "50",
  maxLeverage: 3,
  dailyMarginBudget: "500",
};

const owner: SpikeWallet = {
  role: "owner",
  injectiveAddress: "inj1owner",
  ethereumAddress: "0xowner",
  subaccountId: "0x" + "11".repeat(20) + "0".repeat(24),
  subaccountIndex: 1,
  privateKeyHex: "aa".repeat(32),
};

const grantee: SpikeWallet = {
  role: "grantee",
  injectiveAddress: "inj1grantee",
  ethereumAddress: "0xgrantee",
  subaccountId: "0x" + "22".repeat(20) + "0".repeat(24),
  subaccountIndex: 1,
  privateKeyHex: "bb".repeat(32),
};

describe("proposeAndExecLimitOrder notional gate", () => {
  it("denies oversized notional before any broadcast attempt", async () => {
    const signer = new IsolatedGranteeSigner({
      granteeAddress: grantee.injectiveAddress,
      privateKeyHex: grantee.privateKeyHex,
    });

    const result = await proposeAndExecLimitOrder({
      agent: { role: "agent", apiToken: "agt_live_test" },
      policy,
      intent: {
        marketId: "0xallowed",
        margin: "10",
        leverage: 2,
        price: "100",
        quantity: "1", // notional 100 > max 50
      },
      owner,
      grantee,
      signer,
    });

    assert.equal(result.status, "denied");
    assert.equal(result.stage, "policy");
    assert.equal(result.signed, false);
    assert.equal(result.broadcast, false);
    assert.match(result.reasons.join(" "), /notional/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IsolatedGranteeSigner,
  canonicalLimitOrderPayload,
} from "./signer.ts";
import type { AgentCredential } from "./keys.ts";

const agent: AgentCredential = {
  role: "agent",
  apiToken: "agt_test_token_not_a_key",
};

describe("IsolatedGranteeSigner", () => {
  it("signs only with a valid approval; never exposes key to agent path", () => {
    const signer = new IsolatedGranteeSigner({
      granteeAddress: "inj1grantee",
      privateKeyHex: "aa".repeat(32),
    });

    const canonicalPayload = canonicalLimitOrderPayload({
      msgTypeUrl: "/injective.exchange.v1beta1.MsgCreateDerivativeLimitOrder",
      marketId: "0xbtc",
      subaccountId: "0xsub1",
      price: "100",
      quantity: "1",
      margin: "50",
    });

    const approval = signer.issueApproval({
      canonicalPayload,
      policyVersion: 1,
      nonce: "n1",
      expiresAtMs: Date.now() + 60_000,
    });

    const ok = signer.signApprovedPayload({
      agent,
      canonicalPayload,
      approval,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.match(ok.signatureHex, /^[0-9a-f]{64}$/);

    const tampered = signer.signApprovedPayload({
      agent,
      canonicalPayload: canonicalPayload + "x",
      approval,
    });
    assert.equal(tampered.ok, false);

    assert.throws(() => signer.signBytes(new Uint8Array([1, 2, 3])), /disabled/);

    signer.destroy();
    const after = signer.signApprovedPayload({
      agent,
      canonicalPayload,
      approval,
    });
    assert.equal(after.ok, false);
    assert.equal(signer.debugKeyPresent(), false);
  });

  it("rejects expired approvals", () => {
    const signer = new IsolatedGranteeSigner({
      granteeAddress: "inj1g",
      privateKeyHex: "bb".repeat(32),
    });
    const canonicalPayload = '{"m":1}';
    const approval = signer.issueApproval({
      canonicalPayload,
      policyVersion: 1,
      nonce: "n2",
      expiresAtMs: Date.now() - 1,
    });
    const r = signer.signApprovedPayload({
      agent,
      canonicalPayload,
      approval,
      nowMs: Date.now(),
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /expired/);
  });

  it("rejects replay of the same approval nonce", () => {
    const signer = new IsolatedGranteeSigner({
      granteeAddress: "inj1g",
      privateKeyHex: "cc".repeat(32),
    });
    const canonicalPayload = '{"m":2}';
    const approval = signer.issueApproval({
      canonicalPayload,
      policyVersion: 1,
      nonce: "once",
      expiresAtMs: Date.now() + 60_000,
    });
    const first = signer.signApprovedPayload({ agent, canonicalPayload, approval });
    const second = signer.signApprovedPayload({ agent, canonicalPayload, approval });
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    if (!second.ok) assert.match(second.reason, /replay/);
  });
});

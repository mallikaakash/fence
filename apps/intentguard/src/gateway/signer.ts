import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { assertAgentHasNoSigningKey, type AgentCredential } from "./keys.ts";

/**
 * Isolated grantee signer (Route A).
 *
 * Security rules:
 * - Holds the ephemeral grantee private key material.
 * - Never returns the key to the agent.
 * - No generic sign(bytes) — only signApprovedPayload after re-validation.
 * - Approval token binds payload hash + policy version + nonce + expiry.
 */

export type ApprovedPayload = {
  /** Canonical JSON (or hex) of the MsgExec body to sign. */
  canonicalPayload: string;
  policyVersion: number;
  nonce: string;
  /** Unix ms after which this approval is invalid. */
  expiresAtMs: number;
  /** SHA-256 hex of canonicalPayload, bound into the approval token. */
  payloadHash: string;
};

export type ApprovalToken = {
  token: string;
  payloadHash: string;
  policyVersion: number;
  nonce: string;
  expiresAtMs: number;
};

export type SignResult =
  | { ok: true; signatureHex: string; signedAtMs: number }
  | { ok: false; reason: string };

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function issueTokenSecret(): string {
  return randomBytes(32).toString("hex");
}

function sealApproval(parts: {
  secret: string;
  payloadHash: string;
  policyVersion: number;
  nonce: string;
  expiresAtMs: number;
}): string {
  const body = [
    parts.payloadHash,
    String(parts.policyVersion),
    parts.nonce,
    String(parts.expiresAtMs),
  ].join("|");
  return createHash("sha256")
    .update(parts.secret + ":" + body, "utf8")
    .digest("hex");
}

export class IsolatedGranteeSigner {
  readonly granteeAddress: string;
  /** Opaque — never exported via agent APIs. */
  #privateKeyHex: string;
  #approvalSecret: string;
  #destroyed = false;
  /** Single-use nonces — replay of the same approval is rejected. */
  #consumedNonces = new Set<string>();

  constructor(params: { granteeAddress: string; privateKeyHex: string }) {
    if (!params.privateKeyHex || params.privateKeyHex.length < 32) {
      throw new Error("IsolatedGranteeSigner: invalid private key material");
    }
    this.granteeAddress = params.granteeAddress;
    this.#privateKeyHex = params.privateKeyHex;
    this.#approvalSecret = issueTokenSecret();
  }

  /** Test / ops only — must never be called from agent-facing code paths. */
  debugKeyPresent(): boolean {
    return !this.#destroyed && this.#privateKeyHex.length > 0;
  }

  destroy(): void {
    this.#destroyed = true;
    this.#privateKeyHex = "";
    this.#approvalSecret = "";
    this.#consumedNonces.clear();
  }

  /**
   * Gateway issues an approval after policy evaluation.
   * Agent never sees this token's construction secret.
   */
  issueApproval(payload: Omit<ApprovedPayload, "payloadHash">): ApprovalToken {
    if (this.#destroyed) {
      throw new Error("signer destroyed");
    }
    const payloadHash = sha256Hex(payload.canonicalPayload);
    const token = sealApproval({
      secret: this.#approvalSecret,
      payloadHash,
      policyVersion: payload.policyVersion,
      nonce: payload.nonce,
      expiresAtMs: payload.expiresAtMs,
    });
    return {
      token,
      payloadHash,
      policyVersion: payload.policyVersion,
      nonce: payload.nonce,
      expiresAtMs: payload.expiresAtMs,
    };
  }

  /**
   * Re-validate approval + payload, then "sign".
   * Spike: returns a deterministic HMAC-style signature placeholder (not chain-ready).
   * Live MsgExec broadcast wires here next — still never exposes #privateKeyHex.
   */
  signApprovedPayload(params: {
    agent: AgentCredential;
    canonicalPayload: string;
    approval: ApprovalToken;
    nowMs?: number;
  }): SignResult {
    assertAgentHasNoSigningKey(params.agent);

    if (this.#destroyed || !this.#privateKeyHex) {
      return { ok: false, reason: "signer destroyed or key cleared" };
    }

    const now = params.nowMs ?? Date.now();
    if (now >= params.approval.expiresAtMs) {
      return { ok: false, reason: "approval expired" };
    }

    const payloadHash = sha256Hex(params.canonicalPayload);
    if (payloadHash !== params.approval.payloadHash) {
      return { ok: false, reason: "payload hash mismatch" };
    }

    const expected = sealApproval({
      secret: this.#approvalSecret,
      payloadHash: params.approval.payloadHash,
      policyVersion: params.approval.policyVersion,
      nonce: params.approval.nonce,
      expiresAtMs: params.approval.expiresAtMs,
    });

    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(params.approval.token, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "invalid approval token" };
    }

    if (this.#consumedNonces.has(params.approval.nonce)) {
      return { ok: false, reason: "approval nonce already used (replay)" };
    }
    this.#consumedNonces.add(params.approval.nonce);

    // Placeholder signature: proves key stayed local. Replace with real secp256k1 MsgExec.
    const signatureHex = createHash("sha256")
      .update(
        `intentguard-v0:${this.#privateKeyHex}:${params.canonicalPayload}`,
        "utf8",
      )
      .digest("hex");

    return { ok: true, signatureHex, signedAtMs: now };
  }

  /** Explicitly refuse generic byte signing — attack surface closed. */
  signBytes(_bytes: Uint8Array): never {
    throw new Error(
      "IsolatedGranteeSigner: generic sign(bytes) is disabled — use signApprovedPayload only",
    );
  }
}

/** Build a canonical payload string for limit-order MsgExec planning (offline spike). */
export function canonicalLimitOrderPayload(order: {
  msgTypeUrl: string;
  marketId: string;
  subaccountId: string;
  price: string;
  quantity: string;
  margin: string;
}): string {
  return JSON.stringify({
    msgTypeUrl: order.msgTypeUrl,
    marketId: order.marketId.toLowerCase(),
    subaccountId: order.subaccountId.toLowerCase(),
    price: order.price,
    quantity: order.quantity,
    margin: order.margin,
  });
}

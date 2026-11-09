import { randomBytes } from "node:crypto";
import { evaluateTradeIntent } from "../policy/evaluate.ts";
import type { IntentGuardPolicy, TradeIntent } from "../policy/types.ts";
import {
  IsolatedGranteeSigner,
  canonicalLimitOrderPayload,
} from "../gateway/signer.ts";
import {
  assertAgentHasNoSigningKey,
  type AgentCredential,
} from "../gateway/keys.ts";
import {
  attemptDerivativeLimitMsgExec,
  type MsgExecAttemptResult,
} from "./msgExec.ts";
import type { SpikeWallet } from "./keys.ts";
import { V0_TRADING_MSG_TYPES } from "../authz/types.ts";
import { humanizeBroadcastError } from "./execUserHints.ts";

export type LiveExecResult =
  | {
      status: "denied";
      stage: "policy" | "approval" | "broadcast";
      reasons: string[];
      signed: false;
      broadcast: false;
    }
  | {
      status: "allowed";
      stage: "broadcast";
      reasons: string[];
      signed: true;
      broadcast: true;
      txHash: string;
      approvalPayloadHash: string;
      chain: MsgExecAttemptResult;
    }
  | {
      status: "denied";
      stage: "broadcast";
      reasons: string[];
      signed: true;
      broadcast: false;
      approvalPayloadHash: string;
      chain: MsgExecAttemptResult;
      userHint?: string;
      errorCode?: string;
    };

/**
 * Full Route A path: agent propose → policy (incl. notional) → isolated approval → MsgExec.
 * Grantee key never touches the agent credential.
 */
export async function proposeAndExecLimitOrder(params: {
  agent: AgentCredential;
  policy: IntentGuardPolicy;
  intent: TradeIntent;
  owner: SpikeWallet;
  grantee: SpikeWallet;
  /** Isolated signer holding the grantee key (gateway-owned). */
  signer: IsolatedGranteeSigner;
  approvalTtlMs?: number;
  dailyMarginUsed?: string;
}): Promise<LiveExecResult> {
  assertAgentHasNoSigningKey(params.agent);

  if (
    params.signer.granteeAddress !== params.grantee.injectiveAddress
  ) {
    return {
      status: "denied",
      stage: "approval",
      reasons: ["signer grantee address mismatch"],
      signed: false,
      broadcast: false,
    };
  }

  const decision = evaluateTradeIntent(params.policy, params.intent, {
    dailyMarginUsed: params.dailyMarginUsed ?? "0",
  });

  if (!decision.allow) {
    return {
      status: "denied",
      stage: "policy",
      reasons: decision.reasons,
      signed: false,
      broadcast: false,
    };
  }

  if (
    params.intent.price === undefined ||
    params.intent.quantity === undefined
  ) {
    return {
      status: "denied",
      stage: "policy",
      reasons: ["live MsgExec requires intent.price and intent.quantity"],
      signed: false,
      broadcast: false,
    };
  }

  const canonicalPayload = canonicalLimitOrderPayload({
    msgTypeUrl: V0_TRADING_MSG_TYPES[0],
    marketId: params.intent.marketId,
    subaccountId: params.owner.subaccountId,
    price: params.intent.price,
    quantity: params.intent.quantity,
    margin: params.intent.margin,
  });

  const approval = params.signer.issueApproval({
    canonicalPayload,
    policyVersion: params.policy.version,
    nonce: randomBytes(8).toString("hex"),
    expiresAtMs: Date.now() + (params.approvalTtlMs ?? 60_000),
  });

  const signed = params.signer.signApprovedPayload({
    agent: params.agent,
    canonicalPayload,
    approval,
  });

  if (!signed.ok) {
    return {
      status: "denied",
      stage: "approval",
      reasons: [signed.reason],
      signed: false,
      broadcast: false,
    };
  }

  // Broadcast only after policy + approval-bound sign. Chain secp256k1 is via grantee broadcaster.
  const chain = await attemptDerivativeLimitMsgExec({
    owner: params.owner,
    grantee: params.grantee,
    intent: {
      marketId: params.intent.marketId,
      price: Number(params.intent.price),
      quantity: Number(params.intent.quantity),
      margin: Number(params.intent.margin),
    },
  });

  if (!chain.ok) {
    const raw = chain.error ?? "broadcast failed";
    const { hint, code } = humanizeBroadcastError(raw);
    return {
      status: "denied",
      stage: "broadcast",
      reasons: [raw],
      signed: true,
      broadcast: false,
      approvalPayloadHash: approval.payloadHash,
      chain,
      userHint: hint,
      errorCode: code,
    };
  }

  return {
    status: "allowed",
    stage: "broadcast",
    reasons: decision.reasons,
    signed: true,
    broadcast: true,
    txHash: chain.txHash!,
    approvalPayloadHash: approval.payloadHash,
    chain,
  };
}

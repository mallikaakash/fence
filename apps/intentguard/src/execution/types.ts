import type { TradeIntent } from "../policy/types.ts";

export type ExecutionTransitionMeta = {
  lastTransitionAt: string;
  recoveryAt?: string;
  recoveryReason?: string;
  previousState?: string;
};

export type TradeProposalStatus =
  | "approved"
  | "consuming"
  | "broadcast_pending"
  | "broadcast_unknown"
  | "broadcasted"
  | "confirmed"
  | "consumed"
  | "failed_before_broadcast"
  | "denied"
  | "expired";

export type TradeProposal = {
  proposalId: string;
  sessionId: string;
  agentTokenFingerprint: string;
  status: TradeProposalStatus;
  intentFingerprint: string;
  policyFingerprint: string;
  intent: TradeIntent;
  subaccountId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  consumedByIdempotencyKeyHash?: string;
  activeIdempotencyKeyHash?: string;
  denyReasons?: string[];
  executionMeta?: ExecutionTransitionMeta;
};

export type ExecuteIdempotencyState =
  | "processing"
  | "broadcast_pending"
  | "broadcasted"
  | "confirmed"
  | "failed_before_broadcast"
  | "broadcast_unknown"
  | "completed";

export type ExecuteIdempotencyRecord = {
  idempotencyKeyHash: string;
  sessionId: string;
  requestFingerprint: string;
  proposalId: string;
  state: ExecuteIdempotencyState;
  txHash?: string;
  /** Sanitized API body — never signing material. */
  result?: Record<string, unknown>;
  errorCode?: string;
  message?: string;
  createdAt: string;
  updatedAt: string;
  executionMeta?: ExecutionTransitionMeta;
};

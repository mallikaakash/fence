/** Agent-facing API status machine — see docs/AGENTS.md */

export type AgentApiPhase = "policy_check" | "chain_broadcast";

export type ProposeApiResponse = {
  status: "allowed" | "denied";
  phase: "policy_check";
  chainEffect: "none";
  signed: false;
  broadcast: false;
  wouldSign: boolean;
  dryRun: boolean;
  decisionReasons: string[];
  sessionId?: string;
  granteeAddress?: string;
  note?: string;
  idempotentReplay?: boolean;
  /** Present when status=allowed and session has subaccount binding. */
  proposalId?: string;
  proposalExpiresAt?: string;
  intentFingerprint?: string;
};

export type ExecuteApiResponse = {
  status: string;
  phase: "chain_broadcast";
  stage?: string;
  signed: boolean;
  broadcast: boolean;
  reasons?: string[];
  userHint?: string;
  errorCode?: string;
  sessionId?: string;
  txHash?: string;
  proposalId?: string;
  idempotencyKeyHash?: string;
  requestFingerprint?: string;
  executionState?: string;
  idempotentReplay?: boolean;
  warning?: string;
};

export const PROPOSE_AGENT_NOTE =
  "Policy check only — does not verify wallet permission on-chain. Execution requires an active wallet grant and POST /v1/execute.";

export function envelopePropose(
  inner: Record<string, unknown>,
): ProposeApiResponse {
  const status = inner.status as "allowed" | "denied";
  return {
    status,
    phase: "policy_check",
    chainEffect: "none",
    signed: false,
    broadcast: false,
    wouldSign: Boolean(inner.wouldSign),
    dryRun: true,
    decisionReasons: (inner.decisionReasons as string[]) ?? [],
    sessionId: inner.sessionId as string | undefined,
    granteeAddress: inner.granteeAddress as string | undefined,
    note:
      status === "allowed"
        ? (inner.note as string | undefined) ?? PROPOSE_AGENT_NOTE
        : undefined,
    idempotentReplay: inner.idempotentReplay as boolean | undefined,
  };
}

export function envelopeExecute(
  inner: Record<string, unknown>,
): ExecuteApiResponse {
  return {
    status: String(inner.status ?? "denied"),
    phase: "chain_broadcast",
    stage: inner.stage as string | undefined,
    signed: Boolean(inner.signed),
    broadcast: Boolean(inner.broadcast),
    reasons: (inner.reasons as string[]) ?? undefined,
    userHint: inner.userHint as string | undefined,
    errorCode: inner.errorCode as string | undefined,
    sessionId: inner.sessionId as string | undefined,
    txHash: inner.txHash as string | undefined,
  };
}

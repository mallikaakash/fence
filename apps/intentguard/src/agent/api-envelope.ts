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
};

export const PROPOSE_AGENT_NOTE =
  "Policy OK — call POST /v1/execute only after propose allowed and sidecar has INTENTGUARD_EXECUTE=1";

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

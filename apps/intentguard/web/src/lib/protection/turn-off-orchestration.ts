import type { GatewaySettings } from "../gateway/storage.ts";
import type { TurnOffProtectionResult } from "./turn-off-outcome.ts";

export type TurnOffProgress = {
  step:
    | "confirm"
    | "on_chain"
    | "session"
    | "confirming"
    | "local"
    | "done"
    | "error";
  message: string;
};
import {
  resultFromDimensions,
  type TurnOffDimensions,
  type WalletPermissionOutcome,
} from "./turn-off-outcome.ts";

export const REVOKE_TX_COUNT = 2;

export type TurnOffOrchestrationDeps = {
  broadcastRevokes: () => Promise<{ txHashes: string[] }>;
  /** Thrown RevokeBroadcastError handled by caller with txHashes on partial. */
  endGatewaySession: (
    settings: GatewaySettings,
    sessionId: string,
  ) => Promise<{ ended: boolean; error?: string }>;
  pollWalletAfterBroadcast: (
    settings: GatewaySettings,
    sessionId: string,
  ) => Promise<WalletPermissionOutcome>;
  snapshotWallet: (
    settings: GatewaySettings,
    sessionId: string,
  ) => Promise<WalletPermissionOutcome>;
  clearLocal: () => void;
};

export type OrchestrationTrace = {
  gatewayRevokeCalled: boolean;
  gatewayRevokeBeforePoll: boolean;
  pollCalled: boolean;
  clearLocalCalled: boolean;
};

/**
 * Turn off protection orchestration (injectable for tests).
 * Order: broadcast → gateway revoke → clear local on server OK → LCD poll.
 */
export async function orchestrateTurnOffProtection(params: {
  sessionId: string;
  settings: GatewaySettings;
  deps: TurnOffOrchestrationDeps;
  txHashes: string[];
  txsAttempted: number;
  broadcastError?: string;
  onProgress?: (p: TurnOffProgress) => void;
  trace?: OrchestrationTrace;
}): Promise<TurnOffProtectionResult> {
  const { sessionId, settings, deps, txHashes, txsAttempted } = params;
  const progress = params.onProgress;
  const trace = params.trace;

  if (txHashes.length === 0) {
    const dimensions: TurnOffDimensions = {
      txHashes: [],
      txsAttempted: 0,
      txsExpected: REVOKE_TX_COUNT,
      wallet: "failed",
      session: "preserved",
      broadcastError: params.broadcastError,
    };
    return resultFromDimensions(dimensions);
  }

  progress?.({
    step: "session",
    message: "Ending IntentGuard session on the server…",
  });

  if (trace) trace.gatewayRevokeCalled = true;
  const sessionRes = await deps.endGatewaySession(settings, sessionId);
  const session: TurnOffDimensions["session"] = sessionRes.ended
    ? "ended"
    : "failed";

  if (sessionRes.ended) {
    if (trace) trace.clearLocalCalled = true;
    progress?.({ step: "local", message: "Clearing local session…" });
    deps.clearLocal();
  }

  if (trace) trace.gatewayRevokeBeforePoll = true;

  progress?.({
    step: "confirming",
    message: "Checking wallet permission on-chain…",
  });

  if (trace) trace.pollCalled = true;

  let wallet: WalletPermissionOutcome = sessionRes.ended
    ? await deps.pollWalletAfterBroadcast(settings, sessionId)
    : await deps.snapshotWallet(settings, sessionId);

  if (txsAttempted < REVOKE_TX_COUNT && wallet === "cleared") {
    wallet = "incomplete_on_chain";
  } else if (txsAttempted < REVOKE_TX_COUNT && wallet !== "pending_confirmation") {
    if (wallet !== "cleared") wallet = "incomplete_on_chain";
  }

  const dimensions: TurnOffDimensions = {
    txHashes,
    txsAttempted,
    txsExpected: REVOKE_TX_COUNT,
    wallet,
    session,
    broadcastError: params.broadcastError,
    sessionError: sessionRes.error,
  };

  const out = resultFromDimensions(dimensions, sessionId);
  if (out.ok) {
    progress?.({ step: "done", message: out.message });
  }
  return out;
}

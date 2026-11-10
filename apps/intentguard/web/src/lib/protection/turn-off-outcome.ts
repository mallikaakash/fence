/**
 * Pure turn-off outcome logic (testable without Keplr / network).
 */

export type WalletPermissionOutcome =
  | "not_attempted"
  | "broadcast_only"
  | "incomplete_on_chain"
  | "cleared"
  | "pending_confirmation"
  | "failed";

export type SessionOutcome = "preserved" | "ended" | "failed";

export type TurnOffDimensions = {
  txHashes: string[];
  txsAttempted: number;
  txsExpected: number;
  wallet: WalletPermissionOutcome;
  session: SessionOutcome;
  broadcastError?: string;
  sessionError?: string;
};

export type TurnOffProtectionResult =
  | {
      ok: true;
      kind: "complete";
      txHashes: string[];
      message: string;
    }
  | {
      ok: false;
      dimensions: TurnOffDimensions;
      message: string;
      canRetrySession: boolean;
      sessionId?: string;
    };

export function buildTurnOffMessage(d: TurnOffDimensions): {
  message: string;
  isCompleteSuccess: boolean;
  canRetrySession: boolean;
} {
  const sessionEnded = d.session === "ended";
  const walletCleared = d.wallet === "cleared";
  const anyBroadcast = d.txHashes.length > 0;

  if (!anyBroadcast) {
    return {
      message: d.broadcastError
        ? `Wallet permission was not revoked: ${d.broadcastError}`
        : "Wallet permission was not revoked. No transaction was broadcast. Your IntentGuard session is unchanged.",
      isCompleteSuccess: false,
      canRetrySession: false,
    };
  }

  if (!sessionEnded && d.session === "failed") {
    return {
      message:
        "Wallet revocation was submitted, but IntentGuard could not confirm that the bot session was ended. Retry session cleanup.",
      isCompleteSuccess: false,
      canRetrySession: true,
    };
  }

  if (sessionEnded && walletCleared) {
    return {
      message: "Wallet permission revoked. IntentGuard session ended.",
      isCompleteSuccess: true,
      canRetrySession: false,
    };
  }

  if (sessionEnded && !walletCleared) {
    const partialTx =
      d.txsAttempted < d.txsExpected
        ? " One of two revoke transactions did not complete."
        : "";
    return {
      message: `IntentGuard session ended, but wallet permission revocation is incomplete. Review the remaining wallet permission in Keplr or the block explorer.${partialTx}`,
      isCompleteSuccess: false,
      canRetrySession: false,
    };
  }

  if (d.wallet === "pending_confirmation") {
    return {
      message:
        "Revoke transactions were broadcast. Wallet permission is still propagating on-chain. Retry session cleanup if your bot code still works.",
      isCompleteSuccess: false,
      canRetrySession: d.session !== "ended",
    };
  }

  return {
    message: "Turn off protection could not be completed. Check details below.",
    isCompleteSuccess: false,
    canRetrySession: d.session === "failed" && anyBroadcast,
  };
}

export function resultFromDimensions(
  d: TurnOffDimensions,
  sessionId?: string,
): TurnOffProtectionResult {
  const { message, isCompleteSuccess, canRetrySession } = buildTurnOffMessage(d);
  if (isCompleteSuccess) {
    return { ok: true, kind: "complete", txHashes: d.txHashes, message };
  }
  return {
    ok: false,
    dimensions: d,
    message,
    canRetrySession,
    sessionId: canRetrySession ? sessionId : undefined,
  };
}

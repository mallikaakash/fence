import {
  broadcastTypedRevokes,
  RevokeBroadcastError,
} from "@/lib/chain/broadcast-revoke";
import { gatewayGrantStatus, gatewayRevokeSession } from "@/lib/gateway/client";
import type { GatewaySettings } from "@/lib/gateway/storage";
import {
  clearGatewaySettings,
  saveGatewaySettings,
} from "@/lib/gateway/storage";
import {
  clearProtectionSummary,
  loadProtectionSummary,
  saveProtectionSummary,
} from "@/lib/protection-state";
import { parseGrantStatusJson } from "@/lib/grant-status";
import {
  classifyWalletFromGrantStatus,
  lcdClassToWalletOutcome,
} from "@/lib/wallet-lcd-state";
import type { WalletPermissionOutcome } from "@/lib/protection/turn-off-outcome";
import {
  orchestrateTurnOffProtection,
  REVOKE_TX_COUNT,
  type TurnOffProgress,
} from "@/lib/protection/turn-off-orchestration";

export type { TurnOffProtectionResult } from "@/lib/protection/turn-off-outcome";
export type {
  TurnOffOrchestrationDeps,
  OrchestrationTrace,
  TurnOffProgress,
} from "@/lib/protection/turn-off-orchestration";
export { orchestrateTurnOffProtection, REVOKE_TX_COUNT };

const LCD_POLL_MS = 3_000;
const LCD_MAX_MS = 45_000;

export async function fetchWalletPermissionOutcome(
  settings: GatewaySettings,
  sessionId: string,
): Promise<WalletPermissionOutcome> {
  const { res, json } = await gatewayGrantStatus(settings, sessionId);
  if (!res.ok) return "pending_confirmation";
  return lcdClassToWalletOutcome(
    classifyWalletFromGrantStatus(parseGrantStatusJson(json)),
  );
}

export async function pollWalletPermissionCleared(
  settings: GatewaySettings,
  sessionId: string,
  maxMs = LCD_MAX_MS,
): Promise<WalletPermissionOutcome> {
  const deadline = Date.now() + maxMs;
  let sawIncomplete = false;

  while (Date.now() < deadline) {
    const { res, json } = await gatewayGrantStatus(settings, sessionId);
    if (res.ok) {
      const lcd = classifyWalletFromGrantStatus(parseGrantStatusJson(json));
      if (lcd === "cleared") return "cleared";
      sawIncomplete = true;
    }
    await new Promise((r) => setTimeout(r, LCD_POLL_MS));
  }

  if (sawIncomplete) return "incomplete_on_chain";
  return "pending_confirmation";
}

async function endGatewaySession(
  settings: GatewaySettings,
  sessionId: string,
): Promise<{ ended: boolean; error?: string }> {
  try {
    const { res, json } = await gatewayRevokeSession(settings, sessionId);
    if (!res.ok) {
      return {
        ended: false,
        error: (json as { error?: string }).error ?? `Revoke ${res.status}`,
      };
    }
    return { ended: true };
  } catch (e) {
    return {
      ended: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function clearLocalSession() {
  clearProtectionSummary();
  saveGatewaySettings({ agentApiToken: "", ownerApiKey: "" });
  clearGatewaySettings();
}

function defaultDeps(): import("@/lib/protection/turn-off-orchestration").TurnOffOrchestrationDeps {
  return {
    broadcastRevokes: async () => ({ txHashes: [] }),
    endGatewaySession,
    pollWalletAfterBroadcast: pollWalletPermissionCleared,
    snapshotWallet: fetchWalletPermissionOutcome,
    clearLocal: clearLocalSession,
  };
}

export async function turnOffProtection(params: {
  granter: string;
  grantee: string;
  sessionId: string;
  settings: GatewaySettings;
  network?: "testnet" | "mainnet";
  onProgress?: (p: TurnOffProgress) => void;
  deps?: import("@/lib/protection/turn-off-orchestration").TurnOffOrchestrationDeps;
  trace?: import("@/lib/protection/turn-off-orchestration").OrchestrationTrace;
}): Promise<import("@/lib/protection/turn-off-outcome").TurnOffProtectionResult> {
  const { sessionId, settings } = params;
  const network = params.network ?? "testnet";
  const progress = params.onProgress;
  const deps = params.deps ?? defaultDeps();

  let txHashes: string[] = [];
  let broadcastError: string | undefined;
  let txsAttempted = 0;

  progress?.({
    step: "on_chain",
    message: "Approve revoke transactions in Keplr…",
  });

  try {
    const result = await broadcastTypedRevokes({
      network,
      granter: params.granter,
      grantee: params.grantee,
    });
    txHashes = result.txHashes;
    txsAttempted = txHashes.length;
  } catch (e) {
    if (e instanceof RevokeBroadcastError) {
      txHashes = e.txHashes;
      txsAttempted = txHashes.length;
      broadcastError = e.message;
    } else {
      broadcastError = e instanceof Error ? e.message : String(e);
    }
  }

  return orchestrateTurnOffProtection({
    sessionId,
    settings,
    deps,
    txHashes,
    txsAttempted,
    broadcastError,
    onProgress: progress,
    trace: params.trace,
  });
}

/**
 * User already revoked wallet permission in Keplr — end IntentGuard session only.
 * No on-chain transactions. Not triggered automatically from grant-status.
 */
export async function cleanupApplicationSessionOnly(params: {
  sessionId: string;
  settings: GatewaySettings;
  onProgress?: (p: TurnOffProgress) => void;
}): Promise<
  | { ok: true; message: string }
  | { ok: false; error: string; canRetry: true; sessionId: string; settings: GatewaySettings }
> {
  params.onProgress?.({
    step: "session",
    message: "Ending IntentGuard session (no new wallet transaction)…",
  });
  const sessionRes = await endGatewaySession(params.settings, params.sessionId);
  if (!sessionRes.ended) {
    return {
      ok: false,
      error: sessionRes.error ?? "Session cleanup failed",
      canRetry: true,
      sessionId: params.sessionId,
      settings: params.settings,
    };
  }
  clearLocalSession();
  params.onProgress?.({ step: "done", message: "Application session ended." });
  return {
    ok: true,
    message:
      "IntentGuard session ended. No new on-chain transaction was submitted — use this when you already revoked wallet permission in Keplr.",
  };
}

/** Idempotent: safe if session already revoked on server. */
export async function retrySessionCleanupAfterRevoke(params: {
  sessionId: string;
  settings: GatewaySettings;
  onProgress?: (p: TurnOffProgress) => void;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  return cleanupApplicationSessionOnly(params);
}

export function markLocalProtectionInactive(sessionId: string) {
  const summary = loadProtectionSummary();
  if (!summary || summary.sessionId !== sessionId) return;
  saveProtectionSummary({
    ...summary,
    grantReady: false,
    updatedAt: new Date().toISOString(),
  });
}

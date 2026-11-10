"use client";

import { useState } from "react";
import {
  retrySessionCleanupAfterRevoke,
  turnOffProtection,
  type TurnOffProgress,
  type TurnOffProtectionResult,
} from "@/lib/protection/turn-off-protection";
import { loadGatewaySettings } from "@/lib/gateway/storage";
import type { ProtectionSummary } from "@/lib/protection-state";
import { explorerTxUrl } from "@/lib/explorer";

const CONFIRM_MESSAGE =
  "This will revoke your wallet permission (place and cancel orders) on Injective testnet and end the IntentGuard session on the server. Your bot access code will stop working.\n\nContinue?";

export function TurnOffProtectionPanel({
  summary,
  onComplete,
  compact,
}: {
  summary: ProtectionSummary;
  onComplete?: () => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TurnOffProgress | null>(null);
  const [result, setResult] = useState<TurnOffProtectionResult | null>(null);
  const [retrySession, setRetrySession] = useState<{
    sessionId: string;
    settings: ReturnType<typeof loadGatewaySettings>;
  } | null>(null);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);

  async function runTurnOff() {
    if (!summary.ownerInj?.startsWith("inj1") || !summary.granteeInj) {
      setRetryMsg("Connect the same wallet used for setup before revoking.");
      return;
    }
    if (!globalThis.confirm(CONFIRM_MESSAGE)) return;

    setBusy(true);
    setResult(null);
    setRetryMsg(null);
    setRetrySession(null);
    const settings = loadGatewaySettings();

    const out = await turnOffProtection({
      granter: summary.ownerInj,
      grantee: summary.granteeInj,
      sessionId: summary.sessionId,
      settings,
      network: "testnet",
      onProgress: setProgress,
    });

    setResult(out);
    setBusy(false);

    if (out.ok) {
      onComplete?.();
      return;
    }
    if (out.canRetrySession && out.sessionId) {
      setRetrySession({ sessionId: out.sessionId, settings });
    }
  }

  async function runRetry() {
    if (!retrySession) return;
    setBusy(true);
    setRetryMsg(null);
    const r = await retrySessionCleanupAfterRevoke({
      sessionId: retrySession.sessionId,
      settings: retrySession.settings,
      onProgress: setProgress,
    });
    setBusy(false);
    if (r.ok) {
      setRetrySession(null);
      onComplete?.();
      setResult({
        ok: false,
        message:
          "Session cleanup completed on retry. Verify wallet permission separately if you revoked on-chain.",
        canRetrySession: false,
        dimensions: {
          txHashes: result && !result.ok ? result.dimensions.txHashes : [],
          txsAttempted: 0,
          txsExpected: 2,
          wallet: "pending_confirmation",
          session: "ended",
        },
      });
    } else {
      setRetryMsg(r.error);
    }
  }

  return (
    <div className="space-y-3">
      {!compact ? (
        <p className="text-xs text-white/50">
          Removes wallet permission on-chain and ends your IntentGuard session (bot access
          code). This does not replace &quot;End session on this device only&quot; if you only want
          to clear the browser.
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        className="text-xs text-red-200 border border-red-400/40 px-3 py-1.5 rounded-full hover:bg-red-950/30 disabled:opacity-50"
        onClick={() => void runTurnOff()}
      >
        {busy ? "Turning off…" : "Turn off protection"}
      </button>

      {progress && busy ? (
        <p className="text-xs text-white/55" aria-live="polite">
          {progress.message}
        </p>
      ) : null}

      {result?.ok ? (
        <p className="text-xs text-green-300/90" aria-live="polite">
          {result.message}
        </p>
      ) : null}

      {result && !result.ok ? (
        <div
          className="text-xs text-amber-100/90 border border-amber-400/30 rounded-lg px-3 py-2 bg-amber-950/20 space-y-2"
          role="alert"
        >
          <p>{result.message}</p>
          {result.dimensions.sessionError ? (
            <p className="text-white/55">Server: {result.dimensions.sessionError}</p>
          ) : null}
          {result.dimensions.txHashes.map((h) => (
            <a
              key={h}
              href={explorerTxUrl(h, "testnet")}
              target="_blank"
              rel="noreferrer"
              className="block text-[#75bfcf] break-all hover:underline"
            >
              Tx {h.slice(0, 18)}…
            </a>
          ))}
          {result.canRetrySession ? (
            <button
              type="button"
              className="text-[#75bfcf] underline"
              onClick={() => void runRetry()}
            >
              Retry session cleanup
            </button>
          ) : null}
        </div>
      ) : null}

      {retryMsg ? (
        <p className="text-xs text-red-300/90" role="alert">
          {retryMsg}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  cleanupApplicationSessionOnly,
  retrySessionCleanupAfterRevoke,
  type TurnOffProgress,
} from "@/lib/protection/turn-off-protection";
import { loadGatewaySettings } from "@/lib/gateway/storage";
import type { ProtectionSummary } from "@/lib/protection-state";

const CONFIRM =
  "This ends your IntentGuard session and clears the bot access code on this device. It does NOT submit any wallet transaction — use this only if you already revoked permission in Keplr.\n\nContinue?";

export function SessionCleanupOnlyPanel({
  summary,
  onComplete,
}: {
  summary: ProtectionSummary;
  onComplete?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TurnOffProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCtx, setRetryCtx] = useState<{
    sessionId: string;
    settings: ReturnType<typeof loadGatewaySettings>;
  } | null>(null);

  async function run() {
    if (!globalThis.confirm(CONFIRM)) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    setRetryCtx(null);
    const settings = loadGatewaySettings();
    const out = await cleanupApplicationSessionOnly({
      sessionId: summary.sessionId,
      settings,
      onProgress: setProgress,
    });
    setBusy(false);
    if (out.ok) {
      setMessage(out.message);
      onComplete?.();
      return;
    }
    setError(out.error);
    setRetryCtx({ sessionId: out.sessionId, settings: out.settings });
  }

  async function retry() {
    if (!retryCtx) return;
    setBusy(true);
    setError(null);
    const out = await retrySessionCleanupAfterRevoke({
      sessionId: retryCtx.sessionId,
      settings: retryCtx.settings,
      onProgress: setProgress,
    });
    setBusy(false);
    if (out.ok) {
      setMessage(out.message);
      onComplete?.();
    } else setError(out.error);
  }

  return (
    <div className="border border-white/15 rounded-lg p-3 bg-black/20 space-y-2">
      <p className="text-xs text-white/60">
        Already revoked in Keplr? End the IntentGuard session here without signing a new
        transaction.
      </p>
      <button
        type="button"
        disabled={busy}
        className="text-xs text-[#75bfcf] underline disabled:opacity-50"
        onClick={() => void run()}
      >
        {busy ? "Cleaning up…" : "End session only (wallet already revoked)"}
      </button>
      {progress && busy ? (
        <p className="text-[11px] text-white/45">{progress.message}</p>
      ) : null}
      {message ? (
        <p className="text-xs text-green-300/90" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <div className="text-xs text-amber-100/90 space-y-1">
          <p role="alert">{error}</p>
          {retryCtx ? (
            <button type="button" className="underline text-[#75bfcf]" onClick={() => void retry()}>
              Retry session cleanup
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

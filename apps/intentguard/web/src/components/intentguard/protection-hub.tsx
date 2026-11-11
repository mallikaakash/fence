"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TESTNET_PERP_MARKETS } from "@/lib/markets-testnet";
import { loadProtectionSummary, type ProtectionSummary } from "@/lib/protection-state";
import { ProtectionLiveStatus } from "@/components/intentguard/protection-live-status";
import { ProtectionStatusHeadline } from "@/components/intentguard/protection-status-headline";
import { ProtectionReadiness } from "@/components/intentguard/protection-readiness";
import { SessionExecuteReadiness } from "@/components/intentguard/session-execute-readiness";
import { SessionExposurePanel } from "@/components/intentguard/session-exposure-panel";
import { ConnectBotPanel } from "@/components/intentguard/connect-bot-panel";
import { RecentActivityPreview } from "@/components/intentguard/recent-activity-preview";
import { TurnOffProtectionPanel } from "@/components/intentguard/turn-off-protection-panel";
import { SessionCleanupOnlyPanel } from "@/components/intentguard/session-cleanup-only-panel";
import { gatewayRevokeSession } from "@/lib/gateway/client";
import { clearGatewaySettings, loadGatewaySettings } from "@/lib/gateway/storage";
import { clearProtectionSummary } from "@/lib/protection-state";

export function ProtectionHub() {
  const [summary, setSummary] = useState<ProtectionSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionMsg, setSessionMsg] = useState<string | null>(null);

  const reload = useCallback(() => {
    setSummary(loadProtectionSummary());
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!summary) {
    return (
      <div className="glass-card p-8 md:p-10 text-center space-y-5 text-white max-w-lg mx-auto">
        <h2 className="text-xl text-white/90">No protection set up yet</h2>
        <p className="text-sm text-white/60">
          Choose markets and size limits, then approve a timed permission in Keplr. About three minutes
          on Injective testnet.
        </p>
        <Link href="/start" className="cta-primary inline-block">
          Start setup
        </Link>
        <p className="text-xs text-white/45">
          <Link href="/limitations" className="text-[#75bfcf] underline">
            How it works & limits
          </Link>
        </p>
      </div>
    );
  }

  const marketLabels = summary.marketIds
    .map((id) => TESTNET_PERP_MARKETS.find((m) => m.id === id)?.symbol ?? "market")
    .join(", ");

  const expiryLabel =
    summary.grantExpirySeconds >= 604_800 ? "7 days" : "24 hours";

  async function revokeSessionOnly() {
    if (!summary) return;
    const sessionId = summary.sessionId;
    setSessionBusy(true);
    setSessionMsg(null);
    try {
      const settings = loadGatewaySettings();
      const { res, json } = await gatewayRevokeSession(settings, sessionId);
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Revoke failed");
      clearProtectionSummary();
      clearGatewaySettings();
      setSummary(null);
      setSessionMsg("Session ended on this device only. On-chain wallet permission unchanged.");
    } catch (e) {
      setSessionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSessionBusy(false);
    }
  }

  return (
    <div className="space-y-6 text-white" key={refreshKey}>
      <ProtectionStatusHeadline refreshKey={refreshKey} />

      <div className="glass-card p-5 md:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg text-[#75bfcf]">Your rules</h2>
            <p className="text-sm text-white/60 mt-1">
              Markets: <strong className="text-white/85">{marketLabels}</strong> · Max order size{" "}
              {summary.maxOrderNotional} · Daily margin limit {summary.dailyMarginBudget} · Leverage
              ≤ {summary.maxLeverage} · Permission length {expiryLabel}
            </p>
          </div>
          <Link href="/start" className="text-sm text-[#75bfcf] underline shrink-0">
            Change rules
          </Link>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-white/45 mb-2">Live signals</p>
          <ProtectionLiveStatus refreshKey={refreshKey} />
        </div>
      </div>

      <ProtectionReadiness refreshKey={refreshKey} />

      <SessionExecuteReadiness key={refreshKey} />

      <SessionExposurePanel key={`exp-${refreshKey}`} />

      <ConnectBotPanel collapsedAdvanced refreshKey={refreshKey} />

      <RecentActivityPreview />

      <div className="border border-red-400/20 rounded-xl p-4 bg-red-950/15 space-y-3">
        <h3 className="text-sm text-white/80">Turn off protection</h3>
        <TurnOffProtectionPanel summary={summary} onComplete={reload} />
        <SessionCleanupOnlyPanel summary={summary} onComplete={reload} />
        <button
          type="button"
          disabled={sessionBusy}
          className="text-xs text-white/50 underline"
          onClick={() => void revokeSessionOnly()}
        >
          End session on this device only (keeps on-chain permission)
        </button>
        {sessionMsg ? <p className="text-xs text-white/60">{sessionMsg}</p> : null}
      </div>
    </div>
  );
}

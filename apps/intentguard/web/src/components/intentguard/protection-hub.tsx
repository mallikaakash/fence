"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TESTNET_PERP_MARKETS } from "@/lib/markets-testnet";
import { loadProtectionSummary, type ProtectionSummary } from "@/lib/protection-state";
import { ProtectionLiveStatus } from "@/components/intentguard/protection-live-status";
import { ProtectionReadiness } from "@/components/intentguard/protection-readiness";
import { ConnectBotPanel } from "@/components/intentguard/connect-bot-panel";
import { RecentActivityPreview } from "@/components/intentguard/recent-activity-preview";
import { GrantRevokeButton } from "@/components/intentguard/grant-revoke-button";
import { gatewayRevokeSession } from "@/lib/gateway/client";
import { clearGatewaySettings, loadGatewaySettings } from "@/lib/gateway/storage";
import { clearProtectionSummary } from "@/lib/protection-state";

export function ProtectionHub() {
  const [summary, setSummary] = useState<ProtectionSummary | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeMsg, setRevokeMsg] = useState<string | null>(null);

  useEffect(() => {
    setSummary(loadProtectionSummary());
  }, []);

  if (!summary) {
    return (
      <div className="glass-card p-8 md:p-10 text-center space-y-5 text-white max-w-lg mx-auto">
        <h2 className="text-xl text-white/90">No protection set up yet</h2>
        <p className="text-sm text-white/60">
          Choose markets and size limits, then sign one timed permission in Keplr. Takes about three
          minutes on Injective testnet.
        </p>
        <Link href="/start" className="cta-primary inline-block">
          Set up protection
        </Link>
        <p className="text-xs text-white/45">
          <Link href="/limitations" className="text-[#75bfcf] underline">
            How limits work
          </Link>{" "}
          · Testnet only
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
    setRevoking(true);
    setRevokeMsg(null);
    try {
      const settings = loadGatewaySettings();
      const { res, json } = await gatewayRevokeSession(settings, sessionId);
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Revoke failed");
      clearProtectionSummary();
      clearGatewaySettings();
      setSummary(null);
      setRevokeMsg("Protection turned off in this browser.");
    } catch (e) {
      setRevokeMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div className="glass-card p-5 md:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg text-[#75bfcf]">Your protection</h2>
            <p className="text-sm text-white/60 mt-1">
              Markets: <strong className="text-white/85">{marketLabels}</strong> · Max order{" "}
              {summary.maxOrderNotional} · Daily margin budget {summary.dailyMarginBudget} · Leverage
              ≤ {summary.maxLeverage} · Permission length {expiryLabel}
            </p>
          </div>
          <Link href="/start" className="text-sm text-[#75bfcf] underline shrink-0">
            Change limits
          </Link>
        </div>
        <ProtectionLiveStatus />
      </div>

      <ProtectionReadiness />

      <ConnectBotPanel collapsedAdvanced />

      <RecentActivityPreview />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/trade" className="px-4 py-2 rounded-full bg-[#75bfcf] text-black font-medium">
          Practice a trade
        </Link>
        <Link
          href="/limitations"
          className="px-4 py-2 rounded-full border border-white/25 text-white/80"
        >
          What we protect (and don&apos;t)
        </Link>
      </div>

      <div className="border border-red-400/20 rounded-xl p-4 bg-red-950/15 space-y-3">
        <h3 className="text-sm text-white/80">Turn off protection</h3>
        <p className="text-xs text-white/50">
          Revoke on-chain permission in Keplr, then end the session here.
        </p>
        {summary.ownerInj && summary.granteeInj ? (
          <GrantRevokeButton
            granter={summary.ownerInj}
            grantee={summary.granteeInj}
            network="testnet"
            onSuccess={() => setRevokeMsg("On-chain permission revoked.")}
          />
        ) : null}
        <button
          type="button"
          disabled={revoking}
          className="text-xs text-red-200/90 underline"
          onClick={() => void revokeSessionOnly()}
        >
          End session on this device
        </button>
        {revokeMsg ? <p className="text-xs text-white/60">{revokeMsg}</p> : null}
      </div>
    </div>
  );
}

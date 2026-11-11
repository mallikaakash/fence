"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  loadProtectionSummary,
  type ProtectionSummary,
} from "@/lib/protection-state";
import { TESTNET_PERP_MARKETS } from "@/lib/markets-testnet";
import { ProtectionLiveStatus } from "@/components/intentguard/protection-live-status";

export function ProtectionStatusBanner() {
  const [summary, setSummary] = useState<ProtectionSummary | null>(null);

  useEffect(() => {
    setSummary(loadProtectionSummary());
  }, []);

  if (!summary) return null;

  const labels = summary.marketIds
    .map((id) => TESTNET_PERP_MARKETS.find((m) => m.id === id)?.symbol ?? "market")
    .join(", ");

  return (
    <div className="border border-[#75bfcf]/35 rounded-xl bg-[#0d3d4a]/50 px-4 py-3 text-sm text-[#c8ecf4] space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Protection{" "}
          <strong className={summary.grantReady ? "text-green-300" : "text-amber-200"}>
            {summary.grantReady ? "wallet permission on-chain" : "pending permission"}
          </strong>
          {" · "}
          {labels} · max order {summary.maxOrderNotional} · daily margin{" "}
          {summary.dailyMarginBudget}
        </span>
        <Link href="/protection" className="text-xs text-[#75bfcf] underline shrink-0">
          Dashboard
        </Link>
      </div>
      {summary.grantReady ? (
        <p className="text-[11px] text-white/45">
          On-chain permission does not mean execute-ready — confirm subaccount{" "}
          <strong className="text-white/55">quote collateral</strong> on{" "}
          <Link href="/trade" className="text-[#75bfcf] underline">
            Trade
          </Link>
          .
        </p>
      ) : null}
      <ProtectionLiveStatus />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { SPIKE_MARKET_ID } from "@/lib/constants";
import { gatewaySessionReadiness } from "@/lib/gateway/client";
import {
  gatewayOwnerRoutesAvailable,
  loadGatewaySettings,
} from "@/lib/gateway/storage";
import { loadProtectionSummary } from "@/lib/protection-state";
import {
  overallHeadline,
  statusColor,
  type SessionReadinessJson,
} from "@/lib/readiness";

const CHECK_LABELS: Record<keyof SessionReadinessJson["checks"], string> = {
  grants: "Wallet permission",
  granteeGas: "Assistant gas (INJ)",
  subaccountCollateral: "Subaccount collateral",
  market: "Market",
};

export function SessionExecuteReadiness({
  marketId,
  compact = false,
}: {
  marketId?: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<SessionReadinessJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const summary = loadProtectionSummary();
    const settings = loadGatewaySettings();
    if (!summary?.sessionId || !gatewayOwnerRoutesAvailable(settings)) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { res, json } = await gatewaySessionReadiness(
        settings,
        summary.sessionId,
        marketId ?? summary.marketIds[0] ?? SPIKE_MARKET_ID,
      );
      if (res.status === 410) {
        setError("Session ended on the gateway. Start setup again.");
        setData(null);
        return;
      }
      if (!res.ok) {
        throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setData(json as SessionReadinessJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = loadProtectionSummary();
  if (!summary) {
    return (
      <p className="text-xs text-white/50">
        Finish protection setup to run execute readiness checks.
      </p>
    );
  }

  return (
    <div
      className={`border rounded-xl bg-black/30 space-y-3 ${
        compact ? "p-3 text-xs" : "p-4"
      } ${data ? statusColor(data.overallStatus) : "border-white/10 text-white/70"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[#75bfcf] uppercase tracking-wide text-[10px]">
          Execute readiness (testnet)
        </p>
        <button
          type="button"
          className="text-[10px] px-2 py-0.5 rounded border border-white/20 hover:bg-white/10"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {error ? <p className="text-amber-200/90">{error}</p> : null}

      {data ? (
        <>
          <p className={compact ? "text-sm text-white/85" : "text-base text-white/90"}>
            {overallHeadline(data.overallStatus)}
          </p>
          <p className="text-[10px] text-white/45">
            Last checked {new Date(data.checkedAt).toLocaleString()}. Readiness does
            not guarantee a fill or authorize execution by itself.
          </p>
          <ul className="space-y-2">
            {(Object.keys(CHECK_LABELS) as Array<keyof typeof CHECK_LABELS>).map(
              (key) => {
                const check = data.checks[key];
                return (
                  <li
                    key={key}
                    className="border border-white/10 rounded-lg px-3 py-2 bg-white/[0.03]"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="text-white/80">{CHECK_LABELS[key]}</span>
                      <span className="uppercase text-[10px] tracking-wide text-white/50">
                        {check.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-white/60 mt-1">{check.summary}</p>
                    {check.instructions?.length ? (
                      <ul className="mt-1 list-disc list-inside text-white/50 space-y-0.5">
                        {check.instructions.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              },
            )}
          </ul>
          {data.market.quoteSymbol ? (
            <p className="text-[10px] text-white/40">
              Quote asset for {data.market.ticker ?? "market"}: {data.market.quoteSymbol}{" "}
              ({data.market.quoteDenom})
            </p>
          ) : null}
          {data.executeEnabled === false ? (
            <p className="text-amber-200/80 text-[11px]">
              Live execution is disabled on this gateway. Policy checks still apply.
            </p>
          ) : null}
        </>
      ) : !loading && !error ? (
        <p className="text-white/50">Loading readiness…</p>
      ) : null}
    </div>
  );
}

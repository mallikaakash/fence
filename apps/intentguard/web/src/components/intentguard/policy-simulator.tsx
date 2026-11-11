"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SPIKE_MARKET_ID } from "@/lib/constants";
import { gatewayExecute, gatewayHealth, gatewayPropose } from "@/lib/gateway/client";
import { loadGatewaySettings } from "@/lib/gateway/storage";
import type { GatewayHealthJson } from "@/lib/gateway/health-types";
import { loadProtectionSummary, type ProtectionSummary } from "@/lib/protection-state";
import { marketLabelById, TESTNET_PERP_MARKETS } from "@/lib/markets-testnet";
import { formatExecuteFeedback } from "@/lib/gateway/execute-messages";
import { ProtectionLiveStatus } from "@/components/intentguard/protection-live-status";
import { inPolicyPayload, oversizePayload } from "@/lib/agent-intent-presets";

type ProposeResponse = {
  ok: boolean;
  status?: "allowed" | "denied";
  reasons?: string[];
  wouldBroadcast?: boolean;
  error?: string;
};

function offlinePolicyFromSummary(summary: ProtectionSummary | null) {
  const marketIds = summary?.marketIds?.length
    ? summary.marketIds
    : [SPIKE_MARKET_ID];
  const maxOrder = summary?.maxOrderNotional ?? "50";
  return {
    marketIds,
    maxOrderNotional: maxOrder,
    maxMarginPerOrder: maxOrder,
    maxLeverage: summary?.maxLeverage ?? 5,
    dailyMarginBudget: summary?.dailyMarginBudget ?? "500",
    version: 1 as const,
  };
}

export function PolicySimulator() {
  const [protection, setProtection] = useState<ProtectionSummary | null>(null);
  const [marketId, setMarketId] = useState(SPIKE_MARKET_ID);
  const [margin, setMargin] = useState("10");
  const [leverage, setLeverage] = useState("2");
  const [price, setPrice] = useState("100");
  const [quantity, setQuantity] = useState("1");
  const [maxNotional, setMaxNotional] = useState("50");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProposeResponse | null>(null);
  const [sidecarReady, setSidecarReady] = useState(false);
  const [executeEnabled, setExecuteEnabled] = useState(false);
  const [lastIntent, setLastIntent] = useState<Record<string, unknown> | null>(null);
  const [lastProposalId, setLastProposalId] = useState<string | null>(null);
  const [executeResult, setExecuteResult] = useState<string | null>(null);

  const allowedMarkets = useMemo(() => {
    const ids = protection?.marketIds?.length ? protection.marketIds : [SPIKE_MARKET_ID];
    return TESTNET_PERP_MARKETS.filter((m) => ids.includes(m.id));
  }, [protection]);

  useEffect(() => {
    const summary = loadProtectionSummary();
    setProtection(summary);
    if (summary) {
      setMaxNotional(summary.maxOrderNotional);
      setLeverage(String(summary.maxLeverage));
      const first = summary.marketIds[0] ?? SPIKE_MARKET_ID;
      setMarketId(first);
    }

    const s = loadGatewaySettings();
    const ready = Boolean(s.agentApiToken && s.baseUrl);
    setSidecarReady(ready);
    if (ready) {
      void gatewayHealth(s).then(({ res, json }) => {
        if (res.ok) {
          setExecuteEnabled(Boolean((json as GatewayHealthJson).executeEnabled));
        }
      });
    }
  }, []);

  const notionalPreview = useMemo(() => {
    const p = Number(price);
    const q = Number(quantity);
    if (!Number.isFinite(p) || !Number.isFinite(q)) return null;
    return p * q;
  }, [price, quantity]);

  async function proposeIntent(intent: Record<string, unknown>) {
    setLastIntent(intent);
    setExecuteResult(null);
    if (sidecarReady) {
      const s = loadGatewaySettings();
      const { res, json } = await gatewayPropose(s, intent);
      const proposalId = (json as { proposalId?: string }).proposalId ?? null;
      setLastProposalId(proposalId);
      return {
        ok: res.ok,
        status: (json as { status?: string }).status as "allowed" | "denied",
        reasons: (json as { decisionReasons?: string[] }).decisionReasons,
      };
    }
    const res = await fetch("/api/propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        policy: offlinePolicyFromSummary(protection),
        intent,
      }),
    });
    return (await res.json()) as ProposeResponse;
  }

  async function run(mode: "attack" | "ok") {
    setBusy(true);
    setResult(null);
    const payload =
      mode === "attack" ? oversizePayload(maxNotional) : inPolicyPayload(maxNotional);

    try {
      const intent = { marketId, ...payload };
      setResult(await proposeIntent(intent));
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function runCustom() {
    setBusy(true);
    setResult(null);
    try {
      const intent = {
        marketId,
        margin,
        leverage: Number(leverage),
        price,
        quantity,
      };
      setResult(await proposeIntent(intent));
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function runWrongMarket() {
    setBusy(true);
    setResult(null);
    const ids = protection?.marketIds ?? [SPIKE_MARKET_ID];
    const forbidden = TESTNET_PERP_MARKETS.find((m) => !ids.includes(m.id));
    if (!forbidden) {
      setResult({
        ok: false,
        error: "All testnet markets are in your allowlist — add only INJ to test deny.",
      });
      setBusy(false);
      return;
    }
    try {
      const intent = {
        marketId: forbidden.id,
        ...inPolicyPayload(maxNotional),
      };
      setResult(await proposeIntent(intent));
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function runExecute() {
    if (!lastIntent || !lastProposalId) return;
    setBusy(true);
    setExecuteResult(null);
    try {
      const s = loadGatewaySettings();
      const { res, json } = await gatewayExecute(
        s,
        { intent: lastIntent, proposalId: lastProposalId },
        `sim-${lastProposalId}`,
      );
      setExecuteResult(
        res.ok
          ? formatExecuteFeedback(json, res.status)
          : `${res.status}: ${formatExecuteFeedback(json, res.status)}`,
      );
    } catch (e) {
      setExecuteResult(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const dailyBudget = protection?.dailyMarginBudget ?? "500";

  return (
    <div className="space-y-6 text-white">
        {!sidecarReady ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-amber-200/80">Preview mode</p>
            <p className="text-sm text-amber-200/90 border border-amber-400/25 rounded-xl px-4 py-3 bg-amber-950/20">
              You&apos;re seeing example caps — not your wallet yet. Finish{" "}
              <Link href="/start" className="text-[#75bfcf] underline font-medium">
                Start setup
              </Link>{" "}
              to test against your real rules.
            </p>
          </div>
        ) : (
          <p className="text-xs text-green-200/90 border border-green-400/25 rounded-xl px-4 py-2 bg-green-950/20">
            Using your protection session — results match what a bot would see.
          </p>
        )}

        {sidecarReady ? <ProtectionLiveStatus /> : null}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Stat label="Market" value={marketLabelById(marketId)} />
          <Stat
            label="Notional (preview)"
            value={notionalPreview !== null ? String(notionalPreview) : "price × qty"}
          />
          <Stat label="Max order (your cap)" value={maxNotional} />
          <Stat label="Daily margin budget" value={dailyBudget} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-5 md:p-6 space-y-4">
            <h2 className="text-xl font-bold">
              <span className="bg-[#75bfcf] px-2 text-black">Build sample order</span>
            </h2>
            {allowedMarkets.length > 1 ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-white/60 text-xs">Market</span>
                <select
                  className="bg-black/40 border border-white/30 rounded px-2 py-1.5"
                  value={marketId}
                  onChange={(e) => setMarketId(e.target.value)}
                >
                  {allowedMarkets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Price" value={price} onChange={setPrice} />
              <Field label="Quantity" value={quantity} onChange={setQuantity} />
              <Field label="Margin" value={margin} onChange={setMargin} />
              <Field label="Leverage" value={leverage} onChange={setLeverage} />
              {!sidecarReady ? (
                <Field label="Max order size (preview)" value={maxNotional} onChange={setMaxNotional} />
              ) : (
                <p className="col-span-2 text-white/50 text-xs">
                  Max order {maxNotional} from protection — change on{" "}
                  <Link href="/start" className="text-[#75bfcf] underline">
                    Set up
                  </Link>
                  .
                </p>
              )}
            </div>
            <button
              type="button"
              className="w-full px-4 py-2 bg-[#75bfcf] text-black rounded font-medium hover:bg-[#75bfcf]/80 disabled:opacity-50"
              disabled={busy}
              onClick={runCustom}
            >
              {busy ? "Checking…" : "Check if allowed"}
            </button>
          </div>

          <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-5 md:p-6 space-y-4">
            <h2 className="text-xl font-bold">
              <span className="bg-[#75bfcf] px-2 text-black">Quick scenarios</span>
            </h2>
            <p className="text-sm text-white/70">
              Scenarios scale to your max order cap ({maxNotional}).
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className="pressable-button teal flex-1"
                disabled={busy}
                onClick={() => void run("ok")}
              >
                In-policy (allow)
              </button>
              <button
                type="button"
                className="pressable-button flex-1"
                disabled={busy}
                onClick={() => void run("attack")}
              >
                Oversize (deny)
              </button>
              <button
                type="button"
                className="pressable-button flex-1 border border-amber-400/40"
                disabled={busy}
                onClick={() => void runWrongMarket()}
              >
                Wrong market (deny)
              </button>
            </div>
            {result ? (
              <div
                className={`text-sm rounded px-3 py-2 border ${
                  result.status === "allowed"
                    ? "border-[#75bfcf]/40 bg-[#75bfcf]/10"
                    : "border-red-400/30 bg-red-500/10"
                }`}
              >
                <p className="font-semibold uppercase tracking-wide text-xs mb-1">
                  {sidecarReady ? "Policy check" : "Preview"}: {result.status ?? "error"}
                </p>
                {sidecarReady && result.status === "allowed" ? (
                  <p className="text-white/55 text-xs mt-1">
                    Rules satisfied — not execution. Wallet permission is required for real trades.
                  </p>
                ) : null}
                {!sidecarReady && result.status === "allowed" ? (
                  <p className="text-white/55 text-xs mt-1">
                    Simulated caps only — no gateway session.
                  </p>
                ) : null}
                {result.reasons?.map((r) => (
                  <p key={r} className="text-white/85">
                    {r}
                  </p>
                ))}
                {result.error ? <p className="text-white/85">{result.error}</p> : null}
                {result.wouldBroadcast === false && result.status === "denied" ? (
                  <p className="text-white/60 text-xs mt-2">
                    No MsgExec broadcast (gateway short-circuit).
                  </p>
                ) : null}
                {sidecarReady &&
                  result.status === "allowed" &&
                  executeEnabled &&
                  lastIntent && (
                    <button
                      type="button"
                      disabled={busy}
                      className="mt-3 w-full px-3 py-2 rounded border border-orange-400/50 text-orange-100 text-xs hover:bg-orange-400/10"
                      onClick={() => void runExecute()}
                    >
                      Place protected trade
                    </button>
                  )}
                {sidecarReady && result.status === "allowed" && !executeEnabled && (
                  <p className="text-white/50 text-xs mt-2">
                    Live trading is starting — retry in a moment.
                  </p>
                )}
              </div>
            ) : null}
            {executeResult ? (
              <pre className="text-[10px] text-white/60 whitespace-pre-wrap border border-white/10 rounded p-2 max-h-48 overflow-auto">
                {executeResult}
              </pre>
            ) : null}
          </div>
        </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-white/70">{label}</p>
      <p className="text-lg font-semibold break-all">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-white/60 text-xs">{label}</span>
      <input
        className="bg-black/40 border border-white/30 rounded px-2 py-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

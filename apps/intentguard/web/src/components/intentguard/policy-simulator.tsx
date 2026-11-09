"use client";

import { useMemo, useState } from "react";
import { SPIKE_MARKET_ID } from "@/lib/constants";

type ProposeResponse = {
  ok: boolean;
  status?: "allowed" | "denied";
  reasons?: string[];
  wouldBroadcast?: boolean;
  error?: string;
};

export function PolicySimulator() {
  const [margin, setMargin] = useState("10");
  const [leverage, setLeverage] = useState("2");
  const [price, setPrice] = useState("100");
  const [quantity, setQuantity] = useState("1");
  const [maxNotional, setMaxNotional] = useState("50");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProposeResponse | null>(null);

  const notionalPreview = useMemo(() => {
    const p = Number(price);
    const q = Number(quantity);
    if (!Number.isFinite(p) || !Number.isFinite(q)) return null;
    return p * q;
  }, [price, quantity]);

  async function run(mode: "attack" | "ok") {
    setBusy(true);
    setResult(null);
    const payload =
      mode === "attack"
        ? { price: "100", quantity: "1", margin: "20", leverage: 2 }
        : { price: "1", quantity: "2", margin: "5", leverage: 2 };

    try {
      const res = await fetch("/api/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          policy: {
            marketIds: [SPIKE_MARKET_ID],
            maxOrderNotional: maxNotional,
            maxMarginPerOrder: "100",
            maxLeverage: 5,
            dailyMarginBudget: "500",
            version: 1,
          },
          intent: {
            marketId: SPIKE_MARKET_ID,
            ...payload,
          },
        }),
      });
      setResult((await res.json()) as ProposeResponse);
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
      const res = await fetch("/api/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          policy: {
            marketIds: [SPIKE_MARKET_ID],
            maxOrderNotional: maxNotional,
            maxMarginPerOrder: "100",
            maxLeverage: 5,
            dailyMarginBudget: "500",
            version: 1,
          },
          intent: {
            marketId: SPIKE_MARKET_ID,
            margin,
            leverage: Number(leverage),
            price,
            quantity,
          },
        }),
      });
      setResult((await res.json()) as ProposeResponse);
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col items-center justify-center px-4 md:px-8 lg:px-12 py-10 min-h-screen pt-28">
      <div className="w-full max-w-6xl mx-auto space-y-8 text-white">
        <div>
          <h1 className="md:text-5xl text-3xl font-sans font-thin uppercase inline-block leading-tight">
            <span className="bg-orange-400 px-2 rounded-md text-black shadow-md">
              Agent propose
            </span>
          </h1>
          <p className="text-white/70 text-sm mt-2">
            Offline policy gate — same engine as{" "}
            <code className="text-white/90">proposeAndExecLimitOrder</code> (no
            keys in browser)
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat label="Market" value="INJ/USDC PERP" />
          <Stat
            label="Notional (preview)"
            value={
              notionalPreview !== null
                ? String(notionalPreview)
                : "price × qty"
            }
          />
          <Stat label="maxOrderNotional" value={maxNotional} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-5 md:p-6 space-y-4">
            <h2 className="text-xl font-bold">
              <span className="bg-[#75bfcf] px-2 text-black">Custom intent</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Price" value={price} onChange={setPrice} />
              <Field label="Quantity" value={quantity} onChange={setQuantity} />
              <Field label="Margin" value={margin} onChange={setMargin} />
              <Field label="Leverage" value={leverage} onChange={setLeverage} />
              <Field
                label="Max notional"
                value={maxNotional}
                onChange={setMaxNotional}
              />
            </div>
            <button
              type="button"
              className="w-full px-4 py-2 bg-[#75bfcf] text-black rounded font-medium hover:bg-[#75bfcf]/80 disabled:opacity-50"
              disabled={busy}
              onClick={runCustom}
            >
              {busy ? "Evaluating…" : "Evaluate proposal"}
            </button>
          </div>

          <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-5 md:p-6 space-y-4">
            <h2 className="text-xl font-bold">
              <span className="bg-[#75bfcf] px-2 text-black">Demo presets</span>
            </h2>
            <p className="text-sm text-white/70">
              Spike scenarios: oversize notional (deny) vs in-policy size
              (allow).
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className="pressable-button teal flex-1"
                disabled={busy}
                onClick={() => run("ok")}
              >
                In-policy (allow)
              </button>
              <button
                type="button"
                className="pressable-button flex-1"
                disabled={busy}
                onClick={() => run("attack")}
              >
                Oversize (deny)
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
                  {result.status ?? "error"}
                </p>
                {result.reasons?.map((r) => (
                  <p key={r} className="text-white/85">
                    {r}
                  </p>
                ))}
                {result.error ? (
                  <p className="text-white/85">{result.error}</p>
                ) : null}
                {result.wouldBroadcast === false && result.status === "denied" ? (
                  <p className="text-white/60 text-xs mt-2">
                    No MsgExec broadcast (gateway short-circuit).
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
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

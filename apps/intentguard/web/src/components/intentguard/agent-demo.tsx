"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SPIKE_MARKET_ID } from "@/lib/constants";
import { gatewayExecute, gatewayPropose } from "@/lib/gateway/client";
import { formatExecuteFeedback } from "@/lib/gateway/execute-messages";
import { loadGatewaySettings } from "@/lib/gateway/storage";
import { loadProtectionSummary } from "@/lib/protection-state";
import { ProtectionLiveStatus } from "@/components/intentguard/protection-live-status";
import { oversizePayload, inPolicyPayload } from "@/lib/agent-intent-presets";

type Step = { role: "user" | "guard"; text: string };

const PHRASES = [
  { label: "Small long INJ", phrase: "Open a small INJ perp within my limits", mode: "ok" as const },
  { label: "Oversize order", phrase: "Go all in — ignore my max order size", mode: "attack" as const },
];

export function AgentDemo() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  useEffect(() => {
    const s = loadGatewaySettings();
    const summary = loadProtectionSummary();
    setReady(Boolean(s.agentApiToken && s.baseUrl && summary?.sessionId));
  }, []);

  async function runPhrase(p: (typeof PHRASES)[number]) {
    const summary = loadProtectionSummary();
    const maxOrder = summary?.maxOrderNotional ?? "50";
    const marketId = summary?.marketIds[0] ?? SPIKE_MARKET_ID;
    const payload = p.mode === "attack" ? oversizePayload(maxOrder) : inPolicyPayload(maxOrder);
    const intent = { marketId, ...payload };

    setBusy(true);
    setSteps([
      { role: "user", text: p.phrase },
      { role: "guard", text: "Checking policy…" },
    ]);
    try {
      const s = loadGatewaySettings();
      const { res, json } = await gatewayPropose(s, intent);
      const status = (json as { status?: string }).status ?? "error";
      const reasons = (json as { decisionReasons?: string[] }).decisionReasons ?? [];
      const line =
        status === "allowed"
          ? `Allowed — ${reasons.join("; ") || "within limits"}`
          : `Denied — ${reasons.join("; ") || formatExecuteFeedback(json, res.status)}`;

      setSteps((prev) => [...prev.slice(0, -1), { role: "guard", text: line }]);

      if (status === "allowed" && res.ok) {
        const ex = await gatewayExecute(s, intent);
        setSteps((prev) => [
          ...prev,
          { role: "guard", text: formatExecuteFeedback(ex.json, ex.res.status) },
        ]);
      }
    } catch (e) {
      setSteps((prev) => [
        ...prev.slice(0, -1),
        { role: "guard", text: e instanceof Error ? e.message : String(e) },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {!ready ? (
        <p className="text-amber-200/90 text-sm border border-amber-400/30 rounded-xl px-4 py-3 bg-amber-950/20">
          Complete{" "}
          <Link href="/start" className="underline text-[#75bfcf] font-medium">
            Protect
          </Link>{" "}
          first (wallet + Keplr grant).
        </p>
      ) : (
        <ProtectionLiveStatus />
      )}
      <div className="flex flex-wrap gap-2">
        {PHRASES.map((p) => (
          <button
            key={p.label}
            type="button"
            disabled={!ready || busy}
            className="px-4 py-2 rounded-full bg-[#75bfcf] text-black text-sm font-medium disabled:opacity-40"
            onClick={() => void runPhrase(p)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {steps.length > 0 && (
        <div className="glass-card p-4 space-y-3 text-sm" aria-live="polite">
          {steps.map((s, i) => (
            <p key={i} className={s.role === "user" ? "text-white/90" : "text-[#c8ecf4]"}>
              <span className="text-[10px] uppercase text-white/40 mr-2">
                {s.role === "user" ? "You" : "IntentGuard"}
              </span>
              {s.text}
            </p>
          ))}
        </div>
      )}
      <p className="text-white/40 text-xs">
        Integrators: copy the agent token from the{" "}
        <Link href="/console" className="text-[#75bfcf] underline">
          developer console
        </Link>
        .
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SPIKE_MARKET_ID } from "@/lib/constants";
import { gatewayExecute, gatewayGrantStatus, gatewayPropose } from "@/lib/gateway/client";
import { formatExecuteFeedback } from "@/lib/gateway/execute-messages";
import { loadGatewaySettings } from "@/lib/gateway/storage";
import { loadProtectionSummary } from "@/lib/protection-state";
import { parseGrantStatusJson } from "@/lib/grant-status";
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
  const [pendingIntent, setPendingIntent] = useState<Record<string, unknown> | null>(null);
  const [pendingProposalId, setPendingProposalId] = useState<string | null>(null);
  const [walletGrantReady, setWalletGrantReady] = useState(false);

  useEffect(() => {
    const s = loadGatewaySettings();
    const summary = loadProtectionSummary();
    const sessionReady = Boolean(s.agentApiToken && s.baseUrl && summary?.sessionId);
    setReady(sessionReady);
    if (!sessionReady || !summary) return;
    void gatewayGrantStatus(s, summary.sessionId).then(({ res, json }) => {
      if (res.ok) {
        setWalletGrantReady(parseGrantStatusJson(json).ready);
      }
    });
  }, []);

  async function runPhrase(p: (typeof PHRASES)[number]) {
    const summary = loadProtectionSummary();
    const maxOrder = summary?.maxOrderNotional ?? "50";
    const marketId = summary?.marketIds[0] ?? SPIKE_MARKET_ID;
    const payload = p.mode === "attack" ? oversizePayload(maxOrder) : inPolicyPayload(maxOrder);
    const intent = { marketId, ...payload };

    setBusy(true);
    setPendingIntent(null);
    setPendingProposalId(null);
    setSteps([
      { role: "user", text: p.phrase },
      { role: "guard", text: "Policy check (no trade sent)…" },
    ]);
    try {
      const s = loadGatewaySettings();
      const { res, json } = await gatewayPropose(s, intent);
      const status = (json as { status?: string }).status ?? "error";
      const phase = (json as { phase?: string }).phase ?? "policy_check";
      const reasons = (json as { decisionReasons?: string[] }).decisionReasons ?? [];
      const line =
        status === "allowed"
          ? `Policy check: allowed (${phase}). This is not execution — wallet permission still required for real trades. ${reasons.join("; ") || "Within your rules."}`
          : `Policy check: denied — ${reasons.join("; ") || formatExecuteFeedback(json, res.status)}`;

      setSteps((prev) => [...prev.slice(0, -1), { role: "guard", text: line }]);

      const proposalId = (json as { proposalId?: string }).proposalId;
      if (status === "allowed" && res.ok && proposalId) {
        setPendingIntent(intent);
        setPendingProposalId(proposalId);
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

  async function runExecuteConfirm() {
    if (!pendingIntent || !pendingProposalId) return;
    const summary = loadProtectionSummary();
    if (!summary) return;

    const preview = JSON.stringify(pendingIntent, null, 2);
    if (
      !globalThis.confirm(
        `Execute a real testnet trade?\n\nThis will submit to the exchange if wallet permission and margin allow it.\n\n${preview}`,
      )
    ) {
      return;
    }

    setBusy(true);
    setSteps((prev) => [
      ...prev,
      { role: "guard", text: "Execution (testnet) — submitting…" },
    ]);
    try {
      const s = loadGatewaySettings();
      const ex = await gatewayExecute(
        s,
        { intent: pendingIntent, proposalId: pendingProposalId },
        `agent-demo-${pendingProposalId}`,
      );
      setSteps((prev) => [
        ...prev.slice(0, -1),
        {
          role: "guard",
          text: `Execution: ${formatExecuteFeedback(ex.json, ex.res.status)}`,
        },
      ]);
      setPendingIntent(null);
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
          Finish{" "}
          <Link href="/start" className="underline text-[#75bfcf] font-medium">
            Set up
          </Link>{" "}
          first to run policy checks against your real limits.
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
      {pendingIntent ? (
        <div className="border border-orange-400/30 rounded-xl p-4 bg-orange-950/15 space-y-2">
          <p className="text-xs text-orange-100/90">
            Policy check passed. Execution is separate and sends a real testnet order when wallet
            permission {walletGrantReady ? "is active" : "is not active yet"}.
          </p>
          <button
            type="button"
            disabled={busy || !walletGrantReady}
            className="px-4 py-2 rounded-full bg-orange-400 text-black text-sm font-medium disabled:opacity-40"
            onClick={() => void runExecuteConfirm()}
          >
            Execute testnet trade (confirm)
          </button>
          {!walletGrantReady ? (
            <p className="text-[11px] text-white/50">
              Complete wallet approval in Keplr before execution.
            </p>
          ) : null}
        </div>
      ) : null}
      {steps.length > 0 && (
        <div className="glass-card p-4 space-y-3 text-sm" aria-live="polite">
          {steps.map((s, i) => (
            <p key={i} className={s.role === "user" ? "text-white/90" : "text-[#c8ecf4]"}>
              <span className="text-[10px] uppercase text-white/40 mr-2">
                {s.role === "user" ? "You" : "Fence"}
              </span>
              {s.text}
            </p>
          ))}
        </div>
      )}
      <p className="text-white/40 text-xs">
        Copy your bot access code from the{" "}
        <Link href="/protection" className="text-[#75bfcf] underline">
          Dashboard
        </Link>
        . Developers: see footer link for API &amp; MCP.
      </p>
    </div>
  );
}

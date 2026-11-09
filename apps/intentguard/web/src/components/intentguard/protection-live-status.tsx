"use client";

import { useEffect, useState } from "react";
import {
  gatewayAgentSession,
  gatewayGrantStatus,
  gatewayHealth,
} from "@/lib/gateway/client";
import { loadGatewaySettings } from "@/lib/gateway/storage";
import { loadProtectionSummary } from "@/lib/protection-state";

type Chip = { label: string; value: string; tone: "ok" | "warn" | "muted" };

export function ProtectionLiveStatus() {
  const [chips, setChips] = useState<Chip[] | null>(null);

  useEffect(() => {
    const summary = loadProtectionSummary();
    const settings = loadGatewaySettings();
    if (!summary?.sessionId || !settings.agentApiToken) {
      setChips(null);
      return;
    }

    void (async () => {
      const next: Chip[] = [];
      const [grantRes, agentRes, healthRes] = await Promise.all([
        gatewayGrantStatus(settings, summary.sessionId),
        gatewayAgentSession(settings),
        gatewayHealth(settings),
      ]);

      if (grantRes.res.ok) {
        const ready = (grantRes.json as { grantStatus?: { ready?: boolean } }).grantStatus
          ?.ready;
        next.push({
          label: "On-chain grant",
          value: ready ? "active" : "pending",
          tone: ready ? "ok" : "warn",
        });
      }

      if (healthRes.res.ok) {
        const exec = Boolean(
          (healthRes.json as { executeEnabled?: boolean }).executeEnabled,
        );
        next.push({
          label: "Live execute",
          value: exec ? "on" : "off",
          tone: exec ? "ok" : "warn",
        });
      }

      if (agentRes.res.ok) {
        const a = agentRes.json as {
          dailyMarginRemaining?: string;
          dailyMarginBudget?: string;
        };
        const day = (a as { dailyMarginDay?: string }).dailyMarginDay;
        next.push({
          label: "Daily margin left (UTC)",
          value: `${a.dailyMarginRemaining ?? "?"} / ${a.dailyMarginBudget ?? "?"}${day ? ` · ${day}` : ""}`,
          tone: "muted",
        });
      }

      setChips(next.length ? next : null);
    })();
  }, []);

  if (!chips?.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c.label}
          className={`text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-full border ${
            c.tone === "ok"
              ? "border-green-400/40 text-green-200 bg-green-950/30"
              : c.tone === "warn"
                ? "border-amber-400/40 text-amber-100 bg-amber-950/25"
                : "border-white/20 text-white/60 bg-black/20"
          }`}
        >
          {c.label}: <strong className="font-medium normal-case">{c.value}</strong>
        </span>
      ))}
    </div>
  );
}

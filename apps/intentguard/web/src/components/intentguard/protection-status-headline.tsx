"use client";

import { useEffect, useState } from "react";
import { gatewayGrantStatus } from "@/lib/gateway/client";
import { loadGatewaySettings } from "@/lib/gateway/storage";
import { loadProtectionSummary } from "@/lib/protection-state";
import { parseGrantStatusJson } from "@/lib/grant-status";

type HeadlineState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "pending_approval" }
  | { kind: "incomplete" }
  | { kind: "active" }
  | { kind: "no_bot_code" };

export function ProtectionStatusHeadline({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, setState] = useState<HeadlineState>({ kind: "loading" });
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    const summary = loadProtectionSummary();
    const settings = loadGatewaySettings();
    if (!summary?.sessionId) {
      setState({ kind: "none" });
      return;
    }
    if (!settings.agentApiToken) {
      setState({ kind: "no_bot_code" });
      setDetail("Rules are saved locally but no bot access code is on this device.");
      return;
    }

    void (async () => {
      setState({ kind: "loading" });
      const grantRes = await gatewayGrantStatus(settings, summary.sessionId);
      if (!grantRes.res.ok) {
        setState({ kind: "pending_approval" });
        setDetail("Could not verify wallet permission. Try again shortly.");
        return;
      }
      const parsed = parseGrantStatusJson(grantRes.json);
      if (parsed.ready) {
        setState({ kind: "active" });
        setDetail(
          "Wallet permission confirmed on-chain (place and cancel). Trades are policy-checked before the exchange.",
        );
        return;
      }
      if (parsed.limitReady || parsed.cancelReady) {
        setState({ kind: "incomplete" });
        setDetail(
          parsed.userFacingIssues[0] ??
            "Wallet permission is incomplete — finish approval in Keplr.",
        );
        return;
      }
      setState({ kind: "pending_approval" });
      setDetail(
        parsed.userFacingIssues[0] ??
          "Approve the timed permission in Keplr — not active until the chain confirms both permissions.",
      );
    })();
  }, [refreshKey]);

  if (state.kind === "loading") {
    return <p className="text-sm text-white/50">Checking protection status…</p>;
  }
  if (state.kind === "none") {
    return null;
  }

  const copy =
    state.kind === "active"
      ? {
          label: "Protection active",
          className: "border-green-400/35 bg-green-950/25 text-green-100",
        }
      : state.kind === "incomplete"
        ? {
            label: "Wallet permission incomplete",
            className: "border-orange-400/35 bg-orange-950/25 text-orange-100",
          }
        : state.kind === "no_bot_code"
          ? {
              label: "Session not connected on this device",
              className: "border-white/20 bg-black/30 text-white/80",
            }
          : {
              label: "Waiting for wallet approval",
              className: "border-amber-400/35 bg-amber-950/25 text-amber-100",
            };

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${copy.className}`}>
      <p className="font-medium">{copy.label}</p>
      <p className="text-xs mt-1 opacity-90">{detail}</p>
    </div>
  );
}

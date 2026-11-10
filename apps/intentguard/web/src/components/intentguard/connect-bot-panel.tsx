"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchHostedStatus } from "@/lib/hosted";
import { loadGatewaySettings } from "@/lib/gateway/storage";
import { loadProtectionSummary } from "@/lib/protection-state";

export function ConnectBotPanel({
  collapsedAdvanced = false,
  refreshKey = 0,
}: {
  collapsedAdvanced?: boolean;
  refreshKey?: number;
}) {
  const [token, setToken] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(!collapsedAdvanced);

  useEffect(() => {
    const settings = loadGatewaySettings();
    setToken(settings.agentApiToken ?? "");
    void fetchHostedStatus();
  }, [refreshKey]);

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  return (
    <div className="glass-card p-5 md:p-6 space-y-4 text-white">
      <div>
        <h2 className="text-lg font-medium text-[#75bfcf]">Connect a trading bot or AI</h2>
        <p className="text-sm text-white/65 mt-1">
          Give your automation a <strong className="text-white/85">bot access code</strong> — not your
          wallet seed phrase and not unlimited exchange permission.
        </p>
      </div>

      {!token ? (
        <p className="text-amber-200/90 text-sm border border-amber-400/25 rounded-lg px-3 py-2 bg-amber-950/20">
          Set up protection first on{" "}
          <Link href="/start" className="text-[#75bfcf] underline font-medium">
            Set up
          </Link>
          . Your code appears here when you finish.
        </p>
      ) : (
        <div className="space-y-2">
          <span className="text-xs text-white/50">Bot access code</span>
          <div className="flex gap-2 items-start">
            <code className="text-xs break-all text-white/85 flex-1 font-mono">{token}</code>
            <button
              type="button"
              className="pressable-button teal text-xs shrink-0"
              onClick={() => copy(token)}
            >
              Copy code
            </button>
          </div>
          <p className="text-[11px] text-white/45">
            Paste into your bot or AI tool. Anyone with this code can run policy checks and request
            execution within your limits — keep it private.
          </p>
          {(() => {
            const exp = loadProtectionSummary()?.agentTokenExpiresAt;
            if (!exp) return null;
            return (
              <p className="text-[11px] text-white/40">
                Bot access code expires (server):{" "}
                <time dateTime={exp}>{new Date(exp).toLocaleString()}</time>
                {" · "}
                On-chain wallet permission expiry is separate.
              </p>
            );
          })()}
        </div>
      )}

      <button
        type="button"
        className="text-xs text-[#75bfcf] underline"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "Hide" : "Show"} setup for developers
      </button>

      {showAdvanced ? (
        <div className="text-xs text-white/55 space-y-2 border-t border-white/10 pt-3">
          <p>
            Technical name: agent token (<code className="text-white/70">agt_…</code>). Gateway URL is
            handled automatically on this site.
          </p>
          <Link href="/console" className="text-[#75bfcf] underline inline-block">
            Developer console (curl, MCP) →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

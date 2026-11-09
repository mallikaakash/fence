"use client";

import { useEffect, useState } from "react";
import { gatewayAuditEvents, gatewayHealth } from "@/lib/gateway/client";
import type { GatewayHealthJson } from "@/lib/gateway/health-types";
import { explorerTxUrl } from "@/lib/explorer";
import { TxVerifyChip } from "@/components/intentguard/tx-verify-chip";
import { fetchHostedStatus } from "@/lib/hosted";
import { loadGatewaySettings, saveGatewaySettings } from "@/lib/gateway/storage";

type AuditEvent = {
  at: string;
  type: string;
  message: string;
  detail?: Record<string, unknown>;
};

export function LiveActivityPanel() {
  const [health, setHealth] = useState<GatewayHealthJson | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchHostedStatus();
        let settings = loadGatewaySettings();
        if (status?.proxyConfigured && typeof window !== "undefined") {
          const proxy = `${window.location.origin}/api/gateway`;
          if (!settings.baseUrl || settings.baseUrl.includes("127.0.0.1")) {
            settings = { ...settings, baseUrl: proxy, ownerApiKey: "" };
            saveGatewaySettings(settings);
          }
        }
        const { res: hres, json: hj } = await gatewayHealth(settings);
        if (!cancelled && hres.ok) setHealth(hj as GatewayHealthJson);

        if (status?.proxyConfigured || settings.ownerApiKey) {
          const { res, json } = await gatewayAuditEvents(settings);
          if (res.ok) {
            setEvents(
              ((json as { events?: AuditEvent[] }).events ?? []).slice().reverse(),
            );
          } else if (!cancelled) {
            setError(
              (json as { error?: string }).error ??
                "Connect console first if audit is empty",
            );
          }
        } else if (!cancelled) {
          setError("Gateway proxy not configured — live audit unavailable");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const network = health?.network === "mainnet" ? "mainnet" : "testnet";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Stat
          label="Gateway"
          value={
            health
              ? `v${health.version ?? "?"} · ${health.network ?? "?"}`
              : loading
                ? "…"
                : "unreachable"
          }
        />
        <Stat
          label="Execute on sidecar"
          value={health?.executeEnabled ? "enabled" : "propose-only"}
        />
        <Stat label="Sessions" value={String(health?.sessions ?? "—")} />
      </div>

      <p className="text-xs text-white/55">
        Live data from your deployed gateway. Policy proposes are{" "}
        <strong className="text-white/70">off-chain audit</strong> until MsgExec
        broadcasts (execute mode). Notional limits are enforced by the gateway — see{" "}
        <a href="/limitations" className="text-[#75bfcf] underline">
          trust boundaries
        </a>
        .
      </p>

      {error && !events.length ? (
        <p className="text-amber-200/90 text-sm">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-white/50 text-sm">Loading gateway activity…</p>
      ) : events.length === 0 ? (
        <p className="text-white/60 text-sm border border-white/10 rounded-lg p-4 bg-black/20">
          No audit events yet. Create a session in{" "}
          <a href="/console" className="text-[#75bfcf] underline">
            Owner console
          </a>{" "}
          and run a policy test on{" "}
          <a href="/trade" className="text-[#75bfcf] underline">
            Policy test
          </a>
          .
        </p>
      ) : (
        <ul className="space-y-2 max-h-96 overflow-y-auto">
          {events.map((ev, i) => {
            const txHash =
              typeof ev.detail?.txHash === "string" ? ev.detail.txHash : null;
            const phase =
              typeof ev.detail?.broadcast === "boolean"
                ? ev.detail.broadcast
                  ? "on-chain"
                  : "off-chain"
                : ev.type.includes("propose") || ev.type.includes("denied")
                  ? "off-chain"
                  : "ops";
            return (
              <li
                key={`${ev.at}-${i}`}
                className="text-sm border border-white/10 rounded-lg px-3 py-2 bg-black/25"
              >
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <span className="text-[#75bfcf] font-mono text-xs">{ev.type}</span>
                  <span className="text-[10px] uppercase text-white/45">{phase}</span>
                </div>
                <p className="text-white/80 mt-1">{ev.message}</p>
                <p className="text-white/40 text-[10px] mt-1">{ev.at}</p>
                {txHash ? (
                  <div className="mt-1 space-y-1">
                    <a
                      href={explorerTxUrl(txHash, network)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#75bfcf] text-xs break-all hover:underline block"
                    >
                      {txHash}
                    </a>
                    <TxVerifyChip txHash={txHash} network={network} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-xl p-4">
      <p className="text-xs uppercase text-white/60">{label}</p>
      <p className="text-sm font-medium text-white/90 mt-1">{value}</p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { GatewayHealthJson } from "@/lib/gateway/health-types";
import { fetchHostedStatus, isHostedHostname } from "@/lib/hosted";
import {
  gatewaySecretsStale,
  gatewaySecretsSavedAt,
  hasStoredGatewaySecrets,
} from "@/lib/gateway/storage";

export function EnvironmentRibbon() {
  const [hosted, setHosted] = useState(false);
  const [path, setPath] = useState("");
  const [proxyReady, setProxyReady] = useState(false);

  useEffect(() => {
    setHosted(isHostedHostname(window.location.hostname));
    setPath(window.location.pathname);
    void fetchHostedStatus().then((s) => setProxyReady(Boolean(s?.proxyConfigured)));
  }, []);

  if (!hosted) return null;

  const onConsole = path === "/console";
  if (proxyReady) {
    return (
      <div className="fixed top-0 inset-x-0 z-[60] bg-[#0d3d4a]/95 border-b border-[#75bfcf]/40 text-[#c8ecf4] text-xs text-center py-1.5 px-3">
        {onConsole
          ? "Hosted production — console uses Vercel proxy to your sidecar."
          : "Hosted production — grant audit is public; owner flows use /console with sidecar proxy."}
      </div>
    );
  }

  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-amber-950/90 border-b border-amber-500/40 text-amber-100 text-xs text-center py-1.5 px-3">
      {onConsole
        ? "Sidecar not wired — set INTENTGUARD_GATEWAY_URL on Vercel (see docs/DEPLOY-PRODUCTION.md) or use local npm run web:dev."
        : "Grant audit works here; owner console needs a deployed sidecar + Vercel proxy env."}
    </div>
  );
}

export function GatewayConnectionWarnings({
  baseUrl,
  proxyMode,
}: {
  baseUrl: string;
  proxyMode: boolean;
}) {
  const [mixed, setMixed] = useState(false);

  useEffect(() => {
    const httpsPage = window.location.protocol === "https:";
    const httpGateway =
      baseUrl.startsWith("http://") && !baseUrl.includes("/api/gateway");
    setMixed(httpsPage && httpGateway && !proxyMode);
  }, [baseUrl, proxyMode]);

  if (!mixed) return null;

  return (
    <p className="text-amber-200/90 text-xs border border-amber-500/30 rounded-lg px-3 py-2 bg-amber-950/40">
      Browsers block HTTPS → HTTP calls to LAN IPs. Use{" "}
      <strong className="text-amber-100">Vercel proxy</strong> or run{" "}
      <code className="text-amber-50">npm run web:dev</code> on the same machine as the
      sidecar.
    </p>
  );
}

export function GatewaySecretsPanel({ onClear }: { onClear: () => void }) {
  const [stale, setStale] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [hasSecrets, setHasSecrets] = useState(false);

  useEffect(() => {
    setStale(gatewaySecretsStale());
    setSavedAt(gatewaySecretsSavedAt());
    setHasSecrets(hasStoredGatewaySecrets());
  }, []);

  return (
    <div className="border border-white/10 rounded-xl p-4 bg-black/30 space-y-3 text-xs text-white/70">
      <p>
        Owner and agent tokens are stored in <strong className="text-white/90">browser localStorage</strong> on
        this device only. Clear on shared machines; with Vercel proxy the owner key can stay server-side only.{" "}
        <code className="text-white/80">npm run web:dev</code> over untrusted extensions.
      </p>
      {hasSecrets && savedAt && (
        <p className="text-white/50">Last saved: {new Date(savedAt).toLocaleString()}</p>
      )}
      {stale && hasSecrets && (
        <p className="text-amber-200/90">Keys are older than 24h — consider clearing if this is not your daily dev machine.</p>
      )}
      <button
        type="button"
        className="px-3 py-1.5 rounded-full border border-red-400/50 text-red-200 hover:bg-red-950/40"
        onClick={() => {
          if (!confirm("Clear gateway URL, owner key, and agent token from this browser?")) return;
          onClear();
          setHasSecrets(false);
          setStale(false);
          setSavedAt(null);
        }}
      >
        Clear stored keys
      </button>
    </div>
  );
}

export function GatewayNetworkChip({ health }: { health: GatewayHealthJson | null }) {
  if (!health?.network) return null;
  const mainnet = health.network === "mainnet";
  return (
    <span
      className={
        mainnet
          ? "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-orange-400/20 text-orange-200 border border-orange-400/40"
          : "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-[#75bfcf]/20 text-[#75bfcf] border border-[#75bfcf]/40"
      }
    >
      {health.network}
      {health.executeEnabled ? " · execute on" : " · propose only"}
    </span>
  );
}

export function GrantTxPlanPanel({
  json,
  onCopy,
}: {
  json: string;
  onCopy: () => void;
}) {
  return (
    <div className="mt-2 w-full max-w-md border border-white/10 rounded-lg bg-black/30 p-2 text-left">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] text-white/50 uppercase tracking-wide">Grant tx plan</span>
        <button
          type="button"
          className="text-[10px] px-2 py-0.5 border border-white/20 rounded text-white/70"
          onClick={onCopy}
        >
          Copy JSON
        </button>
      </div>
      <pre className="text-[9px] text-white/55 max-h-40 overflow-auto whitespace-pre-wrap">
        {json}
      </pre>
    </div>
  );
}

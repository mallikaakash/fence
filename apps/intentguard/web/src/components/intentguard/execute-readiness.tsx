"use client";

import { useEffect, useState } from "react";
import { fetchHostedStatus } from "@/lib/hosted";
import { gatewayHealth } from "@/lib/gateway/client";
import type { GatewayHealthJson } from "@/lib/gateway/health-types";
import { loadGatewaySettings, saveGatewaySettings } from "@/lib/gateway/storage";
import { TestnetResourcesCallout } from "@/components/intentguard/testnet-resources-callout";

export function ExecuteReadinessPanel() {
  const [health, setHealth] = useState<GatewayHealthJson | null>(null);

  useEffect(() => {
    void (async () => {
      const status = await fetchHostedStatus();
      let s = loadGatewaySettings();
      if (status?.proxyConfigured && typeof window !== "undefined") {
        const proxy = `${window.location.origin}/api/gateway`;
        if (!s.baseUrl || s.baseUrl.includes("127.0.0.1")) {
          s = { ...s, baseUrl: proxy, ownerApiKey: "" };
          saveGatewaySettings(s);
        }
      }
      const { res, json } = await gatewayHealth(s);
      if (res.ok) setHealth(json as GatewayHealthJson);
    })();
  }, []);

  const executeReady = Boolean(health?.executeEnabled);

  return (
    <div className="border border-white/10 rounded-xl p-4 bg-black/30 space-y-2 text-xs text-white/70">
      <p className="text-[#75bfcf] uppercase tracking-wide text-[10px]">
        Execute readiness (testnet)
      </p>
      <ul className="space-y-1 list-disc list-inside">
        <li className={executeReady ? "text-green-300" : "text-amber-200"}>
          Gateway execute: {executeReady ? "enabled" : "off (propose-only)"}
        </li>
        <li>Owner typed MsgGrant on-chain (console → Check grant)</li>
        <li>Funded subaccount margin on exchange (Helix testnet)</li>
        <li>Hosted live trading uses your session keys — no export to the browser</li>
      </ul>
      <TestnetResourcesCallout />
    </div>
  );
}

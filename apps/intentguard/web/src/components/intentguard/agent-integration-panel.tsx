"use client";

import { useEffect, useMemo, useState } from "react";
import { SPIKE_MARKET_ID } from "@/lib/constants";
import { fetchHostedStatus } from "@/lib/hosted";
import { loadGatewaySettings } from "@/lib/gateway/storage";
import { loadProtectionSummary } from "@/lib/protection-state";

const SAMPLE_INTENT = {
  marketId: SPIKE_MARKET_ID,
  margin: "5",
  leverage: 2,
  price: "10",
  quantity: "1",
  side: "long" as const,
};

export function AgentIntegrationPanel() {
  const [baseUrl, setBaseUrl] = useState("/api/gateway");
  const [token, setToken] = useState("");

  useEffect(() => {
    const settings = loadGatewaySettings();
    const summary = loadProtectionSummary();
    if (settings.agentApiToken) setToken(settings.agentApiToken);
    void fetchHostedStatus().then((s) => {
      if (s?.proxyConfigured && typeof window !== "undefined") {
        setBaseUrl(`${window.location.origin}/api/gateway`);
      } else if (settings.baseUrl) {
        setBaseUrl(settings.baseUrl.replace(/\/$/, ""));
      }
    });
  }, []);

  const proposeCurl = useMemo(() => {
    const agt = token || "agt_YOUR_TOKEN";
    return `curl -sS -X POST "${baseUrl}/v1/propose" \\
  -H "Authorization: Bearer ${agt}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ intent: SAMPLE_INTENT }, null, 2)}'`;
  }, [baseUrl, token]);

  const sessionCurl = useMemo(() => {
    const agt = token || "agt_YOUR_TOKEN";
    return `curl -sS -H "Authorization: Bearer ${agt}" "${baseUrl}/v1/agent/session"`;
  }, [baseUrl, token]);

  const mcpNote = `Agent tools should call propose/execute with Bearer agt_… only.
Never put grantee private keys or own_… keys in MCP / agent env.
Docs: repo docs/AGENT-INTEGRATION.md`;

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  return (
    <div className="glass-card p-5 md:p-6 space-y-4 text-white">
      <div>
        <h2 className="text-lg font-medium text-[#75bfcf]">Connect your agent</h2>
        <p className="text-sm text-white/65 mt-1">
          After Protect, the browser saves your session token. Use it in MCP, scripts, or backends — not
          your seed phrase or grantee key.
        </p>
      </div>

      {!token ? (
        <p className="text-amber-200/90 text-sm border border-amber-400/25 rounded-lg px-3 py-2 bg-amber-950/20">
          No <code className="text-xs">agt_</code> token yet. Complete{" "}
          <a href="/start" className="text-[#75bfcf] underline">
            Protect
          </a>{" "}
          first, or create a session in the owner section below.
        </p>
      ) : (
        <div className="space-y-1">
          <span className="text-xs text-white/50">Agent token</span>
          <div className="flex gap-2 items-start">
            <code className="text-xs break-all text-white/85 flex-1">{token}</code>
            <button
              type="button"
              className="pressable-button muted text-xs shrink-0"
              onClick={() => copy(token)}
            >
              Copy token
            </button>
          </div>
        </div>
      )}

      <BlockField title="Gateway base" body={baseUrl} onCopy={() => copy(baseUrl)} />

      <pre className="text-[11px] leading-relaxed bg-black/50 border border-white/15 rounded-xl p-3 overflow-x-auto text-[#c8ecf4] font-mono">
        {sessionCurl}
      </pre>
      <button type="button" className="pressable-button teal text-xs" onClick={() => copy(sessionCurl)}>
        Copy session curl
      </button>

      <pre className="text-[11px] leading-relaxed bg-black/50 border border-white/15 rounded-xl p-3 overflow-x-auto text-[#c8ecf4] font-mono max-h-48">
        {proposeCurl}
      </pre>
      <button type="button" className="pressable-button teal text-xs" onClick={() => copy(proposeCurl)}>
        Copy propose curl
      </button>

      <p className="text-xs text-white/55 whitespace-pre-wrap border-t border-white/10 pt-3">{mcpNote}</p>

      <a
        href="https://github.com/mallikaakash/injective-buildathon/blob/main/docs/AGENT-INTEGRATION.md"
        target="_blank"
        rel="noreferrer"
        className="text-sm text-[#75bfcf] underline inline-block"
      >
        Full integration guide →
      </a>
    </div>
  );
}

function BlockField({
  title,
  body,
  onCopy,
}: {
  title: string;
  body: string;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-white/50">{title}</span>
      <div className="flex gap-2 items-center">
        <code className="text-xs text-white/80 break-all flex-1">{body}</code>
        <button type="button" className="pressable-button muted text-xs shrink-0" onClick={onCopy}>
          Copy
        </button>
      </div>
    </div>
  );
}

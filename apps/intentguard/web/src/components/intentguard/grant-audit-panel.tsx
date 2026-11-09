"use client";

import { useState } from "react";
import { OwnerWalletConnect } from "@/components/intentguard/owner-wallet-connect";

type AuditResponse = {
  ok: boolean;
  pretty?: string;
  error?: string;
  endpoint?: string;
};

export function GrantAuditPanel() {
  const [granter, setGranter] = useState("");
  const [mainnet, setMainnet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuditResponse | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/audit?granter=${encodeURIComponent(granter)}${mainnet ? "&mainnet=1" : ""}`,
        { cache: "no-store" },
      );
      setResult((await res.json()) as AuditResponse);
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
    <div className="space-y-4 text-white">
      <p className="text-sm text-white/70">
        Live Injective LCD — decodes grants and flags risky GenericAuthorization.
        Does not create or revoke grants (use Owner console).
      </p>
      <OwnerWalletConnect
        network={mainnet ? "mainnet" : "testnet"}
        onAddress={setGranter}
      />
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          aria-label="granter address"
          className="flex-1 bg-black/40 border border-white/30 rounded px-3 py-2 text-sm font-mono"
          value={granter}
          onChange={(e) => setGranter(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-white/80 whitespace-nowrap">
          <input
            type="checkbox"
            checked={mainnet}
            onChange={(e) => setMainnet(e.target.checked)}
          />
          Mainnet
        </label>
        <button
          type="button"
          className="pressable-button teal"
          disabled={busy}
          onClick={run}
        >
          {busy ? "Scanning…" : "Run auditor"}
        </button>
      </div>
      {result?.pretty ? (
        <pre className="text-sm whitespace-pre-wrap bg-black/40 border border-white/15 rounded-xl p-4 text-white/85 font-mono">
          {result.pretty}
          {result.endpoint ? `\n\n(${result.endpoint})` : ""}
        </pre>
      ) : null}
      {result?.error ? (
        <p className="text-red-300/90 text-sm">{result.error}</p>
      ) : null}
    </div>
  );
}

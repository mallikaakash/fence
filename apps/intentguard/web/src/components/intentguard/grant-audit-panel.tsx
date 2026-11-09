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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuditResponse | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/audit?granter=${encodeURIComponent(granter)}`,
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
        Queries Injective testnet for AuthZ grants and highlights risky generic permissions. To create
        or revoke protection, use{" "}
        <a href="/start" className="text-[#75bfcf] underline">
          Protect
        </a>
        .
      </p>
      <p className="text-[10px] text-[#75bfcf]/80 uppercase tracking-wide">Injective testnet only</p>
      <OwnerWalletConnect network="testnet" onAddress={setGranter} />
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <input
          aria-label="granter address"
          className="flex-1 min-h-[42px] bg-black/40 border border-white/30 rounded-md px-3 py-2 text-sm font-mono"
          value={granter}
          onChange={(e) => setGranter(e.target.value)}
        />
        <button
          type="button"
          className="pressable-button teal shrink-0 min-w-[8.5rem]"
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

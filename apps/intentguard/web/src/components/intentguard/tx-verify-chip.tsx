"use client";

import { useEffect, useState } from "react";

export function TxVerifyChip({
  txHash,
  network,
}: {
  txHash: string;
  network: "testnet" | "mainnet";
}) {
  const [label, setLabel] = useState<string>("Verifying…");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/tx?hash=${encodeURIComponent(txHash)}${network === "mainnet" ? "&mainnet=1" : ""}`,
        );
        const json = (await res.json()) as {
          ok?: boolean;
          success?: boolean;
          height?: string;
          code?: number;
          error?: string;
        };
        if (cancelled) return;
        if (json.ok && json.success) {
          setLabel(`LCD ✓ block ${json.height ?? "?"}`);
        } else if (json.ok) {
          setLabel(`LCD code ${json.code ?? "?"}`);
        } else {
          setLabel(json.error ?? "LCD miss");
        }
      } catch {
        if (!cancelled) setLabel("LCD unreachable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txHash, network]);

  return (
    <span className="text-[10px] text-white/45 font-mono">{label}</span>
  );
}

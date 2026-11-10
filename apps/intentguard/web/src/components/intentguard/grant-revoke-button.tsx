"use client";

import { useState } from "react";
import { broadcastTypedRevokes } from "@/lib/chain/broadcast-revoke";
import { explorerTxUrl } from "@/lib/explorer";

export function GrantRevokeButton({
  granter,
  grantee,
  network = "testnet",
  onSuccess,
}: {
  granter: string;
  grantee: string;
  network?: "testnet" | "mainnet";
  onSuccess?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [txHashes, setTxHashes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (!granter.startsWith("inj1")) {
      alert("Set owner address (Connect Keplr) first");
      return;
    }
    if (
      !confirm(
        "Revoke wallet permission for this assistant key? You will need to set up protection again.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { txHashes: hashes } = await broadcastTypedRevokes({
        network,
        granter,
        grantee,
      });
      setTxHashes(hashes);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        className="text-xs text-red-300 border border-red-400/40 px-3 py-1 rounded-full hover:bg-red-950/30"
        onClick={() => void revoke()}
      >
        {busy ? "Revoking…" : "Revoke wallet permission"}
      </button>
      {txHashes.map((h) => (
        <a
          key={h}
          href={explorerTxUrl(h, network)}
          target="_blank"
          rel="noreferrer"
          className="block text-[10px] text-[#75bfcf] break-all hover:underline"
        >
          {h}
        </a>
      ))}
      {error && <p className="text-[10px] text-red-300/90">{error}</p>}
    </div>
  );
}

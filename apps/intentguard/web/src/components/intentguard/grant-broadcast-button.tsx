"use client";

import { useState } from "react";
import { broadcastGrantTxPlan } from "@/lib/chain/broadcast-typed-grants";

export function GrantBroadcastButton({
  ownerInjectiveAddress,
  grantTxPlanJson,
  network = "testnet",
  onSuccess,
  onBeforeSign,
  onWalletRejected,
  onBroadcastFailed,
  disabled = false,
  actionLabel = "Approve permission in Keplr",
}: {
  ownerInjectiveAddress: string;
  grantTxPlanJson: string;
  network?: "testnet" | "mainnet";
  onSuccess?: (txHash: string) => void;
  onBeforeSign?: () => void | Promise<void>;
  onWalletRejected?: () => void;
  onBroadcastFailed?: (message: string) => void;
  disabled?: boolean;
  actionLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signAndBroadcast() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const parsed = JSON.parse(grantTxPlanJson) as {
        txPlan?: { msgGrants?: unknown[] };
      };
      const msgGrants =
        parsed.txPlan?.msgGrants ??
        (parsed as { msgGrants?: unknown[] }).msgGrants;
      if (!msgGrants?.length) {
        throw new Error("Grant tx plan missing msgGrants — load plan from gateway first");
      }
      if (!ownerInjectiveAddress.startsWith("inj1")) {
        throw new Error("Set owner inj1… address (Connect Keplr) before signing");
      }
      if (network !== "testnet") {
        throw new Error("Only testnet grant broadcast is enabled in this build");
      }
      if (onBeforeSign) await onBeforeSign();
      const { txHash } = await broadcastGrantTxPlan({
        network,
        ownerInjectiveAddress,
        msgGrants,
      });
      setResult(txHash);
      onSuccess?.(txHash);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const lower = msg.toLowerCase();
      if (
        lower.includes("rejected") ||
        lower.includes("request rejected") ||
        lower.includes("user denied")
      ) {
        onWalletRejected?.();
      } else {
        onBroadcastFailed?.(msg);
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy || !grantTxPlanJson || disabled}
        className="px-3 py-1.5 rounded-full border border-[#75bfcf]/50 text-[#75bfcf] text-xs hover:bg-[#75bfcf]/10 disabled:opacity-50"
        onClick={() => void signAndBroadcast()}
      >
        {busy ? "Opening Keplr…" : actionLabel}
      </button>
      <p className="text-[10px] text-white/45">
        Requires testnet INJ in your wallet for network fees. You approve limited derivative orders
        and cancel permissions for the assistant wallet, not full access to your funds.
      </p>
      {result && (
        <p className="text-xs text-[#75bfcf] break-all">Tx: {result}</p>
      )}
      {error && <p className="text-xs text-red-300/90">{error}</p>}
    </div>
  );
}

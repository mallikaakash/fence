"use client";

import { useCallback, useState } from "react";

const TESTNET_CHAIN = "injective-888";

type InjWindow = Window & {
  keplr?: {
    enable: (chainId: string) => Promise<void>;
    getKey: (chainId: string) => Promise<{ bech32Address: string }>;
  };
  leap?: InjWindow["keplr"];
};

function pickWallet(): "keplr" | "leap" | null {
  if (typeof window === "undefined") return null;
  const w = window as InjWindow;
  if (w.keplr) return "keplr";
  if (w.leap) return "leap";
  return null;
}

export function OwnerWalletConnect({
  onAddress,
  network = "testnet",
}: {
  onAddress: (inj: string) => void;
  network?: "testnet" | "mainnet";
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [connected, setConnected] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setStatus(null);
    const kind = pickWallet();
    if (!kind) {
      setStatus("Install Keplr or Leap for Injective, then retry.");
      return;
    }
    const w = window as InjWindow;
    const provider = kind === "keplr" ? w.keplr! : w.leap!;
    const chainId = network === "mainnet" ? "injective-1" : TESTNET_CHAIN;
    try {
      await provider.enable(chainId);
      const key = await provider.getKey(chainId);
      const addr = key.bech32Address;
      if (!addr.startsWith("inj1")) {
        setStatus("Unexpected address format — use Injective testnet in wallet.");
        return;
      }
      setConnected(addr);
      onAddress(addr);
      setStatus(`Connected via ${kind} (${chainId})`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [network, onAddress]);

  return (
    <div className="flex flex-wrap gap-2 items-center text-xs">
      <button
        type="button"
        className="px-3 py-1.5 rounded-full border border-[#75bfcf]/50 text-[#75bfcf] hover:bg-[#75bfcf]/10"
        onClick={() => void connect()}
      >
        Connect Keplr / Leap
      </button>
      {connected && (
        <code className="text-white/70 break-all">{connected}</code>
      )}
      {status && <span className="text-white/50">{status}</span>}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadProtectionSummary } from "@/lib/protection-state";
import {
  INJECTIVE_TESTNET_FAUCET_URL,
} from "@/lib/testnet-resources";

export function HomePrerequisites() {
  return (
    <div className="border border-white/15 rounded-xl bg-black/30 px-4 py-3 text-sm text-white/75 space-y-2 max-w-2xl">
      <p className="text-xs uppercase tracking-wide text-[#75bfcf]">Before you start</p>
      <ul className="list-disc list-inside text-white/65 text-xs space-y-1">
        <li>
          <strong className="text-white/85">Keplr or Leap</strong> with{" "}
          <strong className="text-white/85">Injective testnet</strong> enabled
        </li>
        <li>About 3 minutes to choose limits and approve in your wallet</li>
        <li>
          For real testnet orders: test INJ (
          <a href={INJECTIVE_TESTNET_FAUCET_URL} className="text-[#75bfcf] underline" target="_blank" rel="noreferrer">
            faucet
          </a>
          ) and margin on Helix testnet
        </li>
      </ul>
    </div>
  );
}

export function HomePageActions() {
  const [hasProtection, setHasProtection] = useState(false);

  useEffect(() => {
    setHasProtection(Boolean(loadProtectionSummary()?.sessionId));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/start" className="cta-primary motion-cta">
          Start setup
        </Link>
        {hasProtection ? (
          <Link href="/protection" className="cta-secondary motion-cta">
            Open dashboard
          </Link>
        ) : (
          <Link href="/limitations" className="cta-secondary motion-cta">
            How it works
          </Link>
        )}
      </div>
      {hasProtection ? (
        <p className="text-white/50 text-sm max-w-2xl">
          You have protection on this device.{" "}
          <Link href="/protection" className="text-[#75bfcf] underline">
            Open dashboard
          </Link>{" "}
          for status, bot access code, and activity.
        </p>
      ) : (
        <p className="text-white/50 text-sm max-w-2xl">
          For Injective traders who want AI or bots to trade within{" "}
          <strong className="text-white/70">your</strong> rules — not unlimited wallet access.
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { loadProtectionSummary } from "@/lib/protection-state";

export function HomeHeroIntro() {
  const [hasProtection, setHasProtection] = useState(false);

  useEffect(() => {
    setHasProtection(Boolean(loadProtectionSummary()?.sessionId));
  }, []);

  if (hasProtection) {
    return (
      <>
        <p className="md:text-xl text-sm text-left mt-2 max-w-2xl text-white/80 leading-relaxed">
          Your protection is saved on this device. Open your session for status, funding checks, and your bot
          code.
        </p>
        <p className="text-white/45 text-xs mt-2">Injective testnet</p>
      </>
    );
  }

  return (
    <p className="md:text-xl text-sm text-left mt-2 max-w-2xl text-white/80 leading-relaxed">
      Put limits on what your trading bot can do. We check each request against your rules before it hits the
      market. We never ask for your seed phrase.
    </p>
  );
}

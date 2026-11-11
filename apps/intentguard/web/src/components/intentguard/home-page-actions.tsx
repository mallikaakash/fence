"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadProtectionSummary } from "@/lib/protection-state";

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
            Open my session
          </Link>
        ) : (
          <Link href="/limitations" className="cta-secondary motion-cta">
            How it works
          </Link>
        )}
      </div>
      {hasProtection ? null : (
        <div className="text-white/45 text-sm max-w-2xl leading-relaxed space-y-1">
          <p>Setup takes a few minutes: connect your wallet, choose limits, approve once in Keplr or Leap.</p>
          <p>Live testnet trades also need gas and margin.</p>
        </div>
      )}
    </div>
  );
}

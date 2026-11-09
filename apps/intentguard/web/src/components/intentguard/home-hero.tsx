"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchHostedStatus } from "@/lib/hosted";

export function HomeHeroIntro() {
  const [proxyReady, setProxyReady] = useState<boolean | null>(null);

  useEffect(() => {
    void fetchHostedStatus().then((s) => setProxyReady(Boolean(s?.proxyConfigured)));
  }, []);

  return (
    <>
      <p className="md:text-xl text-sm text-left mt-2 max-w-2xl text-white/80 leading-relaxed">
        AI trading with limits you set on Injective testnet. IntentGuard blocks oversized or off-market
        orders before they execute — you stay in control with Keplr.
      </p>
      {proxyReady === true ? (
        <p className="motion-reveal motion-reveal--in text-sm text-left max-w-2xl text-[#c8ecf4]/90 border border-[#75bfcf]/30 rounded-lg px-3 py-2 bg-[#0d3d4a]/40 mt-3">
          Hosted testnet —{" "}
          <Link href="/start" className="text-[#75bfcf] underline font-medium">
            protect your wallet
          </Link>{" "}
          in the browser (about 3 minutes).
        </p>
      ) : null}
    </>
  );
}

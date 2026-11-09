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
    <p className="md:text-xl text-sm text-left mt-2 max-w-2xl text-white/80">
      Typed exchange AuthZ, an isolated grantee signer, and gateway-enforced notional limits.
      Agents use scoped API tokens — the sidecar validates proposes before any MsgExec broadcast.
    </p>
    {proxyReady === true ? (
      <p className="text-sm text-left max-w-2xl text-[#c8ecf4]/90 border border-[#75bfcf]/30 rounded-lg px-3 py-2 bg-[#0d3d4a]/40">
        This deployment includes a{" "}
        <strong className="text-white">hosted gateway</strong> (Cloud Run). Use{" "}
        <Link href="/console" className="text-[#75bfcf] underline">
          Owner console
        </Link>{" "}
        in the browser — no <code className="text-white/80">npm run gateway</code> required.
        Owner API auth is injected server-side when using the hosted proxy.
      </p>
    ) : proxyReady === false ? (
      <p className="text-sm text-left max-w-2xl text-amber-200/90 border border-amber-400/30 rounded-lg px-3 py-2 bg-amber-950/30">
        Configure a remote gateway URL on this host to use Owner console without a local
        sidecar ({""}
        <code className="text-amber-100/80">docs/DEPLOY-GCP.md</code>).
      </p>
    ) : null}
    <p className="text-xs text-white/50 max-w-2xl mt-2">
      Testnet today. On-chain AuthZ scopes markets and subaccounts;{" "}
      <strong className="text-white/60">notional caps are gateway-enforced</strong>.{" "}
      <Link href="/limitations" className="text-[#75bfcf] underline">
        Read trust boundaries
      </Link>
      .
    </p>
  </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchHostedStatus } from "@/lib/hosted";

export function HostedStartNote() {
  const [proxyReady, setProxyReady] = useState<boolean | null>(null);

  useEffect(() => {
    const hosted = !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
    if (!hosted) {
      setProxyReady(false);
      return;
    }
    void fetchHostedStatus().then((s) => setProxyReady(Boolean(s?.proxyConfigured)));
  }, []);

  if (proxyReady === null) return null;

  if (proxyReady) {
    return (
      <p className="text-[#c8ecf4]/90 text-sm border border-[#75bfcf]/30 rounded-lg px-3 py-2 bg-[#0d3d4a]/40">
        This deployment is wired to your sidecar. Start at{" "}
        <Link href="/console" className="text-[#75bfcf] underline">
          Owner console
        </Link>{" "}
        (Vercel proxy). Agents call the sidecar URL directly.
      </p>
    );
  }

  return (
    <p className="text-white/75 text-sm leading-relaxed">
      Production setup: deploy the Docker sidecar (Railway/Render/VPC), then set{" "}
      <code className="text-[#75bfcf]">INTENTGUARD_GATEWAY_URL</code> on Vercel. See{" "}
      <a
        className="text-[#75bfcf] underline"
        href="https://github.com/mallikaakash/injective-buildathon/blob/main/docs/DEPLOY-PRODUCTION.md"
        target="_blank"
        rel="noreferrer"
      >
        DEPLOY-PRODUCTION
      </a>
      . Local dev: <code className="text-[#75bfcf]">npm run gateway</code> +{" "}
      <code className="text-[#75bfcf]">npm run web:dev</code>.
    </p>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchHostedStatus } from "@/lib/hosted";

const hostedSteps = [
  {
    title: "Grant audit",
    body: "Live LCD — scan your inj1… for risky GenericAuthorization.",
    href: "/portfolio",
    cta: "Grant Audit",
  },
  {
    title: "Owner console",
    body: "Hosted gateway proxy — connect Keplr, create session (no local npm).",
    href: "/console",
    cta: "Open console",
  },
  {
    title: "Sign typed MsgGrant",
    body: "Grant tx plan → Keplr broadcast on testnet (funded wallet).",
    href: "/console",
    cta: "Console",
  },
  {
    title: "Verify grant on-chain",
    body: "Check grant status in console against LCD.",
    href: "/console",
    cta: "Check grant",
  },
  {
    title: "Agent token",
    body: "Copy agt_… to your agent; agents never get grantee keys.",
    href: "/console",
    cta: "Console",
  },
  {
    title: "Live policy test",
    body: "POST /v1/propose via sidecar (not offline mirror).",
    href: "/trade",
    cta: "Policy test",
  },
  {
    title: "Evidence",
    body: "Gateway audit log + explorer links for broadcasts.",
    href: "/history",
    cta: "Activity",
  },
  {
    title: "Optional execute",
    body: "Enable INTENTGUARD_EXECUTE on gateway only after grant ready.",
    href: "/limitations",
    cta: "Limits",
  },
];

const selfHostedSteps = [
  ...hostedSteps.slice(0, 1),
  {
    title: "Run sidecar",
    body: "Self-host: npm run gateway or Docker (see INSTALL.md).",
    copy: "cd apps/intentguard && npm run gateway",
    cta: "Copy install",
  },
  ...hostedSteps.slice(1),
];

export function OnboardingChecklist() {
  const [hosted, setHosted] = useState(false);
  const [proxyReady, setProxyReady] = useState(false);

  useEffect(() => {
    setHosted(!/localhost|127\.0\.0\.1/.test(window.location.hostname));
    void fetchHostedStatus().then((s) => setProxyReady(Boolean(s?.proxyConfigured)));
  }, []);

  return (
    <div className="border border-white/15 rounded-2xl bg-white/5 p-6 space-y-4">
      {hosted && !proxyReady && (
        <p className="text-amber-200/90 text-sm border border-amber-500/30 rounded-lg px-3 py-2 bg-amber-950/40">
          Sidecar proxy not configured on this host — complete{" "}
          <code className="text-amber-50">docs/DEPLOY-PRODUCTION.md</code> or run the gateway locally
          for steps 2–7.
        </p>
      )}
      {hosted && proxyReady && (
        <p className="text-[#c8ecf4]/90 text-sm border border-[#75bfcf]/30 rounded-lg px-3 py-2 bg-[#0d3d4a]/40">
          Self-service on this URL — gateway runs on Cloud Run; owner auth via server proxy
          (no owner key in the browser).
        </p>
      )}
      <ol className="space-y-4">
        {(hosted && proxyReady ? hostedSteps : selfHostedSteps).map((s, i) => (
          <li
            key={s.title}
            className="flex gap-4 items-start border-b border-white/5 pb-4 last:border-0"
          >
            <span className="text-[#75bfcf] font-mono text-sm shrink-0">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <div className="text-white font-medium text-sm">{s.title}</div>
              <p className="text-white/55 text-xs mt-1">{s.body}</p>
              {"copy" in s && s.copy ? (
                <button
                  type="button"
                  className="text-xs mt-2 px-2 py-1 rounded border border-white/20 text-white/70 hover:bg-white/10"
                  onClick={() => navigator.clipboard.writeText(s.copy)}
                >
                  {s.cta}
                </button>
              ) : "href" in s && s.href ? (
                <Link
                  href={s.href}
                  className="inline-block text-xs mt-2 px-2 py-1 rounded bg-[#75bfcf]/20 text-[#75bfcf] border border-[#75bfcf]/40"
                >
                  {s.cta}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

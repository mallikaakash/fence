"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchHostedStatus } from "@/lib/hosted";

const steps = [
  {
    title: "Scan existing grants (free)",
    body: "Paste granter address — no install.",
    href: "/portfolio",
    cta: "Grant Audit",
  },
  {
    title: "Install sidecar",
    body: "npm install && npm run gateway in apps/intentguard",
    copy: "cd apps/intentguard && npm install && npm run gateway",
    cta: "Copy install",
  },
  {
    title: "Create session (owner)",
    body: "Owner API key from .intentguard/config.json",
    href: "/console",
    cta: "Owner console",
  },
  {
    title: "Sign typed MsgGrant",
    body: "GET grant-tx-plan or npm run grant:broadcast",
    href: "/console",
    cta: "Console → Check grant",
  },
  {
    title: "Give agent token",
    body: "agt_… only — never grantee key",
    copy:
      "INTENTGUARD_URL=http://127.0.0.1:8787 AGENT_TOKEN=agt_… node examples/agent-propose.mjs",
    cta: "Copy agent cmd",
  },
  {
    title: "Policy test",
    body: "Oversize notional must deny",
    href: "/trade",
    cta: "Simulator",
  },
  {
    title: "Optional execute",
    body: "INTENTGUARD_EXECUTE=1 after grant-status ready",
    href: "/console",
    cta: "Console",
  },
  {
    title: "Verify release",
    body: "CI-style smoke before mainnet",
    copy: "npm run product:smoke && npm run e2e:protocol && npm run gtm:verify && npm run platform:verify && npm run ux:verify && npm run agent:verify && npm run legal:verify",
    cta: "Copy verify",
  },
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
          Hosted production — use <Link href="/console" className="text-[#75bfcf] underline">/console</Link>{" "}
          for steps 2–7 (Vercel proxy to your sidecar).
        </p>
      )}
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className="flex gap-4 items-start border-b border-white/5 pb-4 last:border-0"
          >
            <span className="text-[#75bfcf] font-mono text-sm shrink-0">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <div className="text-white font-medium text-sm">{s.title}</div>
              <p className="text-white/55 text-xs mt-1">{s.body}</p>
              {s.copy ? (
                <button
                  type="button"
                  className="text-xs mt-2 px-2 py-1 rounded border border-white/20 text-white/70 hover:bg-white/10"
                  onClick={() => navigator.clipboard.writeText(s.copy!)}
                >
                  {s.cta}
                </button>
              ) : s.href ? (
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

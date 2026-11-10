"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  INJECTIVE_TESTNET_FAUCET_URL,
  HELIX_TESTNET_URL,
} from "@/lib/testnet-resources";
import { gatewayGrantStatus, gatewayHealth } from "@/lib/gateway/client";
import { loadGatewaySettings } from "@/lib/gateway/storage";
import { loadProtectionSummary, type ProtectionSummary } from "@/lib/protection-state";

type Step = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  href?: string;
  hrefLabel?: string;
};

export function ProtectionReadiness() {
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    const summary = loadProtectionSummary();
    const settings = loadGatewaySettings();
    if (!summary) {
      setSteps(null);
      return;
    }

    void (async () => {
      let grantReady = Boolean(summary.grantReady);
      let executeOn = false;

      if (summary.sessionId && settings.agentApiToken) {
        const [grantRes, healthRes] = await Promise.all([
          gatewayGrantStatus(settings, summary.sessionId),
          gatewayHealth(settings),
        ]);
        if (grantRes.res.ok) {
          grantReady = Boolean(
            (grantRes.json as { grantStatus?: { ready?: boolean } }).grantStatus?.ready,
          );
        }
        if (healthRes.res.ok) {
          executeOn = Boolean(
            (healthRes.json as { executeEnabled?: boolean }).executeEnabled,
          );
        }
      }

      setSteps(buildSteps(summary, grantReady, executeOn));
    })();
  }, []);

  if (!steps) return null;

  const readyCount = steps.filter((s) => s.done).length;
  const allDone = readyCount === steps.length;

  return (
    <div className="border border-white/15 rounded-xl p-4 bg-black/25 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-white/90">Getting ready to trade</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            allDone ? "bg-green-950/50 text-green-200" : "bg-amber-950/40 text-amber-100"
          }`}
        >
          {allDone ? "Ready" : `${readyCount} of ${steps.length}`}
        </span>
      </div>
      <ol className="space-y-2">
        {steps.map((s) => (
          <li
            key={s.id}
            className="flex gap-3 text-sm border border-white/10 rounded-lg px-3 py-2 bg-white/[0.03]"
          >
            <span
              className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                s.done ? "bg-green-500/30 text-green-200" : "bg-white/10 text-white/40"
              }`}
              aria-hidden
            >
              {s.done ? "✓" : "·"}
            </span>
            <div className="min-w-0">
              <p className={s.done ? "text-white/75" : "text-white/90"}>{s.title}</p>
              <p className="text-xs text-white/45 mt-0.5">{s.detail}</p>
              {s.href && !s.done ? (
                <Link href={s.href} className="text-xs text-[#75bfcf] underline mt-1 inline-block">
                  {s.hrefLabel ?? "Open"}
                </Link>
              ) : null}
              {s.id === "margin" && !s.done ? (
                <a
                  href={HELIX_TESTNET_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#75bfcf] underline mt-1 inline-block mr-3"
                >
                  Helix testnet
                </a>
              ) : null}
              {s.id === "gas" && !s.done ? (
                <a
                  href={INJECTIVE_TESTNET_FAUCET_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#75bfcf] underline mt-1 inline-block"
                >
                  Get testnet INJ
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function buildSteps(
  summary: ProtectionSummary,
  grantReady: boolean,
  executeOn: boolean,
): Step[] {
  const hasWallet = summary.ownerInj.startsWith("inj1");
  return [
    {
      id: "wallet",
      title: "Wallet connected",
      detail: hasWallet
        ? `Owner ${summary.ownerInj.slice(0, 12)}…`
        : "Connect Keplr on Injective testnet",
      done: hasWallet,
      href: "/start",
      hrefLabel: "Continue setup",
    },
    {
      id: "rules",
      title: "Trading limits signed in Keplr",
      detail: grantReady
        ? "On-chain permission matches your caps and expiry."
        : "Approve the timed permission in your wallet.",
      done: grantReady,
      href: "/start",
      hrefLabel: "Finish approval",
    },
    {
      id: "service",
      title: "Live trading service on",
      detail: executeOn
        ? "Orders can reach the exchange when within your rules."
        : "Waiting for hosted service — try again shortly.",
      done: executeOn,
    },
    {
      id: "margin",
      title: "Margin on Helix (testnet)",
      detail:
        "Deposit a small USDT balance on Helix with the same wallet — required before real fills.",
      done: false,
    },
    {
      id: "gas",
      title: "INJ for network fees",
      detail: "Keep a little INJ on your wallet (and assistant address if prompted).",
      done: false,
    },
  ];
}

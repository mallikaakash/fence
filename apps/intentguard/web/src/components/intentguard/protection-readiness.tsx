"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  INJECTIVE_TESTNET_FAUCET_URL,
  HELIX_TESTNET_URL,
} from "@/lib/testnet-resources";
import { gatewayGrantStatus, gatewayHealth } from "@/lib/gateway/client";
import { parseGrantStatusJson } from "@/lib/grant-status";
import { loadGatewaySettings } from "@/lib/gateway/storage";
import { loadProtectionSummary, type ProtectionSummary } from "@/lib/protection-state";

type Step = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  required: boolean;
  href?: string;
  hrefLabel?: string;
};

export function ProtectionReadiness({ refreshKey = 0 }: { refreshKey?: number }) {
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    const summary = loadProtectionSummary();
    const settings = loadGatewaySettings();
    if (!summary) {
      setSteps(null);
      return;
    }

    void (async () => {
      let grantReady = false;
      let grantDetail = "Approve the timed permission in Keplr — not active until confirmed.";
      let executeOn = false;
      let serviceDetail = "Checking hosted service…";

      if (summary.sessionId && settings.agentApiToken) {
        const [grantRes, healthRes] = await Promise.all([
          gatewayGrantStatus(settings, summary.sessionId),
          gatewayHealth(settings),
        ]);
        if (grantRes.res.ok) {
          const parsed = parseGrantStatusJson(grantRes.json);
          grantReady = parsed.ready;
          if (parsed.userFacingIssues[0]) {
            grantDetail = parsed.userFacingIssues[0];
          } else if (grantReady) {
            grantDetail = "Place and cancel permissions match your rules on-chain.";
          }
        } else {
          grantDetail = "Could not verify wallet permission from the network.";
        }
        if (healthRes.res.ok) {
          executeOn = Boolean(
            (healthRes.json as { executeEnabled?: boolean }).executeEnabled,
          );
          serviceDetail = executeOn
            ? "Hosted service can submit allowed orders (execution still requires wallet permission)."
            : "Execution is disabled on the server.";
        } else {
          serviceDetail = "Trading service unreachable — policy checks may still work offline.";
        }
      }

      const hasBotCode = Boolean(settings.agentApiToken?.startsWith("agt_"));
      setSteps(
        buildSteps(summary, grantReady, grantDetail, executeOn, serviceDetail, hasBotCode),
      );
    })();
  }, [refreshKey]);

  if (!steps) return null;

  const required = steps.filter((s) => s.required);
  const readyCount = required.filter((s) => s.done).length;

  return (
    <div className="border border-white/15 rounded-xl p-4 bg-black/25 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-white/90">Getting ready to trade</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70">
          {readyCount} of {required.length} verified
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
              <p className={s.done ? "text-white/75" : "text-white/90"}>
                {s.title}
                {!s.required ? (
                  <span className="text-white/40 text-[10px] ml-1">(your action)</span>
                ) : null}
              </p>
              <p className="text-xs text-white/45 mt-0.5">{s.detail}</p>
              {s.href && !s.done ? (
                <Link href={s.href} className="text-xs text-[#75bfcf] underline mt-1 inline-block">
                  {s.hrefLabel ?? "Open"}
                </Link>
              ) : null}
              {s.id === "margin" ? (
                <a
                  href={HELIX_TESTNET_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#75bfcf] underline mt-1 inline-block"
                >
                  Open Helix testnet
                </a>
              ) : null}
              {s.id === "gas" ? (
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
  grantDetail: string,
  executeOn: boolean,
  serviceDetail: string,
  hasBotCode: boolean,
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
      required: true,
      href: "/start",
      hrefLabel: "Continue setup",
    },
    {
      id: "rules",
      title: "Wallet permission approved",
      detail: grantDetail,
      done: grantReady,
      required: true,
      href: "/start",
      hrefLabel: "Finish approval",
    },
    {
      id: "service",
      title: "Trading service available",
      detail: serviceDetail,
      done: executeOn,
      required: true,
    },
    {
      id: "bot",
      title: "Bot access code issued",
      detail: hasBotCode
        ? "Copy from Connect a bot below."
        : "Created when setup finishes — appears on this dashboard.",
      done: hasBotCode,
      required: true,
    },
    {
      id: "margin",
      title: "Margin on Helix (testnet)",
      detail:
        "Deposit USDT on Helix with the same wallet before real testnet fills.",
      done: false,
      required: false,
    },
    {
      id: "gas",
      title: "INJ for network fees",
      detail: "Keep testnet INJ on your wallet and assistant wallet if prompted.",
      done: false,
      required: false,
    },
  ];
}

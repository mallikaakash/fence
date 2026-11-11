import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { PolicyCapsCallout } from "@/components/intentguard/policy-caps-callout";
import { RiskDisclosure } from "@/components/intentguard/risk-disclosure";
import { RelatedProductsCallout } from "@/components/intentguard/related-products-callout";
import { TestnetResourcesCallout } from "@/components/intentguard/testnet-resources-callout";

export default function LimitationsPage() {
  return (
    <AppShell>
      <InnerPage
        title="How it works & limits"
        subtitle="Fence checks every trade against your rules on Injective testnet before it can reach the exchange."
      >
        <div className="space-y-6">
          <ol className="text-white/75 text-sm space-y-3 list-decimal list-inside">
            <li>
              <strong className="text-white">Set up</strong> — choose markets and size limits, then
              approve a timed permission in Keplr.
            </li>
            <li>
              <strong className="text-white">Check</strong> — each bot or AI request is allowed or
              blocked against your rules first.
            </li>
            <li>
              <strong className="text-white">Control</strong> — revoke in Keplr or end your session;
              your bot only gets a limited access code, not your seed phrase.
            </li>
          </ol>
          <RelatedProductsCallout />
          <PolicyCapsCallout defaultOpen />
          <TestnetResourcesCallout />
          <RiskDisclosure />
          <Link
            href="/start"
            className="inline-flex px-5 py-2.5 bg-orange-400 text-black rounded-full text-sm font-medium"
          >
            Start setup
          </Link>
          <p className="text-white/40 text-xs">
            Technical limitations:{" "}
            <a
              className="text-[#75bfcf] underline"
              href="https://github.com/mallikaakash/injective-buildathon/blob/main/docs/LIMITATIONS.md"
              target="_blank"
              rel="noreferrer"
            >
              docs/LIMITATIONS.md
            </a>
          </p>
        </div>
      </InnerPage>
    </AppShell>
  );
}

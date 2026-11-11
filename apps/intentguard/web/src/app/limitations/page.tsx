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
        compact
        title="How it works"
        subtitle="Fence checks each trade against your rules on Injective testnet before it reaches the exchange."
      >
        <div className="space-y-6">
          <ol className="text-white/75 text-sm space-y-3 list-decimal list-inside max-w-2xl">
            <li>
              <strong className="text-white">Set up.</strong> Choose markets and size limits, then approve
              in Keplr or Leap.
            </li>
            <li>
              <strong className="text-white">Check.</strong> Each bot request is allowed or blocked against
              your rules first.
            </li>
            <li>
              <strong className="text-white">Control.</strong> Revoke in the wallet or end your session. The
              bot gets an access code, not your seed phrase.
            </li>
          </ol>

          <div className="flex flex-wrap items-center gap-4">
            <Link href="/start" className="cta-primary motion-cta text-sm">
              Start setup
            </Link>
            <Link href="/" className="cta-secondary motion-cta text-sm">
              Back to home
            </Link>
          </div>

          <PolicyCapsCallout />
          <TestnetResourcesCallout />
          <RiskDisclosure />
          <RelatedProductsCallout />
        </div>
      </InnerPage>
    </AppShell>
  );
}

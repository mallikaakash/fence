import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { ProtectionWizard } from "@/components/intentguard/protection-wizard";
import { ProtectionStatusBanner } from "@/components/intentguard/protection-status-banner";
import { PolicyCapsCallout } from "@/components/intentguard/policy-caps-callout";

export default function StartPage() {
  return (
    <AppShell>
      <InnerPage
        title="Protect your trading"
        subtitle="Connect Keplr on Injective testnet, set limits, and sign one timed grant. About three minutes."
      >
        <div className="space-y-5">
          <ProtectionStatusBanner />
          <PolicyCapsCallout />
          <ProtectionWizard />
          <p className="text-white/40 text-xs">
            Already set up?{" "}
            <Link href="/trade" className="text-[#75bfcf] underline">
              Try your limits
            </Link>{" "}
            or{" "}
            <Link href="/agent" className="text-[#75bfcf] underline">
              run the demo agent
            </Link>
            .
          </p>
        </div>
      </InnerPage>
    </AppShell>
  );
}

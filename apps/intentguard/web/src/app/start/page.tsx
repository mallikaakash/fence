import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { ProtectionWizard } from "@/components/intentguard/protection-wizard";
import { ProtectionStatusBanner } from "@/components/intentguard/protection-status-banner";
export default function StartPage() {
  return (
    <AppShell>
      <InnerPage
        title="Protect your trading"
        subtitle="Connect Keplr on Injective testnet, set limits, and sign one timed grant. About three minutes."
      >
        <div className="space-y-5">
          <ProtectionStatusBanner />
          <ProtectionWizard />
        </div>
      </InnerPage>
    </AppShell>
  );
}

import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { PolicySimulator } from "@/components/intentguard/policy-simulator";
import { ProtectionStatusBanner } from "@/components/intentguard/protection-status-banner";

export default function TradePage() {
  return (
    <AppShell>
      <InnerPage
        title="Try a sample trade"
        subtitle="See if a sample order would be allowed or blocked. Start setup first to use your real limits."
      >
        <div className="space-y-5 mb-6">
          <ProtectionStatusBanner />
        </div>
        <PolicySimulator />
      </InnerPage>
    </AppShell>
  );
}

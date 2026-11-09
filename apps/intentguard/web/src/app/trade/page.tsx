import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { PolicySimulator } from "@/components/intentguard/policy-simulator";
import { ProtectionStatusBanner } from "@/components/intentguard/protection-status-banner";

export default function TradePage() {
  return (
    <AppShell>
      <InnerPage
        title="Try your limits"
        subtitle="Send sample trades through your protection session. Finish Protect first for live gateway checks."
      >
        <div className="space-y-5 mb-6">
          <ProtectionStatusBanner />
        </div>
        <PolicySimulator />
      </InnerPage>
    </AppShell>
  );
}

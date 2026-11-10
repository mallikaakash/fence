import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { ProtectionHub } from "@/components/intentguard/protection-hub";

export default function ProtectionPage() {
  return (
    <AppShell>
      <InnerPage
        title="My protection"
        subtitle="See your limits, connect a bot, and review what was allowed or blocked."
      >
        <ProtectionHub />
      </InnerPage>
    </AppShell>
  );
}

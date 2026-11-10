import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { ProtectionHub } from "@/components/intentguard/protection-hub";

export default function ProtectionPage() {
  return (
    <AppShell>
      <InnerPage
        title="Dashboard"
        subtitle="Your limits, bot access code, readiness checklist, and recent activity."
      >
        <ProtectionHub />
      </InnerPage>
    </AppShell>
  );
}

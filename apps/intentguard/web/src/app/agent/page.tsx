import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { AgentDemo } from "@/components/intentguard/agent-demo";

export default function AgentPage() {
  return (
    <AppShell>
      <InnerPage
        title="Demo agent"
        subtitle="Tap a phrase — the same policy engine a real bot uses will allow or deny it."
      >
        <AgentDemo />
      </InnerPage>
    </AppShell>
  );
}

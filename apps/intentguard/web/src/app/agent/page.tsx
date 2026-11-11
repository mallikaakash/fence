import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { AgentDemo } from "@/components/intentguard/agent-demo";

export default function AgentPage() {
  return (
    <AppShell>
      <InnerPage
        title="Try sample AI phrases"
        subtitle="Tap a phrase to see allow or deny. Finish setup to use your real limits."
      >
        <AgentDemo />
      </InnerPage>
    </AppShell>
  );
}

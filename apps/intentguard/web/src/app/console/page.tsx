import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { AdvancedConsoleShell } from "@/components/intentguard/advanced-console-shell";
import { DevelopersLandingCard } from "@/components/intentguard/developers-landing-card";

export default function ConsolePage() {
  return (
    <AppShell>
      <InnerPage
        title="Developers (API and MCP)"
        subtitle="Integrations, curl, and operator probes. Connect bots on My session unless you are building an integration."
      >
        <div className="space-y-6">
          <DevelopersLandingCard />
          <AdvancedConsoleShell />
        </div>
      </InnerPage>
    </AppShell>
  );
}

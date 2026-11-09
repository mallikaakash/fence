import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { OwnerConsole } from "@/components/intentguard/owner-console";

export default function ConsolePage() {
  return (
    <AppShell>
      <InnerPage
        title="Developer console"
        subtitle="For integrators: raw gateway URL, API keys, sessions, and propose/execute probes. Everyday users should use Protect instead."
      >
        <OwnerConsole embedded />
      </InnerPage>
    </AppShell>
  );
}

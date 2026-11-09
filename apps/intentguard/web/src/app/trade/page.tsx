import { AppShell } from "@/components/layout/app-shell";
import { PolicySimulator } from "@/components/intentguard/policy-simulator";

export default function TradePage() {
  return (
    <AppShell>
      <div className="inner-page-bg">
        <PolicySimulator />
      </div>
    </AppShell>
  );
}

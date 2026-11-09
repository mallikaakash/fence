import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { LiveActivityPanel } from "@/components/intentguard/live-activity-panel";

export default function HistoryPage() {
  return (
    <AppShell>
      <InnerPage
        title="Activity log"
        subtitle="Allow, deny, and execute events from your gateway session. Export JSON or CSV for review."
      >
        <div className="glass-card p-5 md:p-6">
          <LiveActivityPanel />
        </div>
      </InnerPage>
    </AppShell>
  );
}

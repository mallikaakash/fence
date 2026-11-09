import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { LiveActivityPanel } from "@/components/intentguard/live-activity-panel";
import { ProofList } from "@/components/intentguard/proof-list";

export default function HistoryPage() {
  return (
    <AppShell>
      <InnerPage
        title="Activity log"
        subtitle="Live audit events from your gateway session. Reference proofs below are demo artifacts, not your wallet history."
      >
        <div className="space-y-6">
          <div className="glass-card p-5 md:p-6">
            <h2 className="text-xs uppercase tracking-wide text-[#75bfcf] mb-4 font-medium">
              Live gateway
            </h2>
            <LiveActivityPanel />
          </div>
          <div className="glass-card p-5 md:p-6">
            <h2 className="text-xs uppercase tracking-wide text-white/55 mb-4 font-medium">
              Reference proofs (testnet demo)
            </h2>
            <ProofList />
          </div>
        </div>
      </InnerPage>
    </AppShell>
  );
}

import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { GrantAuditPanel } from "@/components/intentguard/grant-audit-panel";
export default function PortfolioPage() {
  return (
    <AppShell>
      <InnerPage
        title="Wallet check"
        subtitle="Scan your wallet for risky trading permissions on Injective testnet. Separate from setting up protection."
      >
        <div className="space-y-5">
          <div className="glass-card p-5 md:p-6">
            <GrantAuditPanel />
          </div>
        </div>
      </InnerPage>
    </AppShell>
  );
}

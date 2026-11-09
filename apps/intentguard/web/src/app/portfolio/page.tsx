import { AppShell } from "@/components/layout/app-shell";
import { GrantAuditPanel } from "@/components/intentguard/grant-audit-panel";

export default function PortfolioPage() {
  return (
    <AppShell>
      <div className="inner-page-bg">
        <section className="flex flex-col items-center justify-center px-4 md:px-8 py-10 min-h-screen pt-28">
          <div className="w-full max-w-5xl mx-auto space-y-6">
            <h1 className="md:text-5xl text-3xl font-sans font-thin uppercase text-left mb-4 inline-block">
              <span className="bg-orange-400 px-2 rounded-md text-black shadow-md">
                Grant auditor
              </span>
            </h1>
            <p className="text-white/70 text-sm max-w-xl">
              Surface risky GenericAuthorization grants before you connect an
              agent.
            </p>
            <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-5 md:p-6">
              <GrantAuditPanel />
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

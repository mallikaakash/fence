import { AppShell } from "@/components/layout/app-shell";
import { LiveActivityPanel } from "@/components/intentguard/live-activity-panel";
import { ProofList } from "@/components/intentguard/proof-list";

export default function HistoryPage() {
  return (
    <AppShell>
      <div className="inner-page-bg">
        <section className="flex flex-col items-center justify-center px-4 md:px-8 py-10 min-h-screen pt-28">
          <div className="w-full max-w-5xl mx-auto space-y-6">
            <h1 className="md:text-5xl text-3xl font-sans font-thin uppercase text-left mb-4 inline-block">
              <span className="bg-orange-400 px-2 rounded-md text-black shadow-md">
                Evidence & activity
              </span>
            </h1>
            <p className="text-white/70 text-sm max-w-2xl">
              <strong className="text-white/85">Live</strong> — gateway health and tamper-evident
              audit log (off-chain until MsgExec includes a tx hash).{" "}
              <strong className="text-white/85">Reference</strong> — archived spike txs below,
              not your session state.
            </p>
            <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-5 md:p-6">
              <h2 className="text-sm uppercase tracking-wide text-[#75bfcf] mb-4">
                Live gateway activity
              </h2>
              <LiveActivityPanel />
            </div>
            <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-5 md:p-6">
              <h2 className="text-sm uppercase tracking-wide text-white/60 mb-4">
                Reference spike proofs (testnet)
              </h2>
              <ProofList />
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

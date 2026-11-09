import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { RiskDisclosure } from "@/components/intentguard/risk-disclosure";

export default function Home() {
  return (
    <AppShell>
      <section className="hero-section flex flex-col items-center justify-center p-8 min-h-screen">
        <div className="flex flex-col items-start justify-center w-full md:ml-[20%] ml-[5%] space-y-6">
          <div>
            <p className="mb-5">
              <span className="inline-flex items-center px-2 py-1 text-[0.65rem] tracking-[0.35em] uppercase text-white/80 bg-white/10 rounded-full border border-white/20">
                Injective · AI agent execution policy
              </span>
            </p>
            <h1 className="md:text-5xl text-3xl font-sans font-thin uppercase text-left mb-4 inline-block">
              <span className="bg-orange-400 px-2 rounded-md text-black shadow-md">
                IntentGuard
              </span>
            </h1>
            <p className="md:text-xl text-sm text-left mt-2 max-w-2xl text-white/80">
              Typed exchange AuthZ, an isolated grantee signer, and gateway notional limits — agents
              use scoped tokens while the sidecar denies out-of-policy proposes before broadcast.
              Route A on Injective testnet.
            </p>
            <p className="text-sm text-left max-w-2xl text-amber-200/90 border border-amber-400/30 rounded-lg px-3 py-2 bg-amber-950/30">
              Owner console requires a{" "}
              <span className="font-medium">local sidecar</span> — run{" "}
              <code className="text-amber-100/80">npm run gateway</code> and{" "}
              <code className="text-amber-100/80">npm run web:dev</code> on your machine (not via
              hosted localhost).
            </p>
            <RiskDisclosure compact />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/start"
                className="inline-flex items-center px-4 py-2 bg-white text-black rounded-md font-medium hover:bg-white/90 transition-colors"
              >
                Get started
              </Link>
              <Link
                href="/trade"
                className="inline-flex items-center px-4 py-2 bg-[#75bfcf] text-black rounded-md font-medium hover:bg-[#75bfcf]/80 transition-colors"
              >
                Policy simulator
              </Link>
              <Link
                href="/history"
                className="inline-flex items-center px-4 py-2 border border-white/30 text-white rounded-md font-medium hover:bg-white/10 transition-colors"
              >
                On-chain proofs
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/console"
                className="inline-flex items-center px-4 py-2 bg-orange-400/90 text-black rounded-md font-medium hover:bg-orange-400 transition-colors"
              >
                Owner console
              </Link>
              <Link
                href="/portfolio"
                className="inline-flex items-center px-4 py-2 border border-white/30 text-white rounded-md font-medium hover:bg-white/10 transition-colors"
              >
                Grant auditor
              </Link>
              <a
                href="https://github.com/mallikaakash/injective-buildathon/blob/main/docs/PRICING.md"
                className="text-sm text-white/60 underline hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                Pricing & tiers
              </a>
              <span className="group relative text-black inline-flex items-center px-2 py-1 bg-[#75bfcf] md:text-sm text-xs rounded-md shadow">
                Powered by Injective typed AuthZ
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="features-section flex flex-col items-center p-8 min-h-screen">
        <div className="flex flex-col items-start mt-[10%] w-full ml-[5%] md:ml-[20%]">
          <h2 className="text-3xl font-sans font-thin uppercase text-left mb-8 inline-block">
            <span className="bg-orange-400 px-2 text-black">Why IntentGuard</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl">
            <FeatureCard
              title="Typed AuthZ"
              body="Market IDs and subaccount scoped on-chain — not stock GenericAuthorization."
            />
            <FeatureCard
              title="Isolated signer"
              body="Grantee key stays in the gateway; the agent never sees MsgExec signing material."
            />
            <FeatureCard
              title="Notional gate"
              body="Price × quantity enforced before broadcast; oversize dies with a reason."
            />
            <FeatureCard
              title="Kill switch"
              body="MsgRevoke on-chain — session dead; no alternate signing path in the spike."
            />
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="backdrop-blur-md bg-white/10 border border-white/25 rounded-2xl shadow-2xl p-6 transition-all duration-300 hover:bg-white/20">
      <h3 className="text-xl font-bold mb-3">
        <span className="bg-[#75bfcf] px-2 text-black">{title}</span>
      </h3>
      <p className="text-white/80 leading-relaxed">{body}</p>
    </div>
  );
}

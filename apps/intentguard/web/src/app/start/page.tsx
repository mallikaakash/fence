import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { HostedStartNote } from "@/components/intentguard/hosted-start-note";
import { OnboardingChecklist } from "@/components/intentguard/onboarding-checklist";

export default function StartPage() {
  return (
    <AppShell>
      <section className="max-w-3xl mx-auto px-6 pt-32 pb-24 space-y-6">
        <h1 className="text-3xl font-light text-orange-400">Get started</h1>
        <HostedStartNote />
        <OnboardingChecklist />
        <p className="text-white/50 text-xs">
          Docs:{" "}
          <a
            className="text-[#75bfcf] underline"
            href="https://github.com/mallikaakash/injective-buildathon/blob/main/docs/GETTING-STARTED.md"
            target="_blank"
            rel="noreferrer"
          >
            GETTING-STARTED
          </a>
          {" · "}
          <Link href="/portfolio" className="text-[#75bfcf] underline">
            Free grant audit
          </Link>
        </p>
      </section>
    </AppShell>
  );
}

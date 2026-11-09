import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { InnerPage } from "@/components/layout/inner-page";
import { PolicyCapsCallout } from "@/components/intentguard/policy-caps-callout";
import { RiskDisclosure } from "@/components/intentguard/risk-disclosure";
import { OnboardingChecklist } from "@/components/intentguard/onboarding-checklist";

export default function LimitationsPage() {
  return (
    <AppShell>
      <InnerPage
        title="How it works"
        subtitle="IntentGuard sits between your AI and Injective: policy checks first, then optional live trades on testnet."
      >
        <div className="space-y-6">
          <ol className="text-white/75 text-sm space-y-3 list-decimal list-inside">
            <li>
              <strong className="text-white">Protect</strong> — you sign typed AuthZ in Keplr with
              market and size limits.
            </li>
            <li>
              <strong className="text-white">Gateway</strong> — every agent intent is allow/deny before
              MsgExec.
            </li>
            <li>
              <strong className="text-white">Revoke</strong> — turn off protection or wait for grant
              expiry; assistant keys never go to the agent app.
            </li>
          </ol>
          <PolicyCapsCallout defaultOpen />
          <OnboardingChecklist />
          <RiskDisclosure />
          <Link
            href="/start"
            className="inline-flex px-5 py-2.5 bg-orange-400 text-black rounded-full text-sm font-medium"
          >
            Start protecting
          </Link>
          <p className="text-white/40 text-xs">
            Technical limitations:{" "}
            <a
              className="text-[#75bfcf] underline"
              href="https://github.com/mallikaakash/injective-buildathon/blob/main/docs/LIMITATIONS.md"
              target="_blank"
              rel="noreferrer"
            >
              docs/LIMITATIONS.md
            </a>
          </p>
        </div>
      </InnerPage>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MotionReveal } from "@/components/motion/motion-reveal";
import { loadProtectionSummary } from "@/lib/protection-state";

const STEPS = [
  {
    title: "Set your rules",
    body: "Markets, max order size, daily margin, and leverage.",
  },
  {
    title: "Approve in your wallet",
    body: "Scoped access in Keplr or Leap. Revoke anytime.",
  },
  {
    title: "Connect your bot",
    bodyNew:
      "After setup, copy a bot access code from My session. Never your private key.",
    bodyReturning: "Copy your bot access code from My session. Never your private key.",
  },
] as const;

function StepCard({
  step,
  title,
  body,
  delayMs,
}: {
  step: number;
  title: string;
  body: string;
  delayMs: number;
}) {
  return (
    <MotionReveal delayMs={delayMs}>
      <div className="glass-card p-6 rounded-2xl h-full border border-white/10">
        <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Step {step}</p>
        <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
        <p className="text-white/70 leading-relaxed text-sm">{body}</p>
      </div>
    </MotionReveal>
  );
}

export function HomeHowItWorksSection() {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(Boolean(loadProtectionSummary()?.sessionId));
  }, []);

  const step3Body = hasSession ? STEPS[2].bodyReturning : STEPS[2].bodyNew;

  return (
    <div className="flex flex-col items-start max-w-5xl relative z-10">
      <MotionReveal>
        <h2 className="text-2xl md:text-3xl font-sans font-thin uppercase text-left mb-2">
          <span className="text-white/90">How it works</span>
        </h2>
        <p className="text-white/55 text-sm max-w-2xl mb-8">
          Set your rules, approve in the wallet, connect your bot.
        </p>
      </MotionReveal>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
        <StepCard step={1} title={STEPS[0].title} body={STEPS[0].body} delayMs={0} />
        <StepCard step={2} title={STEPS[1].title} body={STEPS[1].body} delayMs={60} />
        <StepCard step={3} title={STEPS[2].title} body={step3Body} delayMs={120} />
      </div>
      <MotionReveal delayMs={140}>
        <div className="flex flex-wrap items-center gap-4 mt-8">
          <Link href="/start" className="cta-primary motion-cta text-sm">
            Start setup
          </Link>
          {hasSession ? (
            <Link href="/protection" className="cta-secondary motion-cta text-sm">
              Open my session
            </Link>
          ) : null}
        </div>
        <p className="text-white/45 text-sm mt-6 max-w-2xl">
          Every order is checked before it reaches the exchange.{" "}
          <Link href="/limitations" className="text-[#75bfcf] underline">
            Details and limits
          </Link>
        </p>
      </MotionReveal>
    </div>
  );
}

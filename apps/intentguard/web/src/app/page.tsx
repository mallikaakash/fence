import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { HomeHeroIntro } from "@/components/intentguard/home-hero";
import { HeroStagger } from "@/components/motion/hero-stagger";
import { MotionReveal } from "@/components/motion/motion-reveal";

export default function Home() {
  return (
    <AppShell>
      <section className="hero-section flex flex-col justify-center min-h-screen px-[5%] md:pl-[20%] md:pr-[10%] py-16">
        <HeroStagger>
          <div className="flex flex-col items-start justify-center max-w-5xl space-y-6">
            <div className="hero-stagger__item">
              <h1 className="md:text-5xl text-3xl font-sans font-thin uppercase text-left mb-4 inline-block">
                <span className="motion-title-chip bg-orange-400 px-2 rounded-md text-black shadow-md">
                  IntentGuard
                </span>
              </h1>
              <HomeHeroIntro />
            </div>

            <div className="hero-stagger__item flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <Link href="/start" className="cta-primary motion-cta">
                  Protect my wallet
                </Link>
                <Link href="/limitations" className="cta-secondary motion-cta">
                  How it works
                </Link>
              </div>
              <p className="text-white/50 text-sm max-w-2xl">
                Already set up? Use the menu for{" "}
                <Link href="/trade" className="text-[#75bfcf] underline">
                  Try limits
                </Link>
                ,{" "}
                <Link href="/agent" className="text-[#75bfcf] underline">
                  Demo agent
                </Link>
                , or{" "}
                <Link href="/portfolio" className="text-[#75bfcf] underline">
                  Grant audit
                </Link>
                .
              </p>
            </div>
          </div>
        </HeroStagger>
      </section>

      <section className="features-section flex flex-col min-h-screen px-[5%] md:pl-[20%] md:pr-[10%] py-16">
        <div className="flex flex-col items-start max-w-5xl mt-[6%] md:mt-[10%]">
          <MotionReveal>
            <h2 className="text-3xl font-sans font-thin uppercase text-left mb-8 inline-block">
              <span className="motion-title-chip bg-orange-400 px-2 text-black">Why this is different</span>
            </h2>
          </MotionReveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            <FeatureCard
              delayMs={0}
              title="Hard caps"
              body="Max order size, daily margin, and allowed markets — enforced before trades hit the exchange."
            />
            <FeatureCard
              delayMs={90}
              title="Keplr in control"
              body="You approve typed AuthZ and can revoke anytime. We never see your seed phrase."
            />
            <FeatureCard
              delayMs={180}
              title="Demo agent"
              body="See allow/deny decisions with plain phrases — same policy engine as a real bot."
            />
            <FeatureCard
              delayMs={270}
              title="Grant audit"
              body="Free scan for risky generic AuthZ on your wallet before you connect AI tools."
            />
          </div>
          <MotionReveal delayMs={120}>
            <p className="text-white/50 text-sm mt-8 max-w-2xl">
              Notional limits are gateway-enforced, not inside every Injective contract.{" "}
              <Link href="/limitations" className="text-[#75bfcf] underline">
                Limits &amp; trust
              </Link>
            </p>
          </MotionReveal>
        </div>
      </section>
    </AppShell>
  );
}

function FeatureCard({
  title,
  body,
  delayMs,
}: {
  title: string;
  body: string;
  delayMs: number;
}) {
  return (
    <MotionReveal delayMs={delayMs}>
      <div className="motion-card glass-card p-6 rounded-2xl">
        <h3 className="text-xl font-bold mb-3">
          <span className="bg-[#75bfcf] px-2 text-black">{title}</span>
        </h3>
        <p className="text-white/80 leading-relaxed">{body}</p>
      </div>
    </MotionReveal>
  );
}

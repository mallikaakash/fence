import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PRODUCT_NAME } from "@/lib/brand";
import { HomeHeroIntro } from "@/components/intentguard/home-hero";
import { HomePageActions, HomePrerequisites } from "@/components/intentguard/home-page-actions";
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
                  {PRODUCT_NAME}
                </span>
              </h1>
              <HomeHeroIntro />
            </div>

            <div className="hero-stagger__item">
              <HomePrerequisites />
            </div>

            <div className="hero-stagger__item">
              <HomePageActions />
            </div>
          </div>
        </HeroStagger>
      </section>

      <section className="features-section flex flex-col px-[5%] md:pl-[20%] md:pr-[10%] py-20 pb-28">
        <div className="flex flex-col items-start max-w-5xl">
          <MotionReveal>
            <h2 className="text-3xl font-sans font-thin uppercase text-left mb-3 inline-block">
              <span className="motion-title-chip bg-orange-400 px-2 text-black">Why this exists</span>
            </h2>
            <p className="text-white/55 text-sm max-w-2xl mb-8">
              Many AI tools ask for broad trading access. {PRODUCT_NAME} is for people who want{" "}
              <strong className="text-white/75">bring-your-own bots</strong> on Injective with caps —
              not another grid bot inside Helix.
            </p>
          </MotionReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            <FeatureCard
              delayMs={0}
              href="/start"
              title="Your rules"
              body="Choose markets, max order size, daily margin limit, and leverage."
            />
            <FeatureCard
              delayMs={80}
              href="/start"
              title="Your wallet"
              body="Timed permission in Keplr or Leap — revoke anytime. We never see your seed phrase."
            />
            <FeatureCard
              delayMs={160}
              href="/protection"
              title="Your bot"
              body="Copy a bot access code on the dashboard — not unlimited wallet control."
            />
          </div>
          <MotionReveal delayMs={100}>
            <p className="text-white/50 text-sm mt-8 max-w-2xl">
              Limits are checked before orders reach the exchange.{" "}
              <Link href="/limitations" className="text-[#75bfcf] underline">
                How it works & limits →
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
  href,
}: {
  title: string;
  body: string;
  delayMs: number;
  href: string;
}) {
  return (
    <MotionReveal delayMs={delayMs}>
      <Link
        href={href}
        className="motion-card glass-card p-6 rounded-2xl block h-full hover:border-[#75bfcf]/40 transition-colors"
      >
        <h3 className="text-xl font-bold mb-3">
          <span className="bg-[#75bfcf] px-2 text-black">{title}</span>
        </h3>
        <p className="text-white/80 leading-relaxed text-sm">{body}</p>
        <span className="text-[#75bfcf] text-xs mt-4 inline-block">Open →</span>
      </Link>
    </MotionReveal>
  );
}

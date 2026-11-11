import { AppShell } from "@/components/layout/app-shell";
import { PRODUCT_NAME } from "@/lib/brand";
import { HomeHeroIntro } from "@/components/intentguard/home-hero";
import { HomeHowItWorksSection } from "@/components/intentguard/home-how-it-works";
import { HomePageActions } from "@/components/intentguard/home-page-actions";
import { HeroStagger } from "@/components/motion/hero-stagger";

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
              <HomePageActions />
            </div>
          </div>
        </HeroStagger>
      </section>

      <section className="features-section features-section--readable flex flex-col px-[5%] md:pl-[20%] md:pr-[10%] py-20 pb-28">
        <HomeHowItWorksSection />
      </section>
    </AppShell>
  );
}

import { EnvironmentRibbon } from "@/components/intentguard/gateway-ux";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteNav } from "@/components/layout/site-nav";
import { MotionBackground } from "@/components/motion/motion-background";

type Props = {
  children: React.ReactNode;
};

export function AppShell({ children }: Props) {
  return (
    <div className="flex flex-col min-h-screen relative">
      <MotionBackground />
      <EnvironmentRibbon />
      <SiteNav />
      <main className="flex-1 relative z-[1]">{children}</main>
      <SiteFooter />
    </div>
  );
}

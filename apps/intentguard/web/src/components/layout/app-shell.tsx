import Link from "next/link";
import { EnvironmentRibbon } from "@/components/intentguard/gateway-ux";

type Props = {
  children: React.ReactNode;
};

export function AppShell({ children }: Props) {
  return (
    <div>
      <EnvironmentRibbon />
      <nav className="fixed top-8 left-1/2 -translate-x-1/2 z-50 px-6 max-md:top-14">
        <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-full shadow-2xl px-10 py-4">
          <div className="relative flex items-center justify-center space-x-10">
            <Link
              href="/"
              className="text-white/70 hover:text-white transition-all duration-300 font-medium text-sm"
            >
              Home
            </Link>
            <Link
              href="/start"
              className="text-white/70 hover:text-white transition-all duration-300 font-medium text-sm"
            >
              Start
            </Link>
            <Link
              href="/trade"
              className="text-white/70 hover:text-white transition-all duration-300 font-medium text-sm"
            >
              Simulate
            </Link>
            <Link
              href="/history"
              className="text-white/70 hover:text-white transition-all duration-300 font-medium text-sm"
            >
              Proofs
            </Link>
            <Link
              href="/portfolio"
              className="text-white/70 hover:text-white transition-all duration-300 font-medium text-sm"
            >
              Grant Audit
            </Link>
            <Link
              href="/console"
              className="text-white/70 hover:text-white transition-all duration-300 font-medium text-sm"
            >
              Console
            </Link>
            <Link
              href="/limitations"
              className="text-white/50 hover:text-white transition-all duration-300 font-medium text-xs"
            >
              Limits
            </Link>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}

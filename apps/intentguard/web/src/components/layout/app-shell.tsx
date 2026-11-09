import Link from "next/link";

type Props = {
  children: React.ReactNode;
};

export function AppShell({ children }: Props) {
  return (
    <div>
      <nav className="fixed top-8 left-1/2 -translate-x-1/2 z-50 px-6">
        <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-full shadow-2xl px-10 py-4">
          <div className="relative flex items-center justify-center space-x-10">
            <Link
              href="/"
              className="text-white/70 hover:text-white transition-all duration-300 font-medium text-sm"
            >
              Home
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
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}

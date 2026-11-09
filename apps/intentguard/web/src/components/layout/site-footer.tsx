import Link from "next/link";

export function SiteFooter() {
  return (
    <footer
      role="contentinfo"
      className="border-t border-white/10 bg-black/50 py-6 px-[5%] md:px-[20%] text-xs text-white/45"
    >
      <div className="max-w-5xl flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <p>Injective testnet — demo funds only. Not investment advice.</p>
        <nav className="flex flex-wrap gap-4" aria-label="Secondary">
          <Link href="/history" className="hover:text-white/75">
            Activity log
          </Link>
          <Link href="/limitations" className="hover:text-white/75">
            How it works
          </Link>
          <Link href="/console" className="hover:text-white/75">
            Developer console
          </Link>
        </nav>
      </div>
    </footer>
  );
}

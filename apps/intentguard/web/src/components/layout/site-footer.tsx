import Link from "next/link";
import { FOOTER, TESTNET_DISCLOSURE } from "@/lib/product-copy";

export function SiteFooter() {
  return (
    <footer
      role="contentinfo"
      className="border-t border-white/10 bg-black/50 py-6 px-[5%] md:px-[20%] text-xs text-white/45"
    >
      <div className="max-w-5xl flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <p>{TESTNET_DISCLOSURE}</p>
        <nav className="flex flex-wrap gap-4" aria-label="Secondary">
          <Link href="/trade" className="hover:text-white/75">
            {FOOTER.sampleTrade}
          </Link>
          <Link href="/agent" className="hover:text-white/75">
            {FOOTER.sampleAi}
          </Link>
          <Link href="/history" className="hover:text-white/75">
            {FOOTER.activity}
          </Link>
          <Link href="/limitations" className="hover:text-white/75">
            {FOOTER.howItWorks}
          </Link>
          <Link href="/console" className="hover:text-white/75">
            {FOOTER.developers}
          </Link>
        </nav>
      </div>
    </footer>
  );
}

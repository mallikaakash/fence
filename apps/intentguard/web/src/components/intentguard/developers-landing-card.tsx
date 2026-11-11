import Link from "next/link";
import { NAV } from "@/lib/product-copy";

export function DevelopersLandingCard() {
  return (
    <div className="glass-card p-5 md:p-6 space-y-3 text-white border border-[#75bfcf]/25">
      <h2 className="text-lg font-medium text-[#75bfcf]">Everyday users</h2>
      <p className="text-sm text-white/65">
        Connect a trading bot or AI with a <strong className="text-white/85">bot access code</strong> on{" "}
        {NAV.dashboard.toLowerCase()}, not here.
      </p>
      <Link href="/protection" className="cta-primary inline-block text-sm !px-5 !py-2">
        Open {NAV.dashboard.toLowerCase()}
      </Link>
      <p className="text-xs text-white/45 pt-2 border-t border-white/10">
        Below: API keys, curl examples, session probes, and operator tools for developers.
      </p>
    </div>
  );
}

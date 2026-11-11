import Link from "next/link";

export function HomePageActions() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/start" className="cta-primary motion-cta">
          Start setup
        </Link>
        <Link href="/limitations" className="cta-secondary motion-cta">
          How it works
        </Link>
      </div>
      <div className="text-white/45 text-sm max-w-2xl leading-relaxed space-y-1">
        <p>Setup takes a few minutes: connect your wallet, choose limits, approve once in Keplr or Leap.</p>
        <p>Live testnet trades also need gas and margin.</p>
      </div>
    </div>
  );
}

import Link from "next/link";

/** Short on-page disclaimer — not legal advice. */
export function RiskDisclosure({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-white/45 text-xs max-w-2xl leading-relaxed">
        Testnet product. You control your Keplr wallet and on-chain approvals.{" "}
        <Link href="/limitations" className="text-[#75bfcf] underline">
          How it works
        </Link>
      </p>
    );
  }

  return (
    <aside className="border border-white/15 rounded-xl bg-white/5 p-4 text-xs text-white/65 space-y-2 max-w-2xl">
      <p className="text-white/80 font-medium uppercase tracking-wide text-[10px]">
        Risk disclosure (not legal advice)
      </p>
      <ul className="list-disc list-inside space-y-1 text-white/60">
        <li>Policy is enforced by your gateway before broadcast — not solely on-chain.</li>
        <li>
          Compromised sidecar, owner keys on-host, or other wallet grants can bypass the intended
          mandate.
        </li>
        <li>
          <code className="text-white/70">POST /v1/propose</code> does not place orders; see{" "}
          <Link href="/limitations" className="text-[#75bfcf] underline">
            full limitations
          </Link>
          .
        </li>
      </ul>
    </aside>
  );
}

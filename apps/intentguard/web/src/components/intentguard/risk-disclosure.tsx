import Link from "next/link";

const ENGINEERING_LIMITATIONS_URL =
  "https://github.com/mallikaakash/injective-buildathon/blob/main/docs/LIMITATIONS.md";

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
    <aside className="border border-white/15 rounded-xl bg-black/25 p-4 text-sm text-white/65 space-y-3 max-w-2xl">
      <p className="text-white/85 font-medium">Before you rely on this</p>
      <ul className="list-disc list-inside space-y-2 text-white/60 text-xs">
        <li>Testnet only. Not investment advice.</li>
        <li>Fence checks orders on its server before they go out. That is separate from on-chain rules.</li>
        <li>
          If your wallet has other trading permissions, or someone gets your bot access code, they may be
          able to trade within whatever those permissions allow.
        </li>
        <li>You can revoke wallet access in Keplr and end your Fence session at any time.</li>
      </ul>
      <details className="text-xs text-white/50">
        <summary className="cursor-pointer text-[#75bfcf] hover:text-white/80">Engineering notes</summary>
        <ul className="list-disc list-inside mt-2 space-y-1 text-white/45">
          <li>Policy runs on the gateway before broadcast, not only on-chain.</li>
          <li>
            A compromised hosted gateway, leaked owner API keys, or extra AuthZ grants can weaken the
            intended cap.
          </li>
          <li>
            <code className="text-white/55">POST /v1/propose</code> checks policy only; it does not place
            orders by itself.
          </li>
        </ul>
        <p className="mt-2">
          <a
            className="text-[#75bfcf] underline"
            href={ENGINEERING_LIMITATIONS_URL}
            target="_blank"
            rel="noreferrer"
          >
            docs/LIMITATIONS.md
          </a>
        </p>
      </details>
    </aside>
  );
}

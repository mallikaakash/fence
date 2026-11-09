import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { RiskDisclosure } from "@/components/intentguard/risk-disclosure";

export default function LimitationsPage() {
  return (
    <AppShell>
      <section className="max-w-2xl mx-auto px-6 pt-32 pb-24 space-y-6">
        <h1 className="text-3xl font-light text-orange-400">Limitations & risk</h1>
        <RiskDisclosure />
        <Button href="/start" text="Get started" variant="primary" />
        <p className="text-white/50 text-sm leading-relaxed">
          Full text (source of truth for buyers):{" "}
          <a
            className="text-[#75bfcf] underline"
            href="https://github.com/mallikaakash/injective-buildathon/blob/main/docs/LIMITATIONS.md"
            target="_blank"
            rel="noreferrer"
          >
            docs/LIMITATIONS.md
          </a>
          {" · "}
          <Link href="/portfolio" className="text-[#75bfcf] underline">
            Free grant audit
          </Link>
        </p>
        <p className="text-white/40 text-xs">
          Threat model:{" "}
          <a
            className="underline"
            href="https://github.com/mallikaakash/injective-buildathon/blob/main/docs/THREAT-MODEL.md"
            target="_blank"
            rel="noreferrer"
          >
            THREAT-MODEL.md
          </a>
        </p>
      </section>
    </AppShell>
  );
}

function Button({
  href,
  text,
  variant = "secondary",
}: {
  href: string;
  text: string;
  variant?: "primary" | "secondary";
}) {
  const cls =
    variant === "primary"
      ? "inline-flex px-4 py-2 bg-white text-black rounded-md font-medium text-sm"
      : "inline-flex px-4 py-2 border border-white/30 text-white rounded-md text-sm";
  return (
    <Link href={href} className={cls}>
      {text}
    </Link>
  );
}

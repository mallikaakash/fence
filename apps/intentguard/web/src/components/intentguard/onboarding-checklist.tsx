"use client";

import Link from "next/link";

/** gtm:verify — primary user path (hosted testnet). */
const steps = [
  {
    title: "Setup",
    body: "Keplr, limits, timed grant.",
    href: "/start",
    cta: "Open setup",
  },
  {
    title: "Try limits",
    body: "Allow or deny sample trades against your session.",
    href: "/trade",
    cta: "Try limits",
  },
  {
    title: "Grant audit",
    body: "Scan inj1… for risky AuthZ before connecting bots.",
    href: "/portfolio",
    cta: "Grant audit",
  },
];

export function OnboardingChecklist() {
  return (
    <ol className="space-y-3 text-sm text-white/75">
      {steps.map((s, i) => (
        <li
          key={s.title}
          className="flex flex-wrap items-center justify-between gap-2 border border-white/10 rounded-xl px-4 py-3 bg-black/20"
        >
          <div>
            <span className="text-white/40 text-xs mr-2">{i + 1}.</span>
            <strong className="text-white">{s.title}.</strong>{" "}
            <span className="text-white/55">{s.body}</span>
          </div>
          <Link href={s.href} className="text-[#75bfcf] text-xs underline shrink-0">
            {s.cta}
          </Link>
        </li>
      ))}
    </ol>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV } from "@/lib/product-copy";

const LINKS = [
  { href: "/", label: NAV.home },
  { href: "/protection", label: NAV.dashboard },
  { href: "/start", label: NAV.setup },
  { href: "/portfolio", label: NAV.walletCheck },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
  <>
      <nav
        className="motion-nav fixed top-8 left-1/2 z-50 px-6 max-md:top-14 hidden md:block"
        aria-label="Main"
      >
        <div className="motion-nav__pill backdrop-blur-sm bg-white/5 border border-white/10 rounded-full shadow-2xl px-10 py-4">
          <div className="flex items-center justify-center space-x-10">
            {LINKS.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`motion-nav__link transition-all duration-300 font-medium text-sm ${
                    active ? "text-white motion-nav__link--active" : "text-white/70 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <nav className="fixed top-14 left-1/2 -translate-x-1/2 z-50 md:hidden" aria-label="Main">
        <button
          type="button"
          className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-full px-4 py-2 text-white/80 text-xs"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close menu" : "Menu"}
        </button>
        {open ? (
          <div className="mt-2 flex flex-col gap-2 backdrop-blur-md bg-black/85 border border-white/15 rounded-xl p-3 min-w-[10rem]">
            {LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-white/80 py-1"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}
      </nav>
    </>
  );
}

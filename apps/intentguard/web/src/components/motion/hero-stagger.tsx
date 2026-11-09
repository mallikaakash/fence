"use client";

import type { ReactNode } from "react";

/** Wraps hero blocks for staggered entrance on first paint (home + marketing). */
export function HeroStagger({ children }: { children: ReactNode }) {
  return <div className="hero-stagger">{children}</div>;
}

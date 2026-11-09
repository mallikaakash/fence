"use client";

import { OwnerConsole } from "@/components/intentguard/owner-console";

/** Full operator UI — collapsed by default on hosted. */
export function AdvancedConsoleShell() {
  return (
    <details className="glass-card rounded-2xl group">
      <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-white list-none flex items-center justify-between gap-2">
        <span>
          <span className="text-[#75bfcf] uppercase text-[10px] tracking-wide block mb-0.5">
            Advanced
          </span>
          Operator console — sessions, keys, health probes
        </span>
        <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
      </summary>
      <div className="border-t border-white/10 px-2 pb-4 pt-2">
        <OwnerConsole embedded />
      </div>
    </details>
  );
}

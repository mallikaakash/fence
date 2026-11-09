export function PolicyCapsCallout({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details
      className="w-full text-sm text-white/75 border border-white/20 rounded-2xl bg-white/5 backdrop-blur-md"
      open={defaultOpen}
    >
      <summary className="cursor-pointer px-4 py-3 text-[#75bfcf] text-xs uppercase tracking-[0.2em] font-medium list-none">
        What IntentGuard caps (and what it does not) ▾
      </summary>
      <div className="px-4 pb-4 space-y-2 border-t border-white/10 pt-3 text-white/65 text-xs leading-relaxed">
        <p>
          <strong className="text-white/85">Per order</strong> margin &amp; notional ·{" "}
          <strong className="text-white/85">per UTC day</strong> margin sum ·{" "}
          <strong className="text-white/85">markets</strong> allowlisted on-chain.
        </p>
        <p className="text-white/45">
          Not portfolio exposure or open position size — use exchange risk controls for that.
        </p>
      </div>
    </details>
  );
}

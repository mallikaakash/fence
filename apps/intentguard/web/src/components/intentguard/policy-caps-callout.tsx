export function PolicyCapsCallout({ defaultOpen = true }: { defaultOpen?: boolean }) {
  return (
    <details
      className="w-full text-sm text-white/75 border border-white/15 rounded-xl bg-black/25"
      open={defaultOpen}
    >
      <summary className="cursor-pointer px-4 py-3 text-white/80 text-sm font-medium list-none">
        What Fence limits
      </summary>
      <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3 text-white/65 text-sm leading-relaxed">
        <ul className="list-disc list-inside space-y-2">
          <li>Max size per order (margin and notional).</li>
          <li>Max margin your bot can use in one UTC day.</li>
          <li>Which markets it can trade (set during setup).</li>
        </ul>
        <p className="text-white/45 text-xs">
          Fence does not cap total portfolio size or open position size. Use Helix or your own risk
          controls for that.
        </p>
      </div>
    </details>
  );
}

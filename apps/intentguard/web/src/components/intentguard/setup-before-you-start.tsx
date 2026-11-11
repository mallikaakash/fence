export function SetupBeforeYouStart() {
  return (
    <div className="border border-white/15 rounded-lg bg-black/40 px-4 py-3 text-xs text-white/70 space-y-1">
      <p className="text-[#75bfcf] uppercase tracking-wide text-[11px]">Before you start</p>
      <p>
        Install <strong className="text-white/90">Keplr</strong> or{" "}
        <strong className="text-white/90">Leap</strong> and switch it to{" "}
        <strong className="text-white/90">Injective testnet</strong>.
      </p>
    </div>
  );
}

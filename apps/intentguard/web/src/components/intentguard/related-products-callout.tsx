import {
  HELIX_MAINNET_TRADING_BOTS_URL,
  HELIX_TESTNET_TRADING_BOTS_URL,
  HELIX_TESTNET_URL,
} from "@/lib/testnet-resources";

export function RelatedProductsCallout() {
  return (
    <div className="border border-white/15 rounded-xl p-4 text-sm text-white/70 space-y-3">
      <p className="text-white/85 font-medium">How Fence compares to Helix bots</p>
      <p className="text-white/65 leading-relaxed">
        <a
          href={HELIX_MAINNET_TRADING_BOTS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[#75bfcf] underline"
        >
          Helix trading bots
        </a>{" "}
        run inside the Helix app (grid, DCA, and similar). Fence is for your own bot or agent. Fence
        applies your caps before orders leave.
      </p>
      <p className="text-white/50 text-xs">
        Margin is on{" "}
        <a href={HELIX_TESTNET_URL} target="_blank" rel="noreferrer" className="text-[#75bfcf] underline">
          Helix testnet
        </a>
        . Optional:{" "}
        <a
          href={HELIX_TESTNET_TRADING_BOTS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[#75bfcf] underline"
        >
          Helix testnet bot listings
        </a>
        .
      </p>
    </div>
  );
}

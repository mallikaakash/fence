import {
  HELIX_MAINNET_TRADING_BOTS_URL,
  HELIX_TESTNET_TRADING_BOTS_URL,
  HELIX_TESTNET_URL,
} from "@/lib/testnet-resources";

/** Honest positioning vs other Injective automation. */
export function RelatedProductsCallout() {
  return (
    <aside className="glass-card p-5 space-y-3 text-sm text-white/75">
      <p className="text-[#75bfcf] text-[10px] uppercase tracking-wide font-medium">
        Related on Injective
      </p>
      <p>
        <strong className="text-white">Helix trading bots</strong> are{" "}
        <a
          href={HELIX_MAINNET_TRADING_BOTS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[#75bfcf] underline"
        >
          built-in strategies on Helix
        </a>{" "}
        (grid, DCA, etc.) — great if you want a retail bot inside Helix. Fence is{" "}
        <strong className="text-white">not</strong> another grid bot: it is a{" "}
        <strong className="text-white">policy gateway</strong> for{" "}
        <strong className="text-white">bring-your-own</strong> agents (MCP, custom bots) with
        typed AuthZ, notional caps, and a grantee key that never sits in the LLM environment.
      </p>
      <p className="text-white/55 text-xs">
        Trade on{" "}
        <a href={HELIX_TESTNET_URL} target="_blank" rel="noreferrer" className="text-[#75bfcf] underline">
          Helix testnet
        </a>{" "}
        for margin; testnet bots (when listed) live at{" "}
        <a
          href={HELIX_TESTNET_TRADING_BOTS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[#75bfcf] underline"
        >
          testnet Helix trading bots
        </a>
        .
      </p>
    </aside>
  );
}

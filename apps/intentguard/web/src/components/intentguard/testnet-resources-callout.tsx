import {
  HELIX_TESTNET_URL,
  INJECTIVE_TESTNET_FAUCET_GCP_URL,
  INJECTIVE_TESTNET_FAUCET_URL,
} from "@/lib/testnet-resources";

export function TestnetResourcesCallout() {
  return (
    <div className="border border-white/10 rounded-xl p-4 bg-black/25 text-xs text-white/65 space-y-2">
      <p className="text-white/80 font-medium uppercase tracking-wide text-[10px]">
        Testnet resources
      </p>
      <ul className="space-y-1 list-disc list-inside">
        <li>
          <a
            href={INJECTIVE_TESTNET_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[#75bfcf] underline"
          >
            Injective testnet faucet
          </a>{" "}
          — INJ for gas (owner + assistant)
        </li>
        <li>
          <a
            href={INJECTIVE_TESTNET_FAUCET_GCP_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[#75bfcf] underline"
          >
            Google Cloud Injective faucet
          </a>{" "}
          — alternate if the primary faucet is busy
        </li>
        <li>
          <a href={HELIX_TESTNET_URL} target="_blank" rel="noreferrer" className="text-[#75bfcf] underline">
            Helix testnet
          </a>{" "}
          — deposit USDT margin (same wallet as Protect)
        </li>
      </ul>
    </div>
  );
}

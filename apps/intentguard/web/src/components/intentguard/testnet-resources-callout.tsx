import {
  HELIX_TESTNET_URL,
  INJECTIVE_TESTNET_FAUCET_GCP_URL,
  INJECTIVE_TESTNET_FAUCET_URL,
} from "@/lib/testnet-resources";

export function TestnetResourcesCallout() {
  return (
    <div className="border border-white/15 rounded-xl p-4 bg-black/25 text-sm text-white/70 space-y-2">
      <p className="text-white/85 font-medium">Testnet funding</p>
      <ul className="space-y-2 list-disc list-inside text-xs text-white/60">
        <li>
          <a
            href={INJECTIVE_TESTNET_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[#75bfcf] underline"
          >
            Injective faucet
          </a>
          : INJ for gas on your wallet and the assistant wallet.
        </li>
        <li>
          <a
            href={INJECTIVE_TESTNET_FAUCET_GCP_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[#75bfcf] underline"
          >
            Google Cloud faucet
          </a>
          : use if the main faucet is slow or empty.
        </li>
        <li>
          <a href={HELIX_TESTNET_URL} target="_blank" rel="noreferrer" className="text-[#75bfcf] underline">
            Helix testnet
          </a>
          : deposit USDT margin with the same wallet you used in setup.
        </li>
      </ul>
    </div>
  );
}

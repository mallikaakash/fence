const TESTNET_TX =
  "https://testnet.explorer.injective.network/transaction";
const MAINNET_TX = "https://explorer.injective.network/transaction";

export function explorerTxUrl(
  txHash: string,
  network: "testnet" | "mainnet" = "testnet",
): string {
  const base = network === "mainnet" ? MAINNET_TX : TESTNET_TX;
  const hash = txHash.replace(/^0x/i, "").toUpperCase();
  return `${base}/${hash}`;
}

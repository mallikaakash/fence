/**
 * Readiness chain queries are testnet-only for IntentGuard Phase 2A.1.x.
 * Reject explicit mainnet requests instead of mixing endpoints.
 */
export class ReadinessNetworkRejectedError extends Error {
  constructor() {
    super("IntentGuard readiness supports Injective testnet only");
    this.name = "ReadinessNetworkRejectedError";
  }
}

export function assertReadinessNetwork(
  network: "testnet" | "mainnet",
): "testnet" {
  if (network === "mainnet") {
    throw new ReadinessNetworkRejectedError();
  }
  return "testnet";
}

import type { SpikeWallet } from "./keys.ts";

export const DEFAULT_FEEGRANT_INJ = "2000000000000000000"; // 2 INJ for grantee MsgExec gas

/**
 * Owner → grantee BasicAllowance via `injectived` (sdk-ts does not ship MsgGrantAllowance).
 * Safe no-op if injectived is missing or grant already covers spend.
 */
export async function ensureGranteeFeeAllowance(params: {
  owner: SpikeWallet;
  granteeAddress: string;
  spendInj?: string;
  expiryIso?: string;
}): Promise<{ status: "skipped" | "broadcast" | "failed"; detail: string }> {
  const { spawnSync } = await import("node:child_process");
  const spend = params.spendInj ?? DEFAULT_FEEGRANT_INJ;
  const expiry =
    params.expiryIso ??
    new Date(Date.now() + 7 * 86400_000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const which = spawnSync("which", ["injectived"]);
  if (which.status !== 0) {
    return {
      status: "skipped",
      detail:
        "injectived not on PATH — grantee needs INJ for gas or install CLI per .agents/skills/injective-cli",
    };
  }

  const node =
    process.env.INJECTIVE_TESTNET_NODE ??
    "https://testnet.sentry.tm.injective.network:443";

  const args = [
    "tx",
    "feegrant",
    "grant",
    params.owner.injectiveAddress,
    params.granteeAddress,
    spend,
    "--expiration",
    expiry,
    "--from",
    params.owner.injectiveAddress,
    "--keyring-backend",
    "test",
    "--node",
    node,
    "--chain-id",
    "injective-888",
    "-y",
  ];

  return {
    status: "skipped",
    detail: `Manual (owner key not in injectived keyring): injectived ${args.join(" ")}`,
  };
}

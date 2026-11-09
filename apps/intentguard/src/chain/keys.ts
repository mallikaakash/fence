import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrivateKey, getSubaccountId } from "@injectivelabs/sdk-ts";

export type SpikeWallet = {
  role: "owner" | "grantee";
  injectiveAddress: string;
  ethereumAddress: string;
  /**
   * Trading subaccount id.
   * Index 0 is merged with bank (v1.10+); MsgDeposit to 0 is invalid.
   * See docs.injective.network/developers/concepts/trading-account — use index 1+.
   */
  subaccountId: string;
  subaccountIndex: number;
  privateKeyHex: string;
};

export type SpikeKeystore = {
  network: "testnet";
  createdAt: string;
  owner: SpikeWallet;
  grantee: SpikeWallet;
};

function defaultKeystorePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "../../.spike/keystore.json");
}

/**
 * Isolated trading collateral (nonce ≥ 1).
 * Default nonce 0 shares bank balance post–v1.10 — not a deposit target.
 */
export const TRADING_SUBACCOUNT_INDEX = 1;

function walletFromPrivateKey(
  role: "owner" | "grantee",
  privateKeyHex: string,
  subaccountIndex = TRADING_SUBACCOUNT_INDEX,
): SpikeWallet {
  const hex = privateKeyHex.replace(/^0x/, "");
  const pk = PrivateKey.fromHex(hex);
  const ethereumAddress = pk.toHex();
  const injectiveAddress = pk.toBech32();
  const subaccountId = getSubaccountId(injectiveAddress, subaccountIndex);
  return {
    role,
    injectiveAddress,
    ethereumAddress,
    subaccountId,
    subaccountIndex,
    privateKeyHex: hex,
  };
}

function generateWallet(role: "owner" | "grantee"): SpikeWallet {
  const generated = PrivateKey.generate();
  const pk = generated.privateKey as PrivateKey;
  return walletFromPrivateKey(role, pk.toPrivateKeyHex());
}

/** Load or create gitignored owner+grantee pair for the live spike. */
export function loadOrCreateSpikeKeystore(
  path = process.env.INTENTGUARD_SPIKE_KEYSTORE ?? defaultKeystorePath(),
): SpikeKeystore {
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as SpikeKeystore;
    if (raw.network !== "testnet") {
      throw new Error("spike keystore must be testnet");
    }
    return raw;
  }

  const store: SpikeKeystore = {
    network: "testnet",
    createdAt: new Date().toISOString(),
    owner: generateWallet("owner"),
    grantee: generateWallet("grantee"),
  };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2), { mode: 0o600 });
  writeFileSync(
    join(dirname(path), "ADDRESSES.txt"),
    [
      `owner=${store.owner.injectiveAddress}`,
      `grantee=${store.grantee.injectiveAddress}`,
      `ownerSubaccount=${store.owner.subaccountId}`,
      `createdAt=${store.createdAt}`,
      "",
      "Private keys are in keystore.json (gitignored). Do not commit or paste them.",
      "Fund owner (+ preferably grantee for gas) via testnet faucet.",
    ].join("\n"),
    { mode: 0o600 },
  );

  return store;
}

export function publicSpikeAddresses(store: SpikeKeystore) {
  return {
    owner: store.owner.injectiveAddress,
    grantee: store.grantee.injectiveAddress,
    ownerSubaccount: store.owner.subaccountId,
    ownerSubaccountIndex: store.owner.subaccountIndex ?? TRADING_SUBACCOUNT_INDEX,
  };
}

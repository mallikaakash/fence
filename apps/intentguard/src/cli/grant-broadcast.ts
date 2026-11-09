#!/usr/bin/env node
/**
 * Broadcast typed MsgGrant from session create JSON (testnet owner key required).
 *
 *   INTENTGUARD_OWNER_PRIVATE_KEY_HEX=… npm run grant:broadcast -- /tmp/ig-session.json
 */
import { readFileSync, existsSync } from "node:fs";
import { getSubaccountId, PrivateKey } from "@injectivelabs/sdk-ts";
import { TRADING_SUBACCOUNT_INDEX } from "../chain/keys.ts";
import type { SpikeWallet } from "../chain/keys.ts";
import { broadcastTypedTradingGrants } from "../chain/typedGrant.ts";

function ownerWallet(hex: string, subaccountId: string): SpikeWallet {
  const h = hex.replace(/^0x/, "");
  const pk = PrivateKey.fromHex(h);
  return {
    role: "owner",
    injectiveAddress: pk.toBech32(),
    ethereumAddress: pk.toHex(),
    subaccountId,
    subaccountIndex: TRADING_SUBACCOUNT_INDEX,
    privateKeyHex: h,
  };
}

const file = process.argv[2];
const hex = process.env.INTENTGUARD_OWNER_PRIVATE_KEY_HEX?.replace(/^0x/, "");
if (!file || !hex) {
  console.error(
    "Usage: INTENTGUARD_OWNER_PRIVATE_KEY_HEX=… npm run grant:broadcast -- session.json",
  );
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(file, "utf8")) as {
  ownerInjectiveAddress?: string;
  subaccountId?: string;
  session?: { granteeAddress: string };
  grantPlan?: { marketIds: string[]; expirySeconds?: number };
};

const granteeAddress = data.session?.granteeAddress;
const ownerAddr = data.ownerInjectiveAddress;
const marketIds = data.grantPlan?.marketIds;

if (!granteeAddress || !ownerAddr || !marketIds?.length) {
  console.error(
    "JSON needs ownerInjectiveAddress, session.granteeAddress, grantPlan.marketIds",
  );
  process.exit(1);
}

const subaccountId =
  data.subaccountId ??
  getSubaccountId(ownerAddr, TRADING_SUBACCOUNT_INDEX);

const owner = ownerWallet(hex, subaccountId);
if (owner.injectiveAddress !== ownerAddr) {
  console.error("Owner key does not match ownerInjectiveAddress in JSON");
  process.exit(1);
}

const result = await broadcastTypedTradingGrants({
  owner,
  granteeAddress,
  marketIds,
  expirySeconds: data.grantPlan?.expirySeconds,
});

console.log(JSON.stringify(result, null, 2));

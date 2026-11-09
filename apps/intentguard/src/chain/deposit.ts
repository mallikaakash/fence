import { MsgDeposit } from "@injectivelabs/sdk-ts";
import { createBroadcaster } from "./network.ts";
import type { SpikeWallet } from "./keys.ts";

/** Testnet Peggy USDT used by GOLD/USDT etc. */
export const TESTNET_USDT_DENOM =
  "peggy0x87aB3B4C8661e07D6372361211B96ed4Dc36B1B5";

/** Native Circle USDC (MTS) on testnet — quote for INJ/USDC PERP. */
/** Canonical testnet denom from bank (case-sensitive). */
export const TESTNET_USDC_DENOM =
  "erc20:0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d";

/**
 * Deposit bank balance into an isolated exchange subaccount (index ≥ 1).
 * Amount is chain integer string (e.g. 10_000000 for 10 USDT with 6 decimals).
 *
 * Do not target nonce 0: after v1.10, bank and default trading account are merged
 * (docs: Trading Account). MsgDeposit to index 0 fails with "subaccount id is not valid".
 */
export async function depositToSubaccount(params: {
  owner: SpikeWallet;
  denom: string;
  amount: string;
  subaccountId?: string;
}): Promise<{ txHash: string }> {
  const msg = MsgDeposit.fromJSON({
    injectiveAddress: params.owner.injectiveAddress,
    subaccountId: params.subaccountId ?? params.owner.subaccountId,
    amount: {
      denom: params.denom,
      amount: params.amount,
    },
  });
  const broadcaster = createBroadcaster(params.owner.privateKeyHex);
  const response = await broadcaster.broadcast({
    msgs: msg,
    memo: "intentguard subaccount deposit",
  });
  return { txHash: response.txHash };
}

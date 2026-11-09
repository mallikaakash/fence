import {
  MsgCreateDerivativeLimitOrder,
  msgsOrMsgExecMsgs,
  derivativePriceToChainPriceToFixed,
  derivativeQuantityToChainQuantityToFixed,
  derivativeMarginToChainMarginToFixed,
} from "@injectivelabs/sdk-ts";
import { createBroadcaster } from "./network.ts";
import type { SpikeWallet } from "./keys.ts";

export type LimitOrderIntent = {
  marketId: string;
  /** Human price in quote units. */
  price: number;
  /** Human quantity. */
  quantity: number;
  /** Human margin in quote units. */
  margin: number;
  /** 1 = buy, 2 = sell (Injective OrderType). */
  orderType?: number;
  quoteDecimals?: number;
};

export type MsgExecAttemptResult = {
  ok: boolean;
  txHash?: string;
  error?: string;
  marketId: string;
  subaccountId: string;
  /** Which wallet signed the outer MsgExec. */
  signer: string;
};

/**
 * Grantee signs MsgExec wrapping MsgCreateDerivativeLimitOrder for the owner.
 * Inner order sender/subaccount must be the granter's.
 */
export async function attemptDerivativeLimitMsgExec(params: {
  owner: SpikeWallet;
  grantee: SpikeWallet;
  intent: LimitOrderIntent;
  /** Override subaccount on the inner order (for wrong-subaccount attack). */
  subaccountIdOverride?: string;
}): Promise<MsgExecAttemptResult> {
  const quoteDecimals = params.intent.quoteDecimals ?? 6;
  const subaccountId =
    params.subaccountIdOverride ?? params.owner.subaccountId;

  const orderMsg = MsgCreateDerivativeLimitOrder.fromJSON({
    orderType: params.intent.orderType ?? 1,
    triggerPrice: "0",
    injectiveAddress: params.owner.injectiveAddress,
    marketId: params.intent.marketId,
    feeRecipient: params.owner.injectiveAddress,
    subaccountId,
    price: derivativePriceToChainPriceToFixed({
      value: params.intent.price,
      quoteDecimals,
    }),
    quantity: derivativeQuantityToChainQuantityToFixed({
      value: params.intent.quantity,
    }),
    margin: derivativeMarginToChainMarginToFixed({
      value: params.intent.margin,
      quoteDecimals,
    }),
  });

  const msgs = msgsOrMsgExecMsgs(orderMsg, params.grantee.injectiveAddress);
  const broadcaster = createBroadcaster(params.grantee.privateKeyHex);

  try {
    const response = await broadcaster.broadcast({
      msgs,
      memo: "intentguard msgexec spike",
    });
    return {
      ok: true,
      txHash: response.txHash,
      marketId: params.intent.marketId,
      subaccountId,
      signer: params.grantee.injectiveAddress,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      marketId: params.intent.marketId,
      subaccountId,
      signer: params.grantee.injectiveAddress,
    };
  }
}

/**
 * Agent-style bypass: try MsgExec using a key that is NOT the authorized grantee.
 * Must fail if AuthZ is correctly scoped.
 */
export async function attemptMsgExecAsNonGrantee(params: {
  owner: SpikeWallet;
  /** Attacker key (e.g. a throwaway) — not the grantee. */
  attacker: SpikeWallet;
  intent: LimitOrderIntent;
}): Promise<MsgExecAttemptResult> {
  return attemptDerivativeLimitMsgExec({
    owner: params.owner,
    grantee: params.attacker,
    intent: params.intent,
  });
}

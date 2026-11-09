import { MsgGrant, MsgRevoke } from "@injectivelabs/sdk-ts";
import {
  CreateDerivativeLimitOrderAuthz,
  CancelDerivativeOrderAuthz,
} from "@injectivelabs/core-proto-ts-v2/generated/injective/exchange/v1beta1/authz_pb.js";
import { TYPED_EXCHANGE_AUTHZ } from "../authz/types.ts";
import { createBroadcaster } from "./network.ts";
import type { SpikeWallet } from "./keys.ts";

export type TypedGrantBroadcastResult = {
  txHash: string;
  granter: string;
  grantee: string;
  subaccountId: string;
  marketIds: string[];
  expiresAt: string;
  authorizationTypeUrls: string[];
};

function packLimitOrderAuthz(subaccountId: string, marketIds: string[]) {
  return {
    typeUrl: TYPED_EXCHANGE_AUTHZ.CreateDerivativeLimitOrderAuthz,
    value: CreateDerivativeLimitOrderAuthz.toBinary(
      CreateDerivativeLimitOrderAuthz.create({
        subaccountId,
        marketIds,
      }),
    ),
  };
}

function packCancelAuthz(subaccountId: string, marketIds: string[]) {
  return {
    typeUrl: TYPED_EXCHANGE_AUTHZ.CancelDerivativeOrderAuthz,
    value: CancelDerivativeOrderAuthz.toBinary(
      CancelDerivativeOrderAuthz.create({
        subaccountId,
        marketIds,
      }),
    ),
  };
}

/**
 * Broadcast typed CreateDerivativeLimitOrderAuthz (+ optional cancel) MsgGrant.
 * Uses protobuf direct-sign path (sdk-ts amino path only supports GenericAuthorization).
 */
export async function broadcastTypedTradingGrants(params: {
  owner: SpikeWallet;
  granteeAddress: string;
  marketIds: string[];
  expirySeconds?: number;
  includeCancel?: boolean;
}): Promise<TypedGrantBroadcastResult> {
  if (params.marketIds.length === 0) {
    throw new Error("typed grant refused: empty marketIds");
  }

  const expirySeconds = params.expirySeconds ?? 60 * 60 * 24;
  const expiration = Math.floor(Date.now() / 1000) + expirySeconds;
  const subaccountId = params.owner.subaccountId;

  const msgs = [
    MsgGrant.fromJSON({
      granter: params.owner.injectiveAddress,
      grantee: params.granteeAddress,
      authorization: packLimitOrderAuthz(subaccountId, params.marketIds),
      expiration,
    }),
  ];

  if (params.includeCancel !== false) {
    msgs.push(
      MsgGrant.fromJSON({
        granter: params.owner.injectiveAddress,
        grantee: params.granteeAddress,
        authorization: packCancelAuthz(subaccountId, params.marketIds),
        expiration,
      }),
    );
  }

  const broadcaster = createBroadcaster(params.owner.privateKeyHex);
  const response = await broadcaster.broadcast({
    msgs,
    memo: "intentguard typed authz grant",
  });

  return {
    txHash: response.txHash,
    granter: params.owner.injectiveAddress,
    grantee: params.granteeAddress,
    subaccountId,
    marketIds: [...params.marketIds],
    expiresAt: new Date(expiration * 1000).toISOString(),
    authorizationTypeUrls: msgs.map(
      (_, i) =>
        i === 0
          ? TYPED_EXCHANGE_AUTHZ.CreateDerivativeLimitOrderAuthz
          : TYPED_EXCHANGE_AUTHZ.CancelDerivativeOrderAuthz,
    ),
  };
}

export async function broadcastRevokeTypedTrading(params: {
  owner: SpikeWallet;
  granteeAddress: string;
  /** Defaults to v0 limit + cancel. Pass a subset if only some grants exist. */
  msgTypes?: string[];
}): Promise<{ txHash: string }> {
  const msgTypes = params.msgTypes ?? [
    "/injective.exchange.v1beta1.MsgCreateDerivativeLimitOrder",
    "/injective.exchange.v1beta1.MsgCancelDerivativeOrder",
  ];
  const msgs = msgTypes.map((messageType) =>
    MsgRevoke.fromJSON({
      granter: params.owner.injectiveAddress,
      grantee: params.granteeAddress,
      messageType,
    }),
  );
  const broadcaster = createBroadcaster(params.owner.privateKeyHex);
  // Revoke one-by-one so a missing grant does not fail the whole batch.
  let lastHash = "";
  for (const msg of msgs) {
    try {
      const response = await broadcaster.broadcast({
        msgs: msg,
        memo: "intentguard typed authz revoke",
      });
      lastHash = response.txHash;
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if (!/authorization not found/i.test(text)) throw err;
    }
  }
  return { txHash: lastHash || "noop" };
}

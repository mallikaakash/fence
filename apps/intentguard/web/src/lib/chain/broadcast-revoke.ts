"use client";

import { getNetworkInfo, Network } from "@injectivelabs/networks";
import { BaseAccount, MsgRevoke } from "@injectivelabs/sdk-ts";
import {
  ChainRestAuthApi,
  ChainRestTendermintApi,
} from "@injectivelabs/sdk-ts";
import {
  BroadcastModeKeplr,
  createTransaction,
  getTxRawFromTxRawOrDirectSignResponse,
  TxRestApi,
} from "@injectivelabs/sdk-ts";
import {
  DEFAULT_BLOCK_TIMEOUT_HEIGHT,
  getStdFee,
  toBigNumber,
} from "@injectivelabs/utils";
import { encodeTxRawForKeplr } from "@/lib/chain/encode-tx-raw-keplr";

const DEFAULT_REVOKE_TYPES = [
  "/injective.exchange.v1beta1.MsgCreateDerivativeLimitOrder",
  "/injective.exchange.v1beta1.MsgCancelDerivativeOrder",
];

type InjWindow = Window & {
  keplr?: {
    enable: (chainId: string) => Promise<void>;
    getKey: (chainId: string) => Promise<{ bech32Address: string; pubKey: Uint8Array }>;
    getOfflineSigner: (chainId: string) => {
      signDirect: (address: string, signDoc: unknown) => Promise<unknown>;
    };
    sendTx: (chainId: string, tx: Uint8Array, mode: string) => Promise<Uint8Array | null>;
  };
};

/** Owner revokes typed exchange Msg grants on-chain via Keplr (one tx per message type). */
export async function broadcastTypedRevokes(params: {
  network: "testnet" | "mainnet";
  granter: string;
  grantee: string;
  messageTypes?: string[];
}): Promise<{ txHashes: string[] }> {
  const w = window as InjWindow;
  if (!w.keplr) throw new Error("Keplr not found");

  const networkInfo = getNetworkInfo(
    params.network === "mainnet" ? Network.MainnetSentry : Network.TestnetSentry,
  );
  const chainId = networkInfo.chainId;
  await w.keplr.enable(chainId);
  const key = await w.keplr.getKey(chainId);
  if (key.bech32Address !== params.granter) {
    throw new Error("Connected wallet must be the granter");
  }
  const pubKey = Buffer.from(key.pubKey).toString("base64");
  const offlineSigner = w.keplr.getOfflineSigner(chainId);

  const authApi = new ChainRestAuthApi(networkInfo.rest);
  const baseAccount = BaseAccount.fromRestApi(
    await authApi.fetchAccount(params.granter),
  );
  const tendermintApi = new ChainRestTendermintApi(networkInfo.rest);
  const latestBlock = await tendermintApi.fetchLatestBlock();
  const timeoutHeight = toBigNumber(latestBlock.header.height).plus(
    DEFAULT_BLOCK_TIMEOUT_HEIGHT,
  );

  const txHashes: string[] = [];
  let sequence = baseAccount.sequence;

  for (const messageType of params.messageTypes ?? DEFAULT_REVOKE_TYPES) {
    const msg = MsgRevoke.fromJSON({
      granter: params.granter,
      grantee: params.grantee,
      messageType,
    });

    const { signDoc } = createTransaction({
      pubKey,
      chainId,
      fee: getStdFee({}),
      message: msg,
      sequence,
      timeoutHeight: timeoutHeight.toNumber(),
      accountNumber: baseAccount.accountNumber,
    });

    const directSignResponse = await offlineSigner.signDirect(
      params.granter,
      signDoc,
    );
    const txRaw = getTxRawFromTxRawOrDirectSignResponse(
      directSignResponse as Parameters<typeof getTxRawFromTxRawOrDirectSignResponse>[0],
    );

    const broadcastResult = await w.keplr.sendTx(
      chainId,
      encodeTxRawForKeplr(txRaw),
      BroadcastModeKeplr.Sync,
    );
    if (!broadcastResult?.length) {
      throw new Error(`Broadcast failed for ${messageType}`);
    }
    const txHash = Buffer.from(broadcastResult).toString("hex");
    await new TxRestApi(networkInfo.rest).fetchTxPoll({ txHash });
    txHashes.push(txHash);
    sequence += 1;
  }

  return { txHashes };
}

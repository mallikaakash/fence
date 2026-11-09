"use client";

import { getNetworkInfo, Network } from "@injectivelabs/networks";
import { BaseAccount, MsgGrant } from "@injectivelabs/sdk-ts";
import {
  ChainRestAuthApi,
  ChainRestTendermintApi,
} from "@injectivelabs/sdk-ts";
import {
  BroadcastModeKeplr,
  CosmosTxV1Beta1TxPb,
  createTransaction,
  getTxRawFromTxRawOrDirectSignResponse,
  TxRestApi,
} from "@injectivelabs/sdk-ts";
import {
  DEFAULT_BLOCK_TIMEOUT_HEIGHT,
  getStdFee,
  toBigNumber,
} from "@injectivelabs/utils";

type InjWindow = Window & {
  keplr?: {
    enable: (chainId: string) => Promise<void>;
    getKey: (chainId: string) => Promise<{ bech32Address: string; pubKey: Uint8Array }>;
    getOfflineSigner: (chainId: string) => {
      signDirect: (
        address: string,
        signDoc: unknown,
      ) => Promise<{ signed: unknown; signature: { signature: string } }>;
    };
    sendTx: (
      chainId: string,
      tx: Uint8Array,
      mode: string,
    ) => Promise<Uint8Array | null>;
  };
};

/** Broadcast typed MsgGrant(s) from gateway grant-tx-plan via Keplr (owner wallet). */
export async function broadcastGrantTxPlan(params: {
  network: "testnet" | "mainnet";
  ownerInjectiveAddress: string;
  msgGrants: unknown[];
}): Promise<{ txHash: string }> {
  const w = window as InjWindow;
  if (!w.keplr) {
    throw new Error("Keplr not found — install Keplr for Injective");
  }

  const networkInfo = getNetworkInfo(
    params.network === "mainnet" ? Network.MainnetSentry : Network.TestnetSentry,
  );
  const chainId = networkInfo.chainId;

  await w.keplr.enable(chainId);
  const key = await w.keplr.getKey(chainId);
  if (key.bech32Address !== params.ownerInjectiveAddress) {
    throw new Error(
      `Wallet is ${key.bech32Address} — session owner is ${params.ownerInjectiveAddress}`,
    );
  }

  const pubKey = Buffer.from(key.pubKey).toString("base64");
  const offlineSigner = w.keplr.getOfflineSigner(chainId);

  const authApi = new ChainRestAuthApi(networkInfo.rest);
  const accountDetailsResponse = await authApi.fetchAccount(
    params.ownerInjectiveAddress,
  );
  const baseAccount = BaseAccount.fromRestApi(accountDetailsResponse);

  const tendermintApi = new ChainRestTendermintApi(networkInfo.rest);
  const latestBlock = await tendermintApi.fetchLatestBlock();
  const timeoutHeight = toBigNumber(latestBlock.header.height).plus(
    DEFAULT_BLOCK_TIMEOUT_HEIGHT,
  );

  const msgs = params.msgGrants.map((raw) =>
    MsgGrant.fromJSON(raw as Parameters<typeof MsgGrant.fromJSON>[0]),
  );

  const { signDoc } = createTransaction({
    pubKey,
    chainId,
    fee: getStdFee({}),
    message: msgs,
    sequence: baseAccount.sequence,
    timeoutHeight: timeoutHeight.toNumber(),
    accountNumber: baseAccount.accountNumber,
  });

  const directSignResponse = await offlineSigner.signDirect(
    params.ownerInjectiveAddress,
    signDoc,
  );
  const txRaw = getTxRawFromTxRawOrDirectSignResponse(
    directSignResponse as Parameters<typeof getTxRawFromTxRawOrDirectSignResponse>[0],
  );

  const broadcastResult = await w.keplr.sendTx(
    chainId,
    CosmosTxV1Beta1TxPb.TxRaw.encode(txRaw).finish(),
    BroadcastModeKeplr.Sync,
  );

  if (!broadcastResult?.length) {
    throw new Error("Transaction was not broadcast — check wallet for errors");
  }

  const txHash = Buffer.from(broadcastResult).toString("hex");
  await new TxRestApi(networkInfo.rest).fetchTxPoll({ txHash });

  return { txHash };
}

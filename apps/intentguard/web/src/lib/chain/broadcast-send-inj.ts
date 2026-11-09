"use client";

import { getNetworkInfo, Network } from "@injectivelabs/networks";
import { BaseAccount, MsgSend } from "@injectivelabs/sdk-ts";
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

/** Send testnet INJ from owner Keplr (e.g. grantee gas). */
export async function broadcastSendInj(params: {
  network: "testnet" | "mainnet";
  fromInj: string;
  toInj: string;
  /** Human INJ amount, e.g. 0.2 */
  amountInj: string;
}): Promise<{ txHash: string }> {
  const w = window as InjWindow;
  if (!w.keplr) throw new Error("Keplr not found");

  const networkInfo = getNetworkInfo(
    params.network === "mainnet" ? Network.MainnetSentry : Network.TestnetSentry,
  );
  const chainId = networkInfo.chainId;
  await w.keplr.enable(chainId);
  const key = await w.keplr.getKey(chainId);
  if (key.bech32Address !== params.fromInj) {
    throw new Error("Connected wallet does not match your owner address");
  }

  const human = Number(params.amountInj);
  if (!Number.isFinite(human) || human <= 0) {
    throw new Error("Invalid amount");
  }
  const baseAmount = BigInt(Math.floor(human * 1e18)).toString();

  const pubKey = Buffer.from(key.pubKey).toString("base64");
  const offlineSigner = w.keplr.getOfflineSigner(chainId);
  const authApi = new ChainRestAuthApi(networkInfo.rest);
  const accountDetailsResponse = await authApi.fetchAccount(params.fromInj);
  const baseAccount = BaseAccount.fromRestApi(accountDetailsResponse);
  const tendermintApi = new ChainRestTendermintApi(networkInfo.rest);
  const latestBlock = await tendermintApi.fetchLatestBlock();
  const timeoutHeight = toBigNumber(latestBlock.header.height).plus(
    DEFAULT_BLOCK_TIMEOUT_HEIGHT,
  );

  const msg = MsgSend.fromJSON({
    srcInjectiveAddress: params.fromInj,
    dstInjectiveAddress: params.toInj,
    amount: { denom: "inj", amount: baseAmount },
  });

  const { signDoc } = createTransaction({
    pubKey,
    chainId,
    fee: getStdFee({}),
    message: [msg],
    sequence: baseAccount.sequence,
    timeoutHeight: timeoutHeight.toNumber(),
    accountNumber: baseAccount.accountNumber,
  });

  const directSignResponse = await offlineSigner.signDirect(params.fromInj, signDoc);
  const txRaw = getTxRawFromTxRawOrDirectSignResponse(
    directSignResponse as Parameters<typeof getTxRawFromTxRawOrDirectSignResponse>[0],
  );
  const broadcastResult = await w.keplr.sendTx(
    chainId,
    encodeTxRawForKeplr(txRaw),
    BroadcastModeKeplr.Sync,
  );
  if (!broadcastResult?.length) {
    throw new Error("Send was not broadcast");
  }
  const txHash = Buffer.from(broadcastResult).toString("hex");
  await new TxRestApi(networkInfo.rest).fetchTxPoll({ txHash });
  return { txHash };
}

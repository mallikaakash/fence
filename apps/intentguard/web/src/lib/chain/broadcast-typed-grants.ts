"use client";

import { getNetworkInfo, Network } from "@injectivelabs/networks";
import { BaseAccount, MsgGrant } from "@injectivelabs/sdk-ts";
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

type MsgGrantJson = Parameters<typeof MsgGrant.fromJSON>[0];

function uint8FromWireValue(
  value: unknown,
): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") {
    try {
      return Uint8Array.from(Buffer.from(value, "base64"));
    } catch {
      return undefined;
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, number>);
    if (entries.length === 0) return undefined;
    const nums = entries
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, n]) => n);
    return Uint8Array.from(nums);
  }
  return undefined;
}

/** Gateway used to emit `toJSON()` protobuf strings; unwrap for `MsgGrant.fromJSON`. */
export function normalizeMsgGrantWire(raw: unknown): MsgGrantJson {
  let o: Record<string, unknown> =
    typeof raw === "string"
      ? (JSON.parse(raw) as Record<string, unknown>)
      : (raw as Record<string, unknown>);

  if (o.authorization || o.messageType) {
    const auth = o.authorization as { typeUrl?: string; value?: unknown } | undefined;
    if (auth?.value) {
      const bytes = uint8FromWireValue(auth.value);
      if (bytes) {
        o = { ...o, authorization: { ...auth, value: bytes } };
      }
    }
    return o as unknown as MsgGrantJson;
  }

  const grant = o.grant as Record<string, unknown> | undefined;
  if (!grant?.authorization) {
    throw new Error("Grant tx plan entry missing authorization");
  }

  let expiration = o.expiration ?? grant.expiration;
  if (expiration && typeof expiration === "object" && "seconds" in expiration) {
    const sec = (expiration as { seconds: bigint | string | number }).seconds;
    expiration = typeof sec === "bigint" ? sec.toString() : String(sec);
  }

  const auth = grant.authorization as { typeUrl: string; value: unknown };
  const value = uint8FromWireValue(auth.value) ?? auth.value;

  return {
    granter: String(o.granter),
    grantee: String(o.grantee),
    authorization: { typeUrl: auth.typeUrl, value },
    expiration,
  } as unknown as MsgGrantJson;
}

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
    MsgGrant.fromJSON(normalizeMsgGrantWire(raw)),
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
    encodeTxRawForKeplr(txRaw),
    BroadcastModeKeplr.Sync,
  );

  if (!broadcastResult?.length) {
    throw new Error("Transaction was not broadcast — check wallet for errors");
  }

  const txHash = Buffer.from(broadcastResult).toString("hex");
  await new TxRestApi(networkInfo.rest).fetchTxPoll({ txHash });

  return { txHash };
}

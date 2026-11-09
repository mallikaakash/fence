import { Network, getNetworkEndpoints } from "@injectivelabs/networks";
import {
  ChainGrpcAuthZApi,
  ChainGrpcBankApi,
  MsgBroadcasterWithPk,
  PrivateKey,
} from "@injectivelabs/sdk-ts";

export function networkFromEnv(
  network: "testnet" | "mainnet",
): Network {
  return network === "mainnet" ? Network.MainnetSentry : Network.TestnetSentry;
}

export function lcdRestBaseUrl(network: "testnet" | "mainnet"): string {
  return getNetworkEndpoints(networkFromEnv(network)).rest;
}

/** Always testnet for IntentGuard spike unless explicitly overridden. */
export function spikeNetwork(): Network {
  const n = (process.env.INJECTIVE_NETWORK ?? "testnet").toLowerCase();
  if (n === "mainnet") {
    throw new Error("IntentGuard spike refuses mainnet — set INJECTIVE_NETWORK=testnet");
  }
  return Network.TestnetSentry;
}

export function spikeEndpoints() {
  return getNetworkEndpoints(spikeNetwork());
}

export function createBankApi() {
  return new ChainGrpcBankApi(spikeEndpoints().grpc);
}

export function createAuthZApi() {
  return new ChainGrpcAuthZApi(spikeEndpoints().grpc);
}

export function createBroadcaster(privateKeyHex: string): MsgBroadcasterWithPk {
  const hex = privateKeyHex.replace(/^0x/, "");
  return new MsgBroadcasterWithPk({
    network: spikeNetwork(),
    privateKey: PrivateKey.fromHex(hex),
    simulateTx: true,
    gasBufferCoefficient: 1.4,
  });
}

/**
 * Injective faucet SPA API (needs hCaptcha). Prefer Google Cloud faucet in browser:
 * https://cloud.google.com/application/web3/faucet/injective/testnet
 */
export const TESTNET_FAUCET_URL =
  "https://d1ikjbl0xk5pmx.cloudfront.net/v2/faucet";

/** Allowed market for spike (INJ/USDC PERP on testnet). */
export const SPIKE_ALLOWED_MARKET_ID =
  "0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e";

/** Deliberately wrong market (BTC/USDC PERP) for AuthZ deny proof. */
export const SPIKE_FORBIDDEN_MARKET_ID =
  "0xfd704649cf3a516c0c145ab0111717c44640d8dbe52a462ae35cadf2f6df1515";

import {
  IndexerGrpcAccountApi,
  IndexerGrpcDerivativesApi,
} from "@injectivelabs/sdk-ts";
import { indexerEndpointForNetwork, spikeEndpoints } from "./network.ts";
import { readinessQueryTimeoutMs, withQueryTimeout } from "./queryTimeout.ts";

/**
 * Post-trade checks via Indexer API (api.injective.exchange / sdk-ts).
 * Complements MsgExec broadcast — confirms order + balance state off the tx receipt.
 */
function parseChainBalanceInteger(amount: string | undefined): string | null {
  if (amount === undefined) return "0";
  if (amount === "") return "0";
  if (!/^\d+$/.test(amount)) return null;
  return amount;
}

export async function fetchSubaccountQuoteBalance(params: {
  subaccountId: string;
  denom: string;
  network?: "testnet" | "mainnet";
  timeoutMs?: number;
}): Promise<{ availableBalance: string; totalBalance: string } | null> {
  const network = params.network ?? "testnet";
  const timeoutMs = params.timeoutMs ?? readinessQueryTimeoutMs();
  const indexer = indexerEndpointForNetwork(network);
  const api = new IndexerGrpcAccountApi(indexer);
  try {
    const bal = await withQueryTimeout("indexer.subaccountBalance", timeoutMs, () =>
      api.fetchSubaccountBalance(params.subaccountId, params.denom),
    );
    const available = parseChainBalanceInteger(bal.deposit?.availableBalance);
    const total = parseChainBalanceInteger(bal.deposit?.totalBalance);
    if (available === null || total === null) return null;
    return {
      availableBalance: available,
      totalBalance: total,
    };
  } catch {
    return null;
  }
}

/** Testnet spike default (unchanged behavior for post-exec verify). */
export async function fetchSubaccountUsdcBalance(params: {
  subaccountId: string;
  denom: string;
}): Promise<{ availableBalance: string; totalBalance: string } | null> {
  return fetchSubaccountQuoteBalance({
    subaccountId: params.subaccountId,
    denom: params.denom,
    network: "testnet",
  });
}

export async function fetchOpenDerivativeOrders(params: {
  subaccountId: string;
  marketId?: string;
}): Promise<
  Array<{
    orderHash: string;
    marketId: string;
    orderType: string;
    price: string;
    quantity: string;
    state: string;
  }>
> {
  const endpoints = spikeEndpoints();
  const api = new IndexerGrpcDerivativesApi(endpoints.indexer);
  const res = await api.fetchSubaccountOrdersList({
    subaccountId: params.subaccountId,
    marketId: params.marketId,
  });
  const orders = res.orders ?? [];
  return orders.map((o) => ({
    orderHash: o.orderHash ?? "",
    marketId: o.marketId ?? "",
    orderType: String(o.orderType ?? ""),
    price: o.price ?? "",
    quantity: o.quantity ?? "",
    state: String(o.state ?? ""),
  }));
}

export async function verifyPostExec(params: {
  subaccountId: string;
  marketId: string;
  quoteDenom: string;
}): Promise<{
  openOrders: Awaited<ReturnType<typeof fetchOpenDerivativeOrders>>;
  quoteBalance: Awaited<ReturnType<typeof fetchSubaccountUsdcBalance>>;
}> {
  const [openOrders, quoteBalance] = await Promise.all([
    fetchOpenDerivativeOrders({
      subaccountId: params.subaccountId,
      marketId: params.marketId,
    }),
    fetchSubaccountUsdcBalance({
      subaccountId: params.subaccountId,
      denom: params.quoteDenom,
    }),
  ]);
  return { openOrders, quoteBalance };
}

import {
  IndexerGrpcAccountApi,
  IndexerGrpcDerivativesApi,
} from "@injectivelabs/sdk-ts";
import { spikeEndpoints } from "./network.ts";

/**
 * Post-trade checks via Indexer API (api.injective.exchange / sdk-ts).
 * Complements MsgExec broadcast — confirms order + balance state off the tx receipt.
 */
export async function fetchSubaccountUsdcBalance(params: {
  subaccountId: string;
  denom: string;
}): Promise<{ availableBalance: string; totalBalance: string } | null> {
  const endpoints = spikeEndpoints();
  const api = new IndexerGrpcAccountApi(endpoints.indexer);
  try {
    const bal = await api.fetchSubaccountBalance(
      params.subaccountId,
      params.denom,
    );
    return {
      availableBalance: bal.deposit?.availableBalance ?? "0",
      totalBalance: bal.deposit?.totalBalance ?? "0",
    };
  } catch {
    return null;
  }
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

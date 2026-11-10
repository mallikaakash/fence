import { IndexerGrpcDerivativesApi } from "@injectivelabs/sdk-ts";
import { indexerEndpointForNetwork } from "./network.ts";
import { readinessQueryTimeoutMs, withQueryTimeout } from "./queryTimeout.ts";
import {
  assessIndexerSnapshotComplete,
  hasMoreIndexerPages,
  mergePageDedup,
  nextIndexerSkip,
  type ExchangePagingMeta,
} from "../exposure/exposurePagination.ts";

const MAX_PAGES = 50;
export const EXPOSURE_INDEXER_PAGE_SIZE = 100;

export type IndexerPageResult<T> = {
  items: T[];
  /** False when pagination indicates more rows were not retrieved. */
  paginationComplete: boolean;
  totalReported?: number;
  /** Set when a later page failed but earlier rows may be preserved. */
  error?: string;
};

export type DerivativePositionRow = Record<string, unknown>;
export type DerivativeOrderRow = Record<string, unknown>;

type PageFetcher<T> = (skip: number) => Promise<{
  rows: T[];
  pagination?: ExchangePagingMeta;
}>;

export async function paginateIndexerExchangeRows<T>(params: {
  label: string;
  subaccountId: string;
  network: "testnet" | "mainnet";
  timeoutMs: number;
  rowKey: (row: T) => string;
  fetchPage: PageFetcher<T>;
}): Promise<IndexerPageResult<T>> {
  const items: T[] = [];
  const seen = new Set<string>();
  let skip = 0;
  let pages = 0;
  let totalReported: number | undefined;
  let lastError: string | undefined;
  let stoppedEarly = false;

  while (pages < MAX_PAGES) {
    try {
      const page = await withQueryTimeout(
        `${params.label}.page${pages + 1}`,
        params.timeoutMs,
        () => params.fetchPage(skip),
      );
      if (totalReported === undefined && page.pagination?.total !== undefined) {
        totalReported = Number(page.pagination.total);
      }

      const before = items.length;
      const added = mergePageDedup(items, seen, page.rows, params.rowKey);
      pages++;

      const duplicatesOnly = page.rows.length > 0 && added === 0;
      if (duplicatesOnly) {
        stoppedEarly = true;
        lastError = lastError ?? "duplicate indexer rows on consecutive page";
        break;
      }

      const more = hasMoreIndexerPages({
        pageItemCount: page.rows.length,
        limit: EXPOSURE_INDEXER_PAGE_SIZE,
        collectedCount: items.length,
        paging: page.pagination,
      });

      if (!more) break;

      const nextSkip = nextIndexerSkip(items.length);
      if (nextSkip === skip && page.rows.length > 0) {
        stoppedEarly = true;
        lastError = lastError ?? "pagination offset did not advance";
        break;
      }
      skip = nextSkip;

      if (before === items.length && page.rows.length === 0) break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      stoppedEarly = true;
      break;
    }
  }

  if (pages >= MAX_PAGES) stoppedEarly = true;

  const paginationComplete = assessIndexerSnapshotComplete({
    collectedCount: items.length,
    totalReported,
    pagesFetched: pages,
    maxPages: MAX_PAGES,
    stoppedEarly,
  });

  return {
    items,
    paginationComplete,
    totalReported,
    error: lastError,
  };
}

function positionRowKey(row: DerivativePositionRow): string {
  const marketId = String(row.marketId ?? "");
  const subaccountId = String(row.subaccountId ?? row.subaccount_id ?? "");
  return `${marketId}:${subaccountId}`;
}

function orderRowKey(row: DerivativeOrderRow): string {
  return String(row.orderHash ?? row.order_hash ?? "");
}

export async function fetchSubaccountDerivativePositions(params: {
  subaccountId: string;
  network?: "testnet" | "mainnet";
  timeoutMs?: number;
}): Promise<IndexerPageResult<DerivativePositionRow>> {
  const network = params.network ?? "testnet";
  const timeoutMs = params.timeoutMs ?? readinessQueryTimeoutMs();
  const indexer = indexerEndpointForNetwork(network);
  const api = new IndexerGrpcDerivativesApi(indexer);

  return paginateIndexerExchangeRows({
    label: "indexer.positions",
    subaccountId: params.subaccountId,
    network,
    timeoutMs,
    rowKey: positionRowKey,
    fetchPage: async (skip) => {
      const res = await api.fetchPositions({
        subaccountId: params.subaccountId,
        pagination: { skip, limit: EXPOSURE_INDEXER_PAGE_SIZE },
      });
      const paging = res.pagination as ExchangePagingMeta | undefined;
      return {
        rows: (res.positions ?? []) as unknown as DerivativePositionRow[],
        pagination: paging,
      };
    },
  });
}

export async function fetchSubaccountDerivativeOrders(params: {
  subaccountId: string;
  network?: "testnet" | "mainnet";
  timeoutMs?: number;
}): Promise<IndexerPageResult<DerivativeOrderRow>> {
  const network = params.network ?? "testnet";
  const timeoutMs = params.timeoutMs ?? readinessQueryTimeoutMs();
  const indexer = indexerEndpointForNetwork(network);
  const api = new IndexerGrpcDerivativesApi(indexer);

  return paginateIndexerExchangeRows({
    label: "indexer.orders",
    subaccountId: params.subaccountId,
    network,
    timeoutMs,
    rowKey: orderRowKey,
    fetchPage: async (skip) => {
      const res = await api.fetchSubaccountOrdersList({
        subaccountId: params.subaccountId,
        pagination: { skip, limit: EXPOSURE_INDEXER_PAGE_SIZE },
      });
      const paging = res.pagination as ExchangePagingMeta | undefined;
      return {
        rows: (res.orders ?? []) as unknown as DerivativeOrderRow[],
        pagination: paging,
      };
    },
  });
}

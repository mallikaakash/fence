/**
 * Injective indexer ExchangePagination (SDK @injectivelabs/sdk-ts types/pagination.d.ts
 * + injective_derivative_exchange_rpc.Paging proto).
 *
 * Request: PaginationOption.skip + PaginationOption.limit on fetchPositions /
 * fetchSubaccountOrdersList (proto: skip = offset, limit = max items).
 *
 * Response: total, from, to, countBySubaccount, next[] (page navigation tokens).
 */

export type ExchangePagingMeta = {
  total?: number;
  from?: number;
  to?: number;
  next?: string[];
};

export function hasMoreIndexerPages(params: {
  pageItemCount: number;
  limit: number;
  collectedCount: number;
  paging?: ExchangePagingMeta;
}): boolean {
  const { pageItemCount, limit, collectedCount, paging } = params;
  if (pageItemCount <= 0) return false;

  const nextTokens = paging?.next?.filter((t) => t && t.length > 0) ?? [];
  if (nextTokens.length > 0) return true;

  const total = paging?.total;
  if (total !== undefined && Number.isFinite(total) && total >= 0) {
    return collectedCount < total;
  }

  return pageItemCount >= limit && limit > 0;
}

/** Next skip offset for proto skip/limit pagination (skip = items already collected). */
export function nextIndexerSkip(collectedCount: number): number {
  return collectedCount;
}

export function mergePageDedup<T>(
  items: T[],
  seen: Set<string>,
  rows: T[],
  rowKey: (row: T) => string,
): number {
  let added = 0;
  for (const row of rows) {
    const key = rowKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(row);
    added++;
  }
  return added;
}

export function assessIndexerSnapshotComplete(params: {
  collectedCount: number;
  totalReported?: number;
  pagesFetched: number;
  maxPages: number;
  stoppedEarly: boolean;
  pageHadDuplicatesOnly?: boolean;
}): boolean {
  const { collectedCount, totalReported, pagesFetched, maxPages, stoppedEarly } = params;
  if (stoppedEarly) return false;
  if (pagesFetched >= maxPages) return false;
  if (totalReported !== undefined && Number.isFinite(totalReported)) {
    if (collectedCount < totalReported) return false;
    if (collectedCount > totalReported) return false;
  }
  if (params.pageHadDuplicatesOnly) return false;
  return true;
}

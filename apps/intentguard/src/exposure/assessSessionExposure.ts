import type { GatewaySession } from "../gateway/session.ts";
import { IndexerGrpcDerivativesApi } from "@injectivelabs/sdk-ts";
import { indexerEndpointForNetwork } from "../chain/network.ts";
import { readinessQueryTimeoutMs, withQueryTimeout } from "../chain/queryTimeout.ts";
import {
  fetchSubaccountDerivativeOrders,
  fetchSubaccountDerivativePositions,
  type IndexerPageResult,
} from "../chain/exposureIndexer.ts";
import { assertReadinessNetwork } from "../readiness/network.ts";
import type { MarketMetaMap } from "./marketMeta.ts";
import { buildExposureByQuoteDenom, buildMarketBreakdown } from "./calculateExposure.ts";
import { normalizePosition } from "./normalizePosition.ts";
import {
  classifyDerivativeOrderState,
  derivativeOrderStateRaw,
  normalizeOpenOrder,
  normalizeUnknownStateOrder,
} from "./normalizeOrder.ts";
import type {
  ExposureOverallStatus,
  NormalizedOpenOrder,
  NormalizedUnknownStateOrder,
  SessionExposureResponse,
} from "./types.ts";

export type ExposureDeps = {
  fetchPositions?: typeof fetchSubaccountDerivativePositions;
  fetchOrders?: typeof fetchSubaccountDerivativeOrders;
  loadMarketMap?: (network: "testnet") => Promise<MarketMetaMap>;
  queryTimeoutMs?: number;
};

async function defaultMarketMap(network: "testnet", timeoutMs: number): Promise<MarketMetaMap> {
  const indexer = indexerEndpointForNetwork(network);
  const api = new IndexerGrpcDerivativesApi(indexer);
  const markets = await withQueryTimeout("indexer.markets", timeoutMs, () =>
    api.fetchMarkets(),
  );
  const map: MarketMetaMap = new Map();
  for (const m of markets) {
    const id = m.marketId ?? "";
    if (!id) continue;
    const quoteDecimals = Number(m.quoteToken?.decimals ?? 6);
    map.set(id, {
      ticker: m.ticker ?? id,
      quoteDenom: m.quoteDenom ?? "",
      quoteSymbol: m.quoteToken?.symbol ?? "quote",
      quoteDecimals: Number.isFinite(quoteDecimals) ? quoteDecimals : 6,
    });
  }
  return map;
}

function overallFromSources(
  pos: { status: "available" | "unavailable"; paginationComplete: boolean },
  ord: { status: "available" | "unavailable"; paginationComplete: boolean },
): ExposureOverallStatus {
  if (pos.status === "unavailable" && ord.status === "unavailable") {
    return "unavailable";
  }
  if (
    pos.status === "unavailable" ||
    ord.status === "unavailable" ||
    !pos.paginationComplete ||
    !ord.paginationComplete
  ) {
    return "partial";
  }
  return "available";
}

export async function assessSessionExposure(params: {
  session: GatewaySession;
  network: "testnet" | "mainnet";
  deps?: ExposureDeps;
}): Promise<SessionExposureResponse> {
  const chainNetwork = assertReadinessNetwork(params.network);
  const { session } = params;
  const deps = params.deps ?? {};
  const timeoutMs = deps.queryTimeoutMs ?? readinessQueryTimeoutMs();

  if (!session.subaccountId) {
    const now = new Date().toISOString();
    return {
      sessionId: session.sessionId,
      overallStatus: "unavailable",
      positions: [],
      openOrders: [],
      unknownStateOrders: [],
      summary: {
        positionCount: 0,
        openOrderCount: 0,
        unknownOrderStateCount: 0,
        byQuoteDenom: [],
      },
      warnings: [],
      marketBreakdown: [],
      dataSources: {
        positions: {
          status: "unavailable",
          checkedAt: now,
          error: "session missing subaccountId",
          paginationComplete: false,
        },
        openOrders: {
          status: "unavailable",
          checkedAt: now,
          error: "session missing subaccountId",
          paginationComplete: false,
        },
      },
      subaccount: { subaccountId: "" },
      disclaimer:
        "IntentGuard Exposure is a read-only indexer snapshot — not a risk engine or execution guarantee.",
      retrievedAt: now,
    };
  }

  const subaccountId = session.subaccountId;
  const fetchPositions = deps.fetchPositions ?? fetchSubaccountDerivativePositions;
  const fetchOrders = deps.fetchOrders ?? fetchSubaccountDerivativeOrders;
  const loadMarkets = deps.loadMarketMap ?? ((n) => defaultMarketMap(n, timeoutMs));

  let marketMap: MarketMetaMap = new Map();
  try {
    marketMap = await loadMarkets(chainNetwork);
  } catch {
    marketMap = new Map();
  }

  const [posRes, ordRes] = await Promise.all([
    fetchPositions({ subaccountId, network: chainNetwork, timeoutMs }),
    fetchOrders({ subaccountId, network: chainNetwork, timeoutMs }),
  ]);

  const posCheckedAt = new Date().toISOString();
  const ordCheckedAt = new Date().toISOString();

  const positionsSource = sourceFromPageResult(posRes, posCheckedAt);
  const ordersSource = sourceFromPageResult(ordRes, ordCheckedAt);

  const positions = positionsSource.status === "available"
    ? posRes.items
        .map((r) => normalizePosition(r, marketMap))
        .filter((p): p is NonNullable<typeof p> => p !== null)
    : [];

  const openOrders: NormalizedOpenOrder[] = [];
  const unknownStateOrders: NormalizedUnknownStateOrder[] = [];

  if (ordersSource.status === "available") {
    for (const r of ordRes.items) {
      const state = derivativeOrderStateRaw(r);
      const cls = classifyDerivativeOrderState(state);
      if (cls === "open") {
        const o = normalizeOpenOrder(r, marketMap);
        if (o) openOrders.push(o);
      } else if (cls === "unknown") {
        const o = normalizeUnknownStateOrder(r, marketMap);
        if (o) unknownStateOrders.push(o);
      }
    }
  }

  const summary = {
    positionCount: positions.length,
    openOrderCount: openOrders.length,
    unknownOrderStateCount: unknownStateOrders.length,
    byQuoteDenom: buildExposureByQuoteDenom(positions, openOrders),
  };

  const warnings: string[] = [];
  if (unknownStateOrders.length > 0) {
    warnings.push(
      `${unknownStateOrders.length} order(s) have unrecognized indexer state and are excluded from open-order notional.`,
    );
  }
  if (positionsSource.status === "available" && !positionsSource.paginationComplete) {
    warnings.push(
      positionsSource.error
        ? `Position indexer snapshot incomplete: ${positionsSource.error}`
        : "Position indexer snapshot is incomplete (pagination did not finish).",
    );
  }
  if (ordersSource.status === "available" && !ordersSource.paginationComplete) {
    warnings.push(
      ordersSource.error
        ? `Open-order indexer snapshot incomplete: ${ordersSource.error}`
        : "Open-order indexer snapshot is incomplete (pagination did not finish).",
    );
  }

  const overallStatus = overallFromSources(positionsSource, ordersSource);

  const retrievedAt = new Date().toISOString();

  return {
    sessionId: session.sessionId,
    overallStatus,
    positions,
    openOrders,
    unknownStateOrders,
    summary,
    warnings,
    marketBreakdown: buildMarketBreakdown(positions, openOrders),
    dataSources: {
      positions: {
        status: positionsSource.status,
        checkedAt: posCheckedAt,
        error: positionsSource.error,
        paginationComplete: positionsSource.paginationComplete,
      },
      openOrders: {
        status: ordersSource.status,
        checkedAt: ordCheckedAt,
        error: ordersSource.error,
        paginationComplete: ordersSource.paginationComplete,
      },
    },
    subaccount: { subaccountId },
    disclaimer:
      "IntentGuard Exposure is a read-only indexer-based snapshot. It is not an atomic view of chain state, a complete risk engine, a liquidation predictor, or a guarantee of current execution conditions.",
    retrievedAt,
  };
}

function sourceFromPageResult(
  res: IndexerPageResult<unknown>,
  checkedAt: string,
): {
  status: "available" | "unavailable";
  error: string | null;
  paginationComplete: boolean;
  checkedAt: string;
} {
  if (res.error && res.items.length === 0) {
    return {
      status: "unavailable",
      error: res.error,
      paginationComplete: false,
      checkedAt,
    };
  }
  return {
    status: "available",
    error: res.error ?? null,
    paginationComplete: res.error ? false : res.paginationComplete,
    checkedAt,
  };
}

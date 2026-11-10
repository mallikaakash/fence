import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GatewaySession } from "../gateway/session.ts";
import { assessSessionExposure } from "./assessSessionExposure.ts";
import type { MarketMetaMap } from "./marketMeta.ts";
import { SPIKE_ALLOWED_MARKET_ID } from "../chain/network.ts";
import { ReadinessNetworkRejectedError } from "../readiness/network.ts";

function session(over: Partial<GatewaySession> = {}): GatewaySession {
  return {
    sessionId: "sess_exposure",
    agentApiToken: "agt_x",
    granteeAddress: "inj1grantee",
    granteePrivateKeyHex: "a".repeat(64),
    policy: {
      version: 1,
      marketIds: [SPIKE_ALLOWED_MARKET_ID],
      maxMarginPerOrder: "10",
      maxOrderNotional: "100",
      maxLeverage: 3,
      dailyMarginBudget: "500",
    },
    dailyMarginUsed: "0",
    revoked: false,
    createdAt: new Date().toISOString(),
    subaccountId:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890000001",
    subaccountIndex: 1,
    ...over,
  };
}

const marketMap: MarketMetaMap = new Map([
  [
    SPIKE_ALLOWED_MARKET_ID,
    {
      ticker: "INJ/USDC PERP",
      quoteDenom: "erc20:0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d",
      quoteSymbol: "USDC",
      quoteDecimals: 6,
    },
  ],
]);

describe("assessSessionExposure", () => {
  it("empty successful indexer → available, not confused with failure", async () => {
    const res = await assessSessionExposure({
      session: session(),
      network: "testnet",
      deps: {
        loadMarketMap: async () => marketMap,
        fetchPositions: async () => ({
          items: [],
          paginationComplete: true,
        }),
        fetchOrders: async () => ({
          items: [],
          paginationComplete: true,
        }),
      },
    });
    assert.equal(res.overallStatus, "available");
    assert.equal(res.positions.length, 0);
    assert.equal(res.dataSources.positions.status, "available");
  });

  it("position failure → partial, positions not fabricated", async () => {
    const res = await assessSessionExposure({
      session: session(),
      network: "testnet",
      deps: {
        loadMarketMap: async () => marketMap,
        fetchPositions: async () => ({
          items: [],
          paginationComplete: false,
          error: "indexer down",
        }),
        fetchOrders: async () => ({
          items: [],
          paginationComplete: true,
        }),
      },
    });
    assert.equal(res.dataSources.positions.status, "unavailable");
    assert.equal(res.overallStatus, "partial");
    assert.equal(res.positions.length, 0);
  });

  it("both sources fail → unavailable", async () => {
    const res = await assessSessionExposure({
      session: session(),
      network: "testnet",
      deps: {
        loadMarketMap: async () => marketMap,
        fetchPositions: async () => ({
          items: [],
          paginationComplete: false,
          error: "down",
        }),
        fetchOrders: async () => ({
          items: [],
          paginationComplete: false,
          error: "down",
        }),
      },
    });
    assert.equal(res.overallStatus, "unavailable");
  });

  it("partial_filled order counts as open, unknown state excluded from open count", async () => {
    const res = await assessSessionExposure({
      session: session(),
      network: "testnet",
      deps: {
        loadMarketMap: async () => marketMap,
        fetchPositions: async () => ({ items: [], paginationComplete: true }),
        fetchOrders: async () => ({
          items: [
            {
              marketId: SPIKE_ALLOWED_MARKET_ID,
              orderHash: "0xpartial",
              quantity: "1",
              price: "5",
              state: "partial_filled",
              orderSide: "buy",
            },
            {
              marketId: SPIKE_ALLOWED_MARKET_ID,
              orderHash: "0xweird",
              quantity: "1",
              price: "5",
              state: "pending_magic",
              orderSide: "sell",
            },
          ],
          paginationComplete: true,
        }),
      },
    });
    assert.equal(res.summary.openOrderCount, 1);
    assert.equal(res.summary.unknownOrderStateCount, 1);
    assert.equal(res.unknownStateOrders.length, 1);
    assert.ok(res.warnings.length >= 1);
  });

  it("partial indexer page preserves positions", async () => {
    const res = await assessSessionExposure({
      session: session(),
      network: "testnet",
      deps: {
        loadMarketMap: async () => marketMap,
        fetchPositions: async () => ({
          items: [
            {
              marketId: SPIKE_ALLOWED_MARKET_ID,
              quantity: "1",
              direction: "buy",
              markPrice: "10",
            },
          ],
          paginationComplete: false,
          error: "indexer.positions.page2 timed out after 12000ms",
        }),
        fetchOrders: async () => ({ items: [], paginationComplete: true }),
      },
    });
    assert.equal(res.positions.length, 1);
    assert.equal(res.overallStatus, "partial");
    assert.equal(res.dataSources.positions.status, "available");
    assert.equal(res.dataSources.positions.paginationComplete, false);
  });

  it("normalizes one long position", async () => {
    const res = await assessSessionExposure({
      session: session(),
      network: "testnet",
      deps: {
        loadMarketMap: async () => marketMap,
        fetchPositions: async () => ({
          items: [
            {
              marketId: SPIKE_ALLOWED_MARKET_ID,
              quantity: "1.5",
              direction: "buy",
              markPrice: "20",
              entryPrice: "19",
            },
          ],
          paginationComplete: true,
        }),
        fetchOrders: async () => ({ items: [], paginationComplete: true }),
      },
    });
    assert.equal(res.positions.length, 1);
    assert.equal(res.positions[0]!.direction, "long");
    assert.equal(res.summary.positionCount, 1);
  });

  it("rejects mainnet", async () => {
    await assert.rejects(
      () => assessSessionExposure({ session: session(), network: "mainnet" }),
      ReadinessNetworkRejectedError,
    );
  });
});

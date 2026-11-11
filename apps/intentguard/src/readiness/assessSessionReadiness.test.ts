import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GatewaySession } from "../gateway/session.ts";
import type { SessionGrantStatus } from "../authz/verifySessionGrant.ts";
import {
  assessSessionReadiness,
  readinessStatusForTests,
} from "./assessSessionReadiness.ts";
import type { InjBalanceQuery } from "../chain/bank.ts";
import type { DerivativeMarketQuery } from "../chain/market.ts";
import { SPIKE_ALLOWED_MARKET_ID } from "../chain/network.ts";
import { ReadinessNetworkRejectedError } from "./network.ts";

function baseSession(over: Partial<GatewaySession> = {}): GatewaySession {
  return {
    sessionId: "sess_test",
    agentApiToken: "agt_test",
    granteeAddress: "inj1grantee0000000000000000000000000000test",
    granteePrivateKeyHex: "a".repeat(64),
    policy: {
      version: 1,
      marketIds: [SPIKE_ALLOWED_MARKET_ID],
      maxMarginPerOrder: "10",
      maxOrderNotional: "100",
      maxLeverage: 5,
      dailyMarginBudget: "500",
    },
    dailyMarginUsed: "0",
    revoked: false,
    createdAt: new Date().toISOString(),
    ownerInjectiveAddress: "inj1owner00000000000000000000000000000test",
    subaccountId:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890000001",
    subaccountIndex: 1,
    ...over,
  };
}

function grantReady(): SessionGrantStatus {
  return {
    granter: "inj1owner",
    grantee: "inj1grantee",
    network: "testnet",
    ready: true,
    limitReady: true,
    cancelReady: true,
    scopeMatch: true,
    matchingGrants: 2,
    issues: [],
    userFacingIssues: [],
    endpoint: "https://testnet.sentry.lcd.injective.network/...",
    grantsSummary: [],
    onChainLimitScopes: [
      {
        subaccountId: "0xsub",
        marketIds: [SPIKE_ALLOWED_MARKET_ID],
      },
    ],
  };
}

const marketOk: DerivativeMarketQuery = {
  status: "ok",
  market: {
    marketId: SPIKE_ALLOWED_MARKET_ID,
    ticker: "INJ/USDC PERP",
    quoteDenom: "erc20:0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d",
    quoteSymbol: "USDC",
    quoteDecimals: 6,
    marketStatus: "active",
    isPerpetual: true,
    indexerEndpoint: "https://testnet.indexer",
  },
};

describe("assessSessionReadiness (mocked chain)", () => {
  it("all checks passing → overall ready", async () => {
    const res = await assessSessionReadiness({
      session: baseSession(),
      network: "testnet",
      deps: {
        verifyGrants: async () => grantReady(),
        queryInj: async () => ({
          status: "ok",
          amount: "500000000000000000",
          amountWei: 500000000000000000n,
          source: "grpc",
        }),
        fetchMarket: async () => marketOk,
        fetchSubaccountBalance: async () => ({
          availableBalance: "50000000",
          totalBalance: "50000000",
        }),
      },
    });
    assert.equal(res.overallStatus, "ready");
    assert.equal(res.checks.grants.status, "ready");
    assert.equal(res.checks.granteeGas.status, "ready");
    assert.equal(res.checks.subaccountCollateral.status, "ready");
    assert.equal(res.checks.market.status, "ready");
  });

  it("grants ready but subaccount below policy margin → action_required (G4 pattern)", async () => {
    const res = await assessSessionReadiness({
      session: baseSession({ policy: { ...baseSession().policy, maxMarginPerOrder: "50" } }),
      network: "testnet",
      deps: {
        verifyGrants: async () => grantReady(),
        queryInj: async () => ({
          status: "ok",
          amount: "200000000000000000",
          amountWei: 200000000000000000n,
          source: "grpc",
        }),
        fetchMarket: async () => marketOk,
        fetchSubaccountBalance: async () => ({
          availableBalance: "0",
          totalBalance: "0",
        }),
      },
    });
    assert.equal(res.checks.grants.status, "ready");
    assert.equal(res.checks.subaccountCollateral.status, "action_required");
    assert.equal(res.overallStatus, "action_required");
    assert.match(res.checks.subaccountCollateral.summary ?? "", /USDC/i);
  });

  it("missing grants → action_required", async () => {
    const res = await assessSessionReadiness({
      session: baseSession(),
      network: "testnet",
      deps: {
        verifyGrants: async () => ({
          ...grantReady(),
          ready: false,
          limitReady: false,
          userFacingIssues: ["Wallet permission is not active yet."],
          issues: ["no AuthZ grants"],
        }),
        queryInj: async () => ({
          status: "ok",
          amount: "1",
          amountWei: 1n,
          source: "grpc",
        }),
        fetchMarket: async () => marketOk,
        fetchSubaccountBalance: async () => ({
          availableBalance: "0",
          totalBalance: "0",
        }),
      },
    });
    assert.equal(res.checks.grants.status, "action_required");
    assert.equal(res.overallStatus, "action_required");
  });

  it("expired grants → action_required", async () => {
    const res = await assessSessionReadiness({
      session: baseSession(),
      network: "testnet",
      deps: {
        verifyGrants: async () => ({
          ...grantReady(),
          ready: false,
          issues: ["place-order permission expired"],
          userFacingIssues: ["Wallet permission expired."],
        }),
        queryInj: async () => ({
          status: "ok",
          amount: "500000000000000000",
          amountWei: 500000000000000000n,
          source: "grpc",
        }),
        fetchMarket: async () => marketOk,
        fetchSubaccountBalance: async () => ({
          availableBalance: "50000000",
          totalBalance: "50000000",
        }),
      },
    });
    assert.match(res.checks.grants.summary, /expired/i);
  });

  it("insufficient grantee INJ", async () => {
    const res = await assessSessionReadiness({
      session: baseSession(),
      network: "testnet",
      deps: {
        verifyGrants: async () => grantReady(),
        queryInj: async () => ({
          status: "ok",
          amount: "0",
          amountWei: 0n,
          source: "grpc",
        }),
        fetchMarket: async () => marketOk,
        fetchSubaccountBalance: async () => ({
          availableBalance: "50000000",
          totalBalance: "50000000",
        }),
      },
    });
    assert.equal(res.checks.granteeGas.status, "action_required");
    assert.match(res.checks.granteeGas.summary, /INJ/i);
  });

  it("missing subaccount collateral", async () => {
    const res = await assessSessionReadiness({
      session: baseSession(),
      network: "testnet",
      deps: {
        verifyGrants: async () => grantReady(),
        queryInj: async () => ({
          status: "ok",
          amount: "500000000000000000",
          amountWei: 500000000000000000n,
          source: "grpc",
        }),
        fetchMarket: async () => marketOk,
        fetchSubaccountBalance: async () => ({
          availableBalance: "0",
          totalBalance: "0",
        }),
      },
    });
    assert.equal(res.checks.subaccountCollateral.status, "action_required");
    assert.equal(res.market.quoteSymbol, "USDC");
  });

  it("inactive market", async () => {
    const res = await assessSessionReadiness({
      session: baseSession(),
      network: "testnet",
      deps: {
        verifyGrants: async () => grantReady(),
        queryInj: async () => ({
          status: "ok",
          amount: "500000000000000000",
          amountWei: 500000000000000000n,
          source: "grpc",
        }),
        fetchMarket: async () => ({
          status: "ok",
          market: { ...marketOk.market!, marketStatus: "paused" },
        }),
        fetchSubaccountBalance: async () => ({
          availableBalance: "50000000",
          totalBalance: "50000000",
        }),
      },
    });
    assert.equal(res.checks.market.status, "action_required");
  });

  it("LCD / bank unavailable", async () => {
    const res = await assessSessionReadiness({
      session: baseSession(),
      network: "testnet",
      deps: {
        verifyGrants: async () => grantReady(),
        queryInj: async (): Promise<InjBalanceQuery> => ({
          status: "unavailable",
          error: "bank LCD 503",
        }),
        fetchMarket: async () => marketOk,
        fetchSubaccountBalance: async () => ({
          availableBalance: "50000000",
          totalBalance: "50000000",
        }),
      },
    });
    assert.equal(res.checks.granteeGas.status, "unavailable");
    assert.equal(res.overallStatus, "unavailable");
  });

  it("partial indexer failure → unavailable overall", async () => {
    const res = await assessSessionReadiness({
      session: baseSession(),
      network: "testnet",
      deps: {
        verifyGrants: async () => grantReady(),
        queryInj: async () => ({
          status: "ok",
          amount: "500000000000000000",
          amountWei: 500000000000000000n,
          source: "grpc",
        }),
        fetchMarket: async (): Promise<DerivativeMarketQuery> => ({
          status: "unavailable",
          error: "indexer down",
          indexerEndpoint: "https://testnet.indexer",
        }),
        fetchSubaccountBalance: async () => null,
      },
    });
    assert.equal(res.checks.market.status, "unavailable");
    assert.equal(res.overallStatus, "unavailable");
  });

  it("invalid maxMarginPerOrder never yields collateral ready", async () => {
    const res = await assessSessionReadiness({
      session: baseSession({ policy: { ...baseSession().policy, maxMarginPerOrder: "not-a-number" } }),
      network: "testnet",
      deps: {
        verifyGrants: async () => grantReady(),
        queryInj: async () => ({
          status: "ok",
          amount: "500000000000000000",
          amountWei: 500000000000000000n,
          source: "grpc",
        }),
        fetchMarket: async () => marketOk,
        fetchSubaccountBalance: async () => ({
          availableBalance: "999999999",
          totalBalance: "999999999",
        }),
      },
    });
    assert.equal(res.checks.subaccountCollateral.status, "action_required");
    assert.notEqual(res.checks.subaccountCollateral.status, "ready");
  });

  it("limit-only on-chain scope does not make market ready", async () => {
    const sub = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890000001";
    const res = await assessSessionReadiness({
      session: baseSession(),
      network: "testnet",
      deps: {
        verifyGrants: async () => ({
          ...grantReady(),
          ready: false,
          limitReady: true,
          cancelReady: false,
          grantsSummary: [
            {
              authorizationType: "CreateDerivativeLimitOrderAuthz",
              subaccountId: sub,
              marketIds: [SPIKE_ALLOWED_MARKET_ID],
            },
          ],
        }),
        queryInj: async () => ({
          status: "ok",
          amount: "500000000000000000",
          amountWei: 500000000000000000n,
          source: "grpc",
        }),
        fetchMarket: async () => marketOk,
        fetchSubaccountBalance: async () => ({
          availableBalance: "50000000",
          totalBalance: "50000000",
        }),
      },
    });
    assert.equal(res.checks.market.status, "action_required");
    assert.notEqual(res.checks.market.status, "ready");
  });

  it("market outside session policy → action_required", async () => {
    const res = await assessSessionReadiness({
      session: baseSession(),
      network: "testnet",
      marketId: "0xfd704649cf3a516c0c145ab0111717c44640d8dbe52a462ae35cadf2f6df1515",
      deps: {
        verifyGrants: async () => grantReady(),
        queryInj: async () => ({
          status: "ok",
          amount: "500000000000000000",
          amountWei: 500000000000000000n,
          source: "grpc",
        }),
        fetchMarket: async () => marketOk,
        fetchSubaccountBalance: async () => ({
          availableBalance: "50000000",
          totalBalance: "50000000",
        }),
      },
    });
    assert.equal(res.checks.market.status, "action_required");
  });

  it("checkedAt is set after assessment work completes", async () => {
    const start = Date.now();
  let endWork = start;
    const res = await assessSessionReadiness({
      session: baseSession(),
      network: "testnet",
      deps: {
        verifyGrants: async () => {
          await new Promise((r) => setTimeout(r, 25));
          endWork = Date.now();
          return grantReady();
        },
        queryInj: async () => ({
          status: "ok",
          amount: "500000000000000000",
          amountWei: 500000000000000000n,
          source: "grpc",
        }),
        fetchMarket: async () => marketOk,
        fetchSubaccountBalance: async () => ({
          availableBalance: "50000000",
          totalBalance: "50000000",
        }),
      },
    });
    const checked = Date.parse(res.checkedAt);
    assert.ok(checked >= endWork - 5);
  });

  it("rejects mainnet network", async () => {
    await assert.rejects(
      () =>
        assessSessionReadiness({
          session: baseSession(),
          network: "mainnet",
        }),
      ReadinessNetworkRejectedError,
    );
  });

  it("grant query timeout → grants unavailable", async () => {
    const res = await assessSessionReadiness({
      session: baseSession(),
      network: "testnet",
      deps: {
        queryTimeoutMs: 5,
        verifyGrants: async () => {
          await new Promise((r) => setTimeout(r, 50));
          return grantReady();
        },
        queryInj: async () => ({
          status: "ok",
          amount: "500000000000000000",
          amountWei: 500000000000000000n,
          source: "grpc",
        }),
        fetchMarket: async () => marketOk,
        fetchSubaccountBalance: async () => ({
          availableBalance: "50000000",
          totalBalance: "50000000",
        }),
      },
    });
    assert.equal(res.checks.grants.status, "unavailable");
    assert.equal(res.overallStatus, "unavailable");
  });

  it("aggregate never ready when any check unavailable", () => {
    assert.equal(
      readinessStatusForTests(["ready", "ready", "ready", "unavailable"]),
      "unavailable",
    );
    assert.equal(
      readinessStatusForTests(["ready", "action_required", "ready", "ready"]),
      "action_required",
    );
  });
});

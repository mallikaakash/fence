import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateTradeIntent } from "./evaluate.ts";
import type { IntentGuardPolicy } from "./types.ts";

const BTC = "0xBTCMARKET";
const ETH = "0xETHMARKET";

const basePolicy: IntentGuardPolicy = {
  version: 1,
  marketIds: [BTC, ETH],
  maxMarginPerOrder: "200",
  maxLeverage: 3,
  dailyMarginBudget: "500",
  reduceOnlyAlwaysAllowed: true,
};

describe("evaluateTradeIntent", () => {
  it("allows an in-policy order", () => {
    const d = evaluateTradeIntent(basePolicy, {
      marketId: ETH,
      margin: "100",
      leverage: 2,
      side: "long",
    });
    assert.equal(d.allow, true);
  });

  it("denies market not on allowlist", () => {
    const d = evaluateTradeIntent(basePolicy, {
      marketId: "0xSICI",
      margin: "50",
      leverage: 2,
    });
    assert.equal(d.allow, false);
    assert.match(d.reasons.join(" "), /not in allowlist/);
  });

  it("denies oversize margin", () => {
    const d = evaluateTradeIntent(basePolicy, {
      marketId: BTC,
      margin: "201",
      leverage: 2,
    });
    assert.equal(d.allow, false);
    assert.match(d.reasons.join(" "), /maxMarginPerOrder/);
  });

  it("denies over-leverage", () => {
    const d = evaluateTradeIntent(basePolicy, {
      marketId: BTC,
      margin: "50",
      leverage: 10,
    });
    assert.equal(d.allow, false);
    assert.match(d.reasons.join(" "), /leverage/);
  });

  it("denies when daily budget would be exceeded", () => {
    const d = evaluateTradeIntent(
      basePolicy,
      { marketId: BTC, margin: "100", leverage: 2 },
      { dailyMarginUsed: "450" },
    );
    assert.equal(d.allow, false);
    assert.match(d.reasons.join(" "), /daily/);
  });

  it("denies after expiry", () => {
    const d = evaluateTradeIntent(
      { ...basePolicy, expiresAt: "2020-01-01T00:00:00Z" },
      { marketId: BTC, margin: "50", leverage: 2 },
      { nowMs: Date.parse("2026-11-09T00:00:00Z") },
    );
    assert.equal(d.allow, false);
    assert.match(d.reasons.join(" "), /expired/);
  });

  it("always allows reduce-only when configured", () => {
    const d = evaluateTradeIntent(basePolicy, {
      marketId: "0xANY",
      margin: "9999",
      leverage: 50,
      reduceOnly: true,
    });
    assert.equal(d.allow, true);
  });

  it("denies all when marketIds empty", () => {
    const d = evaluateTradeIntent(
      { ...basePolicy, marketIds: [] },
      { marketId: BTC, margin: "10", leverage: 1 },
    );
    assert.equal(d.allow, false);
  });

  it("denies when price×quantity exceeds maxOrderNotional", () => {
    const d = evaluateTradeIntent(
      { ...basePolicy, maxOrderNotional: "100" },
      {
        marketId: BTC,
        margin: "50",
        leverage: 2,
        price: "50",
        quantity: "3",
      },
    );
    assert.equal(d.allow, false);
    assert.match(d.reasons.join(" "), /notional/);
  });

  it("allows when notional within maxOrderNotional", () => {
    const d = evaluateTradeIntent(
      { ...basePolicy, maxOrderNotional: "200" },
      {
        marketId: BTC,
        margin: "50",
        leverage: 2,
        price: "50",
        quantity: "2",
      },
    );
    assert.equal(d.allow, true);
    assert.match(d.reasons.join(" "), /notional/);
  });
});

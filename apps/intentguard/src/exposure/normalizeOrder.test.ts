import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SPIKE_ALLOWED_MARKET_ID } from "../chain/network.ts";
import type { MarketMetaMap } from "./marketMeta.ts";
import { isConfirmedOpenDerivativeOrderState, normalizeOpenOrder, normalizeUnknownStateOrder } from "./normalizeOrder.ts";

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

const row = (state: string) => ({
  marketId: SPIKE_ALLOWED_MARKET_ID,
  orderHash: `0x${state}`,
  quantity: "2",
  price: "10",
  fillQuantity: "0.5",
  state,
  orderSide: "buy",
});

describe("normalizeOpenOrder states", () => {
  it("includes partial_filled", () => {
    const o = normalizeOpenOrder(row("partial_filled"), marketMap);
    assert.ok(o);
    assert.equal(o!.state, "partial_filled");
    assert.equal(o!.notional?.status, "available");
  });

  it("excludes filled terminal state", () => {
    assert.equal(normalizeOpenOrder(row("filled"), marketMap), null);
  });

  it("does not treat unknown as open", () => {
    assert.equal(isConfirmedOpenDerivativeOrderState("weird"), false);
    assert.equal(normalizeOpenOrder(row("weird"), marketMap), null);
    const u = normalizeUnknownStateOrder(row("weird"), marketMap);
    assert.ok(u);
    assert.equal(u!.stateClassification, "unknown");
    assert.equal(u!.notional, undefined);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExposureByQuoteDenom,
  computeOrderNotional,
  computePositionNotional,
} from "./calculateExposure.ts";
import type { NormalizedOpenOrder, NormalizedPosition } from "./types.ts";

describe("exposure calculateExposure", () => {
  it("position notional uses mark price", () => {
    const p: NormalizedPosition = {
      marketId: "0xm",
      direction: "long",
      quantity: "2",
      markPrice: "10",
      quoteDenom: "erc20:usdc",
    };
    const n = computePositionNotional(p);
    assert.equal(n.status, "available");
    if (n.status === "available") {
      assert.equal(n.referencePriceField, "markPrice");
      assert.equal(n.human, "20");
    }
  });

  it("missing price → notional unavailable (not zero)", () => {
    const p: NormalizedPosition = {
      marketId: "0xm",
      direction: "long",
      quantity: "2",
      quoteDenom: "erc20:usdc",
    };
    assert.equal(computePositionNotional(p).status, "unavailable");
  });

  it("groups long and short by quote denom", () => {
    const positions: NormalizedPosition[] = [
      {
        marketId: "0xa",
        direction: "long",
        quantity: "1",
        markPrice: "100",
        quoteDenom: "erc20:usdc",
        quoteSymbol: "USDC",
        notional: {
          status: "available",
          human: "100",
          quoteDenom: "erc20:usdc",
          referencePrice: "100",
          referencePriceField: "markPrice",
        },
      },
      {
        marketId: "0xb",
        direction: "short",
        quantity: "1",
        markPrice: "50",
        quoteDenom: "erc20:usdc",
        quoteSymbol: "USDC",
        notional: {
          status: "available",
          human: "50",
          quoteDenom: "erc20:usdc",
          referencePrice: "50",
          referencePriceField: "markPrice",
        },
      },
    ];
    const by = buildExposureByQuoteDenom(positions, []);
    assert.equal(by.length, 1);
    assert.equal(by[0]!.longPositionNotional.status, "available");
    assert.equal(by[0]!.shortPositionNotional.status, "available");
  });

  it("open order notional uses limit price × remaining qty", () => {
    const o: NormalizedOpenOrder = {
      orderHash: "0xh",
      marketId: "0xm",
      direction: "buy",
      quantity: "2",
      fillQuantity: "0.5",
      limitPrice: "10",
      state: "booked",
      quoteDenom: "erc20:usdc",
    };
    const n = computeOrderNotional(o);
    assert.equal(n.status, "available");
    if (n.status === "available") assert.equal(n.human, "15");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  marketIdsCoverPolicy,
  parseLcdAuthorization,
  subaccountsMatch,
} from "./parseLcdAuthz.ts";

const SPIKE_MARKET =
  "0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e";

describe("parseLcdAuthorization", () => {
  it("parses expanded testnet LCD JSON", () => {
    const parsed = parseLcdAuthorization({
      "@type": "/injective.exchange.v1beta1.CreateDerivativeLimitOrderAuthz",
      subaccount_id:
        "0x20d825cbc889a2f79797dbe374403148f9acd76d000000000000000000000001",
      market_ids: [SPIKE_MARKET],
    });
    assert.ok(parsed?.subaccountId?.startsWith("0x"));
    assert.deepEqual(parsed?.marketIds, [SPIKE_MARKET]);
  });

  it("validates policy market coverage", () => {
    assert.equal(
      marketIdsCoverPolicy([SPIKE_MARKET], [SPIKE_MARKET.toUpperCase()]),
      true,
    );
    assert.equal(marketIdsCoverPolicy([SPIKE_MARKET], ["0xother"]), false);
  });

  it("matches subaccounts case-insensitively", () => {
    assert.equal(
      subaccountsMatch(
        "0xABC",
        "0xabc",
      ),
      true,
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePolicyQuoteAmount } from "./policyAmount.ts";

describe("parsePolicyQuoteAmount", () => {
  it("rejects empty and malformed values", () => {
    assert.equal(parsePolicyQuoteAmount("", 6).ok, false);
    assert.equal(parsePolicyQuoteAmount("  ", 6).ok, false);
    assert.equal(parsePolicyQuoteAmount("abc", 6).ok, false);
    assert.equal(parsePolicyQuoteAmount("-1", 6).ok, false);
    assert.equal(parsePolicyQuoteAmount("0", 6).ok, false);
  });

  it("converts decimals without float math", () => {
    const r = parsePolicyQuoteAmount("10.5", 6);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.chainUnits, 10_500_000n);
    }
  });
});

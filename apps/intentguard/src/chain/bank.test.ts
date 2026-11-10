import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatInjHuman,
  minGranteeInjAmountWei,
  parseInjAmountWei,
} from "./bank.ts";

describe("chain/bank", () => {
  it("default min grantee INJ is ~0.2 INJ wei", () => {
    const prev = process.env.INTENTGUARD_READINESS_MIN_GRANTEE_INJ;
    delete process.env.INTENTGUARD_READINESS_MIN_GRANTEE_INJ;
    const wei = minGranteeInjAmountWei();
    assert.equal(wei, 200_000_000_000_000_000n);
    assert.equal(formatInjHuman(wei), "0.2");
    if (prev) process.env.INTENTGUARD_READINESS_MIN_GRANTEE_INJ = prev;
  });

  it("parseInjAmountWei treats missing inj as zero without fallback", () => {
    assert.equal(parseInjAmountWei(undefined), 0n);
    assert.equal(parseInjAmountWei("0"), 0n);
    assert.equal(parseInjAmountWei("not-digits"), null);
  });
});

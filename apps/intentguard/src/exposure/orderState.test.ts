import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyDerivativeOrderState,
  isConfirmedOpenDerivativeOrderState,
  normalizeDerivativeOrderStateKey,
} from "./orderState.ts";

describe("derivative order state classification", () => {
  for (const state of ["booked", "BOOKED", "Booked"]) {
    it(`open: ${state}`, () => {
      assert.equal(classifyDerivativeOrderState(state), "open");
      assert.equal(isConfirmedOpenDerivativeOrderState(state), true);
    });
  }

  for (const state of ["partial_filled", "PARTIAL_FILLED", "Partial-Filled"]) {
    it(`open partial: ${state}`, () => {
      assert.equal(classifyDerivativeOrderState(state), "open");
      assert.equal(isConfirmedOpenDerivativeOrderState(state), true);
    });
  }

  for (const state of ["filled", "FILLED", "cancelled", "CANCELLED", "canceled", "expired", "EXPIRED"]) {
    it(`closed: ${state}`, () => {
      assert.equal(classifyDerivativeOrderState(state), "closed");
      assert.equal(isConfirmedOpenDerivativeOrderState(state), false);
    });
  }

  it("empty state is unknown, not open", () => {
    assert.equal(classifyDerivativeOrderState(""), "unknown");
    assert.equal(classifyDerivativeOrderState("   "), "unknown");
  });

  it("unexpected enum is unknown", () => {
    assert.equal(classifyDerivativeOrderState("pending_custom"), "unknown");
  });

  it("normalizeDerivativeOrderStateKey", () => {
    assert.equal(normalizeDerivativeOrderStateKey(" partial-filled "), "PARTIAL_FILLED");
  });
});

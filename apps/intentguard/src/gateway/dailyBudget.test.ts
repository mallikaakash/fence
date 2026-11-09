import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureDailyMarginCurrentDay, utcDayKey } from "./dailyBudget.ts";

describe("dailyBudget", () => {
  it("resets used margin on new UTC day", () => {
    const session = { dailyMarginUsed: "99", dailyMarginDay: "2020-01-01" };
    ensureDailyMarginCurrentDay(session, Date.parse("2020-01-02T00:00:00.000Z"));
    assert.equal(session.dailyMarginUsed, "0");
    assert.equal(session.dailyMarginDay, "2020-01-02");
  });

  it("keeps used margin same day", () => {
    const day = utcDayKey();
    const session = { dailyMarginUsed: "42", dailyMarginDay: day };
    ensureDailyMarginCurrentDay(session);
    assert.equal(session.dailyMarginUsed, "42");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  exposureHeadline,
  exposurePanelClass,
  exposureSectionCaption,
} from "./exposure.ts";

describe("exposure UI helpers", () => {
  it("does not use success styling for partial/unavailable", () => {
    assert.ok(!exposurePanelClass("partial").includes("green"));
    assert.ok(!exposurePanelClass("unavailable").includes("green"));
    assert.match(exposureHeadline("unavailable"), /Could not load/i);
  });

  it("section captions distinguish empty vs unavailable", () => {
    assert.match(
      exposureSectionCaption({
        kind: "positions",
        source: { status: "available", checkedAt: "", error: null, paginationComplete: true },
        itemCount: 0,
        overallStatus: "available",
      }),
      /No open positions/i,
    );
    assert.match(
      exposureSectionCaption({
        kind: "positions",
        source: { status: "unavailable", checkedAt: "", error: "oracle data not found" },
        itemCount: 0,
        overallStatus: "unavailable",
      }),
      /unavailable/i,
    );
    assert.match(
      exposureSectionCaption({
        kind: "openOrders",
        source: {
          status: "available",
          checkedAt: "",
          error: null,
          paginationComplete: false,
        },
        itemCount: 1,
        overallStatus: "partial",
      }),
      /incomplete/i,
    );
  });
});

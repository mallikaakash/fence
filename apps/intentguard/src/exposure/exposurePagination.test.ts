import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessIndexerSnapshotComplete,
  hasMoreIndexerPages,
  mergePageDedup,
  nextIndexerSkip,
} from "./exposurePagination.ts";

describe("exposurePagination", () => {
  it("hasMore uses total when no next tokens", () => {
    assert.equal(
      hasMoreIndexerPages({
        pageItemCount: 100,
        limit: 100,
        collectedCount: 100,
        paging: { total: 250 },
      }),
      true,
    );
    assert.equal(
      hasMoreIndexerPages({
        pageItemCount: 50,
        limit: 100,
        collectedCount: 250,
        paging: { total: 250 },
      }),
      false,
    );
  });

  it("hasMore respects next token array", () => {
    assert.equal(
      hasMoreIndexerPages({
        pageItemCount: 1,
        limit: 100,
        collectedCount: 1,
        paging: { next: ["token"], total: 1 },
      }),
      true,
    );
  });

  it("full page without total implies more", () => {
    assert.equal(
      hasMoreIndexerPages({
        pageItemCount: 100,
        limit: 100,
        collectedCount: 100,
        paging: {},
      }),
      true,
    );
  });

  it("empty page stops", () => {
    assert.equal(
      hasMoreIndexerPages({
        pageItemCount: 0,
        limit: 100,
        collectedCount: 10,
        paging: { total: 99 },
      }),
      false,
    );
  });

  it("nextIndexerSkip equals collected count", () => {
    assert.equal(nextIndexerSkip(200), 200);
  });

  it("mergePageDedup skips duplicates", () => {
    const items: { id: string }[] = [];
    const seen = new Set<string>();
    mergePageDedup(items, seen, [{ id: "a" }, { id: "a" }], (r) => r.id);
    assert.equal(items.length, 1);
    mergePageDedup(items, seen, [{ id: "a" }, { id: "b" }], (r) => r.id);
    assert.equal(items.length, 2);
  });

  it("assessIndexerSnapshotComplete", () => {
    assert.equal(
      assessIndexerSnapshotComplete({
        collectedCount: 100,
        totalReported: 50,
        pagesFetched: 1,
        maxPages: 50,
        stoppedEarly: false,
      }),
      false,
      "collected exceeds reported total",
    );
    assert.equal(
      assessIndexerSnapshotComplete({
        collectedCount: 50,
        totalReported: 50,
        pagesFetched: 2,
        maxPages: 50,
        stoppedEarly: false,
      }),
      true,
    );
  });
});

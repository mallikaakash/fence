import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXPOSURE_INDEXER_PAGE_SIZE, paginateIndexerExchangeRows } from "./exposureIndexer.ts";

type Row = { id: string };

describe("paginateIndexerExchangeRows", () => {
  it("fetches multiple pages via skip/limit", async () => {
    const pages: Row[][] = [
      Array.from({ length: EXPOSURE_INDEXER_PAGE_SIZE }, (_, i) => ({ id: `p0-${i}` })),
      [{ id: "p1-0" }],
    ];
    let calls = 0;
    const res = await paginateIndexerExchangeRows<Row>({
      label: "test.rows",
      subaccountId: "0x1",
      network: "testnet",
      timeoutMs: 5_000,
      rowKey: (r) => r.id,
      fetchPage: async (skip) => {
        const page = pages[calls] ?? [];
        calls++;
        return {
          rows: page,
          pagination: {
            total: EXPOSURE_INDEXER_PAGE_SIZE + 1,
            next: [],
          },
        };
      },
    });
    assert.equal(res.items.length, EXPOSURE_INDEXER_PAGE_SIZE + 1);
    assert.equal(res.paginationComplete, true);
    assert.equal(calls, 2);
  });

  it("advances skip by collected rows", async () => {
    const skips: number[] = [];
    const res = await paginateIndexerExchangeRows({
      label: "test.dupSkip",
      subaccountId: "0x1",
      network: "testnet",
      timeoutMs: 5_000,
      rowKey: (r: Row) => r.id,
      fetchPage: async (skip) => {
        skips.push(skip);
        if (skip === 0) {
          return { rows: [{ id: "a" }], pagination: { total: 2, next: [] } };
        }
        return { rows: [{ id: "b" }], pagination: { total: 2, next: [] } };
      },
    });
    assert.deepEqual(skips, [0, 1]);
    assert.equal(res.items.map((r) => r.id).join(","), "a,b");
  });

  it("empty final page", async () => {
    const res = await paginateIndexerExchangeRows({
      label: "test.empty",
      subaccountId: "0x1",
      network: "testnet",
      timeoutMs: 5_000,
      rowKey: (r: Row) => r.id,
      fetchPage: async () => ({ rows: [], pagination: { total: 0 } }),
    });
    assert.equal(res.items.length, 0);
    assert.equal(res.paginationComplete, true);
  });

  it("preserves rows when a later page fails", async () => {
    let calls = 0;
    const res = await paginateIndexerExchangeRows({
      label: "test.fail",
      subaccountId: "0x1",
      network: "testnet",
      timeoutMs: 5_000,
      rowKey: (r: Row) => r.id,
      fetchPage: async (skip) => {
        calls++;
        if (skip === 0) {
          return {
            rows: [{ id: "kept" }],
            pagination: { total: 200, next: [] },
          };
        }
        throw new Error("indexer timeout on page 2");
      },
    });
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0]!.id, "kept");
    assert.equal(res.paginationComplete, false);
    assert.match(res.error ?? "", /page 2|timeout/i);
    assert.equal(calls, 2);
  });

  it("stops on duplicate-only page", async () => {
    const res = await paginateIndexerExchangeRows({
      label: "test.dup",
      subaccountId: "0x1",
      network: "testnet",
      timeoutMs: 5_000,
      rowKey: (r: Row) => r.id,
      fetchPage: async (skip) => {
        if (skip === 0) return { rows: [{ id: "x" }], pagination: { total: 99, next: ["t"] } };
        return { rows: [{ id: "x" }], pagination: { total: 99, next: ["t"] } };
      },
    });
    assert.equal(res.paginationComplete, false);
  });

  it("max page cap marks incomplete", async () => {
    let skip = 0;
    const res = await paginateIndexerExchangeRows({
      label: "test.max",
      subaccountId: "0x1",
      network: "testnet",
      timeoutMs: 5_000,
      rowKey: (r: Row) => r.id,
      fetchPage: async (s) => {
        skip = s;
        return {
          rows: [{ id: `r-${s}` }],
          pagination: { total: 9999, next: ["more"] },
        };
      },
    });
    assert.ok(res.items.length >= 1);
    assert.equal(res.paginationComplete, false);
  });
});

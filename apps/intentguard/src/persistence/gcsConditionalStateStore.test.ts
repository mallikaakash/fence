import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GCS_TEST_OPAQUE_GENERATIONS,
  MemoryGcsObjectAdapter,
} from "./gcsMemoryAdapter.ts";
import { GcsConditionalStateStore } from "./gcsConditionalStateStore.ts";
import {
  StateFencingError,
  StateGenerationConflictError,
} from "./gcsObjectAdapter.ts";
import type { GcsObjectAdapter, GcsUploadResult } from "./gcsObjectAdapter.ts";
import { buildStateDocument } from "./statePayload.ts";

/** Simulates GCS accepting bytes then returning 412 (lost success response). */
class LostResponseAfterSaveAdapter implements GcsObjectAdapter {
  readonly name: string;
  private readonly inner: MemoryGcsObjectAdapter;
  loseOnce = true;

  constructor(inner: MemoryGcsObjectAdapter) {
    this.inner = inner;
    this.name = inner.name;
  }

  getMetadata(): ReturnType<GcsObjectAdapter["getMetadata"]> {
    return this.inner.getMetadata();
  }
  download(
    opts?: Parameters<GcsObjectAdapter["download"]>[0],
  ): ReturnType<GcsObjectAdapter["download"]> {
    return this.inner.download(opts);
  }

  async save(
    data: Buffer,
    opts: { ifGenerationMatch: string | number },
  ): Promise<GcsUploadResult> {
    const result = await this.inner.save(data, opts);
    if (this.loseOnce) {
      this.loseOnce = false;
      const err = new Error("precondition failed") as Error & { code: number };
      err.code = 412;
      throw err;
    }
    return result;
  }
}

describe("GcsConditionalStateStore", () => {
  it("creates initial object with generation 0 precondition", async () => {
    const obj = new MemoryGcsObjectAdapter("state.json");
    const a = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-a",
    });
    await a.load();
    await a.save([], [], { proposals: [], executeIdempotency: [] });
    assert.equal(obj.snapshot().generation, GCS_TEST_OPAQUE_GENERATIONS[0]);
    assert.notEqual(obj.snapshot().generation, 1);
  });

  it("scenario A — concurrent writers from same generation", async () => {
    const obj = new MemoryGcsObjectAdapter("state.json");
    const seed = buildStateDocument(
      [],
      [],
      { proposals: [], executeIdempotency: [] },
      null,
      { writerEpoch: 1, writerHolderId: "seed", lastCommitId: "c0" },
    );
    await obj.save(Buffer.from(JSON.stringify(seed)), { ifGenerationMatch: 0 });

    const a = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-a",
    });
    const b = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-b",
    });
    await a.load();
    await b.load();
    await a.save([], [], { proposals: [], executeIdempotency: [] });
    await assert.rejects(
      () => b.save([], [], { proposals: [], executeIdempotency: [] }),
      StateGenerationConflictError,
    );
  });

  it("scenario B — stale holder cannot write after takeover", async () => {
    const obj = new MemoryGcsObjectAdapter("state.json");
    const a = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-a",
    });
    await a.load();
    await a.save([], [], { proposals: [], executeIdempotency: [] });

    const b = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-b",
    });
    await b.load();
    await b.save([], [], { proposals: [], executeIdempotency: [] });

    await assert.rejects(
      () => a.save([], [], { proposals: [], executeIdempotency: [] }),
      (e) =>
        e instanceof StateGenerationConflictError || e instanceof StateFencingError,
    );
  });

  it("does not refresh generation to commit stale memory after conflict", async () => {
    const obj = new MemoryGcsObjectAdapter("state.json");
    const seed = buildStateDocument(
      [],
      [],
      { proposals: [], executeIdempotency: [] },
      null,
      { writerEpoch: 1, writerHolderId: "x", lastCommitId: "seed" },
    );
    const buf = Buffer.from(JSON.stringify(seed), "utf8");
    await obj.save(buf, { ifGenerationMatch: 0 });

    const a = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-a",
    });
    const b = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-b",
    });
    await a.load();
    await b.load();
    await a.save(
      [],
      [
        {
          id: "1",
          at: new Date().toISOString(),
          type: "session_created",
          message: "a",
        },
      ],
      {
      proposals: [],
      executeIdempotency: [],
    });
    await assert.rejects(
      () =>
        b.save(
          [],
          [
            {
              id: "2",
              at: new Date().toISOString(),
              type: "session_created",
              message: "b",
            },
          ],
          {
          proposals: [],
          executeIdempotency: [],
        }),
      StateGenerationConflictError,
    );
    const snap = obj.snapshot();
    const body = JSON.parse(snap.body!.toString()) as { audit: unknown[] };
    assert.equal(body.audit.length, 1);
  });

  it("reconciles lost 412 when object already has lastCommitId", async () => {
    const inner = new MemoryGcsObjectAdapter("state.json");
    const obj = new LostResponseAfterSaveAdapter(inner);
    const a = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-a",
    });
    await a.load();
    await a.save([], [], { proposals: [], executeIdempotency: [] });
    assert.equal(inner.snapshot().generation, GCS_TEST_OPAQUE_GENERATIONS[0]);
    const body = JSON.parse(inner.snapshot().body!.toString()) as {
      lastCommitId: string;
      writerHolderId: string;
    };
    assert.equal(body.writerHolderId, "holder-a");
    assert.ok(body.lastCommitId.length > 0);
  });

});

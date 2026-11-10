import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GCS_TEST_OPAQUE_GENERATIONS,
  MemoryGcsObjectAdapter,
} from "./gcsMemoryAdapter.ts";
import { GcsConditionalStateStore } from "./gcsConditionalStateStore.ts";
import type { GcsObjectAdapter, GcsUploadResult } from "./gcsObjectAdapter.ts";
import {
  StateGenerationConflictError,
} from "./gcsObjectAdapter.ts";
import { buildStateDocument } from "./statePayload.ts";

/** Live metadata generation differs from generation-pinned body (fail closed). */
class MetadataBodySplitAdapter implements GcsObjectAdapter {
  readonly name = "gs://test/split";
  private readonly inner = new MemoryGcsObjectAdapter("state.json");
  spoofedLiveGeneration: number | null = null;

  snapshot() {
    return this.inner.snapshot();
  }

  async getMetadata(): ReturnType<GcsObjectAdapter["getMetadata"]> {
    const meta = await this.inner.getMetadata();
    if (!meta || this.spoofedLiveGeneration === null) return meta;
    return { generation: String(this.spoofedLiveGeneration) };
  }

  async download(
    opts?: Parameters<GcsObjectAdapter["download"]>[0],
  ): Promise<Buffer> {
    return this.inner.download(opts);
  }

  async save(
    data: Buffer,
    opts: { ifGenerationMatch: string | number },
  ): Promise<GcsUploadResult> {
    return this.inner.save(data, opts);
  }
}

/** Another writer commits between upload and verify (live head is not pending commit). */
class SupersedeBeforeVerifyAdapter implements GcsObjectAdapter {
  readonly name = "gs://test/supersede-verify";
  private readonly inner = new MemoryGcsObjectAdapter("state.json");
  supersedeHolder = "holder-b";

  snapshot() {
    return this.inner.snapshot();
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
    const snap = this.inner.snapshot();
    const parsed = JSON.parse(snap.body!.toString()) as Record<string, unknown>;
    const doc = buildStateDocument(
      [],
      [],
      { proposals: [], executeIdempotency: [] },
      null,
      {
        writerEpoch: (parsed.writerEpoch as number) + 1,
        writerHolderId: this.supersedeHolder,
        lastCommitId: "supersede-commit",
      },
    );
    await this.inner.save(Buffer.from(JSON.stringify(doc)), {
      ifGenerationMatch: snap.generation!,
    });
    return result;
  }
}

class LostResponseAdapter implements GcsObjectAdapter {
  readonly name = "gs://test/lost";
  private readonly inner = new MemoryGcsObjectAdapter("state.json");

  snapshot() {
    return this.inner.snapshot();
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
    await this.inner.save(data, opts);
    const err = new Error("precondition failed") as Error & { code: number };
    err.code = 412;
    throw err;
  }
}

describe("GCS generation semantics (non-sequential)", () => {
  it("1 — initial creation uses opaque generation, not 1", async () => {
    const obj = new MemoryGcsObjectAdapter("state.json");
    const store = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "h1",
    });
    await store.load();
    await store.save([], [], { proposals: [], executeIdempotency: [] });
    const gen = obj.snapshot().generation!;
    assert.equal(gen, GCS_TEST_OPAQUE_GENERATIONS[0]);
    assert.notEqual(gen, 1);
    assert.equal(store.snapshot().generation, gen);
  });

  it("2 — replacement generation is not previous + 1", async () => {
    const obj = new MemoryGcsObjectAdapter("state.json");
    const store = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "h1",
    });
    await store.load();
    await store.save([], [], { proposals: [], executeIdempotency: [] });
    const gen1 = obj.snapshot().generation!;
    await store.save([], [], { proposals: [], executeIdempotency: [] });
    const gen2 = obj.snapshot().generation!;
    assert.notEqual(gen2, gen1 + 1);
    assert.equal(gen2, GCS_TEST_OPAQUE_GENERATIONS[1]);
  });

  it("3 — adopts actual generation from live head verification", async () => {
    const obj = new MemoryGcsObjectAdapter("state.json");
    const store = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "h1",
    });
    await store.load();
    await store.save([], [], { proposals: [], executeIdempotency: [] });
    assert.equal(store.snapshot().generation, obj.snapshot().generation);
  });

  it("4 — supersede before verify fails closed", async () => {
    const obj = new SupersedeBeforeVerifyAdapter();
    const a = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-a",
    });
    await a.load();
    await assert.rejects(
      () => a.save([], [], { proposals: [], executeIdempotency: [] }),
      StateGenerationConflictError,
    );
    assert.equal(a.snapshot().generation, null);
  });

  it("5 — ambiguous 412 reconciles when pending commit is live head", async () => {
    const obj = new LostResponseAdapter();
    const store = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-a",
    });
    await store.load();
    await store.save([], [], { proposals: [], executeIdempotency: [] });
    assert.equal(store.snapshot().generation, GCS_TEST_OPAQUE_GENERATIONS[0]);
  });

  it("6 — ambiguous 412 does not reconcile after supersede", async () => {
    const inner = new MemoryGcsObjectAdapter("state.json");
    const obj: GcsObjectAdapter = {
      name: "combo",
      getMetadata: () => inner.getMetadata(),
      download: (opts) => inner.download(opts),
      async save(data, opts) {
        const r = await inner.save(data, opts);
        const snap = inner.snapshot();
        const doc = buildStateDocument(
          [],
          [],
          { proposals: [], executeIdempotency: [] },
          null,
          {
            writerEpoch: 99,
            writerHolderId: "other",
            lastCommitId: "other-commit",
          },
        );
        await inner.save(Buffer.from(JSON.stringify(doc)), {
          ifGenerationMatch: snap.generation!,
        });
        const err = new Error("precondition failed") as Error & { code: number };
        err.code = 412;
        throw err;
      },
    };
    const a = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-a",
    });
    await a.load();
    await assert.rejects(
      () => a.save([], [], { proposals: [], executeIdempotency: [] }),
      StateGenerationConflictError,
    );
  });

  it("7 — generation-pinned read rejects metadata/body generation mismatch", async () => {
    const obj = new MetadataBodySplitAdapter();
    const store = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "h1",
    });
    await store.load();
    await store.save([], [], { proposals: [], executeIdempotency: [] });
    obj.spoofedLiveGeneration = GCS_TEST_OPAQUE_GENERATIONS[2];
    await assert.rejects(() =>
      store.save([], [], { proposals: [], executeIdempotency: [] }),
    );
  });

  it("8 — stale writer cannot adopt newer live generation without its commit", async () => {
    const obj = new MemoryGcsObjectAdapter("state.json");
    const a = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "a",
    });
    await a.load();
    await a.save([], [], { proposals: [], executeIdempotency: [] });
    const staleGen = a.snapshot().generation;

    const b = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "b",
    });
    await b.load();
    await b.save([], [], { proposals: [], executeIdempotency: [] });
    assert.notEqual(obj.snapshot().generation, staleGen);

    await assert.rejects(
      () => a.save([], [], { proposals: [], executeIdempotency: [] }),
      StateGenerationConflictError,
    );
  });

  it("9 — production store has no expectedGeneration arithmetic", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("./gcsConditionalStateStore.ts", import.meta.url),
        "utf8",
      ),
    );
    assert.doesNotMatch(src, /expectedGenerationAfterMatch/);
    assert.doesNotMatch(src, /ifGenerationMatch \+ 1/);
    assert.doesNotMatch(src, /\? 1 :/);
  });
});

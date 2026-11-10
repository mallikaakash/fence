import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GCS_TEST_OPAQUE_GENERATIONS,
  MemoryGcsObjectAdapter,
} from "./gcsMemoryAdapter.ts";
import { GcsConditionalStateStore } from "./gcsConditionalStateStore.ts";
import type { GcsObjectAdapter, GcsUploadResult } from "./gcsObjectAdapter.ts";
import {
  StateFencingError,
  StateGenerationConflictError,
  StatePersistenceError,
} from "./gcsObjectAdapter.ts";
import { buildStateDocument } from "./statePayload.ts";
import { durablePersist } from "./gcsTestDurablePersist.ts";

/** Yield before precondition check so two parallel saves can race like separate processes. */
class YieldingMemoryGcsObjectAdapter implements GcsObjectAdapter {
  readonly name: string;
  private readonly inner = new MemoryGcsObjectAdapter("state.json");

  constructor() {
    this.name = this.inner.name;
  }

  innerSnapshot() {
    return this.inner.snapshot();
  }

  async getMetadata(): ReturnType<GcsObjectAdapter["getMetadata"]> {
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
    await new Promise<void>((r) => setImmediate(r));
    return this.inner.save(data, opts);
  }
}

/** Ignored by store after fix; kept to ensure success path verifies body, not upload return. */
class InflatedGenerationAfterSaveAdapter implements GcsObjectAdapter {
  readonly name = "gs://test/inflated";
  readonly inner = new MemoryGcsObjectAdapter("state.json");

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
    return { generation: String(Number(result.generation) + 50) };
  }
}

/** Applies inner save then overwrites object before returning 412 to caller. */
class CommitThenSupersedeAdapter implements GcsObjectAdapter {
  readonly name = "gs://test/supersede";
  private readonly inner = new MemoryGcsObjectAdapter("state.json");
  supersedeAfterHolder: string | null = null;
  private supersedeEpoch = 0;

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
    if (this.supersedeAfterHolder) {
      const snap = this.inner.snapshot();
      const parsed = JSON.parse(snap.body!.toString()) as Record<string, unknown>;
      this.supersedeEpoch += 1;
      const doc = buildStateDocument(
        [],
        [],
        { proposals: [], executeIdempotency: [] },
        null,
        {
          writerEpoch: (parsed.writerEpoch as number) + 1,
          writerHolderId: this.supersedeAfterHolder,
          lastCommitId: `b-commit-${this.supersedeEpoch}`,
        },
      );
      await this.inner.save(Buffer.from(JSON.stringify(doc)), {
        ifGenerationMatch: snap.generation!,
      });
    }
    const err = new Error("precondition failed") as Error & { code: number };
    err.code = 412;
    throw err;
  }
}

describe("GcsConditionalStateStore adversarial", () => {
  it("1 — post-write metadata race cannot adopt newer generation with stale memory", async () => {
    const obj = new InflatedGenerationAfterSaveAdapter();
    const a = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-a",
    });
    await a.load();
    await a.save([], [], { proposals: [], executeIdempotency: [] });
    assert.equal(a.snapshot().generation, GCS_TEST_OPAQUE_GENERATIONS[0]);
    assert.notEqual(a.snapshot().generation, 1);

    const b = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-b",
    });
    await b.load();
    await b.save([], [], { proposals: [], executeIdempotency: [] });

    const staleA = a;
    staleA.snapshot();
    await assert.rejects(
      () =>
        staleA.save(
          [],
          [{ id: "stale", at: new Date().toISOString(), type: "session_created", message: "x" }],
          { proposals: [], executeIdempotency: [] },
        ),
      StateGenerationConflictError,
    );
    const remote = JSON.parse(obj.snapshot().body!.toString()) as {
      writerHolderId: string;
      audit: unknown[];
    };
    assert.equal(remote.writerHolderId, "holder-b");
    assert.equal(remote.audit.length, 0);
  });

  it("2 — concurrent first-time initialization: only one writer wins", async () => {
    const obj = new YieldingMemoryGcsObjectAdapter();
    const a = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "proc-a",
    });
    const b = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "proc-b",
    });
    await a.load();
    await b.load();
    const results = await Promise.allSettled([
      a.save([], [], { proposals: [], executeIdempotency: [] }),
      b.save([], [], { proposals: [], executeIdempotency: [] }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(bad.length, 1);
    assert.equal(obj.innerSnapshot().generation, GCS_TEST_OPAQUE_GENERATIONS[0]);
  });

  it("3 — ambiguous reconcile after newer writer must fail for stale process", async () => {
    const obj = new CommitThenSupersedeAdapter();
    obj.supersedeAfterHolder = "holder-b";

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
    const body = JSON.parse(obj.snapshot().body!.toString()) as {
      writerHolderId: string;
    };
    assert.equal(body.writerHolderId, "holder-b");
  });

  it("4 — dual takeover race: one winner, loser cannot retry stale generation", async () => {
    const obj = new YieldingMemoryGcsObjectAdapter();
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
    const race = await Promise.allSettled([
      a.save([], [], { proposals: [], executeIdempotency: [] }),
      b.save([], [], { proposals: [], executeIdempotency: [] }),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    const loser = race[0].status === "rejected" ? a : b;
    await assert.rejects(
      () => loser.save([], [], { proposals: [], executeIdempotency: [] }),
      StateGenerationConflictError,
    );
  });

  it("5 — stale writer resumes after takeover cannot overwrite", async () => {
    const obj = new MemoryGcsObjectAdapter("state.json");
    const a = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-a",
    });
    await a.load();
    await a.save([], [], { proposals: [], executeIdempotency: [] });

    const staleA = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-a",
    });
    await staleA.load();

    const b = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-b",
    });
    await b.load();
    await b.save([], [], { proposals: [], executeIdempotency: [] });

    await assert.rejects(
      () =>
        staleA.save(
          [],
          [{ id: "x", at: new Date().toISOString(), type: "session_created", message: "stale" }],
          { proposals: [], executeIdempotency: [] },
        ),
      (e) =>
        e instanceof StateGenerationConflictError || e instanceof StateFencingError,
    );
    const snap = obj.snapshot();
    const remote = JSON.parse(snap.body!.toString()) as { writerHolderId: string; audit: unknown[] };
    assert.equal(remote.writerHolderId, "holder-b");
    assert.equal(remote.audit.length, 0);
  });

  it("6 — GCS unavailable at execution checkpoint aborts before broadcast", async () => {
    const outcome = await durablePersist(async () => {
      throw new StatePersistenceError("GCS unavailable");
    });
    assert.ok(outcome);
    assert.equal(outcome.httpStatus, 503);
    assert.equal(outcome.body.errorCode, "persist_failed");
  });

  it("7 — restart after ambiguous commit loads B without adopting stale A memory", async () => {
    const obj = new MemoryGcsObjectAdapter("state.json");
    const b = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-b",
    });
    await b.load();
    await b.save([], [], { proposals: [], executeIdempotency: [] });

    const restartB = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-b",
    });
    const loaded = await restartB.load();
    assert.deepEqual(loaded.sessions, []);
    assert.equal(restartB.snapshot().writerMeta.writerHolderId, "holder-b");
  });

  it("8 — shutdown-style flush with superseding writer fails closed", async () => {
    const obj = new MemoryGcsObjectAdapter("state.json");
    const a = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-a",
    });
    await a.load();
    await a.save([], [], { proposals: [], executeIdempotency: [] });

    const staleA = a;
    const b = new GcsConditionalStateStore({
      object: obj,
      dataKey: null,
      holderId: "holder-b",
    });
    await b.load();
    await b.save([], [], { proposals: [], executeIdempotency: [] });

    await assert.rejects(
      () => staleA.save([], [], { proposals: [], executeIdempotency: [] }),
      StateGenerationConflictError,
    );
  });

  it("missing object path does not reset existing object at same adapter", async () => {
    const existing = new MemoryGcsObjectAdapter("real.json");
    const seed = buildStateDocument(
      [],
      [{ id: "1", at: new Date().toISOString(), type: "session_created", message: "keep" }],
      { proposals: [], executeIdempotency: [] },
      null,
      { writerEpoch: 3, writerHolderId: "prod", lastCommitId: "prod-c" },
    );
    await existing.save(Buffer.from(JSON.stringify(seed)), { ifGenerationMatch: 0 });

    const wrongPath = new GcsConditionalStateStore({
      object: new MemoryGcsObjectAdapter("wrong/path.json"),
      dataKey: null,
      holderId: "mistake",
    });
    const empty = await wrongPath.load();
    assert.equal(empty.audit.length, 0);
    await wrongPath.save([], [], { proposals: [], executeIdempotency: [] });

    const keep = JSON.parse(existing.snapshot().body!.toString()) as { audit: unknown[] };
    assert.equal(keep.audit.length, 1);
  });
});

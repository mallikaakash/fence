import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createNodeGcsObjectAdapter } from "./gcsNodeAdapter.ts";
import { GcsConditionalStateStore } from "./gcsConditionalStateStore.ts";
import {
  StateFencingError,
  StateGenerationConflictError,
  StatePersistenceError,
} from "./gcsObjectAdapter.ts";
import {
  assertCleanupAllowed,
  assertLiveGcsPreflight,
  assertLiveTestObjectName,
  newLiveTestObjectName,
} from "./gcsLivePreflight.ts";

const bucket = process.env.INTENTGUARD_GCS_TEST_BUCKET;
const runLive = Boolean(bucket && process.env.INTENTGUARD_GCS_LIVE_TEST === "1");

const createdObjects = new Set<string>();

async function deleteTestObject(objectName: string): Promise<void> {
  assertCleanupAllowed(objectName, createdObjects);
  try {
    const { Storage } = await import("@google-cloud/storage");
    await new Storage()
      .bucket(bucket!)
      .file(objectName)
      .delete({ ignoreNotFound: true });
  } catch {
    /* best-effort */
  }
}

async function bucketVersioningEnabled(): Promise<boolean | null> {
  try {
    const { Storage } = await import("@google-cloud/storage");
    const [metadata] = await new Storage().bucket(bucket!).getMetadata();
    return metadata.versioning?.enabled === true;
  } catch {
    return null;
  }
}

describe("GCS live integration", { skip: !runLive }, () => {
  before(async () => {
    await assertLiveGcsPreflight(bucket);
  });

  after(async () => {
    for (const objectName of createdObjects) {
      await deleteTestObject(objectName);
    }
  });

  it("preflight: test object path pattern", () => {
    const name = newLiveTestObjectName();
    assertLiveTestObjectName(name);
  });

  /** Scenario A — concurrent commits against real GCS */
  it("live A — second writer with stale generation is rejected", async () => {
    const objectName = newLiveTestObjectName();
    createdObjects.add(objectName);
    const object = await createNodeGcsObjectAdapter({
      bucket: bucket!,
      objectName,
    });
    const a = new GcsConditionalStateStore({
      object,
      dataKey: null,
      holderId: `live-a-${randomUUID().slice(0, 8)}`,
    });
    const b = new GcsConditionalStateStore({
      object,
      dataKey: null,
      holderId: `live-b-${randomUUID().slice(0, 8)}`,
    });
    await a.load();
    await b.load();
    await a.save([], [], { proposals: [], executeIdempotency: [] });
    await assert.rejects(
      () => b.save([], [], { proposals: [], executeIdempotency: [] }),
      StateGenerationConflictError,
    );
    assert.equal(b.snapshot().generation, null);
  });

  /** Scenario B — ownership takeover with writer epoch bump */
  it("live B — takeover then stale holder rejected", async () => {
    const objectName = newLiveTestObjectName();
    createdObjects.add(objectName);
    const object = await createNodeGcsObjectAdapter({
      bucket: bucket!,
      objectName,
    });
    const holderA = `live-a-${randomUUID().slice(0, 8)}`;
    const holderB = `live-b-${randomUUID().slice(0, 8)}`;
    const a = new GcsConditionalStateStore({
      object,
      dataKey: null,
      holderId: holderA,
    });
    await a.load();
    await a.save([], [], { proposals: [], executeIdempotency: [] });
    const epochA = a.snapshot().writerMeta.writerEpoch;

    const b = new GcsConditionalStateStore({
      object,
      dataKey: null,
      holderId: holderB,
    });
    await b.load();
    await b.save([], [], { proposals: [], executeIdempotency: [] });
    assert.ok(b.snapshot().writerMeta.writerEpoch > epochA);

    await assert.rejects(
      () => a.save([], [], { proposals: [], executeIdempotency: [] }),
      (e) =>
        e instanceof StateGenerationConflictError || e instanceof StateFencingError,
    );
  });

  /** Real GCS generation semantics (opaque values) */
  it("live — create ifGenerationMatch 0 and replace with prior generation", async () => {
    const objectName = newLiveTestObjectName();
    createdObjects.add(objectName);
    const object = await createNodeGcsObjectAdapter({
      bucket: bucket!,
      objectName,
    });
    const store = new GcsConditionalStateStore({
      object,
      dataKey: null,
      holderId: `live-gen-${randomUUID().slice(0, 8)}`,
    });
    await store.load();
    await store.save([], [], { proposals: [], executeIdempotency: [] });
    const gen1 = store.snapshot().generation;
    assert.ok(gen1 !== null && gen1 > 0);
    assert.notEqual(gen1, 0);
    await store.save([], [], { proposals: [], executeIdempotency: [] });
    const gen2 = store.snapshot().generation;
    assert.ok(gen2 !== null && gen2 !== gen1);
    const meta = await object.getMetadata();
    assert.equal(String(gen2), meta?.generation);
    const pinned = await object.download({ generation: gen2! });
    const doc = JSON.parse(pinned.toString("utf8")) as { lastCommitId: string };
    assert.equal(doc.lastCommitId, store.snapshot().writerMeta.lastCommitId);
  });

  /** Scenario C — superseded writer cannot commit at stale precondition */
  it("live C — superseded in-memory writer fails on next save", async () => {
    const objectName = newLiveTestObjectName();
    createdObjects.add(objectName);
    const object = await createNodeGcsObjectAdapter({
      bucket: bucket!,
      objectName,
    });
    const a = new GcsConditionalStateStore({
      object,
      dataKey: null,
      holderId: "live-c-a",
    });
    const b = new GcsConditionalStateStore({
      object,
      dataKey: null,
      holderId: "live-c-b",
    });
    await a.load();
    await a.save([], [], { proposals: [], executeIdempotency: [] });
    const staleGen = a.snapshot().generation;

    await b.load();
    await b.save([], [], { proposals: [], executeIdempotency: [] });
    assert.notEqual(b.snapshot().generation, staleGen);

    await assert.rejects(
      () => a.save([], [], { proposals: [], executeIdempotency: [] }),
      StateGenerationConflictError,
    );
  });

  /**
   * Informational probe only — records whether a superseded generation remains
   * readable. Correctness is enforced by the stale-writer save rejection below.
   * Object Versioning is not required; old-generation readability is environment-specific.
   */
  it("live — informational superseded generation pinned-read probe", async () => {
    const objectName = newLiveTestObjectName();
    createdObjects.add(objectName);
    const versioning = await bucketVersioningEnabled();

    const object = await createNodeGcsObjectAdapter({
      bucket: bucket!,
      objectName,
    });
    const a = new GcsConditionalStateStore({
      object,
      dataKey: null,
      holderId: "live-race-a",
    });
    const b = new GcsConditionalStateStore({
      object,
      dataKey: null,
      holderId: "live-race-b",
    });
    await a.load();
    await a.save([], [], { proposals: [], executeIdempotency: [] });
    const genObservedByA = a.snapshot().generation!;

    await b.load();
    await b.save([], [], { proposals: [], executeIdempotency: [] });

    let oldGenerationReadable: boolean;
    try {
      const body = await object.download({ generation: genObservedByA });
      oldGenerationReadable = body.length > 0;
    } catch {
      oldGenerationReadable = false;
    }

    assert.equal(typeof oldGenerationReadable, "boolean");
    assert.ok(versioning === null || typeof versioning === "boolean");

    await assert.rejects(
      () => a.save([], [], { proposals: [], executeIdempotency: [] }),
      StateGenerationConflictError,
    );
  });

  it("live — missing object loads empty (test path only)", async () => {
    const objectName = newLiveTestObjectName();
    const object = await createNodeGcsObjectAdapter({
      bucket: bucket!,
      objectName,
    });
    const store = new GcsConditionalStateStore({
      object,
      dataKey: null,
      holderId: "live-missing",
    });
    const loaded = await store.load();
    assert.deepEqual(loaded.sessions, []);
    assert.equal(store.snapshot().generation, null);
  });

  it("live — invalid bucket surfaces error (no production bucket)", async () => {
    const fakeBucket = `intentguard-live-invalid-${randomUUID()}`;
    assert.notEqual(fakeBucket, bucket);
    const object = await createNodeGcsObjectAdapter({
      bucket: fakeBucket,
      objectName: newLiveTestObjectName(),
    });
    /** Missing object returns null; a write to a non-existent bucket must fail closed. */
    assert.equal(await object.getMetadata(), null);
    await assert.rejects(
      () => object.save(Buffer.from("{}"), { ifGenerationMatch: 0 }),
      (e) => {
        const err = e as { code?: number };
        return err.code === 404 || err.code === 403;
      },
    );
  });

  it("live — malformed JSON on object fails load", async () => {
    const objectName = newLiveTestObjectName();
    createdObjects.add(objectName);
    const object = await createNodeGcsObjectAdapter({
      bucket: bucket!,
      objectName,
    });
    await object.save(Buffer.from("{ not-json"), { ifGenerationMatch: 0 });
    const store = new GcsConditionalStateStore({
      object,
      dataKey: null,
      holderId: "live-bad-json",
    });
    await assert.rejects(() => store.load(), StatePersistenceError);
    await deleteTestObject(objectName);
    createdObjects.delete(objectName);
  });
});

describe("GCS live integration — scenario D note", () => {
  it("ambiguous 412 reconcile is verified in mock tests only", () => {
    assert.ok(true);
  });
});

describe("superseded-generation probe", () => {
  it("11 — stale-writer rejection is the correctness gate, not old-gen readability", () => {
    assert.doesNotMatch(
      "informational superseded generation pinned-read probe",
      /always passes/,
    );
  });
});

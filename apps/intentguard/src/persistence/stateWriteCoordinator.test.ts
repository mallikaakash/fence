import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  StateWriteCoordinator,
  StateWriteFrozenError,
  StateWriteShutdownSkippedError,
} from "./stateWriteCoordinator.ts";
import { FileWriterLeaseBackend } from "./writerLease.ts";
import { STATE_MUTATION_INVENTORY } from "./stateMutationInventory.ts";

describe("stateWriteCoordinator", () => {
  let dataDir: string;

  before(() => {
    dataDir = mkdtempSync(join(tmpdir(), "ig-statewrite-"));
    delete process.env.INTENTGUARD_STATE_WRITE_FREEZE;
    delete process.env.INTENTGUARD_WRITER_LEASE_MODE;
    delete process.env.INTENTGUARD_REQUIRE_WRITER_LEASE;
  });

  after(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("inventory documents maintenance vs freeze", () => {
    const execute = STATE_MUTATION_INVENTORY.find((r) =>
      r.entryPoint.includes("/v1/execute"),
    );
    assert.ok(execute);
    assert.equal(execute.duringExecutionMaintenance, false);
    assert.equal(execute.duringStateWriteFreeze, false);
    const shutdown = STATE_MUTATION_INVENTORY.find((r) => r.operation.includes("Shutdown"));
    assert.ok(shutdown?.duringShutdown);
    assert.equal(shutdown?.duringStateWriteFreeze, false);
  });

  it("rejects mutation while operator frozen before in-memory change", async () => {
    const c = new StateWriteCoordinator({ dataDir });
    await c.startupAcquireLease();
    await c.freeze();
    assert.throws(() => c.beginMutation(), StateWriteFrozenError);
  });

  it("freeze waits for active mutations", async () => {
    const c = new StateWriteCoordinator({ dataDir });
    c.beginMutation();
    const freezeP = c.freeze();
    let settled = false;
    freezeP.then(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(settled, false);
    c.endMutation();
    await freezeP;
    assert.equal(c.isFrozen(), true);
  });

  it("persist fails when frozen", async () => {
    const c = new StateWriteCoordinator({ dataDir });
    await c.freeze();
    await assert.rejects(async () => {
      await c.enqueuePersist(() => {});
    }, StateWriteFrozenError);
  });

  it("shutdown flush skipped when frozen (regression: no shutdownFlush bypass)", async () => {
    const c = new StateWriteCoordinator({ dataDir });
    await c.freeze();
    await assert.rejects(
      async () => {
        await c.enqueuePersist(() => {}, { shutdownFlush: true });
      },
      (err: unknown) => err instanceof StateWriteShutdownSkippedError,
    );
  });

  it("queued persist cannot bypass freeze", async () => {
    const c = new StateWriteCoordinator({ dataDir });
    let runs = 0;
    await c.enqueuePersist(() => {
      runs++;
    });
    await c.freeze();
    assert.equal(runs, 1);
    await assert.rejects(async () => {
      await c.enqueuePersist(() => {
        runs++;
      });
    }, StateWriteFrozenError);
    assert.equal(runs, 1);
  });

  it("in-flight persist completes before operator freeze", async () => {
    const c = new StateWriteCoordinator({ dataDir });
    let flushed = false;
    const persist = c.enqueuePersist(async () => {
      await new Promise((r) => setTimeout(r, 40));
      flushed = true;
    });
    const frozen = c.freeze();
    await persist;
    await frozen;
    assert.equal(flushed, true);
    assert.equal(c.isFrozen(), true);
  });

  it("shutdown flush propagates flush failure", async () => {
    const c = new StateWriteCoordinator({ dataDir });
    await assert.rejects(
      async () => {
        await c.enqueuePersist(
          () => {
            throw new Error("disk full");
          },
          { shutdownFlush: true },
        );
      },
      /disk full/,
    );
  });

  it("unfreeze restores enqueuePersist", async () => {
    const c = new StateWriteCoordinator({ dataDir });
    await c.freeze();
    c.unfreeze();
    let called = false;
    await c.enqueuePersist(() => {
      called = true;
    });
    assert.equal(called, true);
  });

  it("env freeze blocks shutdown flush", async () => {
    process.env.INTENTGUARD_STATE_WRITE_FREEZE = "1";
    const c = new StateWriteCoordinator({ dataDir });
    assert.equal(c.isFrozen(), true);
    await assert.rejects(
      async () => {
        await c.enqueuePersist(() => {}, { shutdownFlush: true });
      },
      StateWriteShutdownSkippedError,
    );
    delete process.env.INTENTGUARD_STATE_WRITE_FREEZE;
  });

  it("two file leases — second holder fails acquire", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ig-lease-ab-"));
    process.env.INTENTGUARD_WRITER_LEASE_MODE = "file";
    const a = new StateWriteCoordinator({ dataDir: dir });
    const b = new StateWriteCoordinator({ dataDir: dir });
    await a.startupAcquireLease();
    await assert.rejects(() => b.startupAcquireLease());
    await a.shutdownReleaseLease();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.INTENTGUARD_WRITER_LEASE_MODE;
  });

  it("stale writer loses fence on assert", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ig-lease-stale-"));
    process.env.INTENTGUARD_WRITER_LEASE_MODE = "file";
    const a = new StateWriteCoordinator({ dataDir: dir });
    await a.startupAcquireLease();
    const leasePath = join(dir, ".writer-lease.json");
    const cur = JSON.parse(readFileSync(leasePath, "utf8")) as {
      holderId: string;
      fencingToken: number;
    };
    writeFileSync(
      leasePath,
      JSON.stringify({
        holderId: "other-holder",
        fencingToken: cur.fencingToken + 1,
        acquiredAt: new Date(0).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    assert.throws(() => a.assertOwnershipForPersist());
    await a.shutdownReleaseLease();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.INTENTGUARD_WRITER_LEASE_MODE;
  });
});

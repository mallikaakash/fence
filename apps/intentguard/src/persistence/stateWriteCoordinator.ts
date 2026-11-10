import { randomUUID } from "node:crypto";
import {
  isStateWriteFreezeEnvEnabled,
  STATE_WRITE_FROZEN_ERROR_CODE,
  STATE_WRITE_FROZEN_MESSAGE,
} from "./stateWriteFreezeEnv.ts";
import {
  type WriterLeaseBackend,
  WriterLeaseLostError,
  createWriterLeaseBackend,
} from "./writerLease.ts";

export class StateWriteFrozenError extends Error {
  readonly code = STATE_WRITE_FROZEN_ERROR_CODE;
  constructor(message: string = STATE_WRITE_FROZEN_MESSAGE) {
    super(message);
  }
}

/** Shutdown asked for a final flush while state writes are frozen (migration / deploy). */
export class StateWriteShutdownSkippedError extends Error {
  readonly code = "shutdown_persist_skipped_frozen" as const;
  constructor(
    message: string = "shutdown state flush skipped — state write freeze active",
  ) {
    super(message);
  }
}

export type StateWriteStatus = {
  frozen: boolean;
  frozenByEnv: boolean;
  frozenByOperator: boolean;
  activeMutations: number;
  persistInFlight: boolean;
  writerLeaseMode: string;
  writerLeaseHeld: boolean;
  fencingToken: number | null;
};

export class StateWriteCoordinator {
  readonly holderId: string;
  private readonly lease: WriterLeaseBackend;
  private readonly envFrozen: boolean;
  private readonly requireLease: boolean;
  private operatorFrozen = false;
  private activeMutations = 0;
  private persistInFlight = false;
  private persistChain: Promise<void> = Promise.resolve();

  constructor(opts: {
    dataDir: string;
    requireWriterLease?: boolean;
  }) {
    this.holderId = `gw-${randomUUID()}`;
    this.lease = createWriterLeaseBackend(opts.dataDir);
    this.envFrozen = isStateWriteFreezeEnvEnabled();
    this.requireLease =
      opts.requireWriterLease ??
      (process.env.INTENTGUARD_REQUIRE_WRITER_LEASE === "1" ||
        process.env.INTENTGUARD_REQUIRE_WRITER_LEASE === "true");
  }

  status(): StateWriteStatus {
    const snap = this.lease.snapshot();
    return {
      frozen: this.isFrozen(),
      frozenByEnv: this.envFrozen,
      frozenByOperator: this.operatorFrozen,
      activeMutations: this.activeMutations,
      persistInFlight: this.persistInFlight,
      writerLeaseMode: this.lease.mode,
      writerLeaseHeld: snap.held,
      fencingToken: this.lease.localFencingToken(),
    };
  }

  isFrozen(): boolean {
    return this.envFrozen || this.operatorFrozen;
  }

  assertMutationAllowed(): void {
    if (this.isFrozen()) {
      throw new StateWriteFrozenError();
    }
    if (this.requireLease || this.lease.mode !== "none") {
      this.lease.assertOwnership();
    }
  }

  beginMutation(): void {
    this.assertMutationAllowed();
    this.activeMutations++;
  }

  endMutation(): void {
    if (this.activeMutations > 0) this.activeMutations--;
  }

  /**
   * Queue a state.json flush. Fail closed on freeze/lease loss before writing.
   * Shutdown uses { shutdownFlush: true }; still blocked when frozen (skipped, not silent success).
   */
  enqueuePersist(
    flush: () => void | Promise<void>,
    opts?: { shutdownFlush?: boolean },
  ): Promise<void> {
    const run = this.persistChain.then(async () => {
      if (this.isFrozen()) {
        if (opts?.shutdownFlush) {
          throw new StateWriteShutdownSkippedError();
        }
        throw new StateWriteFrozenError();
      }
      if (this.requireLease || this.lease.mode !== "none") {
        this.lease.assertOwnership();
      }
      this.persistInFlight = true;
      try {
        await Promise.resolve(flush());
      } finally {
        this.persistInFlight = false;
      }
    });
    this.persistChain = run.catch(() => {
      /* keep chain settled; caller awaits `run` for errors */
    });
    return run;
  }

  async waitForPersistIdle(): Promise<void> {
    await this.persistChain;
  }

  async freeze(): Promise<{ ok: true; flushed: boolean }> {
    const deadline = Date.now() + 60_000;
    while (this.activeMutations > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    if (this.activeMutations > 0) {
      throw new StateWriteFrozenError("freeze timed out with active mutations");
    }
    await this.waitForPersistIdle();
    this.operatorFrozen = true;
    return { ok: true, flushed: true };
  }

  unfreeze(): void {
    if (this.envFrozen) {
      throw new StateWriteFrozenError(
        "cannot unfreeze — INTENTGUARD_STATE_WRITE_FREEZE env is set",
      );
    }
    this.operatorFrozen = false;
  }

  async startupAcquireLease(): Promise<void> {
    if (this.lease.mode === "none" && this.requireLease) {
      throw new WriterLeaseLostError(
        "INTENTGUARD_REQUIRE_WRITER_LEASE=1 but writer lease mode is none",
      );
    }
    if (this.lease.mode === "none") return;
    const ttlMs = Number(process.env.INTENTGUARD_WRITER_LEASE_TTL_MS ?? 120_000);
    await this.lease.acquire(this.holderId, ttlMs);
  }

  async shutdownReleaseLease(): Promise<void> {
    if (this.lease.mode === "none") return;
    await this.lease.release(this.holderId);
  }

  assertOwnershipForPersist(): void {
    if (this.requireLease || this.lease.mode !== "none") {
      this.lease.assertOwnership();
    }
  }
}

export { WriterLeaseLostError };

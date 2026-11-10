import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomic } from "../server/persist.ts";

export type WriterLeaseRecord = {
  holderId: string;
  fencingToken: number;
  acquiredAt: string;
  expiresAt: string;
};

export type WriterLeaseSnapshot = {
  held: boolean;
  holderId?: string;
  fencingToken?: number;
  expiresAt?: string;
};

export class WriterLeaseLostError extends Error {
  readonly code = "writer_lease_lost" as const;
  constructor(message: string) {
    super(message);
  }
}

export interface WriterLeaseBackend {
  readonly mode: "none" | "file" | "gcs";
  snapshot(): WriterLeaseSnapshot;
  /** Fail closed when another holder owns a non-expired lease. */
  acquire(holderId: string, ttlMs: number): Promise<void>;
  /** Re-read lease; throw if holder lost ownership (fencing). */
  assertOwnership(): void;
  release(holderId: string): Promise<void>;
  localFencingToken(): number | null;
}

/** Local dev / tests — NOT safe on GCS FUSE for production cross-process guarantees. */
export class FileWriterLeaseBackend implements WriterLeaseBackend {
  readonly mode = "file" as const;
  readonly path: string;
  private holderId: string | null = null;
  private fencingToken: number | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, ".writer-lease.json");
  }

  #read(): WriterLeaseRecord | null {
    if (!existsSync(this.path)) return null;
    return JSON.parse(readFileSync(this.path, "utf8")) as WriterLeaseRecord;
  }

  snapshot(): WriterLeaseSnapshot {
    const cur = this.#read();
    if (!cur) return { held: false };
    const held =
      this.holderId !== null &&
      cur.holderId === this.holderId &&
      cur.fencingToken === this.fencingToken;
    return {
      held,
      holderId: cur.holderId,
      fencingToken: cur.fencingToken,
      expiresAt: cur.expiresAt,
    };
  }

  async acquire(holderId: string, ttlMs: number): Promise<void> {
    const now = Date.now();
    const cur = this.#read();
    if (
      cur &&
      cur.expiresAt > new Date(now).toISOString() &&
      cur.holderId !== holderId
    ) {
      throw new WriterLeaseLostError(
        `writer lease held by ${cur.holderId} until ${cur.expiresAt}`,
      );
    }
    const nextFence = (cur?.fencingToken ?? 0) + 1;
    const record: WriterLeaseRecord = {
      holderId,
      fencingToken: nextFence,
      acquiredAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
    };
    writeJsonAtomic(this.path, record);
    const verify = this.#read();
    if (
      !verify ||
      verify.holderId !== holderId ||
      verify.fencingToken !== nextFence
    ) {
      throw new WriterLeaseLostError("writer lease acquire lost race");
    }
    this.holderId = holderId;
    this.fencingToken = nextFence;
  }

  assertOwnership(): void {
    if (!this.holderId || this.fencingToken === null) {
      throw new WriterLeaseLostError("writer lease not acquired");
    }
    const cur = this.#read();
    if (
      !cur ||
      cur.holderId !== this.holderId ||
      cur.fencingToken !== this.fencingToken
    ) {
      throw new WriterLeaseLostError("writer lease fencing token stale");
    }
    if (cur.expiresAt <= new Date().toISOString()) {
      throw new WriterLeaseLostError("writer lease expired");
    }
  }

  async release(holderId: string): Promise<void> {
    const cur = this.#read();
    if (cur?.holderId === holderId && existsSync(this.path)) {
      unlinkSync(this.path);
    }
    if (this.holderId === holderId) {
      this.holderId = null;
      this.fencingToken = null;
    }
  }

  localFencingToken(): number | null {
    return this.fencingToken;
  }
}

/** No cross-process lease — single-process deployments only. */
export class NoWriterLeaseBackend implements WriterLeaseBackend {
  readonly mode = "none" as const;
  snapshot(): WriterLeaseSnapshot {
    return { held: true, holderId: "local-only", fencingToken: 0 };
  }
  async acquire(): Promise<void> {}
  assertOwnership(): void {}
  async release(): Promise<void> {}
  localFencingToken(): number | null {
    return 0;
  }
}

export function createWriterLeaseBackend(
  dataDir: string,
): WriterLeaseBackend {
  const mode = process.env.INTENTGUARD_WRITER_LEASE_MODE ?? "none";
  if (mode === "file") {
    return new FileWriterLeaseBackend(dataDir);
  }
  if (mode === "none" || mode === "off") {
    return new NoWriterLeaseBackend();
  }
  if (mode === "auto") {
    if (process.env.INTENTGUARD_STATE_BACKEND === "gcs") {
      return new NoWriterLeaseBackend();
    }
    if (process.env.DOCKER === "1") {
      return new FileWriterLeaseBackend(dataDir);
    }
    return new NoWriterLeaseBackend();
  }
  return new NoWriterLeaseBackend();
}

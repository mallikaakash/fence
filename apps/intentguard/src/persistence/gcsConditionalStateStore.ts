import { randomUUID } from "node:crypto";
import type { GatewaySession } from "../gateway/session.ts";
import type { AuditEvent } from "../gateway/audit.ts";
import type { ExecuteIdempotencyRecord, TradeProposal } from "../execution/types.ts";
import {
  buildStateDocument,
  parseStateDocument,
  type StateWriterMeta,
} from "./statePayload.ts";
import type { GcsObjectAdapter } from "./gcsObjectAdapter.ts";
import {
  isPreconditionFailed,
  StateAmbiguousCommitError,
  StateFencingError,
  StateGenerationConflictError,
  StatePersistenceError,
} from "./gcsObjectAdapter.ts";

export type GcsConditionalStateSnapshot = {
  generation: number | null;
  writerMeta: StateWriterMeta;
  holderId: string;
  needsOwnershipClaim: boolean;
};

/**
 * Authoritative gateway state via GCS JSON API + generation preconditions + writerEpoch fencing.
 * Never refreshes generation after 412 to retry stale in-memory state.
 */
export class GcsConditionalStateStore {
  readonly dataKey: Buffer | null;
  private readonly object: GcsObjectAdapter;
  private readonly holderId: string;
  private generation: number | null = null;
  private writerEpoch = 0;
  private writerHolderId = "";
  private lastCommitId = "";
  private needsOwnershipClaim = false;

  constructor(opts: {
    object: GcsObjectAdapter;
    dataKey: Buffer | null;
    holderId: string;
  }) {
    this.object = opts.object;
    this.dataKey = opts.dataKey;
    this.holderId = opts.holderId;
  }

  snapshot(): GcsConditionalStateSnapshot {
    return {
      generation: this.generation,
      writerMeta: {
        writerEpoch: this.writerEpoch,
        writerHolderId: this.writerHolderId,
        lastCommitId: this.lastCommitId,
      },
      holderId: this.holderId,
      needsOwnershipClaim: this.needsOwnershipClaim,
    };
  }

  /** Load object; does not transfer ownership to this process. */
  async load(): Promise<{
    sessions: GatewaySession[];
    audit: AuditEvent[];
    proposals: TradeProposal[];
    executeIdempotency: ExecuteIdempotencyRecord[];
  }> {
    const meta = await this.object.getMetadata();
    if (!meta) {
      this.generation = null;
      this.writerEpoch = 0;
      this.writerHolderId = "";
      this.lastCommitId = "";
      this.needsOwnershipClaim = true;
      return { sessions: [], audit: [], proposals: [], executeIdempotency: [] };
    }
    const liveGeneration = Number(meta.generation);
    if (!Number.isFinite(liveGeneration)) {
      throw new StatePersistenceError("state object generation is not numeric");
    }
    const buf = await this.object.download({ generation: liveGeneration });
    let parsed: unknown;
    try {
      parsed = JSON.parse(buf.toString("utf8"));
    } catch {
      throw new StatePersistenceError("state object is not valid JSON");
    }
    const loaded = parseStateDocument(parsed, this.dataKey);
    this.generation = liveGeneration;
    this.writerEpoch = loaded.writerMeta.writerEpoch;
    this.writerHolderId = loaded.writerMeta.writerHolderId;
    this.lastCommitId = loaded.writerMeta.lastCommitId;
    this.needsOwnershipClaim = this.writerHolderId !== this.holderId;
    return {
      sessions: loaded.sessions,
      audit: loaded.audit,
      proposals: loaded.proposals,
      executeIdempotency: loaded.executeIdempotency,
    };
  }

  assertMayWrite(): void {
    if (!this.needsOwnershipClaim && this.writerHolderId !== this.holderId) {
      throw new StateFencingError(
        `stale writer holder ${this.writerHolderId} — this process is ${this.holderId}`,
      );
    }
  }

  async save(
    sessions: GatewaySession[],
    audit: AuditEvent[],
    execution?: {
      proposals: TradeProposal[];
      executeIdempotency: ExecuteIdempotencyRecord[];
    },
  ): Promise<void> {
    this.assertMayWrite();

    const epochForWrite = this.needsOwnershipClaim
      ? this.writerEpoch + 1
      : this.writerEpoch;
    const precondition =
      this.generation === null ? 0 : this.generation;

    if (precondition === 0 && this.generation !== null) {
      throw new StatePersistenceError("invalid generation state");
    }

    const commitId = randomUUID();
    const doc = buildStateDocument(
      sessions,
      audit,
      execution ?? { proposals: [], executeIdempotency: [] },
      this.dataKey,
      {
        writerEpoch: epochForWrite,
        writerHolderId: this.holderId,
        lastCommitId: commitId,
      },
    );
    const text = JSON.stringify(doc, null, 2) + "\n";
    await this.commitBody(text, commitId, {
      ifGenerationMatch: precondition,
      epochForWrite,
    });
  }

  private async commitBody(
    text: string,
    commitId: string,
    opts: { ifGenerationMatch: number; epochForWrite: number },
  ): Promise<void> {
    const buf = Buffer.from(text, "utf8");
    try {
      await this.object.save(buf, {
        ifGenerationMatch: opts.ifGenerationMatch,
      });
      await this.adoptVerifiedCommit(commitId, opts.epochForWrite);
      return;
    } catch (err) {
      if (err instanceof StateGenerationConflictError) {
        throw err;
      }
      if (err instanceof StateAmbiguousCommitError) {
        throw err;
      }
      if (!isPreconditionFailed(err)) {
        throw new StatePersistenceError(
          err instanceof Error ? err.message : String(err),
        );
      }
      try {
        const reconciled = await this.reconcileAfterPreconditionFailure(
          commitId,
          opts.epochForWrite,
        );
        if (reconciled) return;
      } catch (reconcileErr) {
        if (reconcileErr instanceof StateAmbiguousCommitError) {
          throw reconcileErr;
        }
        if (reconcileErr instanceof StateGenerationConflictError) {
          throw reconcileErr;
        }
        throw new StateAmbiguousCommitError(
          reconcileErr instanceof Error
            ? reconcileErr.message
            : String(reconcileErr),
        );
      }
      throw new StateGenerationConflictError(
        "GCS generation precondition failed — stale writer or concurrent commit",
      );
    }
  }

  private async adoptVerifiedCommit(
    commitId: string,
    epochForWrite: number,
  ): Promise<void> {
    const verified = await this.readVerifiedCommitAtLiveHead(
      commitId,
      epochForWrite,
    );
    if (!verified) {
      throw new StateGenerationConflictError(
        "commit not at live object head — superseded or never landed",
      );
    }
    this.generation = verified.generation;
    this.writerEpoch = epochForWrite;
    this.writerHolderId = this.holderId;
    this.lastCommitId = commitId;
    this.needsOwnershipClaim = false;
  }

  /**
   * Live head must contain this pending commit (commitId, holder, epoch).
   * Uses generation-pinned download so metadata and body refer to the same version.
   */
  private async readVerifiedCommitAtLiveHead(
    commitId: string,
    epochForWrite: number,
  ): Promise<{ generation: number } | null> {
    let meta;
    try {
      meta = await this.object.getMetadata();
    } catch (e) {
      throw new StateAmbiguousCommitError(
        `metadata read failed after commit: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!meta) return null;
    const generation = Number(meta.generation);
    if (!Number.isFinite(generation)) {
      throw new StateAmbiguousCommitError("live object generation is not numeric");
    }

    let buf: Buffer;
    try {
      buf = await this.object.download({ generation });
    } catch (e) {
      throw new StateAmbiguousCommitError(
        `generation-pinned download failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(buf.toString("utf8"));
    } catch {
      throw new StateAmbiguousCommitError("committed object is not valid JSON");
    }
    if (!parsed || typeof parsed !== "object") return null;
    const loaded = parseStateDocument(parsed, this.dataKey);
    if (loaded.writerMeta.lastCommitId !== commitId) return null;
    if (loaded.writerMeta.writerHolderId !== this.holderId) return null;
    if (loaded.writerMeta.writerEpoch !== epochForWrite) return null;
    return { generation };
  }

  /** If our commitId is at the live head, treat upload as succeeded. */
  private async reconcileAfterPreconditionFailure(
    pendingCommitId: string,
    epochForWrite: number,
  ): Promise<boolean> {
    const verified = await this.readVerifiedCommitAtLiveHead(
      pendingCommitId,
      epochForWrite,
    );
    if (!verified) return false;

    this.generation = verified.generation;
    this.writerEpoch = epochForWrite;
    this.writerHolderId = this.holderId;
    this.lastCommitId = pendingCommitId;
    this.needsOwnershipClaim = false;
    return true;
  }
}

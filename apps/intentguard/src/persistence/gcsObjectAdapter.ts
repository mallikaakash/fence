/**
 * Thin adapter over GCS object operations — mockable for unit tests.
 */
export type GcsObjectMetadata = {
  generation: string;
  metageneration?: string;
};

export type GcsUploadResult = {
  generation: string;
};

export type GcsDownloadOptions = {
  /** Pin read to a specific object generation (GCS `generation` query parameter). */
  generation?: string | number;
};

export interface GcsObjectAdapter {
  readonly name: string;
  getMetadata(): Promise<GcsObjectMetadata | null>;
  download(opts?: GcsDownloadOptions): Promise<Buffer>;
  save(
    data: Buffer,
    opts: { ifGenerationMatch: string | number },
  ): Promise<GcsUploadResult>;
}

export class StateGenerationConflictError extends Error {
  readonly code = "state_generation_conflict" as const;
  constructor(message: string) {
    super(message);
  }
}

export class StateFencingError extends Error {
  readonly code = "state_fencing_stale" as const;
  constructor(message: string) {
    super(message);
  }
}

export class StatePersistenceError extends Error {
  readonly code = "state_persistence_failed" as const;
  constructor(message: string) {
    super(message);
  }
}

/** Upload outcome uncertain (I/O or metadata/body inconsistency) — fail closed. */
export class StateAmbiguousCommitError extends Error {
  readonly code = "state_commit_ambiguous" as const;
  constructor(message: string) {
    super(message);
  }
}

export function isPreconditionFailed(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number | string; response?: { statusCode?: number } };
  return e.code === 412 || e.response?.statusCode === 412;
}

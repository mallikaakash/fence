import type {
  GcsDownloadOptions,
  GcsObjectAdapter,
  GcsObjectMetadata,
  GcsUploadResult,
} from "./gcsObjectAdapter.ts";

/**
 * Opaque GCS-like generation IDs (not sequential — mirrors real bucket semantics in tests).
 */
export const GCS_TEST_OPAQUE_GENERATIONS = [
  1360887697105000,
  1360887759327000,
  1360887612345000,
  1360890011222000,
  1360891122334000,
  1360892233445000,
] as const;

/** In-memory GCS object for deterministic tests (not proof of live GCS). */
export class MemoryGcsObjectAdapter implements GcsObjectAdapter {
  readonly name: string;
  private body: Buffer | null = null;
  private generation: number | null = null;
  private nextGenIndex = 0;

  constructor(name: string) {
    this.name = name;
  }

  snapshot(): { generation: number | null; body: Buffer | null } {
    return { generation: this.generation, body: this.body };
  }

  private assignGeneration(): number {
    const g =
      GCS_TEST_OPAQUE_GENERATIONS[
        this.nextGenIndex % GCS_TEST_OPAQUE_GENERATIONS.length
      ];
    this.nextGenIndex += 1;
    return g;
  }

  async getMetadata(): Promise<GcsObjectMetadata | null> {
    if (this.body === null || this.generation === null) return null;
    return { generation: String(this.generation) };
  }

  async download(opts?: GcsDownloadOptions): Promise<Buffer> {
    if (!this.body || this.generation === null) {
      throw new Error("object not found");
    }
    if (opts?.generation !== undefined) {
      if (String(opts.generation) !== String(this.generation)) {
        const err = new Error("no such object generation") as Error & { code: number };
        err.code = 404;
        throw err;
      }
    }
    return Buffer.from(this.body);
  }

  async save(
    data: Buffer,
    opts: { ifGenerationMatch: string | number },
  ): Promise<GcsUploadResult> {
    const expected = String(opts.ifGenerationMatch);
    if (expected === "0") {
      if (this.body !== null) {
        const err = new Error("precondition failed") as Error & { code: number };
        err.code = 412;
        throw err;
      }
      this.body = Buffer.from(data);
      this.generation = this.assignGeneration();
      return { generation: String(this.generation) };
    }
    if (
      this.body === null ||
      this.generation === null ||
      String(this.generation) !== expected
    ) {
      const err = new Error("precondition failed") as Error & { code: number };
      err.code = 412;
      throw err;
    }
    this.body = Buffer.from(data);
    this.generation = this.assignGeneration();
    return { generation: String(this.generation) };
  }
}

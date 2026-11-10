import type {
  GcsDownloadOptions,
  GcsObjectAdapter,
  GcsObjectMetadata,
  GcsUploadResult,
} from "./gcsObjectAdapter.ts";

export type GcsNodeAdapterConfig = {
  bucket: string;
  objectName: string;
};

/** Native GCS API — not FUSE. */
export async function createNodeGcsObjectAdapter(
  config: GcsNodeAdapterConfig,
): Promise<GcsObjectAdapter> {
  const { Storage } = await import("@google-cloud/storage");
  const storage = new Storage();
  const file = storage.bucket(config.bucket).file(config.objectName);

  return {
    name: `gs://${config.bucket}/${config.objectName}`,
    async getMetadata(): Promise<GcsObjectMetadata | null> {
      try {
        const [meta] = await file.getMetadata();
        return {
          generation: String(meta.generation),
          metageneration: meta.metageneration
            ? String(meta.metageneration)
            : undefined,
        };
      } catch (e: unknown) {
        const err = e as { code?: number };
        if (err.code === 404) return null;
        throw e;
      }
    },
    async download(opts?: GcsDownloadOptions): Promise<Buffer> {
      const scoped =
        opts?.generation !== undefined
          ? storage.bucket(config.bucket).file(config.objectName, {
              generation: Number(opts.generation),
            })
          : file;
      const [buf] = await scoped.download();
      return buf;
    },
    async save(
      data: Buffer,
      opts: { ifGenerationMatch: string | number },
    ): Promise<GcsUploadResult> {
      const match = Number(opts.ifGenerationMatch);
      await file.save(data, {
        resumable: false,
        contentType: "application/json",
        preconditionOpts: {
          ifGenerationMatch: match,
        },
      });
      /** `@google-cloud/storage` File#save resolves void — generation comes from metadata. */
      const [meta] = await file.getMetadata();
      return { generation: String(meta.generation) };
    },
  };
}

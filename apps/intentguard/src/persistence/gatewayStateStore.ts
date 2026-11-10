import { randomUUID } from "node:crypto";
import type { GatewaySession } from "../gateway/session.ts";
import type { AuditEvent } from "../gateway/audit.ts";
import type { ExecuteIdempotencyRecord, TradeProposal } from "../execution/types.ts";
import type { GatewayConfig } from "../server/config.ts";
import { SecureFileStore } from "../server/secureStore.ts";
import { GcsConditionalStateStore } from "./gcsConditionalStateStore.ts";
import { createNodeGcsObjectAdapter } from "./gcsNodeAdapter.ts";
import { StatePersistenceError } from "./gcsObjectAdapter.ts";

export type GatewayStateStore = {
  readonly backend: "file" | "gcs";
  /** FUSE/local path (file backend) or gs:// URI (gcs backend) for logging. */
  readonly location: string;
  load(): Promise<{
    sessions: GatewaySession[];
    audit: AuditEvent[];
    proposals: TradeProposal[];
    executeIdempotency: ExecuteIdempotencyRecord[];
  }>;
  save(
    sessions: GatewaySession[],
    audit: AuditEvent[],
    execution?: {
      proposals: TradeProposal[];
      executeIdempotency: ExecuteIdempotencyRecord[];
    },
  ): Promise<void>;
  assertMayWrite?(): void;
};

export function resolveStateBackend(config: GatewayConfig): "file" | "gcs" {
  const raw = process.env.INTENTGUARD_STATE_BACKEND?.toLowerCase();
  if (raw === "gcs") return "gcs";
  if (raw === "file") return "file";
  if (config.requireGcsState || process.env.DOCKER === "1") {
    if (config.gcsStateBucket && config.gcsStateObject) return "gcs";
  }
  return "file";
}

export async function createGatewayStateStore(
  config: GatewayConfig,
  holderId: string = `gw-${randomUUID()}`,
): Promise<GatewayStateStore> {
  const backend = resolveStateBackend(config);
  if (backend === "gcs") {
    if (!config.gcsStateBucket || !config.gcsStateObject) {
      throw new StatePersistenceError(
        "INTENTGUARD_STATE_BACKEND=gcs requires INTENTGUARD_GCS_STATE_BUCKET and INTENTGUARD_GCS_STATE_OBJECT",
      );
    }
    if (config.requireGcsState) {
      /* explicit hosted requirement */
    }
    const object = await createNodeGcsObjectAdapter({
      bucket: config.gcsStateBucket,
      objectName: config.gcsStateObject,
    });
    const gcs = new GcsConditionalStateStore({
      object,
      dataKey: config.dataKey,
      holderId,
    });
    return {
      backend: "gcs",
      location: object.name,
      load: () => gcs.load(),
      save: (s, a, e) => gcs.save(s, a, e),
      assertMayWrite: () => gcs.assertMayWrite(),
    };
  }

  if (config.requireGcsState) {
    throw new StatePersistenceError(
      "INTENTGUARD_REQUIRE_GCS_STATE=1 but state backend is file — misconfiguration",
    );
  }

  const file = new SecureFileStore(config.dataDir, config.dataKey);
  return {
    backend: "file",
    location: file.path,
    load: async () => file.load(),
    save: async (sessions, audit, execution) => {
      file.save(sessions, audit, execution);
    },
  };
}

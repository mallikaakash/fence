import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { GatewaySession } from "../gateway/session.ts";
import type { AuditEvent } from "../gateway/audit.ts";
import type { ExecuteIdempotencyRecord, TradeProposal } from "../execution/types.ts";
import { writeJsonAtomic } from "./persist.ts";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import { sealAuditLog, verifyAuditSeal } from "./auth.ts";

/** On-disk session — grantee key encrypted when dataKey set. */
export type StoredSession = Omit<GatewaySession, "granteePrivateKeyHex"> & {
  granteePrivateKeyHex?: string;
  granteePrivateKeyEnc?: string;
};

export type PersistedStateV2 = {
  version: 2;
  updatedAt: string;
  sessions: StoredSession[];
  audit: AuditEvent[];
  auditSeal?: string;
};

export type PersistedStateV3 = {
  version: 3;
  updatedAt: string;
  sessions: StoredSession[];
  audit: AuditEvent[];
  proposals?: TradeProposal[];
  executeIdempotency?: ExecuteIdempotencyRecord[];
  auditSeal?: string;
};

export class SecureFileStore {
  readonly path: string;
  readonly dataKey: Buffer | null;

  constructor(dataDir: string, dataKey: Buffer | null) {
    this.path = join(dataDir, "state.json");
    this.dataKey = dataKey;
  }

  #toStored(session: GatewaySession): StoredSession {
    const { granteePrivateKeyHex, ...rest } = session;
    if (!granteePrivateKeyHex) {
      return { ...rest, granteePrivateKeyHex: "" };
    }
    if (this.dataKey) {
      return {
        ...rest,
        granteePrivateKeyEnc: encryptSecret(
          this.dataKey,
          granteePrivateKeyHex,
        ),
      };
    }
    return { ...rest, granteePrivateKeyHex };
  }

  #fromStored(stored: StoredSession): GatewaySession {
    let hex = stored.granteePrivateKeyHex ?? "";
    if (stored.granteePrivateKeyEnc) {
      if (!this.dataKey) {
        throw new Error(
          "state contains encrypted grantee keys — set INTENTGUARD_DATA_KEY",
        );
      }
      hex = decryptSecret(this.dataKey, stored.granteePrivateKeyEnc);
    }
    return { ...stored, granteePrivateKeyHex: hex };
  }

  load(): {
    sessions: GatewaySession[];
    audit: AuditEvent[];
    proposals: TradeProposal[];
    executeIdempotency: ExecuteIdempotencyRecord[];
  } {
    if (!existsSync(this.path)) {
      return { sessions: [], audit: [], proposals: [], executeIdempotency: [] };
    }
    const raw = JSON.parse(readFileSync(this.path, "utf8")) as
      | PersistedStateV3
      | PersistedStateV2
      | {
          version: 1;
          sessions: GatewaySession[];
          audit: AuditEvent[];
          auditSeal?: string;
        };

    const sessions = (raw.sessions as StoredSession[]).map((s) =>
      this.#fromStored(s),
    );
    const audit = raw.audit ?? [];
    const proposals =
      "proposals" in raw && Array.isArray(raw.proposals) ? raw.proposals : [];
    const executeIdempotency =
      "executeIdempotency" in raw && Array.isArray(raw.executeIdempotency)
        ? raw.executeIdempotency
        : [];

    if (this.dataKey && raw.auditSeal) {
      const json = JSON.stringify(audit);
      if (!verifyAuditSeal(json, raw.auditSeal, this.dataKey)) {
        throw new Error("audit log seal mismatch — possible tampering");
      }
    }

    return { sessions, audit, proposals, executeIdempotency };
  }

  save(
    sessions: GatewaySession[],
    audit: AuditEvent[],
    execution?: {
      proposals: TradeProposal[];
      executeIdempotency: ExecuteIdempotencyRecord[];
    },
  ): void {
    const stored = sessions.map((s) => this.#toStored(s));
    const auditJson = JSON.stringify(audit);
    const state: PersistedStateV3 = {
      version: 3,
      updatedAt: new Date().toISOString(),
      sessions: stored,
      audit,
      proposals: execution?.proposals ?? [],
      executeIdempotency: execution?.executeIdempotency ?? [],
      auditSeal: this.dataKey
        ? sealAuditLog(auditJson, this.dataKey)
        : undefined,
    };
    writeJsonAtomic(this.path, state);
  }
}
